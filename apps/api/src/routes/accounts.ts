import { Router } from 'express';
import type { Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireTenant } from '../middleware/tenant.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import {
  createAccount,
  listAccounts,
  getAccountWithOpportunities,
  updateAccount,
  deleteAccount,
} from '../services/accountService.js';
import type { UpdateAccountParams } from '../services/accountService.js';
import { logger } from '../lib/logger.js';
import {
  parsePaginationQuery,
  paginatedResponse,
  DEFAULT_LIMIT,
  MAX_LIMIT,
} from '../lib/pagination.js';
import { isAppError } from '../lib/appError.js';

export const accountsRouter = Router();

/**
 * POST /accounts
 *
 * Creates a new account within the authenticated user's tenant.
 * The requesting user becomes the owner of the account.
 *
 * Requires: valid Bearer token (requireAuth) + resolved tenantId (requireTenant).
 *
 * Request body (JSON):
 *   {
 *     "name": string,
 *     "industry"?: string,
 *     "website"?: string,
 *     "phone"?: string,
 *     "email"?: string,
 *     "addressLine1"?: string,
 *     "addressLine2"?: string,
 *     "city"?: string,
 *     "region"?: string,
 *     "postalCode"?: string,
 *     "country"?: string,
 *     "notes"?: string
 *   }
 *
 * Responses:
 *   201  – account created; body contains the created Account
 *   400  – validation error (e.g. missing name, invalid email/phone)
 *   401  – missing or invalid Bearer token
 *   403  – authenticated but no active tenant context
 *   500  – unexpected server error
 */
export async function handleCreateAccount(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const body = req.body as {
    name?: string;
    industry?: string;
    website?: string;
    phone?: string;
    email?: string;
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    region?: string;
    postalCode?: string;
    country?: string;
    notes?: string;
  };

  const { userId: requestingUserId, tenantId } = req.user!;

  try {
    const account = await createAccount({
      name: body?.name ?? '',
      industry: body?.industry,
      website: body?.website,
      phone: body?.phone,
      email: body?.email,
      addressLine1: body?.addressLine1,
      addressLine2: body?.addressLine2,
      city: body?.city,
      region: body?.region,
      postalCode: body?.postalCode,
      country: body?.country,
      notes: body?.notes,
      tenantId: tenantId!,
      requestingUserId,
    });

    res.status(201).json(account);
  } catch (err: unknown) {
    if (err instanceof Error && (err as Error & { code?: string }).code === 'VALIDATION_ERROR') {
      res.status(400).json({ error: err.message, code: 'VALIDATION_ERROR' });
      return;
    }

    logger.error({ err, tenantId, requestingUserId }, 'Unexpected error creating account');
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

/**
 * GET /accounts
 *
 * Returns a paginated list of accounts owned by the authenticated user within
 * their tenant. Supports searching by name and email.
 *
 * Requires: valid Bearer token (requireAuth) + resolved tenantId (requireTenant).
 *
 * Query parameters:
 *   search?: string — searches name and email (case-insensitive)
 *   limit?:  number — results per page, defaults to {@link DEFAULT_LIMIT} (max {@link MAX_LIMIT})
 *   offset?: number — results to skip, defaults to 0
 *
 * Responses:
 *   200  – { data: Account[], pagination: { total, limit, offset, hasMore } }
 *   400  – invalid pagination parameters (limit > max, negative values, etc.)
 *   401  – missing or invalid Bearer token
 *   403  – authenticated but no active tenant context
 *   500  – unexpected server error
 */
export async function handleListAccounts(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const { userId: requestingUserId, tenantId } = req.user!;

  const query = req.query as { search?: string; limit?: string; offset?: string };

  let pagination;
  try {
    pagination = parsePaginationQuery(query);
  } catch (err) {
    if (isAppError(err)) {
      res
        .status(err.statusCode)
        .json({ error: err.message, code: err.code, ...(err.details ?? {}) });
      return;
    }
    throw err;
  }

  try {
    const result = await listAccounts({
      tenantId: tenantId!,
      ownerId: requestingUserId,
      search: query.search,
      limit: pagination.limit,
      offset: pagination.offset,
    });

    res.status(200).json(paginatedResponse(result.data, result.total, pagination));
  } catch (err: unknown) {
    logger.error({ err, tenantId, requestingUserId }, 'Unexpected error listing accounts');
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

/**
 * GET /accounts/:id
 *
 * Returns a single account by ID with linked opportunities.
 * Scoped to the authenticated user's tenant and ownership.
 *
 * Requires: valid Bearer token (requireAuth) + resolved tenantId (requireTenant).
 *
 * Responses:
 *   200  – Account object with opportunities array
 *   401  – missing or invalid Bearer token
 *   403  – authenticated but no active tenant context
 *   404  – account not found or not owned by the authenticated user
 *   500  – unexpected server error
 */
export async function handleGetAccount(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const { id } = req.params as { id: string };
  const { userId: requestingUserId, tenantId } = req.user!;

  try {
    const account = await getAccountWithOpportunities(id, tenantId!, requestingUserId);

    if (!account) {
      res.status(404).json({ error: 'Account not found', code: 'NOT_FOUND' });
      return;
    }

    res.status(200).json(account);
  } catch (err: unknown) {
    logger.error(
      { err, tenantId, requestingUserId, accountId: id },
      'Unexpected error fetching account',
    );
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

/**
 * PUT /accounts/:id
 *
 * Updates an existing account within the authenticated user's tenant.
 * Only the fields present in the request body are updated.
 * The updated_at timestamp is refreshed automatically.
 *
 * Requires: valid Bearer token (requireAuth) + resolved tenantId (requireTenant).
 *
 * Request body (JSON) — all fields optional:
 *   {
 *     "name"?: string,
 *     "industry"?: string | null,
 *     "website"?: string | null,
 *     "phone"?: string | null,
 *     "email"?: string | null,
 *     "addressLine1"?: string | null,
 *     "addressLine2"?: string | null,
 *     "city"?: string | null,
 *     "region"?: string | null,
 *     "postalCode"?: string | null,
 *     "country"?: string | null,
 *     "notes"?: string | null
 *   }
 *
 * Responses:
 *   200  – updated Account object
 *   400  – validation error
 *   401  – missing or invalid Bearer token
 *   403  – authenticated but no active tenant context
 *   404  – account not found or not owned by the authenticated user
 *   500  – unexpected server error
 */
export async function handleUpdateAccount(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const { id } = req.params as { id: string };
  const { userId: requestingUserId, tenantId } = req.user!;

  const body = req.body as {
    name?: string;
    industry?: string | null;
    website?: string | null;
    phone?: string | null;
    email?: string | null;
    addressLine1?: string | null;
    addressLine2?: string | null;
    city?: string | null;
    region?: string | null;
    postalCode?: string | null;
    country?: string | null;
    notes?: string | null;
  };

  const params: UpdateAccountParams = {};
  if ('name' in body) params.name = body.name;
  if ('industry' in body) params.industry = body.industry;
  if ('website' in body) params.website = body.website;
  if ('phone' in body) params.phone = body.phone;
  if ('email' in body) params.email = body.email;
  if ('addressLine1' in body) params.addressLine1 = body.addressLine1;
  if ('addressLine2' in body) params.addressLine2 = body.addressLine2;
  if ('city' in body) params.city = body.city;
  if ('region' in body) params.region = body.region;
  if ('postalCode' in body) params.postalCode = body.postalCode;
  if ('country' in body) params.country = body.country;
  if ('notes' in body) params.notes = body.notes;

  try {
    const updated = await updateAccount(id, tenantId!, requestingUserId, params);
    res.status(200).json(updated);
  } catch (err: unknown) {
    const code = (err as Error & { code?: string }).code;

    if (code === 'VALIDATION_ERROR') {
      res.status(400).json({ error: (err as Error).message, code: 'VALIDATION_ERROR' });
      return;
    }

    if (code === 'NOT_FOUND') {
      res.status(404).json({ error: 'Account not found', code: 'NOT_FOUND' });
      return;
    }

    logger.error(
      { err, tenantId, requestingUserId, accountId: id },
      'Unexpected error updating account',
    );
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

/**
 * DELETE /accounts/:id
 *
 * Deletes an account by ID, scoped to the authenticated user's tenant and ownership.
 *
 * Requires: valid Bearer token (requireAuth) + resolved tenantId (requireTenant).
 *
 * Responses:
 *   204  – account deleted successfully
 *   401  – missing or invalid Bearer token
 *   403  – authenticated but no active tenant context
 *   404  – account not found or not owned by the authenticated user
 *   500  – unexpected server error
 */
export async function handleDeleteAccount(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const { id } = req.params as { id: string };
  const { userId: requestingUserId, tenantId } = req.user!;

  try {
    await deleteAccount(id, tenantId!, requestingUserId);
    res.status(204).end();
  } catch (err: unknown) {
    const code = (err as Error & { code?: string }).code;

    if (code === 'NOT_FOUND') {
      res.status(404).json({ error: 'Account not found', code: 'NOT_FOUND' });
      return;
    }

    logger.error(
      { err, tenantId, requestingUserId, accountId: id },
      'Unexpected error deleting account',
    );
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

accountsRouter.post('/', requireAuth, requireTenant, handleCreateAccount);
accountsRouter.get('/', requireAuth, requireTenant, handleListAccounts);
accountsRouter.get('/:id', requireAuth, requireTenant, handleGetAccount);
accountsRouter.put('/:id', requireAuth, requireTenant, handleUpdateAccount);
accountsRouter.delete('/:id', requireAuth, requireTenant, handleDeleteAccount);
