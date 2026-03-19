import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from './auth.js';
import { logger } from '../lib/logger.js';

/**
 * Middleware that restricts access to platform super-admins.
 *
 * Super-admin user IDs are stored in the SUPER_ADMIN_IDS environment variable
 * as a comma-separated list of Descope user IDs, e.g.:
 *   SUPER_ADMIN_IDS=U2abc123,U2def456
 *
 * Must be placed after requireAuth so that req.user is already populated.
 */
export function requireSuperAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  const userId = req.user?.userId;

  const superAdmins = process.env.SUPER_ADMIN_IDS
    ? process.env.SUPER_ADMIN_IDS.split(',').map((id) => id.trim()).filter(Boolean)
    : [];

  if (!userId || !superAdmins.includes(userId)) {
    logger.warn(
      { path: req.path, userId },
      'Super-admin access denied: user is not in SUPER_ADMIN_IDS',
    );
    res.status(403).json({ error: 'Not a platform admin', code: 'FORBIDDEN' });
    return;
  }

  next();
}
