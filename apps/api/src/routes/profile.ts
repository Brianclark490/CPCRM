import { Router } from 'express';
import type { Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import {
  getOrCreateProfile,
  updateProfile,
} from '../services/profileService.js';
import type { UpdateProfileParams } from '../services/profileService.js';
import { logger } from '../lib/logger.js';

export const profileRouter = Router();

/**
 * GET /profile
 *
 * Returns the profile for the authenticated user.
 * If the user has no profile yet, one is automatically created on first access.
 *
 * Requires: valid Bearer token (requireAuth).
 *
 * Responses:
 *   200  – UserProfile object
 *   401  – missing or invalid Bearer token
 *   500  – unexpected server error
 */
export async function handleGetProfile(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const { userId } = req.user!;

  try {
    const profile = await getOrCreateProfile(userId);
    res.status(200).json(profile);
  } catch (err: unknown) {
    logger.error({ err, userId }, 'Unexpected error retrieving user profile');
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

/**
 * PUT /profile
 *
 * Updates the authenticated user's profile.
 * Only the fields present in the request body are updated.
 * Users may only update their own profile.
 *
 * Requires: valid Bearer token (requireAuth).
 *
 * Request body (JSON) — all fields optional:
 *   {
 *     "displayName"?: string,
 *     "jobTitle"?: string
 *   }
 *
 * Responses:
 *   200  – updated UserProfile object
 *   400  – validation error (e.g. field too long)
 *   401  – missing or invalid Bearer token
 *   404  – profile not found (should not occur in practice — GET creates it)
 *   500  – unexpected server error
 */
export async function handleUpdateProfile(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const { userId } = req.user!;

  const body = req.body as {
    displayName?: string;
    jobTitle?: string;
  };

  const params: UpdateProfileParams = {};
  if ('displayName' in body) params.displayName = body.displayName;
  if ('jobTitle' in body) params.jobTitle = body.jobTitle;

  try {
    const profile = await updateProfile(userId, params, userId);
    res.status(200).json(profile);
  } catch (err: unknown) {
    const code = (err as Error & { code?: string }).code;

    if (code === 'VALIDATION_ERROR') {
      res.status(400).json({ error: (err as Error).message });
      return;
    }

    if (code === 'NOT_FOUND') {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }

    logger.error({ err, userId }, 'Unexpected error updating user profile');
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

profileRouter.get('/', requireAuth, handleGetProfile);
profileRouter.put('/', requireAuth, handleUpdateProfile);
