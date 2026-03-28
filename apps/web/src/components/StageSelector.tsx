import { useState, useEffect, useCallback } from 'react';
import { useSession } from '@descope/react-sdk';
import { GateFailureModal } from './GateFailureModal.js';
import type { GateFailure } from './GateFailureModal.js';
import styles from './StageSelector.module.css';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PipelineStage {
  id: string;
  pipelineId: string;
  name: string;
  apiName: string;
  sortOrder: number;
  stageType: string;
  colour: string;
  defaultProbability?: number;
}

interface StageSelectorProps {
  apiName: string;
  recordId: string;
  currentStageId: string | undefined;
  currentStageName: string | undefined;
  disabled?: boolean;
  onStageChanged: () => void;
}

interface MoveStageErrorResponse {
  error: string;
  code: string;
  failures?: GateFailure[];
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * A pipeline-aware stage selector that replaces the standalone stage dropdown.
 *
 * - Fetches stages from the default pipeline for the object type
 * - Selecting a new stage calls the move-stage API endpoint
 * - If stage gates block the move, shows the GateFailureModal
 * - After a successful move, calls onStageChanged to refresh the record
 */
export function StageSelector({
  apiName,
  recordId,
  currentStageId,
  currentStageName,
  disabled = false,
  onStageChanged,
}: StageSelectorProps) {
  const { sessionToken } = useSession();

  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [loading, setLoading] = useState(true);
  const [moving, setMoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Gate failure modal state
  const [gateFailures, setGateFailures] = useState<GateFailure[] | null>(null);
  const [gateStageName, setGateStageName] = useState('');
  const [gateTargetStageId, setGateTargetStageId] = useState('');

  // ── Fetch pipeline stages ──────────────────────────────────────────────────

  const fetchStages = useCallback(async () => {
    if (!sessionToken) return;

    try {
      const response = await fetch(
        `/api/objects/${apiName}/records/pipeline-stages`,
        { headers: { Authorization: `Bearer ${sessionToken}` } },
      );

      if (response.ok) {
        const data = (await response.json()) as { pipelineId: string | null; stages: PipelineStage[] };
        setStages(data.stages);
      }
    } catch {
      // Pipeline stages fetch is best-effort — fall back gracefully
    } finally {
      setLoading(false);
    }
  }, [sessionToken, apiName]);

  useEffect(() => {
    void fetchStages();
  }, [fetchStages]);

  // ── Move stage ─────────────────────────────────────────────────────────────

  const moveToStage = useCallback(
    async (targetStageId: string) => {
      if (!sessionToken || moving) return;

      setMoving(true);
      setError(null);
      setSuccess(false);

      try {
        const response = await fetch(
          `/api/objects/${apiName}/records/${recordId}/move-stage`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${sessionToken}`,
            },
            body: JSON.stringify({ target_stage_id: targetStageId }),
          },
        );

        if (response.ok) {
          setSuccess(true);
          onStageChanged();
          return;
        }

        const data = (await response.json()) as MoveStageErrorResponse;

        if (data.code === 'GATE_VALIDATION_FAILED' && data.failures) {
          const targetStage = stages.find((s) => s.id === targetStageId);
          setGateStageName(targetStage?.name ?? 'target stage');
          setGateTargetStageId(targetStageId);
          setGateFailures(data.failures);
          return;
        }

        setError(data.error ?? 'Failed to move stage');
      } catch {
        setError('Failed to connect to the server. Please try again.');
      } finally {
        setMoving(false);
      }
    },
    [sessionToken, apiName, recordId, stages, moving, onStageChanged],
  );

  // ── Handle stage dropdown change ───────────────────────────────────────────

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const targetStageId = e.target.value;
    if (!targetStageId || targetStageId === currentStageId) return;
    void moveToStage(targetStageId);
  };

  // ── Handle gate failure modal ──────────────────────────────────────────────

  const handleFillAndMove = async (fieldValues: Record<string, unknown>) => {
    if (!sessionToken) return;

    setMoving(true);
    setError(null);

    try {
      // First, update the record with the gate field values
      const updateResponse = await fetch(
        `/api/objects/${apiName}/records/${recordId}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${sessionToken}`,
          },
          body: JSON.stringify({ fieldValues }),
        },
      );

      if (!updateResponse.ok) {
        const data = (await updateResponse.json()) as { error?: string };
        setError(data.error ?? 'Failed to update fields');
        setMoving(false);
        return;
      }

      // Then retry the move-stage
      const moveResponse = await fetch(
        `/api/objects/${apiName}/records/${recordId}/move-stage`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${sessionToken}`,
          },
          body: JSON.stringify({ target_stage_id: gateTargetStageId }),
        },
      );

      if (moveResponse.ok) {
        setGateFailures(null);
        setSuccess(true);
        onStageChanged();
        return;
      }

      const data = (await moveResponse.json()) as MoveStageErrorResponse;

      if (data.code === 'GATE_VALIDATION_FAILED' && data.failures) {
        // Still failing — update the modal with remaining failures
        setGateFailures(data.failures);
        return;
      }

      setError(data.error ?? 'Failed to move stage');
      setGateFailures(null);
    } catch {
      setError('Failed to connect to the server. Please try again.');
      setGateFailures(null);
    } finally {
      setMoving(false);
    }
  };

  const handleGateCancel = () => {
    setGateFailures(null);
    setGateTargetStageId('');
    setGateStageName('');
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  // If no stages loaded, show nothing (pipeline not configured)
  if (loading || stages.length === 0) {
    return null;
  }

  return (
    <div className={styles.wrapper}>
      <select
        className={styles.select}
        value={currentStageId ?? ''}
        onChange={handleChange}
        disabled={disabled || moving}
        data-testid="stage-selector"
      >
        {!currentStageId && (
          <option value="">Select stage</option>
        )}
        {stages.map((stage) => (
          <option key={stage.id} value={stage.id}>
            {stage.name}
          </option>
        ))}
      </select>

      {error && <span className={styles.error}>{error}</span>}
      {success && <span className={styles.success}>Stage updated</span>}

      {gateFailures && (
        <GateFailureModal
          stageName={gateStageName}
          failures={gateFailures}
          onFillAndMove={(values) => void handleFillAndMove(values)}
          onCancel={handleGateCancel}
          loading={moving}
        />
      )}
    </div>
  );
}
