/**
 * Pagination helpers used by all list endpoints.
 *
 * The CRM exposes a single canonical pagination envelope:
 *
 * ```json
 * {
 *   "data": [ ... ],
 *   "pagination": {
 *     "total": 123,
 *     "limit": 50,
 *     "offset": 0,
 *     "hasMore": true
 *   }
 * }
 * ```
 *
 * Query parameters `limit` and `offset` are both optional. If omitted,
 * `limit` defaults to {@link DEFAULT_LIMIT} and `offset` defaults to 0.
 * `limit` is bounded by {@link MAX_LIMIT}; any request with a larger value is
 * rejected with HTTP 400 so an unbounded result set cannot be requested.
 *
 * Validation is enforced via {@link parsePaginationQuery}, which throws an
 * `AppError` so the global error middleware produces the canonical error
 * response shape.
 */
import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { AppError } from './appError.js';

// Ensure `.openapi(...)` is available on Zod schemas even when this module is
// imported before any route `*.schema.ts` file that also calls
// `extendZodWithOpenApi`. The helper is idempotent.
extendZodWithOpenApi(z);

/** Default page size when `limit` is not supplied. */
export const DEFAULT_LIMIT = 50;

/** Maximum permitted value for the `limit` query parameter. */
export const MAX_LIMIT = 200;

/** Validated pagination parameters returned by {@link parsePaginationQuery}. */
export interface PaginationParams {
  limit: number;
  offset: number;
}

/** Canonical pagination metadata returned by every list endpoint. */
export interface PaginationMeta {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

/** Canonical response envelope returned by every list endpoint. */
export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationMeta;
}

/**
 * Zod schema for pagination query parameters.
 *
 * Query values arrive as strings; this schema coerces and validates them.
 * Invalid values (non-numeric, negative, `limit > MAX_LIMIT`) are rejected.
 */
export const PaginationQuerySchema = z.object({
  limit: z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => (v === undefined || v === '' ? undefined : Number(v)))
    .refine((v) => v === undefined || (Number.isFinite(v) && Number.isInteger(v)), {
      message: 'limit must be an integer',
    })
    .refine((v) => v === undefined || v >= 1, {
      message: 'limit must be >= 1',
    })
    .refine((v) => v === undefined || v <= MAX_LIMIT, {
      message: `limit must be <= ${MAX_LIMIT}`,
    }),
  offset: z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => (v === undefined || v === '' ? undefined : Number(v)))
    .refine((v) => v === undefined || (Number.isFinite(v) && Number.isInteger(v)), {
      message: 'offset must be an integer',
    })
    .refine((v) => v === undefined || v >= 0, {
      message: 'offset must be >= 0',
    }),
});

/** Zod schema used by OpenAPI registrations for the pagination envelope. */
export const PaginationMetaSchema = z
  .object({
    total: z.number().int().nonnegative(),
    limit: z.number().int().positive(),
    offset: z.number().int().nonnegative(),
    hasMore: z.boolean(),
  })
  .openapi('PaginationMeta');

/**
 * Produces a Zod schema describing the canonical paginated envelope for a
 * given item schema. Usable directly in `registry.registerPath()`.
 */
export function paginatedResponseSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    data: z.array(itemSchema),
    pagination: PaginationMetaSchema,
  });
}

/** OpenAPI `query` object covering the shared `limit` / `offset` params. */
export const PaginationOpenApiQuery = z.object({
  limit: z.string().optional().openapi({
    description: `Maximum number of items to return (default ${DEFAULT_LIMIT}, max ${MAX_LIMIT}).`,
    example: String(DEFAULT_LIMIT),
  }),
  offset: z.string().optional().openapi({
    description: 'Number of items to skip before returning results (default 0).',
    example: '0',
  }),
});

/**
 * Parses and validates pagination query parameters.
 *
 * @throws {AppError} 400 VALIDATION_ERROR when `limit` or `offset` are malformed
 *   or out of range.
 */
export function parsePaginationQuery(query: unknown): PaginationParams {
  const result = PaginationQuerySchema.safeParse(query);

  if (!result.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const field = issue.path[0];
      if (typeof field === 'string' && !(field in fieldErrors)) {
        fieldErrors[field] = issue.message;
      }
    }
    throw AppError.validation('Invalid pagination parameters', { fieldErrors });
  }

  const limit = result.data.limit ?? DEFAULT_LIMIT;
  const offset = result.data.offset ?? 0;

  return { limit, offset };
}

/**
 * Wraps a list of items and a total count in the canonical paginated response.
 */
export function paginatedResponse<T>(
  data: T[],
  total: number,
  { limit, offset }: PaginationParams,
): PaginatedResponse<T> {
  return {
    data,
    pagination: {
      total,
      limit,
      offset,
      hasMore: offset + data.length < total,
    },
  };
}

/**
 * Paginates an already-materialised array in memory and wraps it in the
 * canonical paginated response. Intended for small, bounded result sets
 * (e.g. admin metadata) where loading the full list is cheap.
 *
 * For larger datasets, pagination should be pushed into the database query
 * via {@link paginatedResponse} with a separate `COUNT(*)`.
 */
export function paginateInMemory<T>(
  items: readonly T[],
  pagination: PaginationParams,
): PaginatedResponse<T> {
  const { limit, offset } = pagination;
  const page = items.slice(offset, offset + limit);
  return paginatedResponse(page as T[], items.length, pagination);
}
