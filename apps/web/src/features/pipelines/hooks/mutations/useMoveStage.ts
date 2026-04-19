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
  /**
   * API name (or name) of the target stage.  When supplied and the record
   * already carries a `fieldValues.stage` field, the optimistic patch rewrites
   * it so `KanbanBoard`'s column resolver — which prefers `fieldValues.stage`
   * over `currentStageId` — visibly moves the card before the round-trip.
   */
  targetStageApiName?: string;
}

/** Server payload returned on a 422 gate-validation failure. */
interface GateFailureBody {
  error?: string;
  code?: string;
  failures?: GateFailure[];
}

/**
 * Snapshot of the single record being mutated. Rolling back at the record
 * level — rather than replacing the whole list with a pre-mutate copy — keeps
 * concurrent successful moves on *other* records intact when this one fails.
 */
interface MoveStageContext {
  previous:
    | {
        currentStageId: string | undefined;
        stageEnteredAt: string | undefined;
        fieldValues: Record<string, unknown> | undefined;
      }
    | null;
}

export interface UseMoveStageOptions {
  apiName: ObjectApiName;
  /**
   * Filters/pagination used by the records list this hook mutates. Required:
   * the optimistic patch + rollback target exactly `recordsKeys.list(apiName,
   * listParams)`, so callers must pass the same params they gave `useRecords`
   * or the update will silently miss the cache entry.
   */
  listParams: ListParams;
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

/**
 * Replace a single record in the cached list via `queryClient.setQueryData`.
 * Leaves every other record untouched so concurrent mutations on siblings
 * aren't clobbered.
 */
function patchOneRecord(
  queryClient: ReturnType<typeof useQueryClient>,
  key: readonly unknown[],
  recordId: RecordId,
  apply: (record: RecordItem) => RecordItem,
): void {
  queryClient.setQueryData<RecordsResponse>(key, (prev) => {
    if (!prev) return prev;
    return {
      ...prev,
      data: prev.data.map((r) => (r.id === recordId ? apply(r) : r)),
    };
  });
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Move a record to a new pipeline stage with optimistic UI and 422 rollback.
 *
 * Flow:
 *   1. `onMutate` snapshots the affected record's prior stage fields and
 *      optimistically patches `currentStageId`, `stageEnteredAt`, and — when
 *      the record has one — `fieldValues.stage`, so the card visibly jumps to
 *      the target column before the network round-trip.
 *   2. `onError` restores just that record's pre-mutate fields — not the
 *      whole list — so concurrent successful moves on siblings aren't
 *      clobbered. When the error is a 422 gate-validation failure the parsed
 *      `failures` are forwarded to `onGateFailure`.
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

    onMutate: async ({ recordId, targetStageId, targetStageApiName }) => {
      // Cancel in-flight refetches so they don't overwrite the optimistic patch.
      await queryClient.cancelQueries({ queryKey: recordsListKey });

      const currentList =
        queryClient.getQueryData<RecordsResponse>(recordsListKey);
      const existing = currentList?.data.find((r) => r.id === recordId);

      const previous: MoveStageContext['previous'] = existing
        ? {
            currentStageId: existing.currentStageId,
            stageEnteredAt: existing.stageEnteredAt,
            fieldValues: existing.fieldValues,
          }
        : null;

      const now = new Date().toISOString();
      patchOneRecord(queryClient, recordsListKey, recordId, (r) => {
        const hasStageField =
          r.fieldValues && typeof r.fieldValues.stage === 'string';
        const fieldValues =
          hasStageField && targetStageApiName
            ? { ...r.fieldValues, stage: targetStageApiName }
            : r.fieldValues;
        return {
          ...r,
          currentStageId: targetStageId,
          stageEnteredAt: now,
          fieldValues,
        };
      });

      return { previous };
    },

    onError: (error, vars, context) => {
      if (context?.previous) {
        const { previous } = context;
        patchOneRecord(queryClient, recordsListKey, vars.recordId, (r) => ({
          ...r,
          currentStageId: previous.currentStageId,
          stageEnteredAt: previous.stageEnteredAt,
          fieldValues: previous.fieldValues ?? {},
        }));
      }
      const failures = extractGateFailures(error);
      if (failures && onGateFailure) {
        onGateFailure(failures, vars);
      }
    },

    onSuccess: (data) => {
      patchOneRecord(queryClient, recordsListKey, data.id, (r) => ({
        ...r,
        pipelineId: data.pipelineId,
        currentStageId: data.currentStageId,
        stageEnteredAt: data.stageEnteredAt,
        fieldValues: data.fieldValues,
      }));
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
