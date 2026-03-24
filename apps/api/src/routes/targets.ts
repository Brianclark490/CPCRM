import { Router } from 'express';
import type { Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireTenant } from '../middleware/tenant.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import {
  getTargetSummary,
  getUserTarget,
} from '../services/salesTargetService.js';
import { logger } from '../lib/logger.js';
import rateLimit from 'express-rate-limit';

export const targetsRouter = Router();

const targetsRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // limit each IP to 300 requests per windowMs for targets routes
  standardHeaders: true,
  legacyHeaders: false,
});

// ─── Handlers ────────────────────────────────────────────────────────────────

/**
 * GET /targets/summary
 *
 * Returns the current period summary with actuals, grouped by
 * business → team → user.
 *
 * Query parameters:
 *   period_start – override period start (YYYY-MM-DD)
 *   period_end   – override period end (YYYY-MM-DD)
 *
 * Responses:
 *   200  – target summary with business, team, and user breakdowns
 *   401  – missing or invalid Bearer token
 *   403  – no tenant context
 *   500  – unexpected server error
 */
export async function handleGetTargetSummary(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const query = req.query as Record<string, string>;
  const periodStart = query.period_start ?? query.periodStart;
  const periodEnd = query.period_end ?? query.periodEnd;

  try {
    const summary = await getTargetSummary(req.user!.tenantId!, periodStart, periodEnd);
    res.status(200).json(summary);
  } catch (err: unknown) {
    logger.error({ err }, 'Unexpected error fetching target summary');
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

/**
 * GET /targets/user/:userId
 *
 * Returns a specific user's target and actuals for the current period.
 *
 * Query parameters:
 *   period_start – override period start (YYYY-MM-DD)
 *   period_end   – override period end (YYYY-MM-DD)
 *
 * Responses:
 *   200  – user target with actuals
 *   401  – missing or invalid Bearer token
 *   403  – no tenant context
 *   500  – unexpected server error
 */
export async function handleGetUserTarget(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const { userId } = req.params as { userId: string };
  const query = req.query as Record<string, string>;
  const periodStart = query.period_start ?? query.periodStart;
  const periodEnd = query.period_end ?? query.periodEnd;

  try {
    const result = await getUserTarget(req.user!.tenantId!, userId, periodStart, periodEnd);
    res.status(200).json(result);
  } catch (err: unknown) {
    logger.error({ err, userId }, 'Unexpected error fetching user target');
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

// ─── Route registration ──────────────────────────────────────────────────────

targetsRouter.get('/summary', requireAuth, requireTenant, targetsRateLimiter, handleGetTargetSummary);
targetsRouter.get('/user/:userId', requireAuth, requireTenant, targetsRateLimiter, handleGetUserTarget);
