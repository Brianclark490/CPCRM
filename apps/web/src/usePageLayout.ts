import { useQuery } from '@tanstack/react-query';
import { useSession } from '@descope/react-sdk';
import { useApiClient } from './lib/apiClient.js';
import { pageLayoutsKeys } from './lib/queryKeys.js';
import type { PageLayout } from './components/layoutTypes.js';

/**
 * Fetches the effective page layout for a given object type.
 *
 * Backed by TanStack Query with the shared `pageLayoutsKeys.effective`
 * key so the admin publish handler can invalidate every listening
 * record-detail page with one call. Returns `layout: null` when the
 * server responds 204 (no layout configured) so callers can fall back
 * to the legacy record form unchanged.
 */
export function usePageLayout(objectApiName: string | undefined) {
  const { sessionToken } = useSession();
  const api = useApiClient();

  const query = useQuery<PageLayout | null>({
    queryKey: pageLayoutsKeys.effective(objectApiName ?? ''),
    enabled: Boolean(sessionToken && objectApiName),
    queryFn: async () => {
      const response = await api.request(
        `/api/v1/objects/${encodeURIComponent(objectApiName!)}/page-layout`,
      );
      if (response.status === 204 || !response.ok) return null;
      return (await response.json()) as PageLayout;
    },
  });

  return {
    layout: query.data ?? null,
    loading: query.isPending && Boolean(sessionToken && objectApiName),
  };
}
