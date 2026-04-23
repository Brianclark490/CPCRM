import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useSession } from '@descope/react-sdk';
import { unwrapList, useApiClient } from '../../../../lib/apiClient.js';
import { objectDefinitionsKeys } from '../../../../lib/queryKeys.js';
import type { ObjectDefinitionListItem } from '../../types.js';

export interface UseObjectDefinitionsOptions {
  /**
   * Gate the query behind the active tab. The field builder only needs the
   * object list for the Relationships target dropdown — defaults to `true`
   * so shared callers (record list page, etc.) see normal query behaviour.
   */
  enabled?: boolean;
}

/**
 * Fetches the list of object definitions from `GET /api/v1/admin/objects`.
 *
 * Cached under `objectDefinitionsKeys.all()` — the same key
 * `useObjectDefinition` in the records feature uses — so every consumer
 * shares one cache entry. Used by the relationships editor to populate the
 * "target object" dropdown.
 */
export function useObjectDefinitions(
  { enabled = true }: UseObjectDefinitionsOptions = {},
): UseQueryResult<ObjectDefinitionListItem[]> {
  const { sessionToken } = useSession();
  const api = useApiClient();

  return useQuery({
    queryKey: objectDefinitionsKeys.all(),
    queryFn: async () => {
      const payload = await api.get<unknown>('/api/v1/admin/objects');
      return unwrapList<ObjectDefinitionListItem>(payload);
    },
    enabled: Boolean(sessionToken) && enabled,
  });
}
