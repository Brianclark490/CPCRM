import { Router } from 'express';
import type { Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireTenant } from '../middleware/tenant.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { provisionOrganisation } from '../services/organisationService.js';
import { logger } from '../lib/logger.js';

export const organisationsRouter = Router();

/**
 * POST /organisations
 *
 * Creates a new organisation within the authenticated user's tenant and
 * registers the requesting user as the initial owner.
 *
 * Requires: valid Bearer token (requireAuth) + resolved tenantId (requireTenant).
 *
 * Request body (JSON):
 *   { "name": string, "description"?: string }
 *
 * Responses:
 *   201  – organisation created; body contains { organisation, membership }
 *   400  – validation error (e.g. missing name)
 *   401  – missing or invalid Bearer token
 *   403  – authenticated but no active tenant context
 *   500  – unexpected server error
 */
export async function handleCreateOrganisation(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const body = req.body as { name?: string; description?: string };

  // req.user is guaranteed non-null after requireAuth + requireTenant
  const { userId: requestingUserId, tenantId } = req.user!;

  try {
    const result = await provisionOrganisation({
      name: body?.name ?? '',
      description: body?.description,
      tenantId: tenantId!,
      requestingUserId,
    });

    res.status(201).json(result);
  } catch (err: unknown) {
    if (err instanceof Error && (err as Error & { code?: string }).code === 'VALIDATION_ERROR') {
      res.status(400).json({ error: err.message });
      return;
    }

    logger.error({ err, tenantId, requestingUserId }, 'Unexpected error provisioning organisation');
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

organisationsRouter.post('/', requireAuth, requireTenant, handleCreateOrganisation);
