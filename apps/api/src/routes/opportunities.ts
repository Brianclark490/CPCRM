import { Router } from 'express';
import type { Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireTenant } from '../middleware/tenant.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { createOpportunity } from '../services/opportunityService.js';
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

opportunitiesRouter.post('/', requireAuth, requireTenant, handleCreateOpportunity);
