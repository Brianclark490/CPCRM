/**
 * Kysely SQL regression suite for tenantProvisioning.
 *
 * Complements `tenantProvisioning.test.ts` (validation behaviour) and
 * `tenantProvisioning.e2e.test.ts` (end-to-end provisioning flow with an
 * in-memory DB) by asserting directly on the SQL Kysely emits for every
 * tenant-management entry point. It exists to:
 *
 *   1. Catch drift in the generated SQL as Kysely is upgraded or the
 *      service is refactored.
 *   2. Verify the pre-insert slug check routes through the Kysely query
 *      builder (not a stray raw `pool.query`).
 *   3. Verify the transactional INSERT binds every column explicitly
 *      (rather than relying on DB defaults) so a tenant's `status`,
 *      `plan`, and `settings` shape stays under our control.
 *   4. Verify the list path emits a lightweight `COUNT(*)` separate from
 *      the wide data projection (same pattern as accountService).
 *   5. Verify the user-count correlated scalar subquery is scoped to the
 *      outer tenant via `m.tenant_id = t.id` (no cross-tenant leakage).
 *   6. Verify updateTenant only writes the columns the caller supplied
 *      (plus the always-touched `updated_at`).
 *   7. Verify deleteTenant is a soft-delete (`UPDATE ... SET status =
 *      'suspended'`) rather than a `DELETE FROM`.
 *
 * No real Postgres — the pg pool is mocked and captures every compiled
 * SQL string Kysely hands down.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const TENANT_ID = 'sql-tenant-001';

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

// ─── Mock seedWithClient — we don't want to exercise 1000+ lines of seed
// SQL when we're only asserting on the tenant-management SQL. Return a
// zero-row seed result so provisionTenant completes happily.
vi.mock('../seedDefaultObjects.js', () => ({
  seedWithClient: vi.fn(async () => ({
    objectsCreated: 0,
    fieldsCreated: 0,
    relationshipsCreated: 0,
    pipelinesCreated: 0,
  })),
}));

// ─── SQL capture ──────────────────────────────────────────────────────────────

interface CapturedQuery {
  sql: string;
  params: unknown[];
  via: 'pool' | 'client';
}

const { capturedQueries, mockQuery, mockConnect, resetCapture } = vi.hoisted(
  () => {
    const capturedQueries: CapturedQuery[] = [];

    function makeTenantRow(overrides: Record<string, unknown> = {}) {
      const now = new Date();
      return {
        id: 'sql-tenant-001',
        name: 'SQL Corp',
        slug: 'sql-tenant-001',
        status: 'active',
        plan: 'free',
        settings: '{}',
        created_at: now,
        updated_at: now,
        ...overrides,
      };
    }

    function runQuery(
      rawSql: string,
      params: unknown[] | undefined,
      via: 'pool' | 'client',
    ) {
      capturedQueries.push({ sql: rawSql, params: params ?? [], via });

      const s = rawSql
        .replace(/\s+/g, ' ')
        .replace(/"/g, '')
        .trim()
        .toUpperCase();

      if (s === 'BEGIN' || s === 'COMMIT' || s === 'ROLLBACK') {
        return { rows: [] };
      }
      if (s.startsWith('SELECT SET_CONFIG')) {
        return { rows: [] };
      }

      // Slug uniqueness check — return empty so provisionTenant proceeds.
      if (s.startsWith('SELECT ID FROM TENANTS WHERE SLUG')) {
        return { rows: [], rowCount: 0 };
      }

      // INSERT INTO tenants ... RETURNING *  (compiled by Kysely, executed
      // on the raw client inside the BEGIN/COMMIT envelope).
      if (s.startsWith('INSERT INTO TENANTS')) {
        const [
          id,
          name,
          slug,
          status,
          plan,
          settings,
          created_at,
          updated_at,
        ] = (params ?? []) as unknown[];
        return {
          rows: [
            {
              id,
              name,
              slug,
              status,
              plan,
              settings,
              created_at,
              updated_at,
            },
          ],
          rowCount: 1,
          command: 'INSERT',
        };
      }

      // listTenants count path: SELECT count(*) as total FROM tenants
      if (s.startsWith('SELECT COUNT(*)') && s.includes('FROM TENANTS')) {
        return { rows: [{ total: '1' }] };
      }

      // listTenants data path: SELECT t.*, (SELECT count(*) ...) FROM tenants AS t
      if (
        s.startsWith('SELECT') &&
        s.includes('FROM TENANTS AS T') &&
        s.includes('LIMIT')
      ) {
        return { rows: [{ ...makeTenantRow(), user_count: '0' }] };
      }

      // getTenantById tenant SELECT:
      //   SELECT * FROM tenants WHERE id = $1
      if (
        s.startsWith('SELECT') &&
        s.includes('FROM TENANTS') &&
        !s.includes('FROM TENANTS AS T')
      ) {
        return { rows: [makeTenantRow()] };
      }

      // getTenantById count path on tenant_memberships
      if (
        s.startsWith('SELECT COUNT(*)') &&
        s.includes('FROM TENANT_MEMBERSHIPS')
      ) {
        return { rows: [{ count: '0' }] };
      }

      // UPDATE tenants ... RETURNING *  /  RETURNING ID
      if (s.startsWith('UPDATE TENANTS')) {
        return { rows: [makeTenantRow()], rowCount: 1, command: 'UPDATE' };
      }

      return { rows: [] };
    }

    const mockQuery = vi.fn(async (sql: unknown, params?: unknown[]) => {
      const rawSql =
        typeof sql === 'string' ? sql : (sql as { text: string }).text;
      return runQuery(rawSql, params, 'pool');
    });

    const mockConnect = vi.fn(async () => ({
      query: vi.fn(async (sql: unknown, params?: unknown[]) => {
        const rawSql =
          typeof sql === 'string' ? sql : (sql as { text: string }).text;
        return runQuery(rawSql, params, 'client');
      }),
      release: vi.fn(),
    }));

    function resetCapture() {
      capturedQueries.length = 0;
    }

    return { capturedQueries, mockQuery, mockConnect, resetCapture };
  },
);

vi.mock('../../db/client.js', () => ({
  pool: { query: mockQuery, connect: mockConnect },
}));

const {
  provisionTenant,
  listTenants,
  getTenantById,
  updateTenant,
  deleteTenant,
} = await import('../tenantProvisioning.js');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalise(sql: string): string {
  return sql.replace(/\s+/g, ' ').replace(/"/g, '').trim().toUpperCase();
}

function dataQueries(): CapturedQuery[] {
  return capturedQueries.filter((q) => {
    const s = normalise(q.sql);
    return (
      s !== 'BEGIN' &&
      s !== 'COMMIT' &&
      s !== 'ROLLBACK' &&
      !s.startsWith('RESET ') &&
      !s.startsWith('SELECT SET_CONFIG')
    );
  });
}

beforeEach(() => {
  resetCapture();
  mockCreateTenantWithId.mockResolvedValue({});
  mockDeleteTenant.mockResolvedValue({});
  mockDescopeInvite.mockResolvedValue({});
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('tenantProvisioning Kysely SQL — provisionTenant', () => {
  it('slug uniqueness check is a compiled Kysely SELECT (not a raw pool.query)', async () => {
    await provisionTenant({
      name: 'SQL Corp',
      slug: 'sql-tenant-001',
      adminEmail: 'admin@sql.example',
      adminName: 'SQL Admin',
    });

    const slugCheck = dataQueries().find((q) =>
      normalise(q.sql).startsWith('SELECT ID FROM TENANTS WHERE SLUG'),
    );
    expect(slugCheck).toBeDefined();
    // Kysely routes every query through pool.connect(), so the slug
    // check must have been captured via the 'client' path.
    expect(slugCheck!.via).toBe('client');
    expect(slugCheck!.params).toEqual(['sql-tenant-001']);
  });

  it('INSERT INTO tenants binds all 8 columns in the declared order', async () => {
    await provisionTenant({
      name: 'SQL Corp',
      slug: 'sql-tenant-001',
      adminEmail: 'admin@sql.example',
      adminName: 'SQL Admin',
    });

    const inserts = dataQueries().filter((q) =>
      normalise(q.sql).startsWith('INSERT INTO TENANTS'),
    );
    expect(inserts.length).toBe(1);

    const insert = inserts[0]!;
    // Column order (as written in the service .values({...})):
    //   id, name, slug, status, plan, settings, created_at, updated_at.
    expect(insert.params.length).toBe(8);
    expect(insert.params[0]).toBe('sql-tenant-001'); // id === slug
    expect(insert.params[1]).toBe('SQL Corp'); // name (trimmed)
    expect(insert.params[2]).toBe('sql-tenant-001'); // slug
    expect(insert.params[3]).toBe('active'); // status — hardcoded default
    expect(insert.params[4]).toBe('free'); // plan — default when not supplied
    // settings is passed as a JSON string (not an object) so the raw
    // client can forward it to pg's JSONB column without a custom
    // serialiser.
    expect(typeof insert.params[5]).toBe('string');
    expect(JSON.parse(insert.params[5] as string)).toEqual({
      currency: 'GBP',
      dateFormat: 'DD/MM/YYYY',
      timezone: 'Europe/London',
    });
    expect(insert.params[6]).toBeInstanceOf(Date); // created_at
    expect(insert.params[7]).toBeInstanceOf(Date); // updated_at

    const s = normalise(insert.sql);
    expect(s).toContain('RETURNING');
  });

  it('INSERT runs inside the BEGIN/COMMIT envelope via the raw client', async () => {
    await provisionTenant({
      name: 'SQL Corp',
      slug: 'sql-tenant-001',
      adminEmail: 'admin@sql.example',
      adminName: 'SQL Admin',
    });

    // Every query in provisionTenant (slug check + BEGIN + INSERT +
    // COMMIT + the seed queries, which are mocked away) should have
    // travelled through pool.connect(), not pool.query().
    const poolCalls = capturedQueries.filter((q) => q.via === 'pool');
    expect(poolCalls.length).toBe(0);

    const order = capturedQueries.map((q) => normalise(q.sql));
    const beginIdx = order.indexOf('BEGIN');
    const commitIdx = order.indexOf('COMMIT');
    const insertIdx = order.findIndex((s) => s.startsWith('INSERT INTO TENANTS'));

    expect(beginIdx).toBeGreaterThan(-1);
    expect(commitIdx).toBeGreaterThan(beginIdx);
    expect(insertIdx).toBeGreaterThan(beginIdx);
    expect(insertIdx).toBeLessThan(commitIdx);
  });

  it('honours a caller-supplied plan value on the INSERT', async () => {
    await provisionTenant({
      name: 'SQL Corp',
      slug: 'sql-tenant-001',
      adminEmail: 'admin@sql.example',
      adminName: 'SQL Admin',
      plan: 'enterprise',
    });

    const insert = dataQueries().find((q) =>
      normalise(q.sql).startsWith('INSERT INTO TENANTS'),
    );
    expect(insert!.params[4]).toBe('enterprise');
  });
});

describe('tenantProvisioning Kysely SQL — listTenants', () => {
  it('count query is a separate lightweight SELECT COUNT(*) — not the wide data projection', async () => {
    await listTenants(20, 0);

    const countQuery = dataQueries().find((q) =>
      normalise(q.sql).startsWith('SELECT COUNT(*)'),
    );
    expect(countQuery).toBeDefined();

    const s = normalise(countQuery!.sql);
    // The count query should NOT project the full tenants row or the
    // user_count scalar — that's the data query's job.
    expect(s).not.toContain('T.*');
    expect(s).not.toContain('USER_COUNT');
    // And no LIMIT/OFFSET on the count path
    expect(s).not.toContain('LIMIT');
    expect(s).not.toContain('OFFSET');
  });

  it('data query emits the correlated user_count scalar subquery', async () => {
    await listTenants(20, 0);

    const dataPath = dataQueries().find((q) => {
      const s = normalise(q.sql);
      return s.includes('FROM TENANTS AS T') && s.includes('LIMIT');
    });
    expect(dataPath).toBeDefined();

    const s = normalise(dataPath!.sql);
    expect(s).toContain('T.*');
    expect(s).toContain('USER_COUNT');
    expect(s).toContain('FROM TENANT_MEMBERSHIPS AS M');
    // The subquery must be scoped to the outer tenant via whereRef so
    // we cannot leak counts across tenants.
    expect(s).toContain('M.TENANT_ID = T.ID');
  });

  it('list query orders by t.created_at DESC with LIMIT / OFFSET applied', async () => {
    await listTenants(5, 10);

    const dataPath = dataQueries().find((q) => {
      const s = normalise(q.sql);
      return s.includes('FROM TENANTS AS T') && s.includes('LIMIT');
    });
    expect(dataPath).toBeDefined();

    const s = normalise(dataPath!.sql);
    expect(s).toContain('ORDER BY T.CREATED_AT DESC');
    expect(s).toContain('LIMIT');
    expect(s).toContain('OFFSET');
    expect(dataPath!.params).toContain(5);
    expect(dataPath!.params).toContain(10);
  });
});

describe('tenantProvisioning Kysely SQL — getTenantById', () => {
  it('emits a tenant SELECT + a scoped tenant_memberships COUNT(*)', async () => {
    await getTenantById(TENANT_ID);

    const queries = dataQueries();
    // 1x tenant SELECT + 1x memberships count
    expect(queries.length).toBe(2);

    const tenantSelect = queries.find(
      (q) =>
        normalise(q.sql).startsWith('SELECT') &&
        normalise(q.sql).includes('FROM TENANTS') &&
        !normalise(q.sql).startsWith('SELECT COUNT(*)'),
    );
    expect(tenantSelect).toBeDefined();
    expect(tenantSelect!.params).toContain(TENANT_ID);
    expect(normalise(tenantSelect!.sql)).toContain('ID =');

    const countQuery = queries.find(
      (q) =>
        normalise(q.sql).startsWith('SELECT COUNT(*)') &&
        normalise(q.sql).includes('FROM TENANT_MEMBERSHIPS'),
    );
    expect(countQuery).toBeDefined();
    // The membership count MUST be filtered by tenant_id so we don't
    // return a cross-tenant total.
    expect(normalise(countQuery!.sql)).toContain('TENANT_ID =');
    expect(countQuery!.params).toContain(TENANT_ID);
  });
});

describe('tenantProvisioning Kysely SQL — updateTenant', () => {
  it('only sets columns the caller provided (plus updated_at)', async () => {
    await updateTenant(TENANT_ID, { name: 'Renamed' });

    const updateQuery = dataQueries().find((q) =>
      normalise(q.sql).startsWith('UPDATE TENANTS'),
    );
    expect(updateQuery).toBeDefined();

    const s = normalise(updateQuery!.sql);
    // Kysely's SET clause must include `name` and `updated_at` but
    // NOT `status`, `plan`, `slug`, or `settings`.
    expect(s).toContain('NAME =');
    expect(s).toContain('UPDATED_AT =');
    expect(s).not.toContain('STATUS =');
    expect(s).not.toContain('PLAN =');
    expect(s).not.toContain('SLUG =');
    expect(s).not.toContain('SETTINGS =');
    expect(s).toContain('RETURNING');
  });

  it('sets status when the caller supplies a valid status', async () => {
    await updateTenant(TENANT_ID, { status: 'suspended' });

    const updateQuery = dataQueries().find((q) =>
      normalise(q.sql).startsWith('UPDATE TENANTS'),
    );
    expect(updateQuery).toBeDefined();
    const s = normalise(updateQuery!.sql);
    expect(s).toContain('STATUS =');
    expect(s).toContain('UPDATED_AT =');
    expect(s).not.toContain('NAME =');
    expect(updateQuery!.params).toContain('suspended');
  });

  it('rejects an empty patch with VALIDATION_ERROR and never touches the DB', async () => {
    await expect(updateTenant(TENANT_ID, {})).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    // No UPDATE should have been captured
    const updates = dataQueries().filter((q) =>
      normalise(q.sql).startsWith('UPDATE TENANTS'),
    );
    expect(updates.length).toBe(0);
  });
});

describe('tenantProvisioning Kysely SQL — deleteTenant', () => {
  it('is a soft-delete via UPDATE status = suspended, not a DELETE FROM', async () => {
    await deleteTenant(TENANT_ID);

    const updates = dataQueries().filter((q) =>
      normalise(q.sql).startsWith('UPDATE TENANTS'),
    );
    expect(updates.length).toBe(1);

    const deletes = dataQueries().filter((q) =>
      normalise(q.sql).startsWith('DELETE FROM'),
    );
    expect(deletes.length).toBe(0);

    const s = normalise(updates[0]!.sql);
    expect(s).toContain('STATUS =');
    expect(s).toContain('UPDATED_AT =');
    expect(s).toContain('ID =');
    expect(s).toContain('RETURNING');
    expect(updates[0]!.params).toContain('suspended');
    expect(updates[0]!.params).toContain(TENANT_ID);
  });
});
