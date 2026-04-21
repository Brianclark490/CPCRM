import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useSession } from '@descope/react-sdk';
import { useApiClient } from '../../../../lib/apiClient.js';
import { objectDefinitionsKeys } from '../../../../lib/queryKeys.js';
import type { ObjectDefinitionDetail } from '../../types.js';

/**
 * Fetches an object definition (including its fields) from
 * `GET /api/v1/admin/objects/{objectId}`.
 *
 * This is the Fields-tab data source for the field builder: the response
 * carries the object metadata used in the header (label, icon, description)
 * plus the full ordered field list rendered in `FieldList`. The key is
 * shared with every other caller of the per-object detail endpoint
 * (`objectDefinitionsKeys.detail(objectId)`), so field and relationship
 * mutations can invalidate a single, well-known cache entry.
 */
export function useFieldDefinitions(
  objectId: string | undefined,
): UseQueryResult<ObjectDefinitionDetail> {
  const { sessionToken } = useSession();
  const api = useApiClient();

  return useQuery({
    queryKey: objectDefinitionsKeys.detail(objectId ?? ''),
    queryFn: () =>
      api.get<ObjectDefinitionDetail>(`/api/v1/admin/objects/${objectId}`),
    enabled: Boolean(sessionToken && objectId),
  });
}
