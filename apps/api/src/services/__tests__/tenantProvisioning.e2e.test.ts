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

function normaliseCall(sqlOrQuery: unknown, paramsArg?: unknown[]) {
  if (typeof sqlOrQuery === 'string') {
    return { sql: sqlOrQuery, params: paramsArg ?? [] };
  }
  const q = sqlOrQuery as { text: string; values?: unknown[] };
  return { sql: q.text, params: q.values ?? [] };
}

function extractInsertRow(sql: string, params: unknown[]): Record<string, unknown> {
  const normalized = sql.replace(/\s+/g, ' ').replace(/"/g, '').trim();
  const match = normalized.match(/INSERT INTO \w+ \(([^)]+)\)/i);
  if (!match) return {};
  const columns = match[1].split(',').map((c) => c.trim().toLowerCase());
  const row: Record<string, unknown> = {};
  columns.forEach((col, i) => { row[col] = params[i]; });
  return row;
}

const defaultClientQueryImpl = async (
  sqlOrQuery: unknown,
  paramsArg?: unknown[],
) => {
  const { sql, params } = normaliseCall(sqlOrQuery, paramsArg);
  const s = sql.replace(/\s+/g, ' ').replace(/"/g, '').trim().toUpperCase();

  if (s === 'BEGIN' || s === 'COMMIT' || s === 'ROLLBACK') return { rows: [] };
  if (s.startsWith('SELECT SET_CONFIG')) return { rows: [] };

  // Slug uniqueness check
  if (s.startsWith('SELECT ID FROM TENANTS WHERE SLUG')) {
    const slug = params[0] as string;
    const match = [...fakeTenants.values()].find((t) => t.slug === slug);
    return { rows: match ? [{ id: match.id }] : [], rowCount: match ? 1 : 0 };
  }

  // INSERT INTO tenants
  if (s.startsWith('INSERT INTO TENANTS')) {
    const row = extractInsertRow(sql, params);
    fakeTenants.set(row.id as string, { ...row, id: row.id as string });
    return { rows: [row], rowCount: 1, command: 'INSERT' };
  }

  // SELECT ... FROM object_definitions WHERE api_name IN (...)
  if (s.includes('FROM OBJECT_DEFINITIONS') && !s.startsWith('INSERT') && !s.startsWith('UPDATE') && s.includes('IN (')) {
    const tenantId = params[params.length - 1] as string;
    const apiNames = params.slice(0, -1) as string[];
    const rows = [...fakeObjects.values()]
      .filter((o) => apiNames.includes(o.api_name as string) && o.tenant_id === tenantId)
      .map((o) => ({ id: o.id, api_name: o.api_name }));
    return { rows };
  }

  // INSERT INTO object_definitions
  if (s.startsWith('INSERT INTO OBJECT_DEFINITIONS')) {
    const row = extractInsertRow(sql, params);
    const existing = [...fakeObjects.values()].find(
      (o) => o.tenant_id === row.tenant_id && o.api_name === row.api_name,
    );
    if (existing) return { rows: [] };
    fakeObjects.set(row.id as string, { ...row, id: row.id as string });
    return { rows: [{ id: row.id }] };
  }

  // SELECT fd.id ... FROM field_definitions fd JOIN object_definitions od
  if (s.includes('FROM FIELD_DEFINITIONS') && s.includes('JOIN OBJECT_DEFINITIONS')) {
    const tenantId = params[params.length - 1] as string;
    const apiNames = params.slice(0, -1) as string[];
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

  // INSERT INTO field_definitions
  if (s.startsWith('INSERT INTO FIELD_DEFINITIONS')) {
    const row = extractInsertRow(sql, params);
    const existing = [...fakeFields.values()].find(
      (f) => f.tenant_id === row.tenant_id && f.object_id === row.object_id && f.api_name === row.api_name,
    );
    if (existing) return { rows: [] };
    fakeFields.set(row.id as string, { ...row, id: row.id as string });
    return { rows: [{ id: row.id }] };
  }

  // INSERT INTO relationship_definitions
  if (s.startsWith('INSERT INTO RELATIONSHIP_DEFINITIONS')) {
    const row = extractInsertRow(sql, params);
    fakeRelationships.set(row.id as string, { ...row, id: row.id as string });
    return { rows: [{ id: row.id }] };
  }

  // SELECT ld ... FROM layout_definitions ld JOIN object_definitions od
  if (s.includes('FROM LAYOUT_DEFINITIONS') && s.includes('JOIN OBJECT_DEFINITIONS')) {
    return { rows: [] };
  }

  // INSERT INTO layout_definitions
  if (s.startsWith('INSERT INTO LAYOUT_DEFINITIONS')) {
    const row = extractInsertRow(sql, params);
    return { rows: [{ id: row.id }] };
  }

  // INSERT INTO layout_fields
  if (s.startsWith('INSERT INTO LAYOUT_FIELDS')) {
    const row = extractInsertRow(sql, params);
    return { rows: [{ id: row.id }] };
  }

  // SELECT ... FROM pipeline_definitions WHERE api_name IN (...)
  if (s.includes('FROM PIPELINE_DEFINITIONS') && !s.startsWith('INSERT') && s.includes('IN (')) {
    return { rows: [] };
  }

  // INSERT INTO pipeline_definitions
  if (s.startsWith('INSERT INTO PIPELINE_DEFINITIONS')) {
    const row = extractInsertRow(sql, params);
    return { rows: [{ id: row.id }] };
  }

  // SELECT sd ... FROM stage_definitions sd JOIN pipeline_definitions pd
  if (s.includes('FROM STAGE_DEFINITIONS') && s.includes('JOIN PIPELINE_DEFINITIONS')) {
    return { rows: [] };
  }

  // INSERT INTO stage_definitions
  if (s.startsWith('INSERT INTO STAGE_DEFINITIONS')) {
    const row = extractInsertRow(sql, params);
    return { rows: [{ id: row.id }] };
  }

  // INSERT INTO stage_gates
  if (s.startsWith('INSERT INTO STAGE_GATES')) {
    const row = extractInsertRow(sql, params);
    return { rows: [{ id: row.id }] };
  }

  // INSERT INTO lead_conversion_mappings
  if (s.startsWith('INSERT INTO LEAD_CONVERSION_MAPPINGS')) {
    const row = extractInsertRow(sql, params);
    return { rows: [{ id: row.id }] };
  }

  // UPDATE object_definitions (name_field_id / name_template)
  if (s.startsWith('UPDATE OBJECT_DEFINITIONS')) {
    return { rows: [] };
  }

  return { rows: [], rowCount: 0 };
};

const mockClientQuery = vi.fn(defaultClientQueryImpl);

const mockRelease = vi.fn();
const mockConnect = vi.fn(() => ({
  query: mockClientQuery,
  release: mockRelease,
}));

const mockPoolQuery = vi.fn(async (..._args: unknown[]) => ({ rows: [], rowCount: 0 }));

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
  // Restore the default dispatcher — tests that need failure injection
  // should call mockImplementation(...) within that test's scope.
  mockClientQuery.mockImplementation(defaultClientQueryImpl);
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
    // Make the DB client throw on the INSERT INTO tenants query.
    // We can't use mockRejectedValueOnce here because Kysely now routes
    // the pre-insert slug-uniqueness check through pool.connect().query
    // as well, so "the first call" is no longer the INSERT. Target the
    // INSERT explicitly and pass other queries through to the default
    // in-memory dispatcher.
    mockClientQuery.mockImplementation(
      async (sqlOrQuery: unknown, paramsArg?: unknown[]) => {
        const sqlRaw =
          typeof sqlOrQuery === 'string'
            ? sqlOrQuery
            : (sqlOrQuery as { text: string }).text;
        if (
          sqlRaw.toUpperCase().includes('INSERT INTO') &&
          sqlRaw.toUpperCase().includes('TENANTS')
        ) {
          throw new Error('DB insert failed');
        }
        return defaultClientQueryImpl(sqlOrQuery, paramsArg);
      },
    );

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
