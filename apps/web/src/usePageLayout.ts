import { useState, useEffect } from 'react';
import { useSession } from '@descope/react-sdk';
import { useApiClient } from './lib/apiClient.js';
import type { PageLayout } from './components/layoutTypes.js';

/**
 * Fetches the effective page layout for a given object type.
 * Returns null if no page layout is configured — the caller should
 * fall back to the legacy record form.
 */
export function usePageLayout(objectApiName: string | undefined) {
  const { sessionToken } = useSession();
  const api = useApiClient();
  const [layout, setLayout] = useState<PageLayout | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sessionToken || !objectApiName) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    const loadLayout = async () => {
      setLoading(true);

      try {
        const response = await api.request(
          `/api/v1/objects/${encodeURIComponent(objectApiName)}/page-layout`,
        );

        if (cancelled) return;

        if (response.status === 204) {
          if (!cancelled) setLayout(null);
        } else if (response.ok) {
          const data = (await response.json()) as PageLayout;
          if (!cancelled) setLayout(data);
        } else {
          if (!cancelled) setLayout(null);
        }
      } catch {
        if (!cancelled) setLayout(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadLayout();

    return () => {
      cancelled = true;
    };
  }, [sessionToken, api, objectApiName]);

  return { layout, loading };
}
