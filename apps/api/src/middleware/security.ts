import helmet from 'helmet';
import type { RequestHandler } from 'express';

/**
 * Helmet middleware configured with a strict Content Security Policy.
 *
 * CSP directives are tuned for:
 * - Descope auth flows (script loading, API calls, iframes)
 * - Google Fonts (stylesheet + font file loading)
 * - CSS modules (requires 'unsafe-inline' for style injection)
 *
 * Applied to all responses. In production the API also serves the SPA,
 * so the CSP protects rendered HTML pages.
 */
export const securityHeaders: RequestHandler = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", 'https://descope.com', 'https://*.descope.com'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'https://*.descope.com', 'https://api.descope.com'],
      frameSrc: ['https://*.descope.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
    },
  },
}) as RequestHandler;
