import { Router } from 'express';
import type { Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireTenant } from '../middleware/tenant.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import {
  upsertTarget,
  listTargets,
  deleteTarget,
} from '../services/salesTargetService.js';
import type { CreateTargetParams } from '../services/salesTargetService.js';
import { logger } from '../lib/logger.js';
import rateLimit from 'express-rate-limit';

export const adminTargetsRouter = Router();

const adminTargetsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per window
  standardHeaders: true,
  legacyHeaders: false,
});

// ─── Handlers ────────────────────────────────────────────────────────────────

/**
 * POST /admin/targets
 *
 * Creates or updates a sales target. If a target already exists for the
 * same tenant/type/entity/period_start, it is updated (upsert).
 *
 * Request body (JSON):
 *   {
 *     "target_type": "business" | "team" | "user",
 *     "target_entity_id"?: string,
 *     "period_type": "monthly" | "quarterly" | "annual",
 *     "period_start": "YYYY-MM-DD",
 *     "period_end": "YYYY-MM-DD",
 *     "target_value": number,
 *     "currency"?: string
 *   }
 *
 * Responses:
 *   201  – target created/updated
 *   400  – validation error
 *   401  – missing or invalid Bearer token
 *   403  – no tenant context
 *   500  – unexpected server error
 */
export async function handleCreateTarget(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const body = req.body as {
    target_type?: string;
    targetType?: string;
    target_entity_id?: string | null;
    targetEntityId?: string | null;
    period_type?: string;
    periodType?: string;
    period_start?: string;
    periodStart?: string;
    period_end?: string;
    periodEnd?: string;
    target_value?: number;
    targetValue?: number;
    currency?: string;
  };

  const params: CreateTargetParams = {
    targetType: body.target_type ?? body.targetType ?? '',
    targetEntityId: body.target_entity_id ?? body.targetEntityId,
    periodType: body.period_type ?? body.periodType ?? '',
    periodStart: body.period_start ?? body.periodStart ?? '',
    periodEnd: body.period_end ?? body.periodEnd ?? '',
    targetValue: body.target_value ?? body.targetValue ?? NaN,
    currency: body.currency,
  };

  try {
    const target = await upsertTarget(req.user!.tenantId!, params);
    res.status(201).json(target);
  } catch (err: unknown) {
    const code = (err as Error & { code?: string }).code;

    if (code === 'VALIDATION_ERROR') {
      res.status(400).json({ error: (err as Error).message, code: 'VALIDATION_ERROR' });
      return;
    }

    logger.error({ err }, 'Unexpected error creating/updating target');
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

/**
 * GET /admin/targets
 *
 * Lists all targets for the tenant. Optionally filter by period.
 *
 * Query parameters:
 *   period_start – filter targets starting on or after this date
 *   period_end   – filter targets ending on or before this date
 *
 * Responses:
 *   200  – array of sales targets
 *   401  – missing or invalid Bearer token
 *   403  – no tenant context
 *   500  – unexpected server error
 */
export async function handleListTargets(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const query = req.query as Record<string, string>;
  const periodStart = query.period_start ?? query.periodStart;
  const periodEnd = query.period_end ?? query.periodEnd;

  try {
    const targets = await listTargets(req.user!.tenantId!, periodStart, periodEnd);
    res.status(200).json(targets);
  } catch (err: unknown) {
    logger.error({ err }, 'Unexpected error listing targets');
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

/**
 * DELETE /admin/targets/:id
 *
 * Deletes a sales target by ID.
 *
 * Responses:
 *   204  – target deleted
 *   401  – missing or invalid Bearer token
 *   403  – no tenant context
 *   404  – target not found
 *   500  – unexpected server error
 */
export async function handleDeleteTarget(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const { id } = req.params as { id: string };

  try {
    await deleteTarget(req.user!.tenantId!, id);
    res.status(204).end();
  } catch (err: unknown) {
    const code = (err as Error & { code?: string }).code;

    if (code === 'NOT_FOUND') {
      res.status(404).json({ error: (err as Error).message, code: 'NOT_FOUND' });
      return;
    }

    logger.error({ err, targetId: id }, 'Unexpected error deleting target');
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

// ─── Route registration ──────────────────────────────────────────────────────

adminTargetsRouter.post('/', requireAuth, requireTenant, adminTargetsLimiter, handleCreateTarget);
adminTargetsRouter.get('/', requireAuth, requireTenant, adminTargetsLimiter, handleListTargets);
adminTargetsRouter.delete('/:id', requireAuth, requireTenant, adminTargetsLimiter, handleDeleteTarget);
