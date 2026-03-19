import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from './auth.js';
import { pool } from '../db/client.js';
import { logger } from '../lib/logger.js';

/**
 * Enforces that an active tenant context is present on the request and that
 * the tenant exists in the local database with an 'active' status.
 * Must be composed after requireAuth so that req.user is populated.
 *
 * Returns:
 *   403 (NO_TENANT)        – token carries no tenantId
 *   403 (INVALID_TENANT)   – tenantId not found in the local tenants table
 *   403 (TENANT_SUSPENDED) – tenant exists but is not active
 *
 * Usage:
 *   router.get('/accounts', requireAuth, requireTenant, handler)
 */
export async function requireTenant(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!req.user?.tenantId) {
    logger.warn(
      { path: req.path, userId: req.user?.userId },
      'Tenant context rejected: no tenantId resolved for authenticated user',
    );
    res.status(403).json({
      error: 'No tenant selected. User must belong to a tenant.',
      code: 'NO_TENANT',
    });
    return;
  }

  try {
    const result = await pool.query(
      'SELECT id, status FROM tenants WHERE id = $1',
      [req.user.tenantId],
    );

    const tenant = result.rows[0] as { id: string; status: string } | undefined;

    if (!tenant) {
      logger.warn(
        { path: req.path, userId: req.user.userId, tenantId: req.user.tenantId },
        'Tenant context rejected: tenant not found in local database',
      );
      res.status(403).json({ error: 'Tenant not found', code: 'INVALID_TENANT' });
      return;
    }

    if (tenant.status !== 'active') {
      logger.warn(
        { path: req.path, userId: req.user.userId, tenantId: req.user.tenantId, status: tenant.status },
        'Tenant context rejected: tenant is not active',
      );
      res.status(403).json({ error: 'Tenant is suspended', code: 'TENANT_SUSPENDED' });
      return;
    }
  } catch (err) {
    logger.error(
      { err, path: req.path, userId: req.user.userId, tenantId: req.user.tenantId },
      'Tenant validation failed: database error',
    );
    res.status(503).json({ error: 'Tenant validation service unavailable' });
    return;
  }

  next();
}
