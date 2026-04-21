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
): UseQueryResult<RecordsResponse> {
  const { sessionToken } = useSession();
  const api = useApiClient();

  return useQuery({
    queryKey: recordsKeys.list(apiName ?? '', params as ListParams),
    queryFn: () =>
      api.get<RecordsResponse>(
        `/api/v1/objects/${apiName}/records${buildQueryString(params)}`,
      ),
    enabled: Boolean(sessionToken && apiName),
    placeholderData: keepPreviousData,
  });
}
