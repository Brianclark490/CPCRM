import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useSession } from '@descope/react-sdk';
import { unwrapList, useApiClient } from '../../../../lib/apiClient.js';
import { relationshipsKeys } from '../../../../lib/queryKeys.js';
import type { RelationshipDefinition } from '../../types.js';

export interface UseObjectRelationshipsOptions {
  /**
   * Gate the query behind the active tab. The field builder only loads
   * relationships when the Relationships tab is selected — defaults to
   * `true` so callers outside the tab UI behave like a normal query.
   */
  enabled?: boolean;
}

/**
 * Fetches the list of relationships for an object from
 * `GET /api/v1/admin/objects/{objectId}/relationships`.
 *
 * Tab-driven: pass `enabled: activeTab === 'relationships'` so the request
 * only fires the first time the user opens that tab. After that, TanStack
 * Query reuses the cache on subsequent tab switches until a relationship
 * mutation invalidates `relationshipsKeys.byObject(objectId)`.
 */
export function useObjectRelationships(
  objectId: string | undefined,
  { enabled = true }: UseObjectRelationshipsOptions = {},
): UseQueryResult<RelationshipDefinition[]> {
  const { sessionToken } = useSession();
  const api = useApiClient();

  return useQuery({
    queryKey: relationshipsKeys.list(objectId ?? ''),
    queryFn: async () => {
      const payload = await api.get<unknown>(
        `/api/v1/admin/objects/${objectId}/relationships`,
      );
      return unwrapList<RelationshipDefinition>(payload);
    },
    enabled: Boolean(sessionToken && objectId) && enabled,
  });
}
