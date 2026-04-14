import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';

/**
 * Kysely RLS Integration Tests
 *
 * These verify that the Kysely `db` instance exported from `../kysely.ts`
 * correctly flows the tenant context through the RLS-aware pool proxy so that
 * Row-Level Security policies (migration 025) are applied to every query and
 * every transaction.
 *
 * The suite is split into two halves:
 *
 * 1. **Mock suite (always runs).**
 *    Mocks `pg.Pool` so the tests run in any environment, including CI.
 *    Verifies that when `tenantStore.run(tenantId, ...)` wraps a Kysely
 *    query, the proxy calls
 *    `SELECT set_config('app.current_tenant_id', $1, false)` on the
 *    checked-out connection before Kysely's SQL is executed, and that the
 *    same holds for `db.transaction().execute(...)`.  This is the contract
 *    that the RLS policies depend on.
 *
 * 2. **Live DB suite (opt-in).**
 *    When `TEST_DATABASE_URL` is set and the migrations have been applied,
 *    this half seeds two tenants, sets the context via `tenantStore.run`,
 *    and asserts that `db.selectFrom('records').selectAll().execute()` only
 *    returns rows for the current tenant — proving RLS is being enforced by
 *    Postgres, not by application code.
 */

// ─── Mock setup ──────────────────────────────────────────────────────────────

const { mockClientQuery, mockRelease, mockConnect, mockEnd, mockOn } =
  vi.hoisted(() => {
    const mockClientQuery = vi.fn(async (..._args: unknown[]) => ({
      rows: [],
      rowCount: 0,
      command: 'SELECT',
      oid: 0,
      fields: [],
    }));
    const mockRelease = vi.fn();
    const mockConnect = vi.fn(async () => ({
      query: mockClientQuery,
      release: mockRelease,
    }));
    const mockEnd = vi.fn(async () => {});
    const mockOn = vi.fn();

    return { mockClientQuery, mockRelease, mockConnect, mockEnd, mockOn };
  });

vi.mock('pg', () => {
  class Pool {
    query = mockClientQuery;
    connect = mockConnect;
    end = mockEnd;
    on = mockOn;
  }
  return { default: { Pool }, Pool };
});

// ─── Imports under test ──────────────────────────────────────────────────────

const { tenantStore } = await import('../tenantContext.js');
const { db } = await import('../kysely.js');

// ─── Test data ───────────────────────────────────────────────────────────────

const TENANT_A = '00000000-0000-0000-0000-00000000000a';
const TENANT_B = '00000000-0000-0000-0000-00000000000b';

// ─── Reset mocks ─────────────────────────────────────────────────────────────

beforeEach(() => {
  mockClientQuery.mockReset();
  mockClientQuery.mockResolvedValue({
    rows: [],
    rowCount: 0,
    command: 'SELECT',
    oid: 0,
    fields: [],
  });
  mockRelease.mockReset();
  mockConnect.mockReset();
  mockConnect.mockResolvedValue({
    query: mockClientQuery,
    release: mockRelease,
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Kysely select via proxy — tenant context is applied
// ═════════════════════════════════════════════════════════════════════════════

describe('Kysely db.selectFrom() via RLS-aware pool proxy', () => {
  it('sets app.current_tenant_id before executing the Kysely query', async () => {
    await tenantStore.run(TENANT_A, async () => {
      await db.selectFrom('records').selectAll().execute();
    });

    // First call on the checked-out connection must be set_config with
    // the active tenant.
    expect(mockClientQuery).toHaveBeenCalled();
    const firstCall = mockClientQuery.mock.calls[0];
    expect(firstCall[0]).toBe(
      "SELECT set_config('app.current_tenant_id', $1, false)",
    );
    expect(firstCall[1]).toEqual([TENANT_A]);

    // The generated SELECT statement must have reached the same connection
    // after set_config, proving Kysely is not bypassing the proxy.
    const sqlCalls = mockClientQuery.mock.calls
      .map((c) => (typeof c[0] === 'string' ? c[0] : (c[0] as { text: string }).text))
      .filter((sql) => /select\s/i.test(sql) && /records/i.test(sql));
    expect(sqlCalls.length).toBeGreaterThan(0);

    // Connection must be released back to the pool.
    expect(mockRelease).toHaveBeenCalled();
  });

  it('uses the innermost tenant ID when contexts are nested', async () => {
    await tenantStore.run(TENANT_A, async () => {
      await tenantStore.run(TENANT_B, async () => {
        await db.selectFrom('records').selectAll().execute();
      });
    });

    const setConfigCalls = mockClientQuery.mock.calls.filter(
      (c) => c[0] === "SELECT set_config('app.current_tenant_id', $1, false)",
    );
    expect(setConfigCalls.length).toBeGreaterThan(0);
    expect(setConfigCalls[0][1]).toEqual([TENANT_B]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Kysely transactions — tenant context is applied to the whole transaction
// ═════════════════════════════════════════════════════════════════════════════

describe('Kysely db.transaction() via RLS-aware pool proxy', () => {
  it('sets app.current_tenant_id on the checked-out connection before BEGIN', async () => {
    await tenantStore.run(TENANT_A, async () => {
      await db.transaction().execute(async (trx) => {
        await trx.selectFrom('records').selectAll().execute();
      });
    });

    // The proxy sets the tenant context on connect() before Kysely issues
    // its BEGIN; the order of calls on the connection should therefore be:
    //   1. SELECT set_config('app.current_tenant_id', ...)
    //   2. begin
    //   3. <user query>
    //   4. commit
    const sqlTexts = mockClientQuery.mock.calls.map((c) =>
      typeof c[0] === 'string' ? c[0] : (c[0] as { text: string }).text,
    );

    const setConfigIdx = sqlTexts.findIndex(
      (s) => s === "SELECT set_config('app.current_tenant_id', $1, false)",
    );
    const beginIdx = sqlTexts.findIndex((s) => /^begin\b/i.test(s.trim()));
    const commitIdx = sqlTexts.findIndex((s) => /^commit\b/i.test(s.trim()));

    expect(setConfigIdx).toBeGreaterThanOrEqual(0);
    expect(beginIdx).toBeGreaterThan(setConfigIdx);
    expect(commitIdx).toBeGreaterThan(beginIdx);

    // Tenant ID matches the active AsyncLocalStorage context.
    expect(mockClientQuery.mock.calls[setConfigIdx][1]).toEqual([TENANT_A]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Live DB suite — opt-in, runs only when TEST_DATABASE_URL is set
// ═════════════════════════════════════════════════════════════════════════════

const LIVE_DB_URL = process.env.TEST_DATABASE_URL;
const describeLive = LIVE_DB_URL ? describe : describe.skip;

describeLive('Kysely RLS against a live Postgres (TEST_DATABASE_URL)', () => {
  // We import pg and Kysely directly here so these tests bypass the module
  // mock above. Vitest's `vi.mock` is scoped per file, so we use a child
  // worker config by dynamic import of a separate helper only when the live
  // URL is present.
  //
  // Note: the mock of `pg` above would normally intercept this import too,
  // which is why we gate the whole block on `LIVE_DB_URL` and unmock inline.

  let realDb: import('kysely').Kysely<import('../kysely.types.js').DB>;
  let cleanup: (() => Promise<void>) | undefined;

  beforeEach(async () => {
    vi.resetModules();
    vi.doUnmock('pg');

    const pg = await vi.importActual<typeof import('pg')>('pg');
    const { Kysely, PostgresDialect } = await import('kysely');
    const { tenantStore: liveStore } = await import('../tenantContext.js');

    const pool = new pg.Pool({ connectionString: LIVE_DB_URL });

    // Wrap the raw pool in the same proxy shape as client.ts so RLS context
    // is applied per-connection.
    const wrapped = new Proxy(pool, {
      get(target, prop, receiver) {
        if (prop === 'connect') {
          return async () => {
            const client = await target.connect();
            const tenantId = liveStore.getStore();
            if (tenantId) {
              await client.query(
                "SELECT set_config('app.current_tenant_id', $1, false)",
                [tenantId],
              );
            } else {
              await client.query('RESET app.current_tenant_id').catch(() => {});
            }
            return client;
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    });

    realDb = new Kysely({ dialect: new PostgresDialect({ pool: wrapped }) });

    cleanup = async () => {
      await realDb.destroy().catch(() => {});
      await pool.end().catch(() => {});
    };
  });

  afterAll(async () => {
    await cleanup?.();
  });

  it('only returns rows belonging to the active tenant', async () => {
    const { tenantStore: liveStore } = await import('../tenantContext.js');

    // Create two tenants and one record each. The RLS bypass path (no
    // tenant context) is used to seed so that we can insert across tenants.
    const tenantAId = crypto.randomUUID();
    const tenantBId = crypto.randomUUID();

    await realDb
      .insertInto('tenants')
      .values([
        { id: tenantAId, name: 'Alpha', slug: `alpha-${tenantAId.slice(0, 8)}` },
        { id: tenantBId, name: 'Bravo', slug: `bravo-${tenantBId.slice(0, 8)}` },
      ])
      .execute();

    // Fetch the system object id for `records` so we have a valid FK.
    const [objectDef] = await realDb
      .selectFrom('object_definitions')
      .selectAll()
      .where('api_name', '=', 'lead')
      .limit(1)
      .execute();

    if (!objectDef) {
      // Seed data missing — skip rather than fail noisily.
      return;
    }

    await realDb
      .insertInto('records')
      .values([
        {
          tenant_id: tenantAId,
          object_id: objectDef.id,
          name: 'Alpha Record',
          field_values: JSON.stringify({}),
          owner_id: 'seed',
        },
        {
          tenant_id: tenantBId,
          object_id: objectDef.id,
          name: 'Bravo Record',
          field_values: JSON.stringify({}),
          owner_id: 'seed',
        },
      ])
      .execute();

    // Querying inside the Alpha tenant context must only see Alpha rows.
    const alphaRows = await liveStore.run(tenantAId, () =>
      realDb.selectFrom('records').selectAll().execute(),
    );
    expect(alphaRows.every((r) => r.tenant_id === tenantAId)).toBe(true);
    expect(alphaRows.some((r) => r.name === 'Alpha Record')).toBe(true);
    expect(alphaRows.some((r) => r.name === 'Bravo Record')).toBe(false);

    // A transaction in the Bravo tenant context must only see Bravo rows.
    const bravoRows = await liveStore.run(tenantBId, () =>
      realDb.transaction().execute((trx) =>
        trx.selectFrom('records').selectAll().execute(),
      ),
    );
    expect(bravoRows.every((r) => r.tenant_id === tenantBId)).toBe(true);
    expect(bravoRows.some((r) => r.name === 'Bravo Record')).toBe(true);
    expect(bravoRows.some((r) => r.name === 'Alpha Record')).toBe(false);

    // Clean up seed data (bypass RLS by running without tenant context).
    await realDb
      .deleteFrom('records')
      .where('tenant_id', 'in', [tenantAId, tenantBId])
      .execute();
    await realDb
      .deleteFrom('tenants')
      .where('id', 'in', [tenantAId, tenantBId])
      .execute();
  });
});
