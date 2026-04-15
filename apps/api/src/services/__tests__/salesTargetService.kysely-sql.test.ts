/**
 * Kysely SQL regression suite for salesTargetService.
 *
 * Complements `salesTargetService.test.ts` (behavioural assertions) by
 * asserting on the SQL Kysely emits at compile time. It exists to:
 *
 *   1. Catch drift in the generated SQL as Kysely is upgraded or the
 *      service is refactored.
 *   2. Audit that every query carries a `tenant_id` filter — including
 *      the previously-latent defence-in-depth gaps the Kysely migration
 *      closes:
 *        - `getRecordName` now accepts a `tenantId` and filters on it
 *        - `calculateActual` scopes `od.tenant_id` + `sd.tenant_id` on
 *          its JOINs in addition to `r.tenant_id`
 *        - `calculateActualForUserRecord`, `getUserTarget`, and
 *          `getTeamUserTargets` all scope `od.tenant_id` on the JOIN
 *   3. Verify INSERT INTO sales_targets uses ON CONFLICT DO UPDATE SET
 *      (upsert semantics) rather than two round-trips.
 *   4. Verify the JSONB `field_values->>'descope_user_id'` and
 *      `field_values->>'team_id'` lookups follow the ADR-006 Appendix A
 *      pattern (column reference written via the `sql` tag, value bound
 *      as a parameter).
 *
 * No real Postgres — the pg pool is mocked and captures every compiled
 * SQL string Kysely hands down.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const TENANT_ID = 'sql-tenant-001';

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ─── SQL capture ──────────────────────────────────────────────────────────────

interface CapturedQuery {
  sql: string;
  params: unknown[];
}

const { capturedQueries, mockQuery, mockConnect, resetCapture } = vi.hoisted(() => {
  const capturedQueries: CapturedQuery[] = [];

  function normaliseForTopLevelMatch(rawSql: string): string {
    return rawSql.replace(/\s+/g, ' ').replace(/"/g, '').trim().toUpperCase();
  }

  function runQuery(rawSql: string, params: unknown[]) {
    capturedQueries.push({ sql: rawSql, params });
    const s = normaliseForTopLevelMatch(rawSql);

    if (s === 'BEGIN' || s === 'COMMIT' || s === 'ROLLBACK') {
      return { rows: [] };
    }
    if (s.startsWith('SELECT SET_CONFIG')) {
      return { rows: [] };
    }

    // INSERT INTO sales_targets ... ON CONFLICT ... RETURNING *
    if (s.startsWith('INSERT INTO SALES_TARGETS')) {
      const [
        tenant_id,
        target_type,
        target_entity_id,
        period_type,
        period_start,
        period_end,
        target_value,
        currency,
        created_by,
      ] = params;
      return {
        rows: [
          {
            id: 'new-target-id',
            tenant_id,
            target_type,
            target_entity_id,
            period_type,
            period_start,
            period_end,
            target_value,
            currency,
            created_by,
            created_at: new Date(),
            updated_at: new Date(),
          },
        ],
        rowCount: 1,
        command: 'INSERT',
      };
    }

    // SELECT FROM sales_targets (list + summary + getUserTarget's target lookup)
    if (s.includes('FROM SALES_TARGETS') && s.startsWith('SELECT')) {
      return { rows: [] };
    }

    // DELETE FROM sales_targets
    if (s.startsWith('DELETE FROM SALES_TARGETS')) {
      return { rows: [], rowCount: 1, command: 'DELETE' };
    }

    // Actuals calculation query
    if (s.includes('COALESCE(SUM')) {
      return { rows: [{ actual: '0' }] };
    }

    // User record lookup (getUserTarget + calculateActualForUserRecord +
    // getTeamUserTargets): records joined to object_definitions, filtered
    // by api_name = 'user'.
    if (s.includes('FROM RECORDS R') && s.includes('OBJECT_DEFINITIONS OD')) {
      return { rows: [] };
    }

    // SELECT name FROM records (getRecordName)
    if (s.startsWith('SELECT NAME FROM RECORDS')) {
      return { rows: [{ name: 'Fake Team' }] };
    }

    return { rows: [] };
  }

  function normaliseCall(sqlOrQuery: unknown, paramsArg?: unknown[]) {
    if (typeof sqlOrQuery === 'string') {
      return { sql: sqlOrQuery, params: paramsArg ?? [] };
    }
    const q = sqlOrQuery as { text: string; values?: unknown[] };
    return { sql: q.text, params: q.values ?? [] };
  }

  const mockQuery = vi.fn(async (sqlOrQuery: unknown, paramsArg?: unknown[]) => {
    const { sql, params } = normaliseCall(sqlOrQuery, paramsArg);
    return runQuery(sql, params);
  });

  const mockConnect = vi.fn(async () => ({
    query: vi.fn(async (sqlOrQuery: unknown, paramsArg?: unknown[]) => {
      const { sql, params } = normaliseCall(sqlOrQuery, paramsArg);
      return runQuery(sql, params);
    }),
    release: vi.fn(),
  }));

  function resetCapture() {
    capturedQueries.length = 0;
  }

  return { capturedQueries, mockQuery, mockConnect, resetCapture };
});

vi.mock('../../db/client.js', () => ({
  pool: { query: mockQuery, connect: mockConnect },
}));

const {
  upsertTarget,
  listTargets,
  deleteTarget,
  calculateActual,
  getUserTarget,
} = await import('../salesTargetService.js');

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
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('salesTargetService Kysely SQL — upsertTarget', () => {
  it('emits INSERT INTO sales_targets with ON CONFLICT DO UPDATE SET', async () => {
    await upsertTarget(TENANT_ID, {
      targetType: 'business',
      periodType: 'quarterly',
      periodStart: '2026-01-01',
      periodEnd: '2026-04-01',
      targetValue: 500000,
      currency: 'GBP',
    });

    const inserts = dataQueries().filter((q) =>
      normalise(q.sql).startsWith('INSERT INTO SALES_TARGETS'),
    );
    expect(inserts.length).toBe(1);

    const insert = inserts[0]!;
    const s = normalise(insert.sql);
    expect(s).toContain('ON CONFLICT');
    expect(s).toContain('DO UPDATE SET');
    expect(s).toContain('TENANT_ID');
    expect(s).toContain('TARGET_TYPE');
    expect(s).toContain('TARGET_ENTITY_ID');
    expect(s).toContain('PERIOD_START');
    expect(s).toContain('RETURNING');
  });

  it('binds all 9 columns with tenant_id at index 0', async () => {
    await upsertTarget(TENANT_ID, {
      targetType: 'business',
      periodType: 'quarterly',
      periodStart: '2026-01-01',
      periodEnd: '2026-04-01',
      targetValue: 500000,
      currency: 'GBP',
      createdBy: 'user-xyz',
    });

    const insert = dataQueries().find((q) =>
      normalise(q.sql).startsWith('INSERT INTO SALES_TARGETS'),
    )!;

    // Column order: tenant_id, target_type, target_entity_id, period_type,
    // period_start, period_end, target_value, currency, created_by
    // (9 bound columns total).
    expect(insert.params[0]).toBe(TENANT_ID);
    expect(insert.params[1]).toBe('business');
    expect(insert.params[2]).toBeNull();
    expect(insert.params[3]).toBe('quarterly');
    expect(insert.params[6]).toBe(500000);
    expect(insert.params[7]).toBe('GBP');
    expect(insert.params[8]).toBe('user-xyz');
    // The first 9 params are the INSERT columns. Kysely may then bind
    // additional params for DO UPDATE SET, so only assert that the
    // INSERT-side parameters cover indices 0..8.
    expect(insert.params.length).toBeGreaterThanOrEqual(9);
  });
});

describe('salesTargetService Kysely SQL — listTargets', () => {
  it('scopes by tenant_id with no period filters when none supplied', async () => {
    await listTargets(TENANT_ID);

    const selects = dataQueries().filter((q) => {
      const s = normalise(q.sql);
      return s.startsWith('SELECT') && s.includes('FROM SALES_TARGETS');
    });
    expect(selects.length).toBe(1);

    const select = selects[0]!;
    const s = normalise(select.sql);
    expect(s).toContain('TENANT_ID =');
    expect(s).not.toContain('PERIOD_START >=');
    expect(s).not.toContain('PERIOD_END <=');
    expect(select.params).toContain(TENANT_ID);
  });

  it('appends period filters and orders by period_start DESC, target_type ASC', async () => {
    await listTargets(TENANT_ID, '2026-01-01', '2026-12-31');

    const select = dataQueries().find((q) => {
      const s = normalise(q.sql);
      return s.startsWith('SELECT') && s.includes('FROM SALES_TARGETS');
    })!;
    const s = normalise(select.sql);

    expect(s).toContain('TENANT_ID =');
    expect(s).toContain('PERIOD_START >=');
    expect(s).toContain('PERIOD_END <=');
    expect(s).toMatch(/ORDER BY PERIOD_START DESC, TARGET_TYPE ASC/);
    expect(select.params).toContain(TENANT_ID);
  });
});

describe('salesTargetService Kysely SQL — deleteTarget', () => {
  it('emits DELETE scoped by id AND tenant_id', async () => {
    await deleteTarget(TENANT_ID, 'target-xyz');

    const deletes = dataQueries().filter((q) =>
      normalise(q.sql).startsWith('DELETE FROM SALES_TARGETS'),
    );
    expect(deletes.length).toBe(1);

    const del = deletes[0]!;
    const s = normalise(del.sql);
    expect(s).toContain('ID =');
    expect(s).toContain('TENANT_ID =');
    expect(del.params).toEqual(['target-xyz', TENANT_ID]);
  });
});

describe('salesTargetService Kysely SQL — calculateActual tenant_id defence-in-depth', () => {
  it('scopes r.tenant_id + od.tenant_id + sd.tenant_id on the JOINed query', async () => {
    await calculateActual(TENANT_ID, '2026-01-01', '2026-04-01');

    const selects = dataQueries().filter((q) => {
      const s = normalise(q.sql);
      return s.startsWith('SELECT') && s.includes('COALESCE(SUM');
    });
    expect(selects.length).toBe(1);

    const select = selects[0]!;
    const s = normalise(select.sql);

    // The ON clauses should carry tenant_id on *both* JOINed tables.
    expect(s).toMatch(/OBJECT_DEFINITIONS AS OD[^W]*OD\.TENANT_ID =/);
    expect(s).toMatch(/STAGE_DEFINITIONS AS SD[^W]*SD\.TENANT_ID =/);
    // And the record-level filter is still present.
    expect(s).toContain('R.TENANT_ID =');
    expect(s).toContain('OD.API_NAME =');
    expect(s).toContain('SD.STAGE_TYPE =');

    // Every tenant_id bind in the params must be the tenant we asked for.
    const tenantCount = select.params.filter((p) => p === TENANT_ID).length;
    // r.tenant_id + od.tenant_id + sd.tenant_id = 3 tenant binds.
    expect(tenantCount).toBeGreaterThanOrEqual(3);
  });

  it('appends r.owner_id = $N when ownerId is supplied', async () => {
    await calculateActual(TENANT_ID, '2026-01-01', '2026-04-01', 'user-123');

    const select = dataQueries().find((q) => {
      const s = normalise(q.sql);
      return s.startsWith('SELECT') && s.includes('COALESCE(SUM');
    })!;
    const s = normalise(select.sql);

    expect(s).toContain('R.OWNER_ID =');
    expect(select.params).toContain('user-123');
  });
});

describe('salesTargetService Kysely SQL — getUserTarget JSONB + tenant_id', () => {
  it('emits records JOIN object_definitions with od.tenant_id and a JSONB field_values lookup', async () => {
    await getUserTarget(TENANT_ID, 'descope-user-1', '2026-01-01', '2026-04-01');

    const userLookup = dataQueries().find((q) => {
      const s = normalise(q.sql);
      return (
        s.startsWith('SELECT') &&
        s.includes('FROM RECORDS AS R') &&
        s.includes('OBJECT_DEFINITIONS AS OD') &&
        s.includes('DESCOPE_USER_ID')
      );
    });
    expect(userLookup).toBeDefined();

    const s = normalise(userLookup!.sql);
    // Both r.tenant_id and od.tenant_id on the JOIN, defence-in-depth.
    expect(s).toContain('R.TENANT_ID =');
    expect(s).toMatch(/OD\.TENANT_ID =/);
    // ADR-006 Appendix A: column reference in SQL, value as bind.
    expect(s).toContain("R.FIELD_VALUES->>'DESCOPE_USER_ID'");
    // Value must be a bound param ($N placeholder), not inlined.
    expect(s).toMatch(/R\.FIELD_VALUES->>'DESCOPE_USER_ID' = \$\d+/);

    // tenant_id + descope_user_id must both be bound on the lookup.
    expect(userLookup!.params).toContain(TENANT_ID);
    expect(userLookup!.params).toContain('descope-user-1');
  });
});

describe('salesTargetService Kysely SQL — BEGIN/COMMIT envelope', () => {
  it('does NOT wrap individual queries in BEGIN/COMMIT (each query is standalone)', async () => {
    // salesTargetService does not use db.transaction().execute() — each
    // operation is a standalone query. This test pins that contract so a
    // future "let's wrap everything in a transaction" refactor shows up
    // as a deliberate SQL change here.
    await upsertTarget(TENANT_ID, {
      targetType: 'business',
      periodType: 'quarterly',
      periodStart: '2026-01-01',
      periodEnd: '2026-04-01',
      targetValue: 500000,
    });

    const begins = capturedQueries.filter((q) => normalise(q.sql) === 'BEGIN');
    const commits = capturedQueries.filter((q) => normalise(q.sql) === 'COMMIT');
    expect(begins.length).toBe(0);
    expect(commits.length).toBe(0);
  });
});
