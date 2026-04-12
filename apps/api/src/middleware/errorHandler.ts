import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError, isAppError } from '../lib/appError.js';
import { logger } from '../lib/logger.js';
import { getRequestId } from './requestId.js';

/**
 * Canonical error payload returned by every API error response.
 *
 * ```json
 * {
 *   "error": {
 *     "code": "VALIDATION_ERROR",
 *     "message": "Human-readable summary",
 *     "details": { "fieldErrors": { "email": "invalid format" } },
 *     "requestId": "uuid"
 *   }
 * }
 * ```
 */
export interface ApiErrorPayload {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    requestId?: string;
  };
}

/**
 * Build the canonical error payload for a given thrown value.
 *
 * Exported so other middleware (e.g. the response normalizer that
 * rewrites legacy `{error: 'string'}` bodies) can share the exact same
 * formatting rules.
 */
export function toErrorPayload(
  err: unknown,
  requestId: string | undefined,
): { statusCode: number; payload: ApiErrorPayload } {
  // Zod errors are treated as 400 VALIDATION_ERROR with field-level errors.
  if (err instanceof ZodError) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of err.issues) {
      const path = issue.path.join('.') || '_';
      if (!(path in fieldErrors)) {
        fieldErrors[path] = issue.message;
      }
    }
    return {
      statusCode: 400,
      payload: {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: { fieldErrors },
          requestId,
        },
      },
    };
  }

  if (isAppError(err)) {
    return {
      statusCode: err.statusCode,
      payload: {
        error: {
          code: err.code,
          message: err.message,
          details: err.details as Record<string, unknown> | undefined,
          requestId,
        },
      },
    };
  }

  // Services in this codebase frequently throw `Error` instances with a
  // `.code` property attached (e.g. VALIDATION_ERROR, NOT_FOUND, CONFLICT).
  // Translate these to a sensible status code so existing services keep
  // working without being rewritten.
  const maybe = err as Error & { code?: string; statusCode?: number } | undefined;
  if (maybe && typeof maybe === 'object' && typeof maybe.code === 'string') {
    const statusCode = maybe.statusCode ?? statusCodeFromCode(maybe.code);
    if (statusCode) {
      return {
        statusCode,
        payload: {
          error: {
            code: maybe.code,
            message: maybe.message ?? 'Request failed',
            requestId,
          },
        },
      };
    }
  }

  // Unknown error — return 500 without leaking internals.
  return {
    statusCode: 500,
    payload: {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        requestId,
      },
    },
  };
}

/**
 * Map a known string code to a default HTTP status. Returns `undefined`
 * for codes we do not recognise so the caller can fall back to 500.
 */
function statusCodeFromCode(code: string): number | undefined {
  switch (code) {
    case 'VALIDATION_ERROR':
      return 400;
    case 'UNAUTHENTICATED':
      return 401;
    case 'FORBIDDEN':
      return 403;
    case 'NOT_FOUND':
      return 404;
    case 'CONFLICT':
      return 409;
    case 'DELETE_BLOCKED':
      return 400;
    case 'RATE_LIMITED':
      return 429;
    default:
      return undefined;
  }
}

/**
 * Express error-handling middleware.
 *
 * Must be registered AFTER all routes. Converts any thrown error into
 * the canonical {@link ApiErrorPayload} shape and logs unexpected errors
 * at error level with the request id for log correlation.
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  const requestId = getRequestId(req);
  const { statusCode, payload } = toErrorPayload(err, requestId);

  // Log 5xx errors — 4xx are client-visible and intentional.
  if (statusCode >= 500) {
    logger.error({ err, requestId, path: req.path }, 'Unhandled error in request');
  }

  // If the response has already been partially sent we cannot safely
  // rewrite the body; delegate to Express' default handler.
  if (res.headersSent) {
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    _next(err);
    return;
  }

  res.status(statusCode).json(payload);
}

/**
 * Middleware that wraps `res.json` so existing routes which still call
 * `res.status(x).json({ error: 'string' })` (or similar legacy shapes)
 * are automatically rewritten into the canonical {@link ApiErrorPayload}
 * shape. This lets us enforce the contract across all 240+ legacy call
 * sites without touching every route in a single PR.
 *
 * New code should throw {@link AppError} instead of building responses
 * manually; that path goes through {@link errorHandler}.
 */
export function normalizeErrorResponses(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const originalJson = res.json.bind(res);
  res.json = function normalizedJson(body: unknown): Response {
    const status = res.statusCode;
    // Only rewrite error responses.
    if (status < 400) {
      return originalJson(body);
    }
    // Already in canonical shape — just inject requestId if missing.
    if (isCanonicalErrorBody(body)) {
      const requestId = getRequestId(req);
      if (requestId && !body.error.requestId) {
        body.error.requestId = requestId;
      }
      return originalJson(body);
    }
    const normalized = normalizeLegacyErrorBody(body, status, getRequestId(req));
    return originalJson(normalized);
  };
  next();
}

function isCanonicalErrorBody(
  body: unknown,
): body is ApiErrorPayload & { error: { code: string; message: string; requestId?: string } } {
  if (!body || typeof body !== 'object') return false;
  const maybe = (body as { error?: unknown }).error;
  if (!maybe || typeof maybe !== 'object') return false;
  const err = maybe as { code?: unknown; message?: unknown };
  return typeof err.code === 'string' && typeof err.message === 'string';
}

/**
 * Normalize a legacy error body (any 4xx/5xx body that isn't already in
 * the canonical shape) into {@link ApiErrorPayload}.
 */
function normalizeLegacyErrorBody(
  body: unknown,
  statusCode: number,
  requestId: string | undefined,
): ApiErrorPayload {
  const record = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;

  // `error` can be a string (`{error: 'msg'}`) or an object (e.g. helmet's
  // malformed-json handler). Handle both.
  let message = 'Request failed';
  const rawError = record.error;
  if (typeof rawError === 'string') {
    message = rawError;
  } else if (typeof record.message === 'string') {
    message = record.message;
  }

  // Some legacy routes include a top-level `code` alongside `error`.
  const rawCode = record.code;
  const code =
    typeof rawCode === 'string'
      ? rawCode
      : defaultCodeForStatus(statusCode);

  // Preserve any ancillary fields the old body carried as `details`.
  const details: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (key === 'error' || key === 'message' || key === 'code') continue;
    details[key] = value;
  }
  // fieldErrors is the canonical location; accept common aliases.
  if (record.fieldErrors && !details.fieldErrors) {
    details.fieldErrors = record.fieldErrors;
  } else if (record.field_errors && !details.fieldErrors) {
    details.fieldErrors = record.field_errors;
  }

  return {
    error: {
      code,
      message,
      details: Object.keys(details).length > 0 ? details : undefined,
      requestId,
    },
  };
}

function defaultCodeForStatus(status: number): string {
  switch (status) {
    case 400:
      return 'VALIDATION_ERROR';
    case 401:
      return 'UNAUTHENTICATED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 422:
      return 'VALIDATION_ERROR';
    case 429:
      return 'RATE_LIMITED';
    default:
      return status >= 500 ? 'INTERNAL_ERROR' : 'CLIENT_ERROR';
  }
}
