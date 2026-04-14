import { useState, useEffect } from 'react';
import { useSession } from '@descope/react-sdk';
import { useApiClient } from '../lib/apiClient.js';

/**
 * Checks whether the current authenticated user is a platform super-admin.
 *
 * Calls GET /api/v1/me and reads the `isSuperAdmin` flag from the response.
 * Returns `{ isSuperAdmin, loading }`.
 */
export function useSuperAdmin(): { isSuperAdmin: boolean; loading: boolean } {
  const { sessionToken } = useSession();
  const api = useApiClient();
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sessionToken) {
      setIsSuperAdmin(false);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const check = async () => {
      try {
        const response = await api.request('/api/v1/me');

        if (cancelled) return;

        if (response.ok) {
          const data = (await response.json()) as { isSuperAdmin?: boolean };
          if (!cancelled) setIsSuperAdmin(data.isSuperAdmin === true);
        }
      } catch {
        // Best-effort check
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void check();

    return () => {
      cancelled = true;
    };
  }, [sessionToken, api]);

  return { isSuperAdmin, loading };
}
