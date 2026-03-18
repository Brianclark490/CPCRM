import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from './auth.js';
import { logger } from '../lib/logger.js';

/**
 * Returns middleware that enforces the user holds **all** of the listed
 * Descope permissions.  Must be composed after `requireAuth` so that
 * `req.user` (including `permissions`) is already populated.
 *
 * Usage:
 *   router.post('/admin/objects', requireAuth, requirePermission('objects:manage'), handler)
 *   router.delete('/records/:id', requireAuth, requirePermission('records:delete'), handler)
 */
export function requirePermission(...required: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const userPermissions = req.user?.permissions ?? [];
    const missing = required.filter((p) => !userPermissions.includes(p));

    if (missing.length > 0) {
      logger.warn(
        { path: req.path, userId: req.user?.userId, missing },
        'Permission denied: user lacks required permissions',
      );
      res.status(403).json({ error: 'Forbidden: insufficient permissions' });
      return;
    }

    next();
  };
}

/**
 * Returns middleware that enforces the user holds **at least one** of the
 * listed Descope roles.  Must be composed after `requireAuth`.
 *
 * Usage:
 *   router.get('/admin', requireAuth, requireRole('admin'), handler)
 */
export function requireRole(...allowed: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const userRoles = req.user?.roles ?? [];
    const hasRole = allowed.some((r) => userRoles.includes(r));

    if (!hasRole) {
      logger.warn(
        { path: req.path, userId: req.user?.userId, allowed, userRoles },
        'Permission denied: user lacks required role',
      );
      res.status(403).json({ error: 'Forbidden: insufficient role' });
      return;
    }

    next();
  };
}
