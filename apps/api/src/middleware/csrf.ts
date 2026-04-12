import type { Request, Response, NextFunction } from 'express';

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
 */

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const CSRF_COOKIE = 'cpcrm_csrf';
const CSRF_HEADER = 'x-csrf-token';

export function requireCsrf(req: Request, res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  const cookieValue = (req.cookies as Record<string, string | undefined>)?.[CSRF_COOKIE];
  const headerValue = req.headers[CSRF_HEADER] as string | undefined;

  if (!cookieValue || !headerValue || cookieValue !== headerValue) {
    res.status(403).json({ error: 'CSRF token mismatch' });
    return;
  }

  next();
}
