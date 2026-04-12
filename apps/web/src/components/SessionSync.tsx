import { useEffect, useRef } from 'react';
import { useSession } from '@descope/react-sdk';
import { syncSessionCookie } from '../lib/apiClient.js';

/**
 * Invisible component that keeps the server-side HttpOnly session cookie in
 * sync with the Descope session token.
 *
 * Placed near the app root (inside `<AuthProvider>`), it fires on mount and
 * whenever the Descope SDK refreshes the session token.
 */
export function SessionSync() {
  const { sessionToken } = useSession();
  const lastSyncedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!sessionToken || sessionToken === lastSyncedRef.current) return;
    lastSyncedRef.current = sessionToken;
    void syncSessionCookie(sessionToken);
  }, [sessionToken]);

  return null;
}
