import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';

const REQUEST_ID_HEADER = 'X-Request-Id';

/**
 * Generates a UUID for every incoming request and:
 *
 *   - Stores it on `req.id` so `pino-http` picks it up for log correlation
 *   - Echoes it back as the `X-Request-Id` response header so clients and
 *     downstream proxies can tie logs to a single request
 *
 * If the client already sent an `X-Request-Id` header (e.g. a load balancer
 * in front of the API) we honour it instead of generating a new one.
 *
 * Note: Express's own type for `Request.id` is `ReqId = string | object`
 * (from `@types/pino-http`), so we read/write through an `any` cast to
 * sidestep the structural mismatch.
 */
export function requestId(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const incoming = req.header(REQUEST_ID_HEADER);
  const id = incoming && incoming.length <= 128 ? incoming : randomUUID();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (req as any).id = id;
  res.setHeader(REQUEST_ID_HEADER, id);
  next();
}

/**
 * Reads the request id from a request (or returns `undefined` if none is
 * present — e.g. when the middleware was bypassed in a test).
 */
export function getRequestId(req: Request): string | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const id: unknown = (req as any).id;
  if (typeof id === 'string') return id;
  if (typeof id === 'number') return String(id);
  return undefined;
}
