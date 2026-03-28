import { useState, useEffect, useCallback } from 'react';
import { useSession } from '@descope/react-sdk';
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

interface StageDefinition {
  id: string;
  name: string;
  apiName: string;
  sortOrder: number;
  stageType: string;
  colour: string;
  defaultProbability?: number;
  expectedDays?: number;
}

interface PipelineDefinition {
  id: string;
  name: string;
  objectId: string;
  stages: StageDefinition[];
}

interface RecordItem {
  id: string;
  name: string;
  fieldValues: Record<string, unknown>;
  ownerId: string;
  pipelineId?: string;
  currentStageId?: string;
  stageEnteredAt?: string;
  createdAt: string;
}

interface RecordsResponse {
  data: RecordItem[];
  total: number;
  page: number;
  limit: number;
}

interface MoveStageResponse {
  id: string;
  pipelineId: string;
  currentStageId: string;
  stageEnteredAt: string;
  fieldValues: Record<string, unknown>;
}

interface GateFailureResponse {
  error: string;
  code: string;
  failures: GateFailure[];
}

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
  const { formatCurrencyCompact } = useTenantLocale();

  const [pipeline, setPipeline] = useState<PipelineDefinition | null>(null);
  const [allRecords, setAllRecords] = useState<RecordItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  // ── Fetch pipeline + records ─────────────────────────────
  useEffect(() => {
    if (!sessionToken || !objectId || !apiName) return;

    let cancelled = false;

    const loadAll = async () => {
      try {
        // 1. Find pipeline for this object
        const response = await fetch('/api/admin/pipelines', {
          headers: { Authorization: `Bearer ${sessionToken}` },
        });

        if (cancelled || !response.ok) {
          if (!cancelled) setError('Failed to load pipeline configuration.');
          setLoading(false);
          return;
        }

        const pipelines = (await response.json()) as Array<PipelineDefinition & { objectId?: string; object_id?: string }>;
        const match = pipelines.find(
          (p) => (p.objectId ?? p.object_id) === objectId,
        );

        if (!match || cancelled) {
          if (!cancelled) {
            setPipeline(null);
            setLoading(false);
          }
          return;
        }

        // 2. Fetch pipeline detail AND records in parallel
        const [detailResponse, recordsResponse] = await Promise.all([
          fetch(`/api/admin/pipelines/${match.id}`, {
            headers: { Authorization: `Bearer ${sessionToken}` },
          }),
          fetch(`/api/objects/${apiName}/records?limit=100`, {
            headers: { Authorization: `Bearer ${sessionToken}` },
          }),
        ]);

        if (cancelled) return;

        if (!detailResponse.ok) {
          setError('Failed to load pipeline stages.');
          setLoading(false);
          return;
        }

        const detail = (await detailResponse.json()) as PipelineDefinition;

        let records: RecordItem[] = [];
        if (recordsResponse.ok) {
          const recordsData = (await recordsResponse.json()) as RecordsResponse;
          records = Array.isArray(recordsData.data) ? recordsData.data : [];
        }

        if (cancelled) return;

        // Set both pipeline and records in the same render batch
        setPipeline(detail);
        setAllRecords(records);

        if (!recordsResponse.ok) {
          setError('Failed to load records for the pipeline.');
        }
      } catch {
        if (!cancelled) {
          setError('Failed to connect to the server.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadAll();

    return () => {
      cancelled = true;
    };
  }, [sessionToken, objectId, apiName]);

  // ── Fetch pipeline analytics ──────────────────────────────
  const loadAnalytics = useCallback(async () => {
    if (!sessionToken || !pipeline) return;

    try {
      const [summaryResp, velocityResp, overdueResp] = await Promise.all([
        fetch(`/api/pipelines/${pipeline.id}/summary`, {
          headers: { Authorization: `Bearer ${sessionToken}` },
        }),
        fetch(`/api/pipelines/${pipeline.id}/velocity?period=30d`, {
          headers: { Authorization: `Bearer ${sessionToken}` },
        }),
        fetch(`/api/pipelines/${pipeline.id}/overdue`, {
          headers: { Authorization: `Bearer ${sessionToken}` },
        }),
      ]);

      if (summaryResp.ok && velocityResp.ok) {
        const summary = (await summaryResp.json()) as { totals: PipelineSummaryData['totals'] };
        const velocity = (await velocityResp.json()) as { avgDaysToClose: number };
        setSummaryData({
          totals: summary.totals,
          avgDaysToClose: velocity.avgDaysToClose,
        });
      }

      if (overdueResp.ok) {
        const overdue = (await overdueResp.json()) as OverdueRecord[];
        setOverdueRecords(overdue);
      }
    } catch {
      // Analytics fetch is best-effort
    }
  }, [sessionToken, pipeline]);

  useEffect(() => {
    if (pipeline) {
      void loadAnalytics();
    }
  }, [pipeline, loadAnalytics]);

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

  const performMoveStage = async (
    recordId: string,
    targetStageId: string,
  ): Promise<boolean> => {
    if (!sessionToken) return false;

    try {
      const response = await fetch(
        `/api/objects/${apiName}/records/${recordId}/move-stage`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${sessionToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ target_stage_id: targetStageId }),
        },
      );

      if (response.ok) {
        const updated = (await response.json()) as MoveStageResponse;
        // Update local state
        setAllRecords((prev) =>
          prev.map((r) =>
            r.id === recordId
              ? {
                  ...r,
                  pipelineId: updated.pipelineId,
                  currentStageId: updated.currentStageId,
                  stageEnteredAt: updated.stageEnteredAt,
                  fieldValues: updated.fieldValues,
                }
              : r,
          ),
        );
        // Refresh analytics after stage change
        void loadAnalytics();
        return true;
      }

      if (response.status === 422) {
        const gateError = (await response.json()) as GateFailureResponse;
        const targetStage = pipeline?.stages.find((s) => s.id === targetStageId);
        setGateModal({
          recordId,
          targetStageId,
          stageName: targetStage?.name ?? 'stage',
          failures: gateError.failures,
        });
        return false;
      }

      return false;
    } catch {
      return false;
    }
  };

  const handleDrop = (e: React.DragEvent, targetStageId: string) => {
    e.preventDefault();
    setDragOverStageId(null);

    const recordId = e.dataTransfer.getData('text/plain');
    if (!recordId || !pipeline) return;

    const record = allRecords.find((r) => r.id === recordId);
    if (!record) return;

    // Compute effective current stage using the same resolution logic as
    // the column placement so that dropping onto the same column is a no-op
    const sortedStages = pipeline.stages.slice().sort((a, b) => a.sortOrder - b.sortOrder);
    const localStageIds = new Set(sortedStages.map((s) => s.id));
    const localStageByName = new Map<string, string>();
    for (const s of sortedStages) {
      localStageByName.set(s.name.toLowerCase(), s.id);
      localStageByName.set(s.apiName.toLowerCase(), s.id);
    }

    let effectiveCurrentStageId: string | undefined;
    // Match fieldValues.stage first (same priority as column placement)
    const dropFv = record.fieldValues ?? {};
    const stageField = dropFv.stage;
    if (typeof stageField === 'string' && stageField.trim()) {
      effectiveCurrentStageId = localStageByName.get(stageField.trim().toLowerCase());
    }
    if (!effectiveCurrentStageId && record.currentStageId && localStageIds.has(record.currentStageId)) {
      effectiveCurrentStageId = record.currentStageId;
    }
    if (!effectiveCurrentStageId) {
      effectiveCurrentStageId = sortedStages.find((s) => s.stageType === 'open')?.id;
    }

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
      const updateResponse = await fetch(
        `/api/objects/${apiName}/records/${gateModal.recordId}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${sessionToken}`,
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
      setAllRecords((prev) =>
        prev.map((r) =>
          r.id === gateModal.recordId
            ? { ...r, fieldValues: { ...r.fieldValues, ...fieldValues } }
            : r,
        ),
      );

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
   * Priority:
   *   1. fieldValues.stage matches a stage name or api_name → use that stage
   *      (this keeps the pipeline view in sync with the stage dropdown shown
   *       in the list view)
   *   2. currentStageId matches a known stage in this pipeline → use it
   *   3. Fall back to the first open stage
   */
  function resolveStageForRecord(record: RecordItem): StageDefinition | null {
    // 1. Match fieldValues.stage against stage names / api_names
    const fv = record.fieldValues ?? {};
    const stageFieldValue = fv.stage;
    if (typeof stageFieldValue === 'string' && stageFieldValue.trim()) {
      const matched = stageByName.get(stageFieldValue.trim().toLowerCase());
      if (matched) return matched;
    }

    // 2. Explicit pipeline assignment
    if (record.currentStageId && stageIds.has(record.currentStageId)) {
      return stages.find((s) => s.id === record.currentStageId) ?? null;
    }

    // 3. Fall back to the first open stage
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
      {/* Summary bar — live API data */}
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

      {/* Overdue deals panel */}
      <OverdueDealsPanel records={overdueRecords} apiName={apiName} />

      {/* Filters */}
      <KanbanFilterBar
        filters={filters}
        onChange={setFilters}
        owners={ownerOptions}
      />

      {/* Columns */}
      <div className={styles.columnsContainer}>
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
