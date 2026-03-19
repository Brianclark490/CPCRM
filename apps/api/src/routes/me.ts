import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';

export const meRouter = Router();

function isSuperAdmin(userId: string | undefined): boolean {
  if (!userId) return false;
  const superAdmins = process.env.SUPER_ADMIN_IDS
    ? process.env.SUPER_ADMIN_IDS.split(',').map((id) => id.trim()).filter(Boolean)
    : [];
  return superAdmins.includes(userId);
}

meRouter.get('/', requireAuth, (req: AuthenticatedRequest, res) => {
  res.json({ user: req.user, isSuperAdmin: isSuperAdmin(req.user?.userId) });
});
