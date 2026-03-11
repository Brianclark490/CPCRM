import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';

export const meRouter = Router();

meRouter.get('/', requireAuth, (req: AuthenticatedRequest, res) => {
  res.json({ user: req.user });
});
