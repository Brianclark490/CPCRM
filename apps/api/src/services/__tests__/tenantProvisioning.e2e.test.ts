import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tenant Provisioning Tests
 *
 * Verifies the end-to-end provisioning flow:
 * - Creates Descope tenant + local DB row + seeds default CRM data
 * - Seed data creates independent objects per tenant
 * - Admin user created with admin role
 * - Invite flow creates/finds user and adds to tenant
 * - Rollback behaviour on failure
 */

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ─── Mock Descope management client ──────────────────────────────────────────

const mockCreateTenantWithId = vi.fn();
const mockDeleteTenant = vi.fn();
const mockDescopeInvite = vi.fn();

vi.mock('../../lib/descopeManagementClient.js', () => ({
  getDescopeManagementClient: vi.fn(() => ({
    management: {
      tenant: {
        createWithId: mockCreateTenantWithId,
        delete: mockDeleteTenant,
      },
      user: {
        invite: mockDescopeInvite,
      },
    },
  })),
}));

// ─── Mock DB pool with fake in-memory state ──────────────────────────────────

interface FakeRow { id: string; [key: string]: unknown }

const fakeTenants = new Map<string, FakeRow>();
const fakeObjects = new Map<string, FakeRow>();
const fakeFields = new Map<string, FakeRow>();
const fakeRelationships = new Map<string, FakeRow>();

const mockClientQuery = vi.fn(async (sql: string, params?: unknown[]) => {
  const s = sql.replace(/\s+/g, ' ').trim().toUpperCase();

  // Transaction control
  if (s === 'BEGIN' || s === 'COMMIT' || s === 'ROLLBACK') return { rows: [] };

  // INSERT INTO tenants ... RETURNING *
  // Params: $1=id, $2=name, $3=slug, $4=plan, $5=created_at, $6=updated_at
  // ('active' and '{}' are hardcoded in the SQL, not parameterised)
  if (s.startsWith('INSERT INTO TENANTS')) {
    const [id, name, slug, plan, created_at, updated_at] = params as unknown[];
    const row: FakeRow = { id: id as string, name, slug, status: 'active', plan, settings: '{}', created_at, updated_at };
    fakeTenants.set(id as string, row);
    return { rows: [row] };
  }

  // SELECT id, api_name FROM object_definitions WHERE api_name = ANY($1) AND tenant_id = $2
  if (s.includes('FROM OBJECT_DEFINITIONS') && s.includes('ANY')) {
    const apiNames = params![0] as string[];
    const tenantId = params![1] as string;
    const rows = [...fakeObjects.values()]
      .filter((o) => apiNames.includes(o.api_name as string) && o.tenant_id === tenantId)
      .map((o) => ({ id: o.id, api_name: o.api_name }));
    return { rows };
  }

  // INSERT INTO object_definitions ... ON CONFLICT ... RETURNING id
  if (s.startsWith('INSERT INTO OBJECT_DEFINITIONS')) {
    const id = params![0] as string;
    const apiName = params![1] as string;
    const tenantId = params![7] as string;
    const existing = [...fakeObjects.values()].find(
      (o) => o.tenant_id === tenantId && o.api_name === apiName,
    );
    if (existing) return { rows: [] };
    const row: FakeRow = { id, api_name: apiName, tenant_id: tenantId };
    fakeObjects.set(id, row);
    return { rows: [{ id }] };
  }

  // SELECT fd.id, od.api_name ... FROM field_definitions fd JOIN object_definitions od
  if (s.includes('FROM FIELD_DEFINITIONS FD') && s.includes('JOIN OBJECT_DEFINITIONS OD')) {
    const apiNames = params![0] as string[];
    const tenantId = params![1] as string;
    const rows: { id: string; object_api_name: string; api_name: string }[] = [];
    for (const field of fakeFields.values()) {
      if (field.tenant_id !== tenantId) continue;
      const obj = [...fakeObjects.values()].find((o) => o.id === field.object_id);
      if (obj && apiNames.includes(obj.api_name as string)) {
        rows.push({
          id: field.id,
          object_api_name: obj.api_name as string,
          api_name: field.api_name as string,
        });
      }
    }
    return { rows };
  }

  // INSERT INTO field_definitions ... ON CONFLICT ... RETURNING id
  if (s.startsWith('INSERT INTO FIELD_DEFINITIONS')) {
    const id = params![0] as string;
    const objectId = params![1] as string;
    const apiName = params![2] as string;
    const tenantId = params![8] as string;
    const existing = [...fakeFields.values()].find(
      (f) => f.tenant_id === tenantId && f.object_id === objectId && f.api_name === apiName,
    );
    if (existing) return { rows: [] };
    const row: FakeRow = { id, object_id: objectId, api_name: apiName, tenant_id: tenantId };
    fakeFields.set(id, row);
    return { rows: [{ id }] };
  }

  // INSERT INTO relationship_definitions
  if (s.startsWith('INSERT INTO RELATIONSHIP_DEFINITIONS')) {
    const id = params![0] as string;
    const tenantId = params![8] as string;
    const row: FakeRow = { id, tenant_id: tenantId };
    fakeRelationships.set(id, row);
    return { rows: [{ id }] };
  }

  // INSERT INTO layout_definitions
  if (s.startsWith('INSERT INTO LAYOUT_DEFINITIONS')) {
    return { rows: [{ id: 'layout-1' }] };
  }

  // INSERT INTO layout_field_assignments
  if (s.startsWith('INSERT INTO LAYOUT_FIELD_ASSIGNMENTS')) {
    return { rows: [{ id: 'lfa-1' }] };
  }

  // INSERT INTO pipeline_definitions
  if (s.startsWith('INSERT INTO PIPELINE_DEFINITIONS')) {
    return { rows: [{ id: params![0] }] };
  }

  // INSERT INTO stage_definitions
  if (s.startsWith('INSERT INTO STAGE_DEFINITIONS')) {
    return { rows: [{ id: params![0] }] };
  }

  // INSERT INTO lead_conversion_mappings
  if (s.startsWith('INSERT INTO LEAD_CONVERSION_MAPPINGS')) {
    return { rows: [{ id: 'lcm-1' }] };
  }

  // Default
  return { rows: [], rowCount: 0 };
});

const mockRelease = vi.fn();
const mockConnect = vi.fn(() => ({
  query: mockClientQuery,
  release: mockRelease,
}));

const mockPoolQuery = vi.fn(async (sql: string, params?: unknown[]) => {
  const s = sql.replace(/\s+/g, ' ').trim().toUpperCase();

  // Check slug uniqueness: SELECT id FROM tenants WHERE slug = $1
  if (s.startsWith('SELECT ID FROM TENANTS WHERE SLUG')) {
    const slug = params![0] as string;
    const match = [...fakeTenants.values()].find((t) => t.slug === slug);
    return { rows: match ? [{ id: match.id }] : [], rowCount: match ? 1 : 0 };
  }

  return { rows: [], rowCount: 0 };
});

vi.mock('../../db/client.js', () => ({
  pool: {
    query: (...args: unknown[]) => mockPoolQuery(...(args as [string, unknown[]])),
    connect: () => mockConnect(),
  },
}));

const { provisionTenant, validateSlug } = await import('../tenantProvisioning.js');

// ─── Reset state ──────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  fakeTenants.clear();
  fakeObjects.clear();
  fakeFields.clear();
  fakeRelationships.clear();
  mockCreateTenantWithId.mockResolvedValue({});
  mockDeleteTenant.mockResolvedValue({});
  mockDescopeInvite.mockResolvedValue({});
});

// ═════════════════════════════════════════════════════════════════════════════
// PROVISIONING END-TO-END
// ═════════════════════════════════════════════════════════════════════════════

describe('provisionTenant — end-to-end flow', () => {
  it('creates Descope tenant, local DB row, seeds data, and invites admin', async () => {
    const result = await provisionTenant({
      name: 'Acme Corp',
      slug: 'acme-corp',
      adminEmail: 'admin@acme.com',
      adminName: 'Jane Admin',
    });

    // 1. Descope tenant was created with slug as ID
    expect(mockCreateTenantWithId).toHaveBeenCalledWith('acme-corp', 'Acme Corp');

    // 2. Local DB tenant was inserted
    expect(fakeTenants.has('acme-corp')).toBe(true);
    expect(result.tenant.id).toBe('acme-corp');
    expect(result.tenant.name).toBe('Acme Corp');
    expect(result.tenant.slug).toBe('acme-corp');
    expect(result.tenant.status).toBe('active');

    // 3. Seed data was created — objects exist in fakeObjects
    expect(fakeObjects.size).toBeGreaterThan(0);

    // 4. Admin user was invited via Descope with admin role
    expect(mockDescopeInvite).toHaveBeenCalledWith('admin@acme.com', {
      email: 'admin@acme.com',
      displayName: 'Jane Admin',
      userTenants: [{ tenantId: 'acme-corp', roleNames: ['admin'] }],
      sendMail: true,
    });

    expect(result.adminUser.email).toBe('admin@acme.com');
    expect(result.adminUser.inviteSent).toBe(true);
    expect(result.seeded.objects).toBeGreaterThan(0);
  });

  it('seed data creates independent objects per tenant', async () => {
    // Provision first tenant
    await provisionTenant({
      name: 'Tenant One',
      slug: 'tenant-one',
      adminEmail: 'admin@one.com',
      adminName: 'Admin One',
    });

    const tenantOneObjects = [...fakeObjects.values()].filter(
      (o) => o.tenant_id === 'tenant-one',
    );

    // Provision second tenant
    await provisionTenant({
      name: 'Tenant Two',
      slug: 'tenant-two',
      adminEmail: 'admin@two.com',
      adminName: 'Admin Two',
    });

    const tenantTwoObjects = [...fakeObjects.values()].filter(
      (o) => o.tenant_id === 'tenant-two',
    );

    // Both tenants should have their own set of objects
    expect(tenantOneObjects.length).toBeGreaterThan(0);
    expect(tenantTwoObjects.length).toBeGreaterThan(0);

    // Object IDs must be distinct between tenants
    const oneIds = new Set(tenantOneObjects.map((o) => o.id));
    const twoIds = new Set(tenantTwoObjects.map((o) => o.id));
    for (const id of twoIds) {
      expect(oneIds.has(id)).toBe(false);
    }
  });

  it('returns inviteSent=false when Descope invite fails but still provisions tenant', async () => {
    mockDescopeInvite.mockRejectedValue(new Error('SMTP unavailable'));

    const result = await provisionTenant({
      name: 'Acme Corp',
      slug: 'acme-corp',
      adminEmail: 'admin@acme.com',
      adminName: 'Jane Admin',
    });

    // Tenant and seed data were still created
    expect(result.tenant.id).toBe('acme-corp');
    expect(result.seeded.objects).toBeGreaterThan(0);

    // But the invite was not sent
    expect(result.adminUser.inviteSent).toBe(false);
  });

  it('rolls back Descope tenant when DB transaction fails', async () => {
    // Make the DB client throw on the INSERT INTO tenants query
    mockClientQuery.mockRejectedValueOnce(new Error('DB insert failed'));

    await expect(
      provisionTenant({
        name: 'Fail Corp',
        slug: 'fail-corp',
        adminEmail: 'admin@fail.com',
        adminName: 'Failing Admin',
      }),
    ).rejects.toThrow('DB insert failed');

    // Descope tenant was created but should have been cleaned up
    expect(mockCreateTenantWithId).toHaveBeenCalledWith('fail-corp', 'Fail Corp');
    expect(mockDeleteTenant).toHaveBeenCalledWith('fail-corp');
  });

  it('uses free as default plan', async () => {
    const result = await provisionTenant({
      name: 'Free Tenant',
      slug: 'free-tenant',
      adminEmail: 'admin@free.com',
      adminName: 'Admin Free',
    });

    // The tenant row should have plan=free (via the DB insert params)
    expect(result.tenant.id).toBe('free-tenant');
    // Verify the plan was passed as 'free' to the DB
    const tenantRow = fakeTenants.get('free-tenant');
    expect(tenantRow?.plan).toBe('free');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// PROVISIONING VALIDATION
// ═════════════════════════════════════════════════════════════════════════════

describe('provisionTenant — validation', () => {
  it('throws VALIDATION_ERROR for missing name', async () => {
    await expect(
      provisionTenant({ name: '', slug: 'acme', adminEmail: 'a@b.com', adminName: 'Admin' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('throws VALIDATION_ERROR for excessively long name', async () => {
    await expect(
      provisionTenant({ name: 'A'.repeat(256), slug: 'acme', adminEmail: 'a@b.com', adminName: 'Admin' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('throws VALIDATION_ERROR for invalid slug', async () => {
    await expect(
      provisionTenant({ name: 'Acme', slug: 'INVALID SLUG', adminEmail: 'a@b.com', adminName: 'Admin' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('throws VALIDATION_ERROR for invalid admin email', async () => {
    await expect(
      provisionTenant({ name: 'Acme', slug: 'acme', adminEmail: 'bad', adminName: 'Admin' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('throws VALIDATION_ERROR for missing admin name', async () => {
    await expect(
      provisionTenant({ name: 'Acme', slug: 'acme', adminEmail: 'a@b.com', adminName: '' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('throws DUPLICATE_SLUG when slug is already taken', async () => {
    // Pre-seed a tenant with the slug
    fakeTenants.set('existing', { id: 'existing', slug: 'acme-corp' } as FakeRow);

    await expect(
      provisionTenant({ name: 'Acme', slug: 'acme-corp', adminEmail: 'a@b.com', adminName: 'Admin' }),
    ).rejects.toMatchObject({ code: 'DUPLICATE_SLUG' });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// SLUG VALIDATION
// ═════════════════════════════════════════════════════════════════════════════

describe('validateSlug', () => {
  it('accepts valid slugs', () => {
    expect(validateSlug('acme-corp')).toBeNull();
    expect(validateSlug('tenant123')).toBeNull();
    expect(validateSlug('my-company')).toBeNull();
  });

  it('rejects too-short slugs', () => {
    expect(validateSlug('ab')).not.toBeNull();
  });

  it('rejects too-long slugs', () => {
    expect(validateSlug('a'.repeat(64))).not.toBeNull();
  });

  it('rejects slugs with uppercase', () => {
    expect(validateSlug('AcmeCorp')).not.toBeNull();
  });

  it('rejects non-string values', () => {
    expect(validateSlug(null)).not.toBeNull();
    expect(validateSlug(undefined)).not.toBeNull();
    expect(validateSlug(42)).not.toBeNull();
  });
});
