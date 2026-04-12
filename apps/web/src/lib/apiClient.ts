import { useCallback, useMemo } from 'react';

/**
 * Reads a cookie value by name from `document.cookie`.
 */
function getCookie(name: string): string | undefined {
  const match = document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split('=')[1]) : undefined;
}

const CSRF_COOKIE = 'cpcrm_csrf';

/** HTTP methods that require CSRF protection. */
const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Thin wrapper around `fetch` that centralizes cookie-based authentication
 * and CSRF protection for outgoing API requests.
 *
 * - All requests are sent with `credentials: 'include'` so the HttpOnly
 *   `cpcrm_session` cookie is attached automatically by the browser.
 * - State-changing requests (POST/PUT/PATCH/DELETE) include the CSRF token
 *   from the `cpcrm_csrf` cookie as an `X-CSRF-Token` header.
 */
export interface ApiClient {
  /**
   * Issues an authenticated request.  Accepts the same arguments as the
   * global `fetch` function.  Cookies and CSRF headers are managed
   * automatically.
   */
  request: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}

/**
 * React hook that returns a stable {@link ApiClient}.
 *
 * The returned `request` function sends all requests with
 * `credentials: 'include'` and attaches the CSRF token on mutations.
 *
 * Session sync (posting the Descope token to the server to establish the
 * HttpOnly cookie) is handled by the `<SessionSync />` component, not here.
 */
export function useApiClient(): ApiClient {
  const request = useCallback(
    (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const headers = new Headers(init?.headers);

      // Attach CSRF token for state-changing requests.
      const method = (init?.method ?? 'GET').toUpperCase();
      if (MUTATION_METHODS.has(method) && !headers.has('X-CSRF-Token')) {
        const csrfToken = getCookie(CSRF_COOKIE);
        if (csrfToken) {
          headers.set('X-CSRF-Token', csrfToken);
        }
      }

      return fetch(input, { ...init, headers, credentials: 'include' });
    },
    [],
  );

  return useMemo(() => ({ request }), [request]);
}

/**
 * Syncs the Descope session token to a server-side HttpOnly cookie by
 * calling POST /api/auth/session.  Called by `<SessionSync />` on login
 * and whenever the Descope SDK refreshes the token.
 */
export async function syncSessionCookie(sessionToken: string): Promise<void> {
  try {
    await fetch('/api/auth/session', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: sessionToken }),
    });
  } catch {
    // Best-effort — the existing cookie (if any) will continue to work
    // until it expires, and the next sync attempt will try again.
  }
}

/**
 * Clears the server-side session cookie by calling DELETE /api/auth/session.
 * Should be called during the logout flow.
 */
export async function clearServerSession(): Promise<void> {
  try {
    await fetch('/api/auth/session', {
      method: 'DELETE',
      credentials: 'include',
    });
  } catch {
    // Best-effort — Descope logout will still clear the client-side session.
  }
}
