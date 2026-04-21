import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useSession } from '@descope/react-sdk';
import { unwrapList, useApiClient } from '../../../../lib/apiClient.js';
import { objectDefinitionsKeys } from '../../../../lib/queryKeys.js';

export interface ObjectDefinitionSummary {
  id: string;
  apiName: string;
  label?: string;
  pluralLabel?: string;
  isSystem?: boolean;
  nameFieldId?: string;
}

/**
 * Resolve the object definition for a given `apiName` from
 * `GET /api/v1/admin/objects`.
 *
 * The admin list endpoint is the canonical way to translate an `apiName`
 * (which the records routes use as a path parameter) into the opaque object
 * id that every layout / pipeline / page-layout endpoint keys off. The raw
 * list is cached under `objectDefinitionsKeys.all()` so every caller — this
 * hook, the page builder, the record detail page — shares the same cache
 * entry; the per-`apiName` match is derived via `select`.
 */
export function useObjectDefinition(
  apiName: string | undefined,
): UseQueryResult<ObjectDefinitionSummary | null> {
  const { sessionToken } = useSession();
  const api = useApiClient();

  return useQuery<
    ObjectDefinitionSummary[],
    Error,
    ObjectDefinitionSummary | null
  >({
    queryKey: objectDefinitionsKeys.all(),
    queryFn: async () => {
      const payload = await api.get<unknown>('/api/v1/admin/objects');
      return unwrapList<ObjectDefinitionSummary>(payload);
    },
    select: (list) => list.find((o) => o.apiName === apiName) ?? null,
    enabled: Boolean(sessionToken && apiName),
  });
}
