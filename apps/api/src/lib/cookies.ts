import { randomBytes } from 'node:crypto';
import type { Response, CookieOptions } from 'express';
import { config } from './config.js';

/**
 * Cookie names used for authentication and CSRF protection.
 */
export const COOKIE_NAMES = {
  session: 'cpcrm_session',
  csrf: 'cpcrm_csrf',
} as const;

const isProduction = config.env === 'production';

/** Base options shared by both cookies. */
const baseCookieOptions: CookieOptions = {
  path: '/',
  sameSite: 'strict',
  secure: isProduction,
};

/** Options for the session cookie — HttpOnly so JS cannot read it. */
export const sessionCookieOptions: CookieOptions = {
  ...baseCookieOptions,
  httpOnly: true,
  // Descope JWTs typically live ~20 minutes; use a generous max-age and let
  // the JWT expiry be the real enforcement.  The cookie is refreshed on every
  // POST /api/auth/session call.
  maxAge: 24 * 60 * 60 * 1000, // 24 hours
};

/** Options for the CSRF cookie — readable by JavaScript (not HttpOnly). */
export const csrfCookieOptions: CookieOptions = {
  ...baseCookieOptions,
  httpOnly: false,
  maxAge: 24 * 60 * 60 * 1000,
};

/** Options used to clear cookies (must match the path/domain of the original). */
export const clearCookieOptions: CookieOptions = {
  path: '/',
  sameSite: 'strict',
  secure: isProduction,
};

/** Generate a cryptographically random CSRF token. */
export function generateCsrfToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Sets the session and CSRF cookies on the response.
 */
export function setSessionCookies(res: Response, sessionToken: string): string {
  const csrfToken = generateCsrfToken();
  res.cookie(COOKIE_NAMES.session, sessionToken, sessionCookieOptions);
  res.cookie(COOKIE_NAMES.csrf, csrfToken, csrfCookieOptions);
  return csrfToken;
}

/**
 * Clears the session and CSRF cookies on the response.
 */
export function clearSessionCookies(res: Response): void {
  res.clearCookie(COOKIE_NAMES.session, clearCookieOptions);
  res.clearCookie(COOKIE_NAMES.csrf, clearCookieOptions);
}
