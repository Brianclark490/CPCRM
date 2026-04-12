import { Router } from 'express';
import DescopeClient from '@descope/node-sdk';
import { logger } from '../lib/logger.js';
import { setSessionCookies, clearSessionCookies, generateCsrfToken, COOKIE_NAMES, csrfCookieOptions } from '../lib/cookies.js';

export const authSessionRouter = Router();

let descopeClientInstance: ReturnType<typeof DescopeClient> | undefined;

class DescopeConfigError extends Error {
  constructor() {
    super('DESCOPE_PROJECT_ID environment variable is required');
    this.name = 'DescopeConfigError';
  }
}

function getDescopeClient(): ReturnType<typeof DescopeClient> {
  if (!descopeClientInstance) {
    const projectId = process.env.DESCOPE_PROJECT_ID;
    if (!projectId) {
      throw new DescopeConfigError();
    }
    descopeClientInstance = DescopeClient({ projectId });
  }
  return descopeClientInstance;
}

/**
 * POST /api/auth/session
 *
 * Accepts a Descope session token in the request body, validates it, and sets
 * an HttpOnly session cookie.  Also sets a non-HttpOnly CSRF cookie.
 *
 * Called by the frontend after a successful Descope login and whenever the
 * Descope SDK refreshes the session token.
 */
authSessionRouter.post('/session', async (req, res) => {
  const { token } = req.body as { token?: string };

  if (!token || typeof token !== 'string') {
    res.status(400).json({ error: 'Missing or invalid token' });
    return;
  }

  try {
    const client = getDescopeClient();
    const authInfo = await client.validateSession(token);

    if (!authInfo.token.sub) {
      res.status(401).json({ error: 'Invalid token: missing subject claim' });
      return;
    }

    const csrfToken = setSessionCookies(res, token);
    res.json({ ok: true, csrfToken });
  } catch (err) {
    if (err instanceof DescopeConfigError) {
      logger.error('Auth session: Descope is not configured');
      res.status(503).json({ error: 'Authentication service unavailable' });
      return;
    }
    logger.warn({ err }, 'Auth session: token validation failed');
    res.status(401).json({ error: 'Invalid or expired token' });
  }
});

/**
 * DELETE /api/auth/session
 *
 * Clears the session and CSRF cookies.  Called by the frontend on logout.
 */
authSessionRouter.delete('/session', (_req, res) => {
  clearSessionCookies(res);
  res.json({ ok: true });
});

/**
 * GET /api/auth/csrf-token
 *
 * Returns a fresh CSRF token and sets the corresponding cookie.
 * Useful on initial page load when the frontend needs a token before the
 * first mutation.
 */
authSessionRouter.get('/csrf-token', (_req, res) => {
  const csrfToken = generateCsrfToken();
  res.cookie(COOKIE_NAMES.csrf, csrfToken, csrfCookieOptions);
  res.json({ csrfToken });
});
