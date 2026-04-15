import { useState, useEffect, useCallback } from 'react';
import { useSession } from '@descope/react-sdk';
import { ApiError, useApiClient, unwrapList } from '../lib/apiClient.js';
import { GateFailureModal } from './GateFailureModal.js';
import type { GateFailure } from './GateFailureModal.js';
import styles from './StageFieldRenderer.module.css';

// ─── Types ────────────────────────────────────────────────────────────────────

interface StageDefinition {
  id: string;
  name: string;
  apiName: string;
  sortOrder: number;
  stageType: string;
  colour: string;
  defaultProbability?: number;
}

interface PipelineDefinition {
  id: string;
  name: string;
  objectId: string;
  stages: StageDefinition[];
}

interface MoveStageResponse {
  id: string;
  pipelineId: string;
  currentStageId: string;
  fieldValues: Record<string, unknown>;
}

export interface StageFieldRendererProps {
  /** Object api_name (e.g. 'opportunity') */
  objectApiName: string;
  /** Object definition ID — used to match the pipeline when no pipelineId is provided */
  objectId: string;
  /**
   * Pipeline ID the record actually lives in. When provided, stages are
   * loaded from this pipeline directly so the dropdown never offers stages
   * from a sibling pipeline. Falls back to the first pipeline matching
   * `objectId` when omitted (e.g. on create forms).
   */
  pipelineId?: string | null;
  /** Record ID — null on create forms */
  recordId: string | null;
  /** Current stage ID from the record — null on create or if not yet assigned */
  currentStageId: string | null;
  /** Current stage name from field_values (fallback display) */
  value: unknown;
  /** Whether the field is in edit mode */
  editing: boolean;
  /** Whether input should be disabled */
  disabled?: boolean;
  /** Callback when stage value changes (used on create forms) */
  onChange?: (value: unknown) => void;
  /** Callback when a stage move succeeds (record detail page) */
  onStageChanged?: (result: {
    currentStageId: string;
    fieldValues: Record<string, unknown>;
  }) => void;
}

/**
 * Extract gate validation failures from an {@link ApiError} body. Handles
 * both the canonical shape (`body.error.details.failures`, produced by the
 * `normalizeErrorResponses` middleware) and the legacy top-level `failures`
 * shape that some tests still mock.
 */
function extractGateFailures(body: unknown): GateFailure[] {
  if (!body || typeof body !== 'object') return [];
  const record = body as Record<string, unknown>;
  const err = record.error;
  if (err && typeof err === 'object') {
    const details = (err as Record<string, unknown>).details;
    if (details && typeof details === 'object') {
      const failures = (details as Record<string, unknown>).failures;
      if (Array.isArray(failures)) return failures as GateFailure[];
    }
  }
  if (Array.isArray(record.failures)) return record.failures as GateFailure[];
  return [];
}

// ─── Colour helpers ───────────────────────────────────────────────────────────

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

function colourToBg(colour: string): string {
  const hex = resolveColour(colour);
  return `${hex}25`; // ~15% opacity via hex alpha
}

// ─── Component ────────────────────────────────────────────────────────────────

export function StageFieldRenderer({
  objectApiName,
  objectId,
  pipelineId,
  recordId,
  currentStageId,
  value,
  editing,
  disabled = false,
  onChange,
  onStageChanged,
}: StageFieldRendererProps) {
  const { sessionToken } = useSession();
  const api = useApiClient();

  const [stages, setStages] = useState<StageDefinition[]>([]);
  const [loadingStages, setLoadingStages] = useState(true);
  const [moving, setMoving] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);

  // Gate failure modal state
  const [gateModal, setGateModal] = useState<{
    targetStageId: string;
    stageName: string;
    failures: GateFailure[];
  } | null>(null);
  const [gateLoading, setGateLoading] = useState(false);
  const [gateError, setGateError] = useState<string | null>(null);

  // ── Fetch pipeline stages ──────────────────────────────────

  useEffect(() => {
    if (!sessionToken || !objectId) return;

    let cancelled = false;

    const resolvePipelineId = async (): Promise<string | null> => {
      // Prefer the caller-provided pipelineId so we never guess and end up
      // loading a sibling pipeline for the same object.
      if (pipelineId) return pipelineId;

      // Fall back to the first pipeline matching this object (create forms).
      const response = await api.request('/api/v1/admin/pipelines');
      if (!response.ok) return null;
      const pipelines = unwrapList<
        PipelineDefinition & { objectId?: string; object_id?: string }
      >(await response.json());
      const match = pipelines.find(
        (p) => (p.objectId ?? p.object_id) === objectId,
      );
      return match?.id ?? null;
    };

    const loadStages = async () => {
      setLoadingStages(true);

      try {
        const resolvedId = await resolvePipelineId();
        if (cancelled || !resolvedId) return;

        const detailResponse = await api.request(
          `/api/v1/admin/pipelines/${resolvedId}`,
        );

        if (cancelled) return;

        if (detailResponse.ok) {
          const detail = (await detailResponse.json()) as PipelineDefinition;
          if (!cancelled) {
            setStages(detail.stages ?? []);
          }
        }
      } catch {
        // Best-effort — fall back to regular field value
      } finally {
        if (!cancelled) setLoadingStages(false);
      }
    };

    void loadStages();

    return () => {
      cancelled = true;
    };
  }, [sessionToken, api, objectId, pipelineId]);

  // ── Move stage (for existing records) ──────────────────────

  const handleMoveStage = useCallback(
    async (targetStageId: string) => {
      if (!sessionToken || !recordId) return;

      setMoving(true);
      setMoveError(null);

      try {
        const result = await api.post<MoveStageResponse>(
          `/api/v1/objects/${objectApiName}/records/${recordId}/move-stage`,
          { body: { target_stage_id: targetStageId } },
        );
        onStageChanged?.({
          currentStageId: result.currentStageId,
          fieldValues: result.fieldValues,
        });
      } catch (err) {
        if (err instanceof ApiError && err.code === 'GATE_VALIDATION_FAILED') {
          const targetStage = stages.find((s) => s.id === targetStageId);
          setGateModal({
            targetStageId,
            stageName: targetStage?.name ?? 'Unknown',
            failures: extractGateFailures(err.body),
          });
          setGateError(null);
        } else if (err instanceof ApiError) {
          setMoveError(err.message);
        } else {
          setMoveError('Failed to connect to the server');
        }
      } finally {
        setMoving(false);
      }
    },
    [sessionToken, api, recordId, objectApiName, stages, onStageChanged],
  );

  // ── Gate failure: fill fields and retry move ───────────────

  const handleFillAndMove = useCallback(
    async (fieldValues: Record<string, unknown>) => {
      if (!sessionToken || !recordId || !gateModal) return;

      setGateLoading(true);
      // Clear any previous server-side error so the user sees a fresh state
      // while this attempt is in-flight.
      setGateError(null);

      try {
        // First update the record with the filled field values
        await api.put(
          `/api/v1/objects/${objectApiName}/records/${recordId}`,
          { body: { fieldValues } },
        );

        // Now retry the stage move
        const result = await api.post<MoveStageResponse>(
          `/api/v1/objects/${objectApiName}/records/${recordId}/move-stage`,
          { body: { target_stage_id: gateModal.targetStageId } },
        );

        setGateModal(null);
        setGateError(null);
        onStageChanged?.({
          currentStageId: result.currentStageId,
          fieldValues: result.fieldValues,
        });
      } catch (err) {
        if (err instanceof ApiError && err.code === 'GATE_VALIDATION_FAILED') {
          // Still failing — update the modal with new failures
          const failures = extractGateFailures(err.body);
          setGateModal((prev) => (prev ? { ...prev, failures } : null));
          setGateError(null);
        } else if (err instanceof ApiError) {
          // Non-gate failure (validation, network, auth, etc.) — keep the
          // modal open so the user can correct their input without losing
          // the values they have already entered, and surface the server
          // message inside the modal.
          setGateError(err.message);
        } else {
          setGateError('Failed to connect to the server');
        }
      } finally {
        setGateLoading(false);
      }
    },
    [sessionToken, api, recordId, objectApiName, gateModal, onStageChanged],
  );

  // ── Handle dropdown change ─────────────────────────────────

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const selectedId = e.target.value;
      if (!selectedId) return;

      if (recordId) {
        // Existing record — use move-stage API
        void handleMoveStage(selectedId);
      } else {
        // Create form — just update the field value with the stage name
        const stage = stages.find((s) => s.id === selectedId);
        onChange?.(stage?.name ?? selectedId);
      }
    },
    [recordId, stages, handleMoveStage, onChange],
  );

  // ── Loading state ──────────────────────────────────────────

  if (loadingStages) {
    return <span className={styles.loading}>Loading stages…</span>;
  }

  // If no stages were loaded, fall back to showing the raw value
  if (stages.length === 0) {
    if (value !== null && value !== undefined && value !== '') {
      return <span>{String(value)}</span>;
    }
    return <span className={styles.loading}>—</span>;
  }

  // ── View mode ──────────────────────────────────────────────

  if (!editing) {
    const currentStage = currentStageId
      ? stages.find((s) => s.id === currentStageId)
      : null;
    const displayName = currentStage?.name ?? (value ? String(value) : '—');
    const colour = currentStage?.colour ?? 'gray';

    return (
      <span
        className={styles.badge}
        style={{
          backgroundColor: colourToBg(colour),
          color: resolveColour(colour),
        }}
      >
        <span
          className={styles.badgeDot}
          style={{ backgroundColor: resolveColour(colour) }}
        />
        {displayName}
      </span>
    );
  }

  // ── Edit / Create mode ─────────────────────────────────────

  // Resolve the currently selected stage ID
  let selectedStageId = currentStageId ?? '';
  if (!selectedStageId && value) {
    // On create forms, match by stage name
    const matchedStage = stages.find(
      (s) =>
        s.name.toLowerCase() === String(value).toLowerCase() ||
        s.apiName.toLowerCase() === String(value).toLowerCase(),
    );
    if (matchedStage) selectedStageId = matchedStage.id;
  }

  return (
    <>
      <select
        className={styles.select}
        value={selectedStageId}
        onChange={handleChange}
        disabled={disabled || moving}
      >
        <option value="">Select stage</option>
        {stages.map((stage) => (
          <option key={stage.id} value={stage.id}>
            {stage.name}
            {stage.defaultProbability !== undefined
              ? ` (${stage.defaultProbability}%)`
              : ''}
          </option>
        ))}
      </select>

      {moveError && <p className={styles.error}>{moveError}</p>}

      {gateModal && (
        <GateFailureModal
          stageName={gateModal.stageName}
          failures={gateModal.failures}
          onFillAndMove={(fv) => void handleFillAndMove(fv)}
          onCancel={() => {
            setGateModal(null);
            setGateError(null);
          }}
          loading={gateLoading}
          error={gateError}
        />
      )}
    </>
  );
}
