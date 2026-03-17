import { Router } from 'express';
import type { Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import {
  getPipelineSummary,
  getPipelineVelocity,
  getOverdueRecords,
} from '../services/pipelineAnalyticsService.js';
import { logger } from '../lib/logger.js';

export const pipelineAnalyticsRouter = Router({ mergeParams: true });

// ─── Handlers ────────────────────────────────────────────────────────────────

/**
 * GET /pipelines/:pipelineId/summary
 *
 * Returns per-stage aggregates and pipeline totals.
 *
 * Responses:
 *   200  – pipeline summary with stage-level and total metrics
 *   401  – missing or invalid Bearer token
 *   404  – pipeline not found
 *   500  – unexpected server error
 */
export async function handleGetSummary(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const { pipelineId } = req.params as { pipelineId: string };
  const { userId } = req.user!;

  try {
    const summary = await getPipelineSummary(pipelineId, userId);
    res.status(200).json(summary);
  } catch (err: unknown) {
    const code = (err as Error & { code?: string }).code;

    if (code === 'NOT_FOUND') {
      res.status(404).json({ error: (err as Error).message, code: 'NOT_FOUND' });
      return;
    }

    logger.error({ err, pipelineId, userId }, 'Unexpected error fetching pipeline summary');
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

/**
 * GET /pipelines/:pipelineId/velocity?period=30d
 *
 * Returns stage-by-stage conversion metrics for the given period.
 *
 * Query parameters:
 *   period – one of: 7d, 30d, 90d, all (default: 30d)
 *
 * Responses:
 *   200  – velocity metrics per stage
 *   400  – invalid period parameter
 *   401  – missing or invalid Bearer token
 *   404  – pipeline not found
 *   500  – unexpected server error
 */
export async function handleGetVelocity(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const { pipelineId } = req.params as { pipelineId: string };
  const { userId } = req.user!;
  const period = (req.query as Record<string, string>).period ?? '30d';

  try {
    const velocity = await getPipelineVelocity(pipelineId, userId, period);
    res.status(200).json(velocity);
  } catch (err: unknown) {
    const code = (err as Error & { code?: string }).code;

    if (code === 'VALIDATION_ERROR') {
      res.status(400).json({ error: (err as Error).message, code: 'VALIDATION_ERROR' });
      return;
    }

    if (code === 'NOT_FOUND') {
      res.status(404).json({ error: (err as Error).message, code: 'NOT_FOUND' });
      return;
    }

    logger.error({ err, pipelineId, userId }, 'Unexpected error fetching pipeline velocity');
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

/**
 * GET /pipelines/:pipelineId/overdue
 *
 * Returns records that have exceeded their stage's expected_days threshold.
 * Sorted by most overdue first.
 *
 * Responses:
 *   200  – array of overdue records
 *   401  – missing or invalid Bearer token
 *   404  – pipeline not found
 *   500  – unexpected server error
 */
export async function handleGetOverdue(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const { pipelineId } = req.params as { pipelineId: string };
  const { userId } = req.user!;

  try {
    const overdue = await getOverdueRecords(pipelineId, userId);
    res.status(200).json(overdue);
  } catch (err: unknown) {
    const code = (err as Error & { code?: string }).code;

    if (code === 'NOT_FOUND') {
      res.status(404).json({ error: (err as Error).message, code: 'NOT_FOUND' });
      return;
    }

    logger.error({ err, pipelineId, userId }, 'Unexpected error fetching overdue records');
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

// ─── Route registration ──────────────────────────────────────────────────────

pipelineAnalyticsRouter.get('/:pipelineId/summary', requireAuth, handleGetSummary);
pipelineAnalyticsRouter.get('/:pipelineId/velocity', requireAuth, handleGetVelocity);
pipelineAnalyticsRouter.get('/:pipelineId/overdue', requireAuth, handleGetOverdue);
