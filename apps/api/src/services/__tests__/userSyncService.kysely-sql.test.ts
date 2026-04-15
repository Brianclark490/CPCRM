/**
 * Kysely SQL regression suite for userSyncService.
 *
 * Complements `userSyncService.test.ts` (behavioural assertions) by
 * asserting directly on the SQL Kysely emits for `syncUserRecord`. It
 * exists to:
 *
 *   1. Catch drift in the generated SQL as Kysely is upgraded or the
 *      service is refactored.
 *   2. Audit that every tenant-scoped query on `records` and
 *      `object_definitions` carries a `tenant_id` filter as
 *      defence-in-depth against an RLS misconfiguration (ADR-006).
 *   3. Verify the JSONB `field_values->>'descope_user_id'` lookup is
 *      emitted with a parameter bind (not string interpolation).
 *
 * No real Postgres — the pg pool is mocked and captures every compiled
 * SQL string Kysely hands down.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const TENANT_ID = 'sql-tenant-001';
const DESCOPE_USER_ID = 'descope-sql-001';
const OBJECT_ID = 'obj-user-sql';

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ─── SQL capture ──────────────────────────────────────────────────────────────

interface CapturedQuery {
  sql: string;
  params: unknown[];
  via: 'pool' | 'client';
}

const {
  capturedQueries,
  mockQuery,
  mockConnect,
  resetCapture,
  setExistingUser,
} = vi.hoisted(() => {
  const capturedQueries: CapturedQuery[] = [];
  let existingUserRow:
    | { id: string; field_values: Record<string, unknown> }
    | null = null;

  function runQuery(
    rawSql: string,
    params: unknown[] | undefined,
    via: 'pool' | 'client',
  ) {
    capturedQueries.push({ sql: rawSql, params: params ?? [], via });

    const s = rawSql.replace(/\s+/g, ' ').replace(/"/g, '').trim().toUpperCase();

    if (s === 'BEGIN' || s === 'COMMIT' || s === 'ROLLBACK') {
      return { rows: [] };
    }
    if (s.startsWith('SELECT SET_CONFIG')) {
      return { rows: [] };
    }

    // SELECT id FROM object_definitions WHERE api_name = 'user' AND tenant_id = $1
    if (s.startsWith('SELECT') && s.includes('FROM OBJECT_DEFINITIONS')) {
      return { rows: [{ id: 'obj-user-sql' }] };
    }

    // SELECT id, field_values FROM records WHERE ... field_values->>'descope_user_id'
    if (
      s.startsWith('SELECT') &&
      s.includes('FROM RECORDS') &&
      s.includes("FIELD_VALUES->>'DESCOPE_USER_ID'")
    ) {
      if (existingUserRow) return { rows: [existingUserRow] };
      return { rows: [] };
    }

    // INSERT INTO records (user record create)
    if (s.startsWith('INSERT INTO RECORDS')) {
      return { rows: [] };
    }

    // UPDATE records (either the user record update or the backfill UPDATEs)
    if (s.startsWith('UPDATE RECORDS')) {
      return { rowCount: 0 };
    }

    return { rows: [] };
  }

  const mockQuery = vi.fn(async (sql: string, params?: unknown[]) => {
    const rawSql =
      typeof sql === 'string' ? sql : (sql as { text: string }).text;
    return runQuery(rawSql, params, 'pool');
  });

  const mockConnect = vi.fn(async () => ({
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      const rawSql =
        typeof sql === 'string' ? sql : (sql as { text: string }).text;
      return runQuery(rawSql, params, 'client');
    }),
    release: vi.fn(),
  }));

  function resetCapture() {
    capturedQueries.length = 0;
    existingUserRow = null;
  }

  function setExistingUser(
    row: { id: string; field_values: Record<string, unknown> } | null,
  ) {
    existingUserRow = row;
  }

  return {
    capturedQueries,
    mockQuery,
    mockConnect,
    resetCapture,
    setExistingUser,
  };
});

vi.mock('../../db/client.js', () => ({
  pool: { query: mockQuery, connect: mockConnect },
}));

const { syncUserRecord } = await import('../userSyncService.js');

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

const baseInput = {
  tenantId: TENANT_ID,
  descopeUserId: DESCOPE_USER_ID,
  email: 'sql@example.com',
  displayName: 'SQL User',
  role: 'member',
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('userSyncService Kysely SQL — tenant_id defence-in-depth', () => {
  it('every data query on a create path references tenant_id', async () => {
    await syncUserRecord(baseInput);

    const queries = dataQueries();
    expect(queries.length).toBeGreaterThan(0);
    for (const q of queries) {
      const s = normalise(q.sql);
      expect(
        s.includes('TENANT_ID'),
        `Query missing TENANT_ID:\n  ${q.sql}`,
      ).toBe(true);
    }
  });

  it('every data query on an update path references tenant_id', async () => {
    setExistingUser({
      id: 'rec-existing',
      field_values: {
        email: 'sql@example.com',
        display_name: 'Old Name',
        role: 'member',
        descope_user_id: DESCOPE_USER_ID,
        is_active: true,
      },
    });
    await syncUserRecord({ ...baseInput, displayName: 'New Name' });

    const queries = dataQueries();
    expect(queries.length).toBeGreaterThan(0);
    for (const q of queries) {
      const s = normalise(q.sql);
      expect(
        s.includes('TENANT_ID'),
        `Query missing TENANT_ID:\n  ${q.sql}`,
      ).toBe(true);
    }
  });
});

describe('userSyncService Kysely SQL — JSONB key access', () => {
  it('descope_user_id lookup binds the user id as a parameter, not an interpolated string', async () => {
    await syncUserRecord(baseInput);

    const lookups = dataQueries().filter((q) => {
      const s = normalise(q.sql);
      return (
        s.startsWith('SELECT') &&
        s.includes('FROM RECORDS') &&
        s.includes("FIELD_VALUES->>'DESCOPE_USER_ID'")
      );
    });
    expect(lookups.length).toBe(1);

    const params = lookups[0]!.params;
    expect(params).toContain(DESCOPE_USER_ID);

    // The raw literal should NOT appear twice in the SQL text (no interpolation).
    const sql = lookups[0]!.sql;
    // The literal 'descope_user_id' (quoted) is present once as the JSONB key;
    // the user id itself (DESCOPE_USER_ID) must NOT appear in the SQL text.
    expect(sql.includes(DESCOPE_USER_ID)).toBe(false);
  });

  it('the SELECT projects only id and field_values — not the full row', async () => {
    await syncUserRecord(baseInput);

    const lookups = dataQueries().filter((q) => {
      const s = normalise(q.sql);
      return (
        s.startsWith('SELECT') &&
        s.includes('FROM RECORDS') &&
        s.includes("FIELD_VALUES->>'DESCOPE_USER_ID'")
      );
    });
    expect(lookups.length).toBe(1);

    const s = normalise(lookups[0]!.sql);
    expect(s).toContain('ID');
    expect(s).toContain('FIELD_VALUES');
    // Columns that should NOT be in the projection
    expect(s).not.toContain('OWNER_NAME');
    expect(s).not.toContain('UPDATED_BY_NAME');
    expect(s).not.toContain('PIPELINE_ID');
  });
});

describe('userSyncService Kysely SQL — create path', () => {
  it('creates the records row with INSERT binding 8 columns', async () => {
    await syncUserRecord(baseInput);

    const inserts = dataQueries().filter((q) =>
      normalise(q.sql).startsWith('INSERT INTO RECORDS'),
    );
    expect(inserts.length).toBe(1);

    // Column order: id, object_id, name, field_values, owner_id, tenant_id, created_at, updated_at.
    expect(inserts[0]!.params.length).toBe(8);
    expect(inserts[0]!.params[1]).toBe(OBJECT_ID);
    expect(inserts[0]!.params[2]).toBe('SQL User'); // name
    expect(inserts[0]!.params[4]).toBe(DESCOPE_USER_ID); // owner_id
    expect(inserts[0]!.params[5]).toBe(TENANT_ID);

    // field_values is a JSON-stringified payload
    const fieldValues = JSON.parse(inserts[0]!.params[3] as string) as Record<
      string,
      unknown
    >;
    expect(fieldValues['descope_user_id']).toBe(DESCOPE_USER_ID);
    expect(fieldValues['display_name']).toBe('SQL User');
    expect(fieldValues['role']).toBe('member');
  });

  it('runs the owner_record_id and updated_by_record_id backfill UPDATEs after creation', async () => {
    await syncUserRecord(baseInput);

    const updates = dataQueries().filter((q) =>
      normalise(q.sql).startsWith('UPDATE RECORDS'),
    );
    // Two backfill UPDATEs (owner_record_id + updated_by_record_id)
    expect(updates.length).toBe(2);

    const ownerBackfill = normalise(updates[0]!.sql);
    expect(ownerBackfill).toContain('OWNER_RECORD_ID');
    expect(ownerBackfill).toContain('OWNER_ID =');
    expect(ownerBackfill).toContain('TENANT_ID =');
    // The OR branch guarding re-writes
    expect(ownerBackfill).toContain('IS NULL');

    const updatedByBackfill = normalise(updates[1]!.sql);
    expect(updatedByBackfill).toContain('UPDATED_BY_RECORD_ID');
    expect(updatedByBackfill).toContain('UPDATED_BY =');
    expect(updatedByBackfill).toContain('TENANT_ID =');
    expect(updatedByBackfill).toContain('IS NULL');
  });
});

describe('userSyncService Kysely SQL — update path', () => {
  it('emits the user-record UPDATE scoped by id + tenant_id', async () => {
    setExistingUser({
      id: 'rec-existing',
      field_values: {
        email: 'sql@example.com',
        display_name: 'Old Name',
        role: 'member',
        descope_user_id: DESCOPE_USER_ID,
        is_active: true,
      },
    });
    await syncUserRecord({ ...baseInput, displayName: 'New Name' });

    const updates = dataQueries().filter((q) =>
      normalise(q.sql).startsWith('UPDATE RECORDS'),
    );
    // 1 user-record UPDATE + 2 backfill UPDATEs = 3
    expect(updates.length).toBe(3);

    const userUpdate = normalise(updates[0]!.sql);
    expect(userUpdate).toContain('FIELD_VALUES =');
    expect(userUpdate).toContain('NAME =');
    expect(userUpdate).toContain('UPDATED_AT =');
    expect(userUpdate).toContain('ID =');
    expect(userUpdate).toContain('TENANT_ID =');
  });

  it('skips the user-record UPDATE when display_name and role are unchanged', async () => {
    setExistingUser({
      id: 'rec-existing',
      field_values: {
        email: 'sql@example.com',
        display_name: 'SQL User',
        role: 'member',
        descope_user_id: DESCOPE_USER_ID,
        is_active: true,
      },
    });
    await syncUserRecord(baseInput);

    const updates = dataQueries().filter((q) =>
      normalise(q.sql).startsWith('UPDATE RECORDS'),
    );
    // Only the 2 backfill UPDATEs, no user-record UPDATE.
    expect(updates.length).toBe(2);
    for (const q of updates) {
      const s = normalise(q.sql);
      // The backfill UPDATEs set owner_record_id / updated_by_record_id, not field_values.
      expect(s).not.toContain('FIELD_VALUES =');
    }
  });
});

describe('userSyncService Kysely SQL — non-transactional paths', () => {
  it('syncUserRecord runs without opening an explicit transaction', async () => {
    await syncUserRecord(baseInput);
    const sqls = capturedQueries.map((q) => normalise(q.sql));
    expect(sqls).not.toContain('BEGIN');
    expect(sqls).not.toContain('COMMIT');
  });
});
