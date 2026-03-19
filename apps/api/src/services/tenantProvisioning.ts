import DescopeClient from '@descope/node-sdk';
import { randomUUID } from 'crypto';
import { pool } from '../db/client.js';
import { logger } from '../lib/logger.js';
import { seedWithClient } from './seedDefaultObjects.js';
import type { SeedResult } from './seedDefaultObjects.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProvisionTenantInput {
  name: string;
  slug: string;
  adminEmail: string;
  adminName: string;
  plan?: string;
}

export interface ProvisionTenantResult {
  tenant: {
    id: string;
    name: string;
    slug: string;
    status: string;
  };
  adminUser: {
    email: string;
    inviteSent: boolean;
  };
  seeded: {
    objects: number;
    fields: number;
    relationships: number;
    pipelines: number;
  };
}

export interface TenantRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  plan: string;
  settings: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

// ─── Validation ───────────────────────────────────────────────────────────────

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validates a tenant slug.
 * Rules: lowercase letters and digits only, separated by single hyphens,
 * no leading/trailing hyphens, 3–63 characters.
 *
 * Returns an error message string, or null if valid.
 */
export function validateSlug(slug: unknown): string | null {
  if (typeof slug !== 'string' || slug.length === 0) {
    return 'Slug is required';
  }
  if (slug.length < 3 || slug.length > 63) {
    return 'Slug must be between 3 and 63 characters';
  }
  if (!SLUG_RE.test(slug)) {
    return 'Slug must contain only lowercase letters, digits, and hyphens (no leading/trailing hyphens)';
  }
  return null;
}

// ─── Descope management client ────────────────────────────────────────────────

let descopeManagementClient: ReturnType<typeof DescopeClient> | undefined;

/**
 * Returns a Descope SDK client configured with the management key.
 * The management client is required for tenant and user management operations.
 *
 * Requires DESCOPE_PROJECT_ID and DESCOPE_MANAGEMENT_KEY environment variables.
 */
function getDescopeManagementClient(): ReturnType<typeof DescopeClient> {
  if (!descopeManagementClient) {
    const projectId = process.env.DESCOPE_PROJECT_ID;
    if (!projectId) {
      throw new Error('DESCOPE_PROJECT_ID environment variable is required');
    }
    const managementKey = process.env.DESCOPE_MANAGEMENT_KEY;
    if (!managementKey) {
      throw new Error('DESCOPE_MANAGEMENT_KEY environment variable is required');
    }
    descopeManagementClient = DescopeClient({ projectId, managementKey });
  }
  return descopeManagementClient;
}

// ─── Service ──────────────────────────────────────────────────────────────────

/**
 * Provisions a new tenant end-to-end:
 *
 * 1. Validates the slug (format + uniqueness).
 * 2. Creates the tenant in Descope (using the slug as the Descope tenant ID).
 * 3. Inserts the tenant record + seeds all default CRM data inside a single
 *    database transaction so that a seed failure rolls back the DB insert.
 * 4. Invites the admin user into the new tenant with the "admin" role in
 *    Descope (create + assign tenant roles + send magic-link invite in one
 *    API call).
 *
 * Atomicity / rollback:
 * - If anything fails after the Descope tenant has been created, the function
 *   attempts to delete the Descope tenant before re-throwing.
 * - The DB insert + seed run inside a single transaction, so a seed failure
 *   automatically rolls back the tenant row.
 *
 * @throws {Error} with `code: 'VALIDATION_ERROR'` for invalid input.
 * @throws {Error} with `code: 'DUPLICATE_SLUG'` if the slug is already taken.
 */
export async function provisionTenant(
  input: ProvisionTenantInput,
): Promise<ProvisionTenantResult> {
  const { name, slug, adminEmail, adminName, plan = 'free' } = input;

  // ── 1. Validate input ──────────────────────────────────────────────────────

  if (!name || name.trim().length === 0) {
    throw Object.assign(new Error('Tenant name is required'), { code: 'VALIDATION_ERROR' });
  }
  if (name.trim().length > 255) {
    throw Object.assign(new Error('Tenant name must be 255 characters or fewer'), { code: 'VALIDATION_ERROR' });
  }

  const slugError = validateSlug(slug);
  if (slugError) {
    throw Object.assign(new Error(slugError), { code: 'VALIDATION_ERROR' });
  }

  if (!adminEmail || !EMAIL_RE.test(adminEmail)) {
    throw Object.assign(new Error('A valid admin email address is required'), { code: 'VALIDATION_ERROR' });
  }
  if (!adminName || adminName.trim().length === 0) {
    throw Object.assign(new Error('Admin name is required'), { code: 'VALIDATION_ERROR' });
  }

  // Check slug uniqueness before touching external systems
  const existing = await pool.query(
    'SELECT id FROM tenants WHERE slug = $1',
    [slug],
  );
  if ((existing.rowCount ?? 0) > 0) {
    throw Object.assign(new Error(`Slug "${slug}" is already in use`), { code: 'DUPLICATE_SLUG' });
  }

  const descopeClient = getDescopeManagementClient();

  // ── 2. Create tenant in Descope ────────────────────────────────────────────

  logger.info({ slug, name }, 'Creating Descope tenant');
  await descopeClient.management.tenant.createWithId(slug, name.trim());
  logger.info({ slug }, 'Descope tenant created');

  // ── 3. Insert tenant record + seed CRM data (single DB transaction) ────────

  const client = await pool.connect();
  // The Descope tenant ID is the slug — use a descriptive alias throughout.
  const tenantId = slug;
  let seedResult: SeedResult;

  try {
    await client.query('BEGIN');

    const now = new Date();
    const tenantResult = await client.query(
      `INSERT INTO tenants (id, name, slug, status, plan, settings, created_at, updated_at)
       VALUES ($1, $2, $3, 'active', $4, '{}', $5, $6)
       RETURNING *`,
      [tenantId, name.trim(), slug, plan, now, now],
    );
    const tenantRow = tenantResult.rows[0] as TenantRow;

    logger.info({ tenantId }, 'Tenant record inserted, seeding default CRM data');
    seedResult = await seedWithClient(client, tenantId);

    await client.query('COMMIT');
    logger.info({ tenantId }, 'Tenant record and seed data committed');

    // ── 4. Invite admin user via Descope ───────────────────────────────────

    logger.info({ tenantId, adminEmail }, 'Inviting admin user via Descope');

    let inviteSent = false;
    try {
      await descopeClient.management.user.invite(adminEmail, {
        email: adminEmail,
        displayName: adminName.trim(),
        userTenants: [{ tenantId, roleNames: ['admin'] }],
        sendMail: true,
      });
      inviteSent = true;
      logger.info({ tenantId, adminEmail }, 'Admin user invited successfully');
    } catch (inviteErr) {
      // Log but do not roll back: the tenant and seed data are committed.
      // The platform admin can resend the invite manually.
      logger.error(
        { err: inviteErr, tenantId, adminEmail },
        'Failed to send admin invite; tenant was created but invite was not sent',
      );
    }

    return {
      tenant: {
        id: tenantRow.id,
        name: tenantRow.name,
        slug: tenantRow.slug,
        status: tenantRow.status,
      },
      adminUser: {
        email: adminEmail,
        inviteSent,
      },
      seeded: {
        objects: seedResult.objectsCreated,
        fields: seedResult.fieldsCreated,
        relationships: seedResult.relationshipsCreated,
        pipelines: 1,
      },
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});

    // Attempt to clean up the Descope tenant so the slug is not orphaned
    logger.warn({ err, tenantId }, 'Provisioning failed; rolling back Descope tenant');
    await descopeClient.management.tenant.delete(tenantId).catch((deleteErr: unknown) => {
      logger.error(
        { err: deleteErr, tenantId },
        'Failed to clean up Descope tenant after provisioning failure — manual cleanup required',
      );
    });

    throw err;
  } finally {
    client.release();
  }
}

// ─── List / get / update / delete helpers ─────────────────────────────────────

/**
 * Lists all tenants with optional pagination.
 */
export async function listTenants(
  limit: number,
  offset: number,
): Promise<{ tenants: TenantRow[]; total: number }> {
  const countResult = await pool.query('SELECT COUNT(*) AS total FROM tenants');
  const total = parseInt((countResult.rows[0] as { total: string }).total, 10);

  const result = await pool.query(
    'SELECT * FROM tenants ORDER BY created_at DESC LIMIT $1 OFFSET $2',
    [limit, offset],
  );

  return { tenants: result.rows as TenantRow[], total };
}

/**
 * Returns a single tenant by ID with an approximate user count.
 */
export async function getTenantById(id: string): Promise<(TenantRow & { userCount: number }) | null> {
  const result = await pool.query('SELECT * FROM tenants WHERE id = $1', [id]);
  if (result.rows.length === 0) return null;

  const tenant = result.rows[0] as TenantRow;

  // Count memberships for this tenant
  const countResult = await pool.query(
    'SELECT COUNT(*) AS count FROM tenant_memberships WHERE tenant_id = $1',
    [id],
  );
  const userCount = parseInt((countResult.rows[0] as { count: string }).count, 10);

  return { ...tenant, userCount };
}

export interface UpdateTenantInput {
  name?: string;
  status?: string;
  plan?: string;
}

/**
 * Updates mutable fields on a tenant record.
 */
export async function updateTenant(
  id: string,
  input: UpdateTenantInput,
): Promise<TenantRow | null> {
  const { name, status, plan } = input;

  const validStatuses = ['active', 'suspended', 'inactive', 'cancelled'];
  if (status !== undefined && !validStatuses.includes(status)) {
    throw Object.assign(
      new Error(`Invalid status "${status}". Must be one of: ${validStatuses.join(', ')}`),
      { code: 'VALIDATION_ERROR' },
    );
  }

  const setClauses: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (name !== undefined) {
    if (!name.trim()) throw Object.assign(new Error('Tenant name cannot be empty'), { code: 'VALIDATION_ERROR' });
    setClauses.push(`name = $${idx++}`);
    values.push(name.trim());
  }
  if (status !== undefined) {
    setClauses.push(`status = $${idx++}`);
    values.push(status);
  }
  if (plan !== undefined) {
    setClauses.push(`plan = $${idx++}`);
    values.push(plan);
  }

  if (setClauses.length === 0) {
    throw Object.assign(new Error('No fields to update'), { code: 'VALIDATION_ERROR' });
  }

  setClauses.push(`updated_at = $${idx++}`);
  values.push(new Date());
  values.push(id);

  const result = await pool.query(
    `UPDATE tenants SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
    values,
  );

  return result.rows.length > 0 ? (result.rows[0] as TenantRow) : null;
}

/**
 * Deletes (or suspends) a tenant.
 * Removes the tenant from Descope if cascade is true.
 */
export async function deleteTenant(id: string, cascade = false): Promise<boolean> {
  const result = await pool.query(
    `UPDATE tenants SET status = 'suspended', updated_at = $1 WHERE id = $2 RETURNING id`,
    [new Date(), id],
  );

  if (result.rows.length === 0) return false;

  if (cascade) {
    const descopeClient = getDescopeManagementClient();
    await descopeClient.management.tenant.delete(id, true).catch((err: unknown) => {
      logger.error({ err, tenantId: id }, 'Failed to delete Descope tenant during cascade delete');
    });
  }

  return true;
}
