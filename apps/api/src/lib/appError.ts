/**
 * AppError — a typed error class used throughout the API to produce
 * structured error responses.
 *
 * All API error responses must conform to the shape:
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
 *
 * Routes should `throw new AppError(...)` on failure and let the global
 * error middleware in `middleware/errorHandler.ts` format the response.
 * Express 5 forwards both synchronous and async thrown errors to the
 * error middleware automatically.
 */

/** Machine-readable error codes emitted by the API. */
export type AppErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'DELETE_BLOCKED'
  | 'RATE_LIMITED'
  | 'CSRF_INVALID'
  | 'INTERNAL_ERROR'
  | (string & {});

/**
 * Structured error payload used by every API error response.
 *
 * `details` is intentionally loose so individual error codes can carry
 * payload-specific metadata. The most common use is `fieldErrors`
 * (a map of field name to message) for validation failures.
 */
export interface AppErrorDetails {
  /** Field-level validation errors keyed by input name. */
  fieldErrors?: Record<string, string>;
  /** Additional context — kept open for error-code-specific fields. */
  [key: string]: unknown;
}

/**
 * Error class thrown by route handlers and services. The global error
 * middleware converts instances of {@link AppError} into the canonical
 * response shape defined above.
 */
export class AppError extends Error {
  public readonly code: AppErrorCode;
  public readonly statusCode: number;
  public readonly details?: AppErrorDetails;

  constructor(
    code: AppErrorCode,
    statusCode: number,
    message: string,
    details?: AppErrorDetails,
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }

  /** Convenience constructor for 400 VALIDATION_ERROR. */
  static validation(message: string, details?: AppErrorDetails): AppError {
    return new AppError('VALIDATION_ERROR', 400, message, details);
  }

  /** Convenience constructor for 404 NOT_FOUND. */
  static notFound(message: string, details?: AppErrorDetails): AppError {
    return new AppError('NOT_FOUND', 404, message, details);
  }

  /** Convenience constructor for 409 CONFLICT. */
  static conflict(message: string, details?: AppErrorDetails): AppError {
    return new AppError('CONFLICT', 409, message, details);
  }

  /** Convenience constructor for 401 UNAUTHENTICATED. */
  static unauthenticated(
    message = 'Authentication required',
    details?: AppErrorDetails,
  ): AppError {
    return new AppError('UNAUTHENTICATED', 401, message, details);
  }

  /** Convenience constructor for 403 FORBIDDEN. */
  static forbidden(
    message = 'Permission denied',
    details?: AppErrorDetails,
  ): AppError {
    return new AppError('FORBIDDEN', 403, message, details);
  }
}

/**
 * Type guard used by the error middleware and tests.
 */
export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}
