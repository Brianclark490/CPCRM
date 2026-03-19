import { Router } from 'express';
import type { Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { requireTenant } from '../middleware/tenant.js';
import { requireRole } from '../middleware/permission.js';
import {
  inviteUser,
  listTenantUsers,
  changeUserRole,
  removeUserFromTenant,
} from '../services/adminUserService.js';
import { logger } from '../lib/logger.js';

export const adminUsersRouter = Router();

// All admin user management routes require authentication, active tenant, and admin role
const auth = [requireAuth, requireTenant, requireRole('admin')];

/**
 * POST /api/admin/users/invite
 *
 * Invites a user to the current tenant.
 *
 * 1. If the user already exists in Descope: adds them to the tenant with the specified role.
 * 2. If not: creates the user in Descope and adds them to the tenant.
 * 3. Sends a magic link invite via Descope.
 *
 * Request body:
 *   { "email": string, "name": string, "role": string }
 *
 * Responses:
 *   201  – user invited successfully
 *   400  – validation error
 *   401  – unauthenticated
 *   403  – not a tenant admin
 *   500  – unexpected error
 */
export async function handleInviteUser(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const body = req.body as { email?: unknown; name?: unknown; role?: unknown };
  const tenantId = req.user!.tenantId!;

  try {
    const result = await inviteUser({
      email: typeof body.email === 'string' ? body.email : '',
      name: typeof body.name === 'string' ? body.name : '',
      role: typeof body.role === 'string' ? body.role : '',
      tenantId,
    });

    res.status(201).json(result);
  } catch (err: unknown) {
    const error = err as Error & { code?: string };

    if (error.code === 'VALIDATION_ERROR') {
      res.status(400).json({ error: error.message, code: 'VALIDATION_ERROR' });
      return;
    }
    if (error.code === 'INVITE_FAILED') {
      res.status(500).json({ error: error.message, code: 'INVITE_FAILED' });
      return;
    }

    logger.error({ err, tenantId }, 'Unexpected error inviting user');
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

/**
 * GET /api/admin/users
 *
 * Lists all users in the current tenant.
 *
 * Returns: array of users with userId, loginId, email, name, roles, status, lastLogin.
 *
 * Responses:
 *   200  – user list
 *   401  – unauthenticated
 *   403  – not a tenant admin
 *   500  – unexpected error
 */
export async function handleListUsers(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const tenantId = req.user!.tenantId!;

  try {
    const users = await listTenantUsers(tenantId);
    res.status(200).json(users);
  } catch (err: unknown) {
    logger.error({ err, tenantId }, 'Unexpected error listing tenant users');
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

/**
 * PUT /api/admin/users/:loginId/role
 *
 * Changes a user's role within the current tenant.
 *
 * Request body:
 *   { "role": string }
 *
 * Responses:
 *   200  – role updated
 *   400  – validation error
 *   401  – unauthenticated
 *   403  – not a tenant admin
 *   500  – unexpected error
 */
export async function handleChangeRole(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const { loginId } = req.params as { loginId: string };
  const tenantId = req.user!.tenantId!;
  const body = req.body as { role?: unknown };
  const newRole = typeof body.role === 'string' ? body.role : '';

  try {
    await changeUserRole({ loginId, tenantId, newRole });

    res.status(200).json({ loginId, tenantId, role: newRole });
  } catch (err: unknown) {
    const error = err as Error & { code?: string };

    if (error.code === 'VALIDATION_ERROR') {
      res.status(400).json({ error: error.message, code: 'VALIDATION_ERROR' });
      return;
    }

    logger.error({ err, loginId, tenantId }, 'Unexpected error changing user role');
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

/**
 * DELETE /api/admin/users/:loginId
 *
 * Removes a user from the current tenant. Does not delete the user from Descope entirely.
 *
 * Responses:
 *   204  – user removed from tenant
 *   401  – unauthenticated
 *   403  – not a tenant admin
 *   500  – unexpected error
 */
export async function handleRemoveUser(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const { loginId } = req.params as { loginId: string };
  const tenantId = req.user!.tenantId!;

  try {
    await removeUserFromTenant(loginId, tenantId);
    res.status(204).end();
  } catch (err: unknown) {
    logger.error({ err, loginId, tenantId }, 'Unexpected error removing user from tenant');
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

// ─── Route bindings ───────────────────────────────────────────────────────────

adminUsersRouter.post('/invite', ...auth, handleInviteUser);
adminUsersRouter.get('/', ...auth, handleListUsers);
adminUsersRouter.put('/:loginId/role', ...auth, handleChangeRole);
adminUsersRouter.delete('/:loginId', ...auth, handleRemoveUser);
