import { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@descope/react-sdk';
import { ApiError, unwrapList, useApiClient } from '../lib/apiClient.js';
import { pipelinesKeys, recordsKeys } from '../lib/queryKeys.js';
import {
  usePipeline,
  type Pipeline as PipelineDefinition,
  type PipelineStage as StageDefinition,
} from '../features/pipelines/hooks/queries/usePipeline.js';
import {
  useRecords,
  type RecordItem,
  type RecordsResponse,
} from '../features/records/hooks/queries/useRecords.js';
import { useMoveStage } from '../features/pipelines/hooks/mutations/useMoveStage.js';
import { useTenantLocale } from '../useTenantLocale.js';
import { KanbanCard } from './KanbanCard.js';
import type { KanbanCardRecord } from './KanbanCard.js';
import { KanbanFilterBar, EMPTY_FILTERS } from './KanbanFilterBar.js';
import type { KanbanFilters } from './KanbanFilterBar.js';
import { GateFailureModal } from './GateFailureModal.js';
import type { GateFailure } from './GateFailureModal.js';
import { PipelineSummaryBar } from './PipelineSummaryBar.js';
import type { PipelineSummaryData } from './PipelineSummaryBar.js';
import { OverdueDealsPanel } from './OverdueDealsPanel.js';
import type { OverdueRecord } from './OverdueDealsPanel.js';
import styles from './KanbanBoard.module.css';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ConfirmState {
  recordId: string;
  targetStageId: string;
  stageName: string;
  stageType: string;
}

interface GateModalState {
  recordId: string;
  targetStageId: string;
  stageName: string;
  failures: GateFailure[];
}

interface KanbanBoardProps {
  apiName: string;
  objectId: string;
}

const RECORDS_QUERY_PARAMS = { limit: 100 } as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const COLOUR_MAP: Record<string, string> = {
  blue: '#6366f1',
  indigo: '#6366f1',
  green: '#10b981',
  emerald: '#10b981',
  yellow: '#f59e0b',
  amber: '#f59e0b',
  orange: '#f97316',
  red: '#ef4444',
  purple: '#a855f7',
  pink: '#ec4899',
  teal: '#14b8a6',
  cyan: '#06b6d4',
  slate: '#64748b',
  gray: '#6b7280',
  grey: '#6b7280',
};

function resolveColour(colour: string): string {
  return COLOUR_MAP[colour.toLowerCase()] ?? colour;
}

function getOwnerInitials(ownerId: string): string {
  // Fall back to first two chars of ownerId
  return (ownerId.slice(0, 2) || '??').toUpperCase();
}

function extractValue(fv: Record<string, unknown>): number | null {
  const v = fv.value ?? fv.amount ?? fv.deal_value;
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function extractCloseDate(fv: Record<string, unknown>): string | null {
  const d = fv.close_date ?? fv.expected_close_date ?? fv.expectedCloseDate;
  return typeof d === 'string' && d.length > 0 ? d : null;
}

function recordToCard(
  record: RecordItem,
  expectedDays: number | null,
): KanbanCardRecord {
  return {
    id: record.id,
    name: record.name,
    value: extractValue(record.fieldValues),
    closeDate: extractCloseDate(record.fieldValues),
    ownerId: record.ownerId,
    ownerInitials: getOwnerInitials(record.ownerId),
    stageEnteredAt: record.stageEnteredAt ?? null,
    expectedDays,
    accountName: record.linkedParent?.recordName ?? null,
    accountId: record.linkedParent?.recordId ?? null,
  };
}

function applyFilters(
  records: KanbanCardRecord[],
  filters: KanbanFilters,
): KanbanCardRecord[] {
  return records.filter((r) => {
    if (filters.search && !r.name.toLowerCase().includes(filters.search.toLowerCase())) {
      return false;
    }
    if (filters.owner && r.ownerId !== filters.owner) {
      return false;
    }
    if (filters.dateFrom && r.closeDate && r.closeDate < filters.dateFrom) {
      return false;
    }
    if (filters.dateTo && r.closeDate && r.closeDate > filters.dateTo) {
      return false;
    }
    if (filters.valueMin && r.value !== null && r.value < Number(filters.valueMin)) {
      return false;
    }
    if (filters.valueMax && r.value !== null && r.value > Number(filters.valueMax)) {
      return false;
    }
    return true;
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

export function KanbanBoard({ apiName, objectId }: KanbanBoardProps) {
  const { sessionToken } = useSession();
  const api = useApiClient();
  const queryClient = useQueryClient();
  const { formatCurrencyCompact } = useTenantLocale();

  const [filters, setFilters] = useState<KanbanFilters>(EMPTY_FILTERS);
  const [draggingRecordId, setDraggingRecordId] = useState<string | null>(null);
  const [dragOverStageId, setDragOverStageId] = useState<string | null>(null);

  // Gate failure modal
  const [gateModal, setGateModal] = useState<GateModalState | null>(null);
  const [gateLoading, setGateLoading] = useState(false);

  // Confirmation modal (won/lost)
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  // Pipeline analytics
  const [summaryData, setSummaryData] = useState<PipelineSummaryData | null>(null);
  const [overdueRecords, setOverdueRecords] = useState<OverdueRecord[]>([]);

  // Summary collapse state (persisted in localStorage)
  const [summaryCollapsed, setSummaryCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('cpcrm-pipeline-summary-collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const toggleSummary = () => {
    setSummaryCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('cpcrm-pipeline-summary-collapsed', String(next));
      } catch {
        // localStorage unavailable
      }
      return next;
    });
  };

  // ── Fetch pipeline + records via TanStack Query ──────────
  //
  // 1. List pipelines and find the one bound to this object. The
  //    `/api/v1/admin/pipelines` endpoint returns a paginated envelope, so
  //    the list is unwrapped before we match on `objectId`.
  // 2. `usePipeline(pipelineId)` fetches the stage detail once the id is
  //    known.
  // 3. `useRecords(apiName, { limit: 100 })` fetches the records for this
  //    object with `keepPreviousData` so the board doesn't flicker between
  //    cached + refetched results.
  const pipelineListQuery = useQuery({
    queryKey: pipelinesKeys.list(),
    queryFn: async () => {
      const payload = await api.get<unknown>('/api/v1/admin/pipelines');
      return unwrapList<
        PipelineDefinition & { objectId?: string; object_id?: string }
      >(payload);
    },
    enabled: Boolean(sessionToken),
  });

  const matchedPipelineId = useMemo(() => {
    const list = pipelineListQuery.data;
    if (!list) return undefined;
    return list.find((p) => (p.objectId ?? p.object_id) === objectId)?.id;
  }, [pipelineListQuery.data, objectId]);

  const pipelineDetailQuery = usePipeline(matchedPipelineId);
  const recordsQuery = useRecords(apiName, RECORDS_QUERY_PARAMS);

  const pipeline = pipelineDetailQuery.data ?? null;
  const allRecords = useMemo<RecordItem[]>(
    () => recordsQuery.data?.data ?? [],
    [recordsQuery.data],
  );

  const loading =
    pipelineListQuery.isLoading ||
    (matchedPipelineId !== undefined &&
      (pipelineDetailQuery.isLoading || recordsQuery.isLoading));

  // Surface records/detail errors only once we know there *is* a pipeline
  // for this object. Otherwise the "no pipeline configured" path would be
  // shadowed by a spurious records-fetch failure.
  const error: string | null = pipelineListQuery.isError
    ? 'Failed to load pipeline configuration.'
    : matchedPipelineId && pipelineDetailQuery.isError
      ? 'Failed to load pipeline stages.'
      : matchedPipelineId && recordsQuery.isError
        ? recordsQuery.error instanceof ApiError &&
          recordsQuery.error.isNetwork
          ? 'Failed to connect to the server.'
          : 'Failed to load records for the pipeline.'
        : null;

  // Patch a single record in the cached list. Used by fill-and-move to
  // reflect the PUT field update before retrying the stage move.
  const patchRecordFields = useCallback(
    (recordId: string, fieldValues: Record<string, unknown>) => {
      queryClient.setQueryData<RecordsResponse>(
        recordsKeys.list(apiName, RECORDS_QUERY_PARAMS),
        (prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            data: prev.data.map((r) =>
              r.id === recordId
                ? { ...r, fieldValues: { ...r.fieldValues, ...fieldValues } }
                : r,
            ),
          };
        },
      );
    },
    [queryClient, apiName],
  );

  // ── Fetch pipeline analytics ──────────────────────────────
  const loadAnalytics = useCallback(async () => {
    if (!sessionToken || !pipeline) return;

    const [summaryResult, velocityResult, overdueResult] =
      await Promise.allSettled([
        api.get<{ totals: PipelineSummaryData['totals'] }>(
          `/api/v1/pipelines/${pipeline.id}/summary`,
        ),
        api.get<{ avgDaysToClose: number }>(
          `/api/v1/pipelines/${pipeline.id}/velocity?period=30d`,
        ),
        api.get<OverdueRecord[]>(`/api/v1/pipelines/${pipeline.id}/overdue`),
      ]);

    if (
      summaryResult.status === 'fulfilled' &&
      velocityResult.status === 'fulfilled'
    ) {
      setSummaryData({
        totals: summaryResult.value.totals,
        avgDaysToClose: velocityResult.value.avgDaysToClose,
      });
    }

    if (overdueResult.status === 'fulfilled') {
      setOverdueRecords(overdueResult.value);
    }
  }, [sessionToken, api, pipeline]);

  useEffect(() => {
    if (pipeline) {
      void loadAnalytics();
    }
  }, [pipeline, loadAnalytics]);

  // ── Move-stage mutation (optimistic + gate-failure rollback) ──
  const moveStage = useMoveStage({
    apiName,
    listParams: RECORDS_QUERY_PARAMS,
    pipelineId: pipeline?.id,
    onGateFailure: (failures, vars) => {
      const targetStage = pipeline?.stages.find((s) => s.id === vars.targetStageId);
      setGateModal({
        recordId: vars.recordId,
        targetStageId: vars.targetStageId,
        stageName: targetStage?.name ?? 'stage',
        failures,
      });
    },
  });

  // ── Drag and drop handlers ────────────────────────────────

  const handleDragStart = (recordId: string) => {
    setDraggingRecordId(recordId);
  };

  const handleDragEnd = () => {
    setDraggingRecordId(null);
    setDragOverStageId(null);
  };

  const handleDragOver = (e: React.DragEvent, stageId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverStageId(stageId);
  };

  const handleDragLeave = () => {
    setDragOverStageId(null);
  };

  const performMoveStage = useCallback(
    async (recordId: string, targetStageId: string): Promise<boolean> => {
      if (!sessionToken) return false;
      const targetStage = pipeline?.stages.find((s) => s.id === targetStageId);
      try {
        await moveStage.mutateAsync(
          {
            recordId,
            targetStageId,
            targetStageApiName: targetStage?.apiName,
          },
          { onSuccess: () => void loadAnalytics() },
        );
        return true;
      } catch {
        // `onError` in the hook rolls back the cache and — for 422 — opens
        // the gate modal.  Other failures fall through silently.
        return false;
      }
    },
    [sessionToken, pipeline, moveStage, loadAnalytics],
  );

  const handleDrop = (e: React.DragEvent, targetStageId: string) => {
    e.preventDefault();
    setDragOverStageId(null);

    const recordId = e.dataTransfer.getData('text/plain');
    if (!recordId || !pipeline) return;

    const record = allRecords.find((r) => r.id === recordId);
    if (!record) return;

    // Share column-placement logic so the drop no-op check can't drift from
    // where the card is actually rendered. `resolveStageForRecord` mirrors the
    // server's source of truth (records.current_stage_id), keeping us clear of
    // the 400 "already in this stage" case a stale fieldValues.stage could
    // otherwise trigger.
    const effectiveCurrentStageId = resolveStageForRecord(record)?.id;
    if (effectiveCurrentStageId === targetStageId) return;

    const targetStage = pipeline.stages.find((s) => s.id === targetStageId);
    if (!targetStage) return;

    // Check if it's a won/lost stage → confirmation
    if (targetStage.stageType === 'won' || targetStage.stageType === 'lost') {
      setConfirmState({
        recordId,
        targetStageId,
        stageName: targetStage.name,
        stageType: targetStage.stageType,
      });
      return;
    }

    void performMoveStage(recordId, targetStageId);
  };

  const handleConfirmMove = () => {
    if (!confirmState) return;
    void performMoveStage(confirmState.recordId, confirmState.targetStageId);
    setConfirmState(null);
  };

  const handleFillAndMove = async (fieldValues: Record<string, unknown>) => {
    if (!gateModal || !sessionToken) return;

    setGateLoading(true);

    try {
      // First update the record fields
      const updateResponse = await api.request(
        `/api/v1/objects/${apiName}/records/${gateModal.recordId}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ fieldValues }),
        },
      );

      if (!updateResponse.ok) {
        setGateLoading(false);
        return;
      }

      // Update local record field values
      patchRecordFields(gateModal.recordId, fieldValues);

      // Now retry the move
      const success = await performMoveStage(
        gateModal.recordId,
        gateModal.targetStageId,
      );

      if (success) {
        setGateModal(null);
      }
    } catch {
      // Error handled silently
    } finally {
      setGateLoading(false);
    }
  };

  // ── Build column data ─────────────────────────────────────

  const stages = pipeline?.stages.slice().sort((a, b) => a.sortOrder - b.sortOrder) ?? [];

  const stageIds = new Set(stages.map((s) => s.id));
  const firstOpenStage = stages.find((s) => s.stageType === 'open');

  // Build a lookup map for matching stage names / api_names (case-insensitive)
  const stageByName = new Map<string, StageDefinition>();
  for (const stage of stages) {
    if (stage.name) stageByName.set(stage.name.toLowerCase(), stage);
    if (stage.apiName) stageByName.set(stage.apiName.toLowerCase(), stage);
  }

  /**
   * Resolve which pipeline stage a record belongs to.
   *
   * Priority matches the server's source of truth so visual placement and
   * move-stage requests agree:
   *   1. `currentStageId` matches a known stage in this pipeline → use it.
   *      The server stores this in `records.current_stage_id` and rejects
   *      no-op moves based on it — if we placed the card by a stale
   *      `fieldValues.stage` and the user dragged to the DB's actual
   *      current column, the server would return 400 "already in this stage".
   *   2. `fieldValues.stage` matches a stage name / api_name (for records
   *      without an assigned stage id yet — e.g. freshly imported rows).
   *   3. Fall back to the first open stage.
   */
  function resolveStageForRecord(record: RecordItem): StageDefinition | null {
    // 1. Explicit pipeline assignment — authoritative.
    if (record.currentStageId && stageIds.has(record.currentStageId)) {
      return stages.find((s) => s.id === record.currentStageId) ?? null;
    }

    // 2. Legacy fallback: match fieldValues.stage against stage names / api_names.
    const fv = record.fieldValues ?? {};
    const stageFieldValue = fv.stage;
    if (typeof stageFieldValue === 'string' && stageFieldValue.trim()) {
      const matched = stageByName.get(stageFieldValue.trim().toLowerCase());
      if (matched) return matched;
    }

    // 3. Fall back to the first open stage.
    return firstOpenStage ?? null;
  }

  const stageRecordMap = new Map<string, KanbanCardRecord[]>();
  for (const stage of stages) {
    stageRecordMap.set(stage.id, []);
  }

  for (const record of allRecords) {
    const resolved = resolveStageForRecord(record);
    if (!resolved) continue;

    const card = recordToCard(record, resolved.expectedDays ?? null);
    const current = stageRecordMap.get(resolved.id) ?? [];
    current.push(card);
    stageRecordMap.set(resolved.id, current);
  }

  // Apply filters to all columns
  for (const [stageId, cards] of stageRecordMap) {
    stageRecordMap.set(stageId, applyFilters(cards, filters));
  }

  // Compute totals
  const openStages = stages.filter((s) => s.stageType === 'open');
  let totalOpenValue = 0;
  let totalWeightedValue = 0;
  let dealCount = 0;

  for (const stage of openStages) {
    const cards = stageRecordMap.get(stage.id) ?? [];
    for (const card of cards) {
      dealCount++;
      const val = card.value ?? 0;
      totalOpenValue += val;
      totalWeightedValue += val * ((stage.defaultProbability ?? 50) / 100);
    }
  }

  // Collect unique owners for filter
  const ownerSet = new Map<string, string>();
  for (const record of allRecords) {
    if (!ownerSet.has(record.ownerId)) {
      ownerSet.set(record.ownerId, getOwnerInitials(record.ownerId));
    }
  }
  const ownerOptions = Array.from(ownerSet.entries()).map(([id, label]) => ({
    id,
    label: `User ${label}`,
  }));

  // ── Render ────────────────────────────────────────────────

  if (loading) {
    return <div className={styles.loadingState}>Loading pipeline…</div>;
  }

  if (error) {
    return <div className={styles.errorState} role="alert">{error}</div>;
  }

  if (!pipeline) {
    return (
      <div className={styles.noPipeline} data-testid="no-pipeline">
        No pipeline configured for this object.
      </div>
    );
  }

  return (
    <div className={styles.board} data-testid="kanban-board">
      {/* Summary toggle */}
      <div className={styles.summaryHeader}>
        <button
          type="button"
          className={styles.summaryToggle}
          onClick={toggleSummary}
          aria-expanded={!summaryCollapsed}
          aria-label={summaryCollapsed ? 'Show summary cards' : 'Hide summary cards'}
          data-testid="summary-toggle"
        >
          <span
            className={`${styles.summaryToggleIcon} ${summaryCollapsed ? styles.summaryToggleIconCollapsed : ''}`}
          >
            ▼
          </span>
          {summaryCollapsed ? 'Show summary' : 'Hide summary'}
        </button>
      </div>

      {/* Summary bar — collapsible */}
      <div
        className={`${styles.summarySection} ${summaryCollapsed ? styles.summarySectionCollapsed : styles.summarySectionExpanded}`}
        data-testid="summary-section"
      >
        {summaryData ? (
          <PipelineSummaryBar data={summaryData} />
        ) : (
          <div className={styles.summaryBar} data-testid="kanban-summary">
            <div className={styles.summaryItem}>
              <span className={styles.summaryLabel}>Open value</span>
              <span className={styles.summaryValue}>{formatCurrencyCompact(totalOpenValue)}</span>
            </div>
            <div className={styles.summaryItem}>
              <span className={styles.summaryLabel}>Weighted value</span>
              <span className={styles.summaryValue}>{formatCurrencyCompact(totalWeightedValue)}</span>
            </div>
            <div className={styles.summaryItem}>
              <span className={styles.summaryLabel}>Deals</span>
              <span className={styles.summaryValue}>{dealCount}</span>
            </div>
          </div>
        )}
      </div>

      {/* Overdue deals panel */}
      <OverdueDealsPanel records={overdueRecords} apiName={apiName} />

      {/* Filters */}
      <KanbanFilterBar
        filters={filters}
        onChange={setFilters}
        owners={ownerOptions}
      />

      {/* Columns */}
      <div
        className={styles.columnsContainer}
        style={{
          gridTemplateColumns: stages.length > 0
            ? `repeat(${stages.length}, minmax(${stages.length >= 10 ? '120px' : '0'}, 1fr))`
            : undefined,
          overflowX: stages.length >= 10 ? 'auto' : undefined,
        }}
      >
        {stages.map((stage) => {
          const cards = stageRecordMap.get(stage.id) ?? [];
          const stageValue = cards.reduce((sum, c) => sum + (c.value ?? 0), 0);
          const isOver = dragOverStageId === stage.id;

          let columnClass = styles.column;
          if (isOver) columnClass += ` ${styles.columnDragOver}`;
          if (stage.stageType === 'won') columnClass += ` ${styles.columnWon}`;
          if (stage.stageType === 'lost') columnClass += ` ${styles.columnLost}`;

          return (
            <div
              key={stage.id}
              className={columnClass}
              onDragOver={(e) => handleDragOver(e, stage.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, stage.id)}
              data-testid={`kanban-column-${stage.apiName}`}
            >
              <div className={styles.columnHeader}>
                <div className={styles.columnHeaderTop}>
                  <span className={styles.columnName}>
                    <span
                      className={styles.columnDot}
                      style={{ backgroundColor: resolveColour(stage.colour) }}
                    />
                    {stage.name}
                  </span>
                  <span className={styles.columnCount}>{cards.length}</span>
                </div>
                <span className={styles.columnValue}>
                  {formatCurrencyCompact(stageValue)}
                </span>
              </div>

              <div className={styles.columnCards}>
                {cards.length === 0 ? (
                  <div className={styles.emptyColumn}>No records</div>
                ) : (
                  cards.map((card) => (
                    <KanbanCard
                      key={card.id}
                      record={card}
                      apiName={apiName}
                      onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd}
                      isDragging={draggingRecordId === card.id}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Gate failure modal */}
      {gateModal && (
        <GateFailureModal
          stageName={gateModal.stageName}
          failures={gateModal.failures}
          onFillAndMove={(fv) => void handleFillAndMove(fv)}
          onCancel={() => setGateModal(null)}
          loading={gateLoading}
        />
      )}

      {/* Confirmation modal for won/lost */}
      {confirmState && (
        <div
          className={styles.confirmOverlay}
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirmState(null);
          }}
          role="dialog"
          aria-modal="true"
          aria-label={`Confirm move to ${confirmState.stageName}`}
          data-testid="confirm-move-modal"
        >
          <div className={styles.confirmModal}>
            <h2 className={styles.confirmTitle}>
              Move to {confirmState.stageName}?
            </h2>
            <p className={styles.confirmText}>
              {confirmState.stageType === 'won'
                ? 'This will mark the deal as closed won. Are you sure?'
                : 'This will mark the deal as closed lost. Are you sure?'}
            </p>
            <div className={styles.confirmActions}>
              <button
                type="button"
                className={styles.confirmCancel}
                onClick={() => setConfirmState(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.confirmProceed}
                onClick={handleConfirmMove}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
