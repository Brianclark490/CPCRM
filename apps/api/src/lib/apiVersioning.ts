import type { NextFunction, Request, Response, Router } from 'express';
import { AppError } from './appError.js';

/**
 * API versioning primitives shared by `index.ts` and the integration tests
 * that exercise the `/api/v1` + legacy `/api` mount pattern.  Keeping the
 * behaviour here (rather than inline in `index.ts`) lets tests construct a
 * minimal Express app against the exact same functions without having to
 * mock the full startup pipeline.
 *
 * See `docs/architecture/adr-005-api-versioning.md` for the policy.
 */

/**
 * Extracts the URL path from `req.originalUrl`, discarding any query string
 * so prefix checks (e.g. `/api/v1?foo=1`) match as intended.
 */
function pathnameOf(originalUrl: string): string {
  const q = originalUrl.indexOf('?');
  return q === -1 ? originalUrl : originalUrl.slice(0, q);
}

/**
 * Installs a terminal 404 middleware on the given API router.
 *
 * Without this, unmatched requests would fall through the router entirely
 * and — in production — hit the SPA static-file fallback, which answers
 * with `index.html` using an HTML content-type. That is the wrong response
 * shape for an API consumer and masks client-side routing bugs.
 *
 * The handler throws `AppError.notFound` so the global error middleware
 * emits the canonical `{ error: { code, message, requestId } }` payload.
 *
 * Must be called **after** all real routes have been mounted on the router,
 * otherwise the 404 will fire before any handler has a chance to match.
 */
export function installApiTerminal404(router: Router): void {
  router.use((req: Request, _res: Response, next: NextFunction): void => {
    next(
      AppError.notFound(
        `API route not found: ${req.method} ${req.originalUrl}`,
      ),
    );
  });
}

/**
 * Builds the middleware mounted at the legacy `/api` prefix.
 *
 * Two responsibilities:
 *
 *  1. Skip requests whose `originalUrl` already begins with `/api/v1`.
 *     In principle those requests are always handled by the versioned
 *     mount (which is registered first and has its own terminal 404), but
 *     a misconfigured future mount ordering or a programmer error could
 *     cause one to fall through here. Without this guard, Express would
 *     re-enter the shared router via the legacy mount, incorrectly stamp
 *     `Deprecation: true` onto the response, and emit a malformed
 *     `Link: </api/v1/v1/...>` successor. By short-circuiting with
 *     `next()` we send those requests on to the next app-level
 *     middleware (ultimately the global error handler).
 *
 *  2. For genuine `/api/...` traffic, stamp the RFC 8288 `Link` header
 *     (with an RFC 5829 `rel="successor-version"` relation type) and the
 *     RFC 8594 `Deprecation` header onto the response, then hand the
 *     request to the shared `apiRouter`.
 *
 * Removing this alias is a breaking change and must follow the deprecation
 * policy in `docs/architecture/adr-005-api-versioning.md`.
 */
export function createLegacyApiAlias(
  apiRouter: Router,
): (req: Request, res: Response, next: NextFunction) => void {
  return function legacyApiAlias(
    req: Request,
    res: Response,
    next: NextFunction,
  ): void {
    const pathname = pathnameOf(req.originalUrl);
    if (pathname === '/api/v1' || pathname.startsWith('/api/v1/')) {
      next();
      return;
    }
    res.setHeader('Deprecation', 'true');
    res.setHeader('Link', `</api/v1${req.url}>; rel="successor-version"`);
    apiRouter(req, res, next);
  };
}
