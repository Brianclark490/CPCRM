import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from './auth.js';
import { pool } from '../db/client.js';
import { tenantStore } from '../db/tenantContext.js';
import { logger } from '../lib/logger.js';
import { seedDefaultObjects } from '../services/seedDefaultObjects.js';
import { syncUserRecord } from '../services/userSyncService.js';

/**
 * Enforces that an active tenant context is present on the request and that
 * the tenant exists in the local database with an 'active' status.
 * Must be composed after requireAuth so that req.user is populated.
 *
 * If the authenticated user's JWT carries a valid tenant ID that does not yet
 * exist in the local tenants table, this middleware will **auto-provision** the
 * tenant by inserting a row into the tenants table and seeding default CRM
 * objects (fields, layouts, relationships, etc.).  This bridges the gap between
 * Descope (where the tenant was already created) and the local database.
 *
 * Returns:
 *   403 (NO_TENANT)        – token carries no tenantId
 *   403 (INVALID_TENANT)   – tenantId not found and auto-provisioning failed
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

    let tenant = result.rows[0] as { id: string; status: string } | undefined;

    if (!tenant) {
      // Just-in-time provisioning: the Descope JWT vouches for this tenant ID
      // but the tenant does not yet exist in the local database.  Create it and
      // seed default CRM objects so the user has a working environment.
      tenant = await autoProvisionTenant(req.user.tenantId, req.user.userId);
    }

    if (!tenant) {
      logger.warn(
        { path: req.path, userId: req.user.userId, tenantId: req.user.tenantId },
        'Tenant context rejected: tenant not found in local database and auto-provisioning failed',
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

  // Sync User record (best-effort, non-blocking for the response)
  // Creates or updates a User record from the Descope JWT claims.
  syncUserRecord({
    tenantId: req.user.tenantId!,
    descopeUserId: req.user.userId,
    email: req.user.email,
    displayName: req.user.name,
    role: req.user.roles?.[0],
  }).catch((err: unknown) => {
    logger.warn(
      { err, userId: req.user?.userId, tenantId: req.user?.tenantId },
      'User sync failed (best-effort)',
    );
  });

  // Run the rest of the middleware/handler chain inside an AsyncLocalStorage
  // context so the RLS-aware pool proxy in client.ts can read the tenant ID
  // and call SET app.current_tenant_id on every checked-out connection.
  tenantStore.run(req.user.tenantId!, next);
}

/**
 * Creates a tenant row in the local database and seeds default CRM data.
 *
 * This is used for just-in-time provisioning when a user's Descope JWT
 * references a tenant that has not yet been provisioned locally.
 *
 * The tenant row is inserted first (with ON CONFLICT DO NOTHING to handle
 * concurrent requests), then default objects are seeded as a best-effort
 * operation — a seed failure will not prevent the tenant from being created.
 *
 * Returns the tenant row if it exists after the provisioning attempt, or
 * undefined if the tenant could not be created.
 */
async function autoProvisionTenant(
  tenantId: string,
  ownerId: string,
): Promise<{ id: string; status: string } | undefined> {
  try {
    // Step 1: Create the tenant row.  ON CONFLICT DO NOTHING handles the race
    // where two requests for the same new tenant arrive simultaneously.
    const insertResult = await pool.query(
      `INSERT INTO tenants (id, name, slug, status)
       VALUES ($1, $2, $3, 'active')
       ON CONFLICT DO NOTHING
       RETURNING id, status`,
      [tenantId, tenantId, tenantId],
    );

    const wasCreated = insertResult.rows.length > 0;

    // Re-read the tenant row (covers the ON CONFLICT path where another
    // request inserted it first).
    const selectResult = await pool.query(
      'SELECT id, status FROM tenants WHERE id = $1',
      [tenantId],
    );
    const tenant = selectResult.rows[0] as { id: string; status: string } | undefined;

    if (!tenant) {
      return undefined;
    }

    // Step 2: Seed default CRM objects (best-effort).  Seeding manages its own
    // transaction internally, so a failure here does not roll back the tenant
    // row.  The user may see an empty navigation initially; a page refresh
    // after a retry or manual seed will populate it.
    if (wasCreated) {
      try {
        await seedDefaultObjects(tenantId, ownerId);
        logger.info(
          { tenantId, ownerId },
          'Auto-provisioned tenant with default CRM data',
        );
      } catch (seedErr: unknown) {
        logger.error(
          { err: seedErr, tenantId },
          'Failed to seed default objects for auto-provisioned tenant; tenant row was created',
        );
      }
    }

    return tenant;
  } catch (err: unknown) {
    logger.error(
      { err, tenantId },
      'Failed to auto-provision tenant',
    );
    return undefined;
  }
}
