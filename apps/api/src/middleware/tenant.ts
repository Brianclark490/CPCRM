import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from './auth.js';
import { logger } from '../lib/logger.js';

/**
 * Enforces that an active tenant context is present on the request.
 * Must be composed after requireAuth so that req.user is populated.
 *
 * Returns 403 if the authenticated user's token carries no tenantId.
 * This prevents any tenant-scoped route handler from running without
 * a resolved tenant, ensuring cross-tenant data access is impossible
 * by construction.
 *
 * Usage:
 *   router.get('/accounts', requireAuth, requireTenant, handler)
 */
export function requireTenant(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  if (!req.user?.tenantId) {
    logger.warn(
      { path: req.path, userId: req.user?.userId },
      'Tenant context rejected: no tenantId resolved for authenticated user',
    );
    res.status(403).json({ error: 'No active tenant context for this user' });
    return;
  }

  next();
}
