import { Router } from 'express';
import type { Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireTenant } from '../middleware/tenant.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import {
  createOpportunity,
  listOpportunities,
  getOpportunity,
  updateOpportunity,
} from '../services/opportunityService.js';
import type { OpportunityStage, UpdateOpportunityParams } from '../services/opportunityService.js';
import { logger } from '../lib/logger.js';

export const opportunitiesRouter = Router();

/**
 * POST /opportunities
 *
 * Creates a new opportunity within the authenticated user's tenant.
 * The requesting user becomes the initial owner of the opportunity.
 * The opportunity is created with an initial stage of "prospecting".
 *
 * Requires: valid Bearer token (requireAuth) + resolved tenantId (requireTenant).
 *
 * Request body (JSON):
 *   {
 *     "title": string,
 *     "accountId": string,
 *     "value"?: number,
 *     "currency"?: string,
 *     "expectedCloseDate"?: string,
 *     "description"?: string
 *   }
 *
 * Responses:
 *   201  – opportunity created; body contains the created Opportunity
 *   400  – validation error (e.g. missing title or accountId)
 *   401  – missing or invalid Bearer token
 *   403  – authenticated but no active tenant context
 *   500  – unexpected server error
 */
export async function handleCreateOpportunity(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const body = req.body as {
    title?: string;
    accountId?: string;
    value?: number;
    currency?: string;
    expectedCloseDate?: string;
    description?: string;
  };

  // req.user is guaranteed non-null after requireAuth + requireTenant
  const { userId: requestingUserId, tenantId } = req.user!;

  try {
    const opportunity = await createOpportunity({
      title: body?.title ?? '',
      accountId: body?.accountId ?? '',
      value: body?.value,
      currency: body?.currency,
      expectedCloseDate: body?.expectedCloseDate,
      description: body?.description,
      tenantId: tenantId!,
      requestingUserId,
    });

    res.status(201).json(opportunity);
  } catch (err: unknown) {
    if (err instanceof Error && (err as Error & { code?: string }).code === 'VALIDATION_ERROR') {
      res.status(400).json({ error: err.message });
      return;
    }

    logger.error({ err, tenantId, requestingUserId }, 'Unexpected error creating opportunity');
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

/**
 * GET /opportunities
 *
 * Returns all opportunities belonging to the authenticated user's tenant,
 * ordered by creation date descending.
 *
 * Requires: valid Bearer token (requireAuth) + resolved tenantId (requireTenant).
 *
 * Responses:
 *   200  – array of Opportunity objects (may be empty)
 *   401  – missing or invalid Bearer token
 *   403  – authenticated but no active tenant context
 *   500  – unexpected server error
 */
export async function handleListOpportunities(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const { userId: requestingUserId, tenantId } = req.user!;

  try {
    const opportunities = await listOpportunities(tenantId!);
    res.status(200).json(opportunities);
  } catch (err: unknown) {
    logger.error({ err, tenantId, requestingUserId }, 'Unexpected error listing opportunities');
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

/**
 * GET /opportunities/:id
 *
 * Returns a single opportunity by ID, scoped to the authenticated user's tenant.
 *
 * Requires: valid Bearer token (requireAuth) + resolved tenantId (requireTenant).
 *
 * Responses:
 *   200  – the Opportunity object
 *   401  – missing or invalid Bearer token
 *   403  – authenticated but no active tenant context
 *   404  – opportunity not found or belongs to a different tenant
 *   500  – unexpected server error
 */
export async function handleGetOpportunity(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const { id } = req.params as { id: string };
  const { userId: requestingUserId, tenantId } = req.user!;

  try {
    const opportunity = await getOpportunity(id, tenantId!);

    if (!opportunity) {
      res.status(404).json({ error: 'Opportunity not found' });
      return;
    }

    res.status(200).json(opportunity);
  } catch (err: unknown) {
    logger.error(
      { err, tenantId, requestingUserId, opportunityId: id },
      'Unexpected error fetching opportunity',
    );
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

/**
 * PUT /opportunities/:id
 *
 * Updates an existing opportunity within the authenticated user's tenant.
 * Only the fields present in the request body are updated.
 * The updatedAt timestamp is refreshed automatically.
 *
 * Requires: valid Bearer token (requireAuth) + resolved tenantId (requireTenant).
 *
 * Request body (JSON) — all fields optional:
 *   {
 *     "title"?: string,
 *     "accountId"?: string,
 *     "ownerId"?: string,
 *     "stage"?: OpportunityStage,
 *     "value"?: number | null,
 *     "currency"?: string | null,
 *     "expectedCloseDate"?: string | null,
 *     "description"?: string | null
 *   }
 *
 * Responses:
 *   200  – updated Opportunity object
 *   400  – validation error
 *   401  – missing or invalid Bearer token
 *   403  – authenticated but no active tenant context
 *   404  – opportunity not found or belongs to a different tenant
 *   500  – unexpected server error
 */
export async function handleUpdateOpportunity(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const { id } = req.params as { id: string };
  const { userId: requestingUserId, tenantId } = req.user!;

  const body = req.body as {
    title?: string;
    accountId?: string;
    ownerId?: string;
    stage?: OpportunityStage;
    value?: number | null;
    currency?: string | null;
    expectedCloseDate?: string | null;
    description?: string | null;
  };

  const params: UpdateOpportunityParams = {};
  if ('title' in body) params.title = body.title;
  if ('accountId' in body) params.accountId = body.accountId;
  if ('ownerId' in body) params.ownerId = body.ownerId;
  if ('stage' in body) params.stage = body.stage;
  if ('value' in body) params.value = body.value;
  if ('currency' in body) params.currency = body.currency;
  if ('expectedCloseDate' in body) params.expectedCloseDate = body.expectedCloseDate;
  if ('description' in body) params.description = body.description;

  try {
    const updated = await updateOpportunity(id, tenantId!, params, requestingUserId);
    res.status(200).json(updated);
  } catch (err: unknown) {
    const code = (err as Error & { code?: string }).code;

    if (code === 'VALIDATION_ERROR' || code === 'INVALID_STAGE_TRANSITION') {
      res.status(400).json({ error: (err as Error).message });
      return;
    }

    if (code === 'NOT_FOUND') {
      res.status(404).json({ error: 'Opportunity not found' });
      return;
    }

    logger.error(
      { err, tenantId, requestingUserId, opportunityId: id },
      'Unexpected error updating opportunity',
    );
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

opportunitiesRouter.get('/', requireAuth, requireTenant, handleListOpportunities);
opportunitiesRouter.get('/:id', requireAuth, requireTenant, handleGetOpportunity);
opportunitiesRouter.post('/', requireAuth, requireTenant, handleCreateOpportunity);
opportunitiesRouter.put('/:id', requireAuth, requireTenant, handleUpdateOpportunity);
