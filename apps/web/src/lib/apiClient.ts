import { useCallback, useMemo } from 'react';
import { useSession } from '@descope/react-sdk';

/**
 * Thin wrapper around `fetch` that centralizes the attachment of the
 * authenticated session token to outgoing API requests.
 *
 * Centralizing this logic lets us swap the credential-transport mechanism
 * (e.g. move from `Authorization: Bearer` headers to HttpOnly cookies — see
 * issue #361) in a single place instead of touching every call site.
 */
export interface ApiClient {
  /**
   * Issues an authenticated request. Accepts the same arguments as the
   * global `fetch` function. When a session token is available it is
   * injected as an `Authorization: Bearer <token>` header unless the
   * caller has already supplied one.
   */
  request: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}

/**
 * React hook that returns a stable {@link ApiClient} bound to the current
 * Descope session. The returned `request` function is memoized on the
 * session token so it is safe to list in `useEffect` / `useCallback`
 * dependency arrays without triggering spurious re-runs.
 */
export function useApiClient(): ApiClient {
  const { sessionToken } = useSession();

  const request = useCallback(
    (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const headers = new Headers(init?.headers);
      if (sessionToken && !headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${sessionToken}`);
      }
      return fetch(input, { ...init, headers });
    },
    [sessionToken],
  );

  return useMemo(() => ({ request }), [request]);
}
