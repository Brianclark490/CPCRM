import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useSession } from '@descope/react-sdk';
import { unwrapList, useApiClient } from '../../../../lib/apiClient.js';
import { pageLayoutsKeys } from '../../../../lib/queryKeys.js';
import type { PageLayoutListItem } from '../../types.js';

export interface UsePageLayoutListOptions {
  /**
   * Gate the query behind the active tab. The field builder only loads
   * page layouts when the Page Layout tab is selected — defaults to `true`
   * for non-tab callers.
   */
  enabled?: boolean;
}

/**
 * Fetches the page layouts for an object from
 * `GET /api/v1/admin/objects/{objectId}/page-layouts`.
 *
 * Uses `pageLayoutsKeys.list(objectId)` so mutations that add or remove a
 * layout (page-builder create/copy/delete) can scope invalidation to one
 * object without wiping unrelated caches.
 */
export function usePageLayoutList(
  objectId: string | undefined,
  { enabled = true }: UsePageLayoutListOptions = {},
): UseQueryResult<PageLayoutListItem[]> {
  const { sessionToken } = useSession();
  const api = useApiClient();

  return useQuery({
    queryKey: pageLayoutsKeys.list(objectId ?? ''),
    queryFn: async () => {
      const payload = await api.get<unknown>(
        `/api/v1/admin/objects/${objectId}/page-layouts`,
      );
      return unwrapList<PageLayoutListItem>(payload);
    },
    enabled: Boolean(sessionToken && objectId) && enabled,
  });
}
