import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from '@tanstack/react-query';
import { ApiError, useApiClient } from '../../../../lib/apiClient.js';
import {
  pipelinesKeys,
  recordsKeys,
  type ListParams,
  type ObjectApiName,
  type PipelineId,
  type RecordId,
} from '../../../../lib/queryKeys.js';
import type {
  RecordItem,
  RecordsResponse,
} from '../../../records/hooks/queries/useRecords.js';
import type { GateFailure } from '../../../../components/GateFailureModal.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MoveStageResponse {
  id: string;
  pipelineId: string;
  currentStageId: string;
  stageEnteredAt: string;
  fieldValues: Record<string, unknown>;
}

export interface MoveStageVariables {
  recordId: RecordId;
  targetStageId: string;
}

/** Server payload returned on a 422 gate-validation failure. */
interface GateFailureBody {
  error?: string;
  code?: string;
  failures?: GateFailure[];
}

interface MoveStageContext {
  previousRecords: RecordsResponse | undefined;
}

export interface UseMoveStageOptions {
  apiName: ObjectApiName;
  /**
   * Filters/pagination used by the records list this hook mutates. Must match
   * the params passed to the corresponding `useRecords` call so the optimistic
   * update targets the right cache entry.
   */
  listParams?: ListParams;
  /**
   * Pipeline id whose analytics key should be invalidated on settle.  When
   * absent, analytics invalidation is skipped — callers that haven't resolved
   * a pipeline id yet shouldn't trigger spurious refetches.
   */
  pipelineId?: PipelineId;
  /**
   * Called when the server rejects the move with a 422 gate-validation error.
   * Receives the parsed `failures` array so the caller can open its gate
   * modal.  The optimistic update has already been rolled back by the time
   * this fires.
   */
  onGateFailure?: (failures: GateFailure[], vars: MoveStageVariables) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractGateFailures(error: unknown): GateFailure[] | null {
  if (!(error instanceof ApiError) || error.status !== 422) return null;
  const body = error.body as GateFailureBody | undefined;
  if (!body || !Array.isArray(body.failures)) return null;
  return body.failures;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Move a record to a new pipeline stage with optimistic UI and 422 rollback.
 *
 * Flow:
 *   1. `onMutate` snapshots the records list and optimistically patches
 *      `currentStageId` + `stageEnteredAt` on the affected record so the card
 *      visibly jumps to the target column before the network round-trip.
 *   2. `onError` restores the snapshot.  When the error is a 422 gate-
 *      validation failure the parsed `failures` are forwarded to
 *      `onGateFailure` so the caller can open its modal.
 *   3. `onSuccess` merges the authoritative response (including server-
 *      computed `fieldValues` like `probability`) back into the cache.
 *   4. `onSettled` invalidates the pipeline analytics key so summary /
 *      velocity / overdue panels pick up the new stage distribution.
 */
export function useMoveStage(
  options: UseMoveStageOptions,
): UseMutationResult<
  MoveStageResponse,
  ApiError,
  MoveStageVariables,
  MoveStageContext
> {
  const api = useApiClient();
  const queryClient = useQueryClient();
  const { apiName, listParams, pipelineId, onGateFailure } = options;
  const recordsListKey = recordsKeys.list(apiName, listParams);

  return useMutation<
    MoveStageResponse,
    ApiError,
    MoveStageVariables,
    MoveStageContext
  >({
    mutationFn: ({ recordId, targetStageId }) =>
      api.post<MoveStageResponse>(
        `/api/v1/objects/${apiName}/records/${recordId}/move-stage`,
        { body: { target_stage_id: targetStageId } },
      ),

    onMutate: async ({ recordId, targetStageId }) => {
      // Cancel in-flight refetches so they don't overwrite the optimistic patch.
      await queryClient.cancelQueries({ queryKey: recordsListKey });

      const previousRecords =
        queryClient.getQueryData<RecordsResponse>(recordsListKey);
      const now = new Date().toISOString();

      queryClient.setQueryData<RecordsResponse>(recordsListKey, (prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          data: prev.data.map((r: RecordItem) =>
            r.id === recordId
              ? { ...r, currentStageId: targetStageId, stageEnteredAt: now }
              : r,
          ),
        };
      });

      return { previousRecords };
    },

    onError: (error, vars, context) => {
      if (context?.previousRecords !== undefined) {
        queryClient.setQueryData(recordsListKey, context.previousRecords);
      }
      const failures = extractGateFailures(error);
      if (failures && onGateFailure) {
        onGateFailure(failures, vars);
      }
    },

    onSuccess: (data) => {
      queryClient.setQueryData<RecordsResponse>(recordsListKey, (prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          data: prev.data.map((r: RecordItem) =>
            r.id === data.id
              ? {
                  ...r,
                  pipelineId: data.pipelineId,
                  currentStageId: data.currentStageId,
                  stageEnteredAt: data.stageEnteredAt,
                  fieldValues: data.fieldValues,
                }
              : r,
          ),
        };
      });
    },

    onSettled: () => {
      if (pipelineId) {
        void queryClient.invalidateQueries({
          queryKey: pipelinesKeys.analytics(pipelineId),
        });
      }
    },
  });
}
