import type { Selectable, Updateable } from 'kysely';
import { db } from '../db/kysely.js';
import type { Tenants } from '../db/kysely.types.js';
import { getDescopeManagementClient } from '../lib/descopeManagementClient.js';
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

/**
 * Row shape returned to API callers.
 *
 * Typed against `Selectable<Tenants>` (with `settings` widened to an
 * object for the public contract) so a column rename or nullability
 * change on the generated schema becomes a compile-time error here.
 */
export type TenantRow = Omit<Selectable<Tenants>, 'settings' | 'plan'> & {
  plan: string;
  settings: Record<string, unknown>;
};

// ─── Validation ───────────────────────────────────────────────────────────────

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Normalises a Kysely/pg `tenants` row into the public TenantRow contract.
 *
 * `settings` comes back as either a JSON string (raw pg transactional path)
 * or a pre-parsed object (pg's default JSONB parser via Kysely). We coerce
 * both shapes into `Record<string, unknown>` so the API surface is stable.
 */
function coerceTenantRow(row: Selectable<Tenants>): TenantRow {
  const rawSettings = row.settings;
  let settings: Record<string, unknown>;
  if (rawSettings == null) {
    settings = {};
  } else if (typeof rawSettings === 'string') {
    try {
      settings = JSON.parse(rawSettings) as Record<string, unknown>;
    } catch {
      settings = {};
    }
  } else {
    settings = rawSettings as Record<string, unknown>;
  }

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    plan: row.plan ?? 'free',
    settings,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// ─── Service ──────────────────────────────────────────────────────────────────

/**
 * Provisions a new tenant end-to-end:
 *
 * 1. Validates the slug (format + uniqueness).
 * 2. Creates the tenant in Descope (using the slug as the Descope tenant ID).
 * 3. Inserts the tenant record + seeds all default CRM data inside a single
 *    Kysely transaction so that a seed failure rolls back the DB insert.
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
  const existing = await db
    .selectFrom('tenants')
    .select('id')
    .where('slug', '=', slug)
    .executeTakeFirst();
  if (existing) {
    throw Object.assign(new Error(`Slug "${slug}" is already in use`), { code: 'DUPLICATE_SLUG' });
  }

  const descopeClient = getDescopeManagementClient();

  // ── 2. Create tenant in Descope ────────────────────────────────────────────

  logger.info({ slug, name }, 'Creating Descope tenant');
  await descopeClient.management.tenant.createWithId(slug, name.trim());
  logger.info({ slug }, 'Descope tenant created');

  // ── 3. Insert tenant record + seed CRM data (single DB transaction) ────────

  const tenantId = slug;
  let txResult: { tenantRow: TenantRow; seedResult: SeedResult };

  try {
    txResult = await db.transaction().execute(async (trx) => {
      const now = new Date();
      const defaultSettings = {
        currency: 'GBP',
        dateFormat: 'DD/MM/YYYY',
        timezone: 'Europe/London',
      };

      const row = await trx
        .insertInto('tenants')
        .values({
          id: tenantId,
          name: name.trim(),
          slug,
          status: 'active',
          plan,
          settings: JSON.stringify(defaultSettings),
          created_at: now,
          updated_at: now,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      logger.info({ tenantId }, 'Tenant record inserted, seeding default CRM data');
      const sr = await seedWithClient(trx, tenantId, tenantId);

      return { tenantRow: coerceTenantRow(row), seedResult: sr };
    });
  } catch (err) {
    logger.warn({ err, tenantId }, 'Provisioning failed; rolling back Descope tenant');
    await descopeClient.management.tenant.delete(tenantId).catch((deleteErr: unknown) => {
      logger.error(
        { err: deleteErr, tenantId },
        'Failed to clean up Descope tenant after provisioning failure — manual cleanup required',
      );
    });

    throw err;
  }

  logger.info({ tenantId }, 'Tenant record and seed data committed');

  // ── 4. Invite admin user via Descope ───────────────────────────────────────

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
    logger.error(
      { err: inviteErr, tenantId, adminEmail },
      'Failed to send admin invite; tenant was created but invite was not sent',
    );
  }

  return {
    tenant: {
      id: txResult.tenantRow.id,
      name: txResult.tenantRow.name,
      slug: txResult.tenantRow.slug,
      status: txResult.tenantRow.status,
    },
    adminUser: {
      email: adminEmail,
      inviteSent,
    },
    seeded: {
      objects: txResult.seedResult.objectsCreated,
      fields: txResult.seedResult.fieldsCreated,
      relationships: txResult.seedResult.relationshipsCreated,
      pipelines: txResult.seedResult.pipelinesCreated,
    },
  };
}

// ─── List / get / update / delete helpers ─────────────────────────────────────

/**
 * Lists all tenants with pagination.
 *
 * Includes a per-tenant membership count emitted as a correlated scalar
 * subquery (rather than the previous LEFT JOIN with GROUP BY) — mirrors
 * the pattern used by accountService for consistency and keeps the count
 * scoped directly by `tenant_id = t.id` without needing a derived table.
 */
export async function listTenants(
  limit: number,
  offset: number,
): Promise<{ tenants: (TenantRow & { userCount: number })[]; total: number }> {
  // Lightweight COUNT(*) — avoids dedupe'ing the wide joined projection.
  const countRow = await db
    .selectFrom('tenants')
    .select((eb) => eb.fn.countAll<string>().as('total'))
    .executeTakeFirstOrThrow();
  const total = parseInt(countRow.total, 10);

  const rows = await db
    .selectFrom('tenants as t')
    .selectAll('t')
    .select((eb) =>
      eb
        .selectFrom('tenant_memberships as m')
        .select(eb.fn.countAll<string>().as('count'))
        .whereRef('m.tenant_id', '=', 't.id')
        .as('user_count'),
    )
    .orderBy('t.created_at', 'desc')
    .limit(limit)
    .offset(offset)
    .execute();

  return {
    tenants: rows.map((row) => ({
      ...coerceTenantRow(row),
      userCount:
        row.user_count == null
          ? 0
          : typeof row.user_count === 'number'
            ? row.user_count
            : parseInt(row.user_count, 10) || 0,
    })),
    total,
  };
}

/**
 * Returns a single tenant by ID with an approximate user count.
 */
export async function getTenantById(
  id: string,
): Promise<(TenantRow & { userCount: number }) | null> {
  const tenant = await db
    .selectFrom('tenants')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirst();
  if (!tenant) return null;

  const countRow = await db
    .selectFrom('tenant_memberships')
    .select((eb) => eb.fn.countAll<string>().as('count'))
    .where('tenant_id', '=', id)
    .executeTakeFirstOrThrow();

  return {
    ...coerceTenantRow(tenant),
    userCount: parseInt(countRow.count, 10),
  };
}

export interface UpdateTenantInput {
  name?: string;
  status?: string;
  plan?: string;
}

/**
 * Updates mutable fields on a tenant record.
 *
 * The patch object is typed against `Updateable<Tenants>` so a column
 * rename or nullability change on the generated schema surfaces as a
 * compile-time error here, not a silent runtime SQL mismatch.
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

  const patch: Updateable<Tenants> = {};

  if (name !== undefined) {
    if (!name.trim()) {
      throw Object.assign(new Error('Tenant name cannot be empty'), { code: 'VALIDATION_ERROR' });
    }
    patch.name = name.trim();
  }
  if (status !== undefined) patch.status = status;
  if (plan !== undefined) patch.plan = plan;

  if (Object.keys(patch).length === 0) {
    throw Object.assign(new Error('No fields to update'), { code: 'VALIDATION_ERROR' });
  }

  patch.updated_at = new Date();

  const row = await db
    .updateTable('tenants')
    .set(patch)
    .where('id', '=', id)
    .returningAll()
    .executeTakeFirst();

  return row ? coerceTenantRow(row) : null;
}

/**
 * Deletes (or suspends) a tenant.
 * Removes the tenant from Descope if cascade is true.
 */
export async function deleteTenant(id: string, cascade = false): Promise<boolean> {
  const row = await db
    .updateTable('tenants')
    .set({ status: 'suspended', updated_at: new Date() })
    .where('id', '=', id)
    .returning('id')
    .executeTakeFirst();

  if (!row) return false;

  if (cascade) {
    const descopeClient = getDescopeManagementClient();
    await descopeClient.management.tenant.delete(id, true).catch((err: unknown) => {
      logger.error({ err, tenantId: id }, 'Failed to delete Descope tenant during cascade delete');
    });
  }

  return true;
}
