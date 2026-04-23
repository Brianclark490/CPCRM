import {
  keepPreviousData,
  useQuery,
  type UseQueryResult,
} from '@tanstack/react-query';
import { useSession } from '@descope/react-sdk';
import { useApiClient } from '../../../../lib/apiClient.js';
import { recordsKeys, type ListParams } from '../../../../lib/queryKeys.js';

export interface RecordField {
  apiName: string;
  label: string;
  fieldType: string;
  value: unknown;
}

export interface RecordItem {
  id: string;
  name: string;
  fieldValues: Record<string, unknown>;
  /**
   * Label-resolved field projection the API returns alongside raw
   * `fieldValues`.  Consumers that render a table column per field — the
   * records list page, the layout-less fallback — rely on this array.  The
   * Kanban board ignores it and only needs `fieldValues`.
   */
  fields?: RecordField[];
  ownerId: string;
  ownerName?: string;
  pipelineId?: string;
  currentStageId?: string;
  stageEnteredAt?: string;
  linkedParent?: {
    objectApiName: string;
    recordId: string;
    recordName: string;
  };
  createdAt: string;
  updatedAt?: string;
}

export interface RecordsObjectSummary {
  id: string;
  apiName: string;
  label: string;
  pluralLabel: string;
  isSystem: boolean;
  nameFieldId?: string;
}

export interface RecordsPagination {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface RecordsResponse {
  data: RecordItem[];
  pagination: RecordsPagination;
  object: RecordsObjectSummary;
}

export interface UseRecordsParams {
  limit?: number;
  offset?: number;
  [key: string]: unknown;
}

export interface UseRecordsOptions {
  /**
   * Extra session-context segments merged into the query key (but not the
   * URL) so the cache entry is scoped to things like the current tenant.
   *
   * The records endpoint is already tenant-filtered server-side via the
   * session cookie, so tenancy does not need to go over the wire. It does,
   * however, need to be part of the client-side cache key: without it, a
   * user who switches organisations can transiently see the previous
   * tenant's records rendered from cache before the refetch completes.
   */
  scope?: Readonly<Record<string, unknown>>;
}

function buildQueryString(params: UseRecordsParams): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const str = search.toString();
  return str ? `?${str}` : '';
}

/**
 * Fetches the paginated list of records for an object from
 * `GET /api/v1/objects/{apiName}/records`.
 *
 * Uses `placeholderData: keepPreviousData` so that paginating / filtering the
 * list keeps showing the previous page of data while the new page loads —
 * avoiding flicker when the user flips through views.
 */
export function useRecords(
  apiName: string | undefined,
  params: UseRecordsParams = {},
  options: UseRecordsOptions = {},
): UseQueryResult<RecordsResponse> {
  const { sessionToken } = useSession();
  const api = useApiClient();
  const { scope } = options;

  const keyParams: ListParams = scope ? { ...scope, ...params } : (params as ListParams);

  return useQuery({
    queryKey: recordsKeys.list(apiName ?? '', keyParams),
    queryFn: () =>
      api.get<RecordsResponse>(
        `/api/v1/objects/${apiName}/records${buildQueryString(params)}`,
      ),
    enabled: Boolean(sessionToken && apiName),
    placeholderData: keepPreviousData,
  });
}
