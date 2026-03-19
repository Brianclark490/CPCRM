import { Router } from 'express';
import type { Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireSuperAdmin } from '../middleware/superAdmin.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import {
  provisionTenant,
  listTenants,
  getTenantById,
  updateTenant,
  deleteTenant,
} from '../services/tenantProvisioning.js';
import { logger } from '../lib/logger.js';

export const platformTenantsRouter = Router();

// All platform routes require authentication and super-admin privileges
const auth = [requireAuth, requireSuperAdmin];

/** Normalises an Express param value that may be a string or string array. */
function resolveParam(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * POST /api/platform/tenants
 *
 * Creates a new tenant end-to-end: Descope tenant, local DB record,
 * default CRM seed data, and admin user invite.
 *
 * Super-admin only.
 *
 * Request body:
 *   { name, slug, adminEmail, adminName, plan? }
 *
 * Responses:
 *   201  – tenant provisioned successfully
 *   400  – validation error
 *   409  – slug already in use
 *   401  – unauthenticated
 *   403  – not a super-admin
 *   500  – unexpected error
 */
export async function handleCreateTenant(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const body = req.body as {
    name?: unknown;
    slug?: unknown;
    adminEmail?: unknown;
    adminName?: unknown;
    plan?: unknown;
  };

  try {
    const result = await provisionTenant({
      name: typeof body.name === 'string' ? body.name : '',
      slug: typeof body.slug === 'string' ? body.slug : '',
      adminEmail: typeof body.adminEmail === 'string' ? body.adminEmail : '',
      adminName: typeof body.adminName === 'string' ? body.adminName : '',
      plan: typeof body.plan === 'string' ? body.plan : undefined,
    });

    res.status(201).json(result);
  } catch (err: unknown) {
    const error = err as Error & { code?: string };

    if (error.code === 'VALIDATION_ERROR') {
      res.status(400).json({ error: error.message, code: 'VALIDATION_ERROR' });
      return;
    }
    if (error.code === 'DUPLICATE_SLUG') {
      res.status(409).json({ error: error.message, code: 'DUPLICATE_SLUG' });
      return;
    }

    logger.error({ err, body }, 'Unexpected error provisioning tenant');
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

/**
 * GET /api/platform/tenants
 *
 * Lists all tenants with optional pagination.
 * Super-admin only.
 *
 * Query params:
 *   limit  – max records to return (default 50, max 100)
 *   offset – number of records to skip (default 0)
 */
export async function handleListTenants(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const limit = Math.min(parseInt(req.query['limit'] as string || '50', 10) || 50, 100);
  const offset = Math.max(parseInt(req.query['offset'] as string || '0', 10) || 0, 0);

  try {
    const { tenants, total } = await listTenants(limit, offset);
    res.json({ tenants, total, limit, offset });
  } catch (err: unknown) {
    logger.error({ err }, 'Unexpected error listing tenants');
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

/**
 * GET /api/platform/tenants/:id
 *
 * Returns a single tenant with its user count.
 * Super-admin only.
 */
export async function handleGetTenant(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const { id } = req.params;
  const tenantId = resolveParam(id);

  try {
    const tenant = await getTenantById(tenantId);
    if (!tenant) {
      res.status(404).json({ error: 'Tenant not found', code: 'NOT_FOUND' });
      return;
    }
    res.json(tenant);
  } catch (err: unknown) {
    logger.error({ err, tenantId }, 'Unexpected error fetching tenant');
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

/**
 * PUT /api/platform/tenants/:id
 *
 * Updates mutable fields on a tenant (name, status, plan).
 * Super-admin only.
 */
export async function handleUpdateTenant(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const { id } = req.params;
  const tenantId = resolveParam(id);
  const body = req.body as { name?: unknown; status?: unknown; plan?: unknown };

  try {
    const updated = await updateTenant(tenantId, {
      name: typeof body.name === 'string' ? body.name : undefined,
      status: typeof body.status === 'string' ? body.status : undefined,
      plan: typeof body.plan === 'string' ? body.plan : undefined,
    });

    if (!updated) {
      res.status(404).json({ error: 'Tenant not found', code: 'NOT_FOUND' });
      return;
    }

    res.json(updated);
  } catch (err: unknown) {
    const error = err as Error & { code?: string };
    if (error.code === 'VALIDATION_ERROR') {
      res.status(400).json({ error: error.message, code: 'VALIDATION_ERROR' });
      return;
    }
    logger.error({ err, tenantId }, 'Unexpected error updating tenant');
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

/**
 * DELETE /api/platform/tenants/:id
 *
 * Suspends a tenant (soft delete). Pass ?cascade=true to also remove the
 * tenant from Descope.
 * Super-admin only.
 */
export async function handleDeleteTenant(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const { id } = req.params;
  const tenantId = resolveParam(id);
  const cascade = req.query['cascade'] === 'true';

  try {
    const deleted = await deleteTenant(tenantId, cascade);
    if (!deleted) {
      res.status(404).json({ error: 'Tenant not found', code: 'NOT_FOUND' });
      return;
    }
    res.status(204).end();
  } catch (err: unknown) {
    logger.error({ err, tenantId }, 'Unexpected error deleting tenant');
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

// ─── Route bindings ───────────────────────────────────────────────────────────

platformTenantsRouter.post('/', ...auth, handleCreateTenant);
platformTenantsRouter.get('/', ...auth, handleListTenants);
platformTenantsRouter.get('/:id', ...auth, handleGetTenant);
platformTenantsRouter.put('/:id', ...auth, handleUpdateTenant);
platformTenantsRouter.delete('/:id', ...auth, handleDeleteTenant);
