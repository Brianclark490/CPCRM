/**
 * Kysely SQL regression suite for leadConversionService.
 *
 * Complements `leadConversionService.test.ts` (behavioural assertions)
 * by asserting directly on the SQL Kysely emits inside the
 * `db.transaction().execute()` closure. It exists to:
 *
 *   1. Catch drift in the generated SQL as Kysely is upgraded or the
 *      service is refactored.
 *   2. Audit that every query inside the conversion transaction carries
 *      a `tenant_id` filter as defence-in-depth against an RLS
 *      misconfiguration (ADR-006).
 *   3. Verify the conversion is actually a single Kysely transaction —
 *      exactly one BEGIN and one COMMIT on exactly one checked-out
 *      client, and every data query runs on that client (not on a
 *      secondary connection).
 *   4. Verify INSERT INTO records binds all 8 columns in declared order
 *      (so `field_values` stays at param index 4, the contract the
 *      behavioural tests rely on).
 *   5. Verify the linkRecordInTransaction helper emits both a SELECT
 *      against relationship_definitions *and* the INSERT into
 *      record_relationships on the same transactional client.
 *
 * No real Postgres — the pg pool is mocked and captures every compiled
 * SQL string Kysely hands down on the transactional client.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const TENANT_ID = 'sql-tenant-001';
const OWNER_ID = 'user-sql-001';
const LEAD_RECORD_ID = 'lead-sql-001';

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ─── SQL capture ──────────────────────────────────────────────────────────────

interface CapturedQuery {
  sql: string;
  params: unknown[];
  clientIndex: number;
}

const {
  capturedQueries,
  mockQuery,
  mockConnect,
  resetCapture,
  setFailOnFirstInsert,
} = vi.hoisted(() => {
  const capturedQueries: CapturedQuery[] = [];
  let connectCount = 0;
  let failOnFirstInsert = false;
  let insertCount = 0;

  function runQuery(
    rawSql: string,
    params: unknown[] | undefined,
    clientIndex: number,
  ) {
    capturedQueries.push({
      sql: rawSql,
      params: params ?? [],
      clientIndex,
    });

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

    // object_definitions lookup
    if (
      s.startsWith('SELECT') &&
      s.includes('FROM OBJECT_DEFINITIONS') &&
      s.includes('API_NAME')
    ) {
      const apiName = (params ?? [])[0] as string;
      return { rows: [{ id: `obj-${apiName}-id` }] };
    }

    // lead record lookup: SELECT * FROM records WHERE id = $1 AND object_id = $2 AND tenant_id = $3
    if (
      s.startsWith('SELECT') &&
      s.includes('FROM RECORDS') &&
      s.includes('OBJECT_ID') &&
      !s.startsWith('SELECT ID')
    ) {
      return {
        rows: [
          {
            id: LEAD_RECORD_ID,
            tenant_id: TENANT_ID,
            object_id: 'obj-lead-id',
            name: 'John Smith',
            field_values: {
              first_name: 'John',
              last_name: 'Smith',
              company: 'SQL Corp',
              status: 'Qualified',
            },
            owner_id: OWNER_ID,
          },
        ],
      };
    }

    // lead_conversion_mappings
    if (s.includes('FROM LEAD_CONVERSION_MAPPINGS')) {
      return {
        rows: [
          {
            lead_field_api_name: 'company',
            target_object: 'account',
            target_field_api_name: 'name',
          },
          {
            lead_field_api_name: 'first_name',
            target_object: 'contact',
            target_field_api_name: 'first_name',
          },
        ],
      };
    }

    // INSERT INTO records (account / contact / opportunity)
    if (s.startsWith('INSERT INTO RECORDS')) {
      insertCount++;
      if (failOnFirstInsert && insertCount === 1) {
        throw new Error('simulated insert failure');
      }
      return { rows: [], rowCount: 1, command: 'INSERT' };
    }

    // relationship_definitions lookup
    if (s.includes('FROM RELATIONSHIP_DEFINITIONS')) {
      const apiName = (params ?? [])[0] as string;
      return { rows: [{ id: `rel-${apiName}-id` }] };
    }

    // INSERT INTO record_relationships
    if (s.startsWith('INSERT INTO RECORD_RELATIONSHIPS')) {
      return { rows: [], rowCount: 1, command: 'INSERT' };
    }

    // UPDATE records (lead conversion metadata)
    if (s.startsWith('UPDATE RECORDS')) {
      return { rows: [], rowCount: 1, command: 'UPDATE' };
    }

    return { rows: [] };
  }

  const mockQuery = vi.fn(async (sql: unknown, params?: unknown[]) => {
    const rawSql =
      typeof sql === 'string' ? sql : (sql as { text: string }).text;
    const paramValues =
      typeof sql === 'string'
        ? params
        : (sql as { values?: unknown[] }).values;
    // Pool-level calls (non-transactional validation) — index -1
    return runQuery(rawSql, paramValues, -1);
  });

  const mockConnect = vi.fn(async () => {
    const myIndex = connectCount++;
    return {
      query: vi.fn(async (sql: unknown, params?: unknown[]) => {
        const rawSql =
          typeof sql === 'string' ? sql : (sql as { text: string }).text;
        const paramValues =
          typeof sql === 'string'
            ? params
            : (sql as { values?: unknown[] }).values;
        return runQuery(rawSql, paramValues, myIndex);
      }),
      release: vi.fn(),
    };
  });

  function resetCapture() {
    capturedQueries.length = 0;
    connectCount = 0;
    insertCount = 0;
    failOnFirstInsert = false;
  }

  function setFailOnFirstInsert(v: boolean) {
    failOnFirstInsert = v;
  }

  return {
    capturedQueries,
    mockQuery,
    mockConnect,
    resetCapture,
    setFailOnFirstInsert,
  };
});

vi.mock('../../db/client.js', () => ({
  pool: { query: mockQuery, connect: mockConnect },
}));

const { convertLead } = await import('../leadConversionService.js');

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

/**
 * Returns the index of the checked-out client that owns both BEGIN and
 * COMMIT (i.e. the transactional client), or -1 if no such client was
 * captured. When Kysely's proxy-pool fires validation SET_CONFIG queries
 * on a throwaway client, the transactional client is typically *not*
 * index 0.
 */
function findTransactionalClientIndex(): number {
  const perClient = new Map<number, { begin: boolean; commit: boolean }>();
  for (const q of capturedQueries) {
    const s = normalise(q.sql);
    if (s === 'BEGIN' || s === 'COMMIT') {
      const entry = perClient.get(q.clientIndex) ?? {
        begin: false,
        commit: false,
      };
      if (s === 'BEGIN') entry.begin = true;
      if (s === 'COMMIT') entry.commit = true;
      perClient.set(q.clientIndex, entry);
    }
  }
  for (const [idx, state] of perClient) {
    if (state.begin && state.commit) return idx;
  }
  return -1;
}

beforeEach(() => {
  resetCapture();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('leadConversionService Kysely SQL — transaction envelope', () => {
  it('runs the entire conversion inside a single BEGIN/COMMIT envelope', async () => {
    await convertLead(TENANT_ID, LEAD_RECORD_ID, OWNER_ID, {});

    const trxClient = findTransactionalClientIndex();
    expect(trxClient).toBeGreaterThanOrEqual(0);

    // Exactly one BEGIN, exactly one COMMIT, zero ROLLBACK on the
    // transactional client.
    const onTrxClient = capturedQueries.filter(
      (q) => q.clientIndex === trxClient,
    );
    const beginCount = onTrxClient.filter(
      (q) => normalise(q.sql) === 'BEGIN',
    ).length;
    const commitCount = onTrxClient.filter(
      (q) => normalise(q.sql) === 'COMMIT',
    ).length;
    const rollbackCount = onTrxClient.filter(
      (q) => normalise(q.sql) === 'ROLLBACK',
    ).length;
    expect(beginCount).toBe(1);
    expect(commitCount).toBe(1);
    expect(rollbackCount).toBe(0);
  });

  it('every data query runs on the transactional client (not via pool.query)', async () => {
    await convertLead(TENANT_ID, LEAD_RECORD_ID, OWNER_ID, {});

    const trxClient = findTransactionalClientIndex();
    const queries = dataQueries();
    expect(queries.length).toBeGreaterThan(0);

    for (const q of queries) {
      expect(
        q.clientIndex,
        `Query hit the wrong client (expected ${trxClient}):\n  ${q.sql}`,
      ).toBe(trxClient);
    }
  });

  it('rolls back the transaction via ROLLBACK when an INSERT throws', async () => {
    setFailOnFirstInsert(true);

    await expect(
      convertLead(TENANT_ID, LEAD_RECORD_ID, OWNER_ID, {}),
    ).rejects.toThrow('simulated insert failure');

    const rolledBack = capturedQueries.some(
      (q) => normalise(q.sql) === 'ROLLBACK',
    );
    expect(rolledBack).toBe(true);
    // And no COMMIT — the transaction must not have been finalised.
    const committed = capturedQueries.some(
      (q) => normalise(q.sql) === 'COMMIT',
    );
    expect(committed).toBe(false);
  });
});

describe('leadConversionService Kysely SQL — tenant_id defence-in-depth', () => {
  it('every SELECT/INSERT/UPDATE inside the transaction carries tenant_id', async () => {
    await convertLead(TENANT_ID, LEAD_RECORD_ID, OWNER_ID, {});

    const trxClient = findTransactionalClientIndex();
    const queries = dataQueries().filter((q) => q.clientIndex === trxClient);

    expect(queries.length).toBeGreaterThan(0);

    for (const q of queries) {
      expect(
        normalise(q.sql).includes('TENANT_ID'),
        `Query missing TENANT_ID:\n  ${q.sql}`,
      ).toBe(true);
      expect(
        q.params,
        `Query params missing TENANT_ID bind:\n  ${q.sql}\n  params=${JSON.stringify(q.params)}`,
      ).toContain(TENANT_ID);
    }
  });
});

describe('leadConversionService Kysely SQL — INSERT INTO records', () => {
  it('binds all 8 columns in declared order (field_values at index 4)', async () => {
    await convertLead(TENANT_ID, LEAD_RECORD_ID, OWNER_ID, {});

    const inserts = dataQueries().filter((q) =>
      normalise(q.sql).startsWith('INSERT INTO RECORDS'),
    );
    // account + contact + opportunity
    expect(inserts.length).toBe(3);

    for (const insert of inserts) {
      // Column order (as written in the service .values({...})):
      //   id, tenant_id, object_id, name, field_values, owner_id,
      //   created_at, updated_at.
      expect(insert.params.length).toBe(8);
      expect(insert.params[1]).toBe(TENANT_ID); // tenant_id
      // field_values must be a JSON string, not an object — pg's JSONB
      // column wants a stringified payload.
      expect(typeof insert.params[4]).toBe('string');
      expect(() => JSON.parse(insert.params[4] as string)).not.toThrow();
      expect(insert.params[5]).toBe(OWNER_ID); // owner_id
      expect(insert.params[6]).toBeInstanceOf(Date); // created_at
      expect(insert.params[7]).toBeInstanceOf(Date); // updated_at
    }
  });

  it('skips the opportunity INSERT when createOpportunity=false', async () => {
    await convertLead(TENANT_ID, LEAD_RECORD_ID, OWNER_ID, {
      createOpportunity: false,
    });

    const inserts = dataQueries().filter((q) =>
      normalise(q.sql).startsWith('INSERT INTO RECORDS'),
    );
    // account + contact only
    expect(inserts.length).toBe(2);
  });
});

describe('leadConversionService Kysely SQL — record_relationships linking', () => {
  it('emits a relationship_definitions SELECT plus a record_relationships INSERT for each link', async () => {
    await convertLead(TENANT_ID, LEAD_RECORD_ID, OWNER_ID, {});

    const relSelects = dataQueries().filter((q) =>
      normalise(q.sql).includes('FROM RELATIONSHIP_DEFINITIONS'),
    );
    const relInserts = dataQueries().filter((q) =>
      normalise(q.sql).startsWith('INSERT INTO RECORD_RELATIONSHIPS'),
    );

    // contact_account + opportunity_account + opportunity_contact
    expect(relSelects.length).toBe(3);
    expect(relInserts.length).toBe(3);

    for (const insert of relInserts) {
      // Column order: id, tenant_id, relationship_id, source_record_id,
      // target_record_id, created_at.
      expect(insert.params.length).toBe(6);
      expect(insert.params[1]).toBe(TENANT_ID);
      expect(insert.params[5]).toBeInstanceOf(Date);
    }
  });
});

describe('leadConversionService Kysely SQL — lead UPDATE', () => {
  it('issues exactly one UPDATE records with field_values + updated_at in SET, scoped by id/object_id/tenant_id', async () => {
    await convertLead(TENANT_ID, LEAD_RECORD_ID, OWNER_ID, {});

    const updates = dataQueries().filter((q) =>
      normalise(q.sql).startsWith('UPDATE RECORDS'),
    );
    expect(updates.length).toBe(1);

    const update = updates[0]!;
    const s = normalise(update.sql);
    expect(s).toContain('FIELD_VALUES =');
    expect(s).toContain('UPDATED_AT =');
    expect(s).toContain('ID =');
    expect(s).toContain('OBJECT_ID =');
    expect(s).toContain('TENANT_ID =');

    // field_values is the first .set() key, so param index 0.
    const fieldValues = JSON.parse(update.params[0] as string);
    expect(fieldValues.status).toBe('Converted');
    expect(fieldValues.converted_at).toBeDefined();
    expect(fieldValues.converted_account_id).toBeDefined();
    expect(fieldValues.converted_contact_id).toBeDefined();
    expect(update.params).toContain(TENANT_ID);
    expect(update.params).toContain(LEAD_RECORD_ID);
  });
});
