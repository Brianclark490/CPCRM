import type { Request, Response, NextFunction } from 'express';
import { COOKIE_NAMES } from '../lib/cookies.js';

/**
 * CSRF protection using the double-submit cookie pattern.
 *
 * How it works:
 * 1. When a session cookie is set (POST /api/auth/session), a `cpcrm_csrf`
 *    cookie is also set.  This cookie is *not* HttpOnly so the browser JS can
 *    read it.
 * 2. On state-changing requests (POST/PUT/PATCH/DELETE) the client must send
 *    the value of that cookie in the `X-CSRF-Token` request header.
 * 3. This middleware compares the two.  Because a cross-origin attacker cannot
 *    read cookies from our domain (SameSite + CORS), they cannot produce the
 *    matching header.
 *
 * Safe methods (GET, HEAD, OPTIONS) are exempt.
 *
 * Requests without a session cookie are also exempt — they will be rejected
 * by the auth middleware instead, and this allows Bearer-token clients to
 * operate without CSRF tokens.
 */

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const CSRF_HEADER = 'x-csrf-token';

export function requireCsrf(req: Request, res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  const cookies = req.cookies as Record<string, string | undefined> | undefined;

  // Skip CSRF check when no session cookie is present — the request is
  // either unauthenticated (auth middleware will reject it) or using Bearer
  // token auth which is not vulnerable to CSRF.
  if (!cookies?.[COOKIE_NAMES.session]) {
    next();
    return;
  }

  const cookieValue = cookies?.[COOKIE_NAMES.csrf];
  const headerValue = req.headers[CSRF_HEADER] as string | undefined;

  if (!cookieValue || !headerValue || cookieValue !== headerValue) {
    res.status(403).json({ error: 'CSRF token mismatch' });
    return;
  }

  next();
}
