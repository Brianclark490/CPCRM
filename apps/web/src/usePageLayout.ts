import { useQuery } from '@tanstack/react-query';
import { useSession } from '@descope/react-sdk';
import { useApiClient } from './lib/apiClient.js';
import { pageLayoutsKeys } from './lib/queryKeys.js';
import { normalizeLayout, type PageLayout } from './components/layoutTypes.js';

/**
 * Fetches the effective page layout for a given object type.
 *
 * Backed by TanStack Query with the shared `pageLayoutsKeys.effective`
 * key so the admin publish handler can invalidate every listening
 * record-detail page with one call. Returns `layout: null` when the
 * server responds 204 (no layout configured) so callers can fall back
 * to the legacy record form unchanged; any other non-OK response
 * propagates as an error so the default retry kicks in instead of
 * caching a spurious "no layout" for the global staleTime window.
 *
 * `staleTime: 0` and the always-refetch flags restore the original
 * per-mount/per-focus fetch semantics a record page needs; publishes
 * from other tabs then land as soon as the record tab regains focus.
 */
export function usePageLayout(objectApiName: string | undefined) {
  const { sessionToken } = useSession();
  const api = useApiClient();

  const query = useQuery<PageLayout | null>({
    queryKey: pageLayoutsKeys.effective(objectApiName ?? ''),
    enabled: Boolean(sessionToken && objectApiName),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
    queryFn: async () => {
      const response = await api.request(
        `/api/v1/objects/${encodeURIComponent(objectApiName!)}/page-layout`,
      );
      if (response.status === 204) return null;
      if (!response.ok) {
        throw new Error(`Failed to load page layout: ${response.status}`);
      }
      return normalizeLayout(await response.json() as PageLayout);
    },
  });

  return {
    layout: query.data ?? null,
    loading: query.isPending && Boolean(sessionToken && objectApiName),
  };
}
