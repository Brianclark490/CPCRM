import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from '@tanstack/react-query';
import { ApiError, useApiClient } from '../../../../lib/apiClient.js';
import {
  recordsKeys,
  type ListParams,
  type ObjectApiName,
  type RecordId,
} from '../../../../lib/queryKeys.js';
import type { RecordItem, RecordsResponse } from '../queries/useRecords.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UpdateRecordResponse {
  id: string;
  fieldValues: Record<string, unknown>;
}

export interface UpdateRecordVariables {
  recordId: RecordId;
  fieldValues: Record<string, unknown>;
}

export interface UseUpdateRecordOptions {
  apiName: ObjectApiName;
  /**
   * Filters/pagination used by the records list this hook mutates. The
   * optimistic patch targets exactly `recordsKeys.list(apiName, listParams)`,
   * so callers must pass the same params they gave `useRecords` or the update
   * will silently miss the cache entry.
   */
  listParams: ListParams;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * PUT record field values.
 *
 * Merges the submitted `fieldValues` into the cached list entry on success
 * so consumers (e.g. Kanban board) see the new values immediately without
 * a refetch. Used by the gate-failure "fill and move" flow to satisfy
 * required fields before retrying the stage move — see `useMoveStage`.
 */
export function useUpdateRecord(
  options: UseUpdateRecordOptions,
): UseMutationResult<UpdateRecordResponse, ApiError, UpdateRecordVariables> {
  const api = useApiClient();
  const queryClient = useQueryClient();
  const { apiName, listParams } = options;
  const recordsListKey = recordsKeys.list(apiName, listParams);

  return useMutation<UpdateRecordResponse, ApiError, UpdateRecordVariables>({
    mutationFn: ({ recordId, fieldValues }) =>
      api.put<UpdateRecordResponse>(
        `/api/v1/objects/${apiName}/records/${recordId}`,
        { body: { fieldValues } },
      ),

    onSuccess: (data, { recordId, fieldValues }) => {
      // Merge submitted values into the cached record so the Kanban card
      // reflects the new field state immediately. Prefer the server's
      // authoritative `fieldValues` when returned; otherwise fall back to
      // the caller's payload.
      const merged = data?.fieldValues ?? fieldValues;
      queryClient.setQueryData<RecordsResponse>(recordsListKey, (prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          data: prev.data.map((r: RecordItem) =>
            r.id === recordId
              ? { ...r, fieldValues: { ...r.fieldValues, ...merged } }
              : r,
          ),
        };
      });
    },
  });
}
