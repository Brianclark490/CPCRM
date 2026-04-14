import { useState, useEffect, useCallback } from 'react';
import { useSession } from '@descope/react-sdk';
import { useApiClient, unwrapList } from '../lib/apiClient.js';
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

interface GateFailureResponse {
  error: string;
  code: string;
  failures: GateFailure[];
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
  /** Object definition ID — used to match the pipeline */
  objectId: string;
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

  // ── Fetch pipeline stages ──────────────────────────────────

  useEffect(() => {
    if (!sessionToken || !objectId) return;

    let cancelled = false;

    const loadStages = async () => {
      setLoadingStages(true);

      try {
        const response = await api.request('/api/v1/admin/pipelines');

        if (cancelled || !response.ok) {
          if (!cancelled) setLoadingStages(false);
          return;
        }

        const pipelines = unwrapList<
          PipelineDefinition & { objectId?: string; object_id?: string }
        >(await response.json());
        const match = pipelines.find(
          (p) => (p.objectId ?? p.object_id) === objectId,
        );

        if (!match || cancelled) {
          if (!cancelled) setLoadingStages(false);
          return;
        }

        // Fetch pipeline detail for stages
        const detailResponse = await api.request(
          `/api/v1/admin/pipelines/${match.id}`,
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
  }, [sessionToken, api, objectId]);

  // ── Move stage (for existing records) ──────────────────────

  const handleMoveStage = useCallback(
    async (targetStageId: string) => {
      if (!sessionToken || !recordId) return;

      setMoving(true);
      setMoveError(null);

      try {
        const response = await api.request(
          `/api/v1/objects/${objectApiName}/records/${recordId}/move-stage`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ target_stage_id: targetStageId }),
          },
        );

        if (response.ok) {
          const result = (await response.json()) as MoveStageResponse;
          onStageChanged?.({
            currentStageId: result.currentStageId,
            fieldValues: result.fieldValues,
          });
        } else if (response.status === 422) {
          // Gate validation failed — show gate failure modal
          const data = (await response.json()) as GateFailureResponse;
          const targetStage = stages.find((s) => s.id === targetStageId);
          setGateModal({
            targetStageId,
            stageName: targetStage?.name ?? 'Unknown',
            failures: data.failures,
          });
        } else {
          const data = (await response.json()) as { error?: string };
          setMoveError(data.error ?? 'Failed to move stage');
        }
      } catch {
        setMoveError('Failed to connect to the server');
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

      try {
        // First update the record with the filled field values
        const updateResponse = await api.request(
          `/api/v1/objects/${objectApiName}/records/${recordId}`,
          {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ fieldValues }),
          },
        );

        if (!updateResponse.ok) {
          return;
        }

        // Now retry the stage move
        const moveResponse = await api.request(
          `/api/v1/objects/${objectApiName}/records/${recordId}/move-stage`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ target_stage_id: gateModal.targetStageId }),
          },
        );

        if (moveResponse.ok) {
          const result = (await moveResponse.json()) as MoveStageResponse;
          setGateModal(null);
          onStageChanged?.({
            currentStageId: result.currentStageId,
            fieldValues: result.fieldValues,
          });
        } else if (moveResponse.status === 422) {
          // Still failing — update the modal with new failures
          const data = (await moveResponse.json()) as GateFailureResponse;
          setGateModal((prev) =>
            prev ? { ...prev, failures: data.failures } : null,
          );
        } else {
          setGateModal(null);
          setMoveError('Failed to move stage after updating fields');
        }
      } catch {
        setMoveError('Failed to connect to the server');
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
          onCancel={() => setGateModal(null)}
          loading={gateLoading}
        />
      )}
    </>
  );
}
