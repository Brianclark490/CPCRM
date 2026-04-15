/**
 * Kysely SQL regression suite for recordService.
 *
 * Complements `recordService.test.ts` (which asserts on return values
 * and domain behaviour) by asserting directly on the SQL Kysely emits
 * for each exported service function. It exists to:
 *
 *   1. Catch drift in the generated SQL as Kysely is upgraded or the
 *      service is refactored.
 *   2. Audit that every tenant-scoped query carries a `tenant_id` filter
 *      as defence-in-depth against an RLS misconfiguration (ADR-006).
 *   3. Verify the JSONB search path uses parameterised `->>` access —
 *      NO string interpolation of user-controlled keys into SQL.
 *   4. Verify listRecords runs a SEPARATE `COUNT(*)` query instead of
 *      chaining it onto `.selectAll()` (the Kysely spike hit this bug).
 *   5. Verify createRecord runs inside a BEGIN/COMMIT transaction and
 *      exercises `pool.connect()` so the RLS proxy applies.
 *
 * No real Postgres — the pg pool is mocked and captures every compiled
 * SQL string Kysely hands down.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const TENANT_ID = 'sql-tenant-001';
const OTHER_TENANT_ID = 'sql-tenant-002';
const OBJECT_ID = 'sql-object-001';
const OWNER_ID = 'sql-owner-001';

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// assignDefaultPipeline is still on raw pg — stub it out so createRecord's
// transaction doesn't execute its inner queries against the capture.
vi.mock('../stageMovementService.js', () => ({
  assignDefaultPipeline: vi.fn(async () => {}),
}));

// ─── SQL capture ──────────────────────────────────────────────────────────────

interface CapturedQuery {
  sql: string;
  params: unknown[];
  /** 'pool' = direct pool.query, 'client' = checked-out client (tx or connect) */
  via: 'pool' | 'client';
}

const { capturedQueries, mockQuery, mockConnect, seedObject, seedRecord, resetCapture } =
  vi.hoisted(() => {
    const capturedQueries: CapturedQuery[] = [];

    const fakeObjects = new Map<string, Record<string, unknown>>();
    const fakeFields: Array<Record<string, unknown>> = [];
    const fakeRecords = new Map<string, Record<string, unknown>>();

    function seedObject(row: Record<string, unknown>) {
      fakeObjects.set(row.id as string, row);
    }

    function seedRecord(row: Record<string, unknown>) {
      fakeRecords.set(row.id as string, row);
    }

    function runQuery(
      rawSql: string,
      params: unknown[] | undefined,
      via: 'pool' | 'client',
    ) {
      capturedQueries.push({ sql: rawSql, params: params ?? [], via });

      // Normalise for pattern-matching: strip identifier quotes, collapse
      // whitespace, upper-case.
      const s = rawSql.replace(/\s+/g, ' ').replace(/"/g, '').trim().toUpperCase();

      // Transaction control
      if (s === 'BEGIN' || s === 'COMMIT' || s === 'ROLLBACK') {
        return { rows: [] };
      }

      // resolveObjectByApiName
      if (
        s.startsWith('SELECT * FROM OBJECT_DEFINITIONS') &&
        s.includes('API_NAME') &&
        s.includes('TENANT_ID')
      ) {
        const apiName = params![0] as string;
        const tenantId = params![1] as string;
        const match = [...fakeObjects.values()].find(
          (r) => r.api_name === apiName && r.tenant_id === tenantId,
        );
        return { rows: match ? [match] : [] };
      }

      // getFieldDefinitions
      if (s.startsWith('SELECT * FROM FIELD_DEFINITIONS')) {
        return { rows: fakeFields };
      }

      // listRecords COUNT
      if (
        s.includes('COUNT(*)') &&
        s.includes('AS TOTAL') &&
        /FROM RECORDS (AS )?R\b/.test(s)
      ) {
        return { rows: [{ total: String(fakeRecords.size) }] };
      }

      // listRecords data query
      if (/FROM RECORDS (AS )?R\b/.test(s) && s.includes('LIMIT')) {
        return { rows: [...fakeRecords.values()] };
      }

      // linked parents query (record_relationships join)
      if (s.includes('FROM RECORD_RELATIONSHIPS')) {
        return { rows: [] };
      }

      // getRecord single-row SELECT
      if (
        s.startsWith('SELECT * FROM RECORDS WHERE ID') &&
        s.includes('TENANT_ID')
      ) {
        const id = params![0] as string;
        const row = fakeRecords.get(id);
        return row ? { rows: [row] } : { rows: [] };
      }

      // relationship_definitions join used by getRecord
      if (s.includes('FROM RELATIONSHIP_DEFINITIONS')) {
        return { rows: [] };
      }

      // stage_definitions lookup used by updateRecord
      if (s.includes('FROM STAGE_DEFINITIONS')) {
        return { rows: [] };
      }

      // INSERT INTO records
      if (s.startsWith('INSERT INTO RECORDS')) {
        const row = {
          id: params![0],
          tenant_id: params![1],
          object_id: params![2],
          name: params![3],
          field_values:
            typeof params![4] === 'string'
              ? JSON.parse(params![4] as string)
              : params![4],
          owner_id: params![5],
          owner_name: params![6],
          updated_by: params![7],
          updated_by_name: params![8],
          created_at: params![9],
          updated_at: params![10],
        };
        fakeRecords.set(row.id as string, row);
        return { rows: [row] };
      }

      // UPDATE records
      if (s.startsWith('UPDATE RECORDS SET')) {
        // The last 3 params are (id, object_id, tenant_id) by query order.
        const id = params![params!.length - 3] as string;
        const row = fakeRecords.get(id);
        return row ? { rows: [row] } : { rows: [] };
      }

      // DELETE FROM records
      if (s.startsWith('DELETE FROM RECORDS')) {
        const id = params![0] as string;
        const existed = fakeRecords.delete(id);
        return {
          command: 'DELETE',
          rowCount: existed ? 1 : 0,
          rows: [],
        };
      }

      return { rows: [] };
    }

    const mockQuery = vi.fn(async (sql: string, params?: unknown[]) => {
      const rawSql = typeof sql === 'string' ? sql : (sql as { text: string }).text;
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
      fakeObjects.clear();
      fakeFields.length = 0;
      fakeRecords.clear();

      const baseObject = {
        id: OBJECT_ID,
        tenant_id: TENANT_ID,
        api_name: 'account',
        label: 'Account',
        plural_label: 'Accounts',
        is_system: true,
        name_field_id: null,
        name_template: null,
      };
      fakeObjects.set(OBJECT_ID, baseObject);

      // Seed a few field definitions covering text / JSONB-searchable types.
      fakeFields.push(
        {
          id: 'field-name',
          object_id: OBJECT_ID,
          tenant_id: TENANT_ID,
          api_name: 'full_name',
          label: 'Full Name',
          field_type: 'text',
          required: false,
          options: {},
          sort_order: 1,
        },
        {
          id: 'field-email',
          object_id: OBJECT_ID,
          tenant_id: TENANT_ID,
          api_name: 'email',
          label: 'Email',
          field_type: 'email',
          required: false,
          options: {},
          sort_order: 2,
        },
        {
          id: 'field-notes',
          object_id: OBJECT_ID,
          tenant_id: TENANT_ID,
          api_name: 'notes',
          label: 'Notes',
          field_type: 'textarea',
          required: false,
          options: {},
          sort_order: 3,
        },
      );
    }

    return {
      capturedQueries,
      mockQuery,
      mockConnect,
      seedObject,
      seedRecord,
      resetCapture,
    };
  });

vi.mock('../../db/client.js', () => ({
  pool: {
    query: mockQuery,
    connect: mockConnect,
  },
}));

const { createRecord, listRecords, getRecord, updateRecord, deleteRecord } =
  await import('../recordService.js');

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

// ─── Tenant defence-in-depth ─────────────────────────────────────────────────

describe('recordService Kysely SQL — tenant_id defence-in-depth', () => {
  it('every data query on listRecords references tenant_id', async () => {
    await listRecords({
      tenantId: TENANT_ID,
      apiName: 'account',
      ownerId: OWNER_ID,
      limit: 20,
      offset: 0,
    });

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

  it('every data query on listRecords w/ search references tenant_id', async () => {
    await listRecords({
      tenantId: TENANT_ID,
      apiName: 'account',
      ownerId: OWNER_ID,
      search: 'acme',
      limit: 20,
      offset: 0,
    });

    for (const q of dataQueries()) {
      const s = normalise(q.sql);
      expect(
        s.includes('TENANT_ID'),
        `Query missing TENANT_ID:\n  ${q.sql}`,
      ).toBe(true);
    }
  });

  it('every data query on getRecord references tenant_id', async () => {
    seedRecord({
      id: 'rec-1',
      tenant_id: TENANT_ID,
      object_id: OBJECT_ID,
      name: 'Acme',
      field_values: {},
      owner_id: OWNER_ID,
      created_at: new Date(),
      updated_at: new Date(),
    });
    capturedQueries.length = 0;

    await getRecord(TENANT_ID, 'account', 'rec-1', OWNER_ID);

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

  it('every data query on createRecord references tenant_id', async () => {
    await createRecord(TENANT_ID, 'account', { full_name: 'Acme Co' }, OWNER_ID);

    const queries = dataQueries();
    expect(queries.length).toBeGreaterThan(0);
    for (const q of queries) {
      const s = normalise(q.sql);
      // No exemptions — every data query, including the post-insert
      // refetch, must carry tenant_id as defence-in-depth (ADR-006).
      expect(
        s.includes('TENANT_ID'),
        `Query missing TENANT_ID:\n  ${q.sql}`,
      ).toBe(true);
    }
  });

  it('every data query on updateRecord references tenant_id', async () => {
    seedRecord({
      id: 'rec-2',
      tenant_id: TENANT_ID,
      object_id: OBJECT_ID,
      name: 'Acme',
      field_values: {},
      owner_id: OWNER_ID,
      created_at: new Date(),
      updated_at: new Date(),
    });
    capturedQueries.length = 0;

    await updateRecord(
      TENANT_ID,
      'account',
      'rec-2',
      { full_name: 'Acme Updated' },
      OWNER_ID,
    );

    for (const q of dataQueries()) {
      const s = normalise(q.sql);
      expect(
        s.includes('TENANT_ID'),
        `Query missing TENANT_ID:\n  ${q.sql}`,
      ).toBe(true);
    }
  });

  it('every data query on deleteRecord references tenant_id', async () => {
    seedRecord({
      id: 'rec-3',
      tenant_id: TENANT_ID,
      object_id: OBJECT_ID,
      name: 'Acme',
      field_values: {},
      owner_id: OWNER_ID,
      created_at: new Date(),
      updated_at: new Date(),
    });
    capturedQueries.length = 0;

    await deleteRecord(TENANT_ID, 'account', 'rec-3', OWNER_ID);

    for (const q of dataQueries()) {
      const s = normalise(q.sql);
      expect(
        s.includes('TENANT_ID'),
        `Query missing TENANT_ID:\n  ${q.sql}`,
      ).toBe(true);
    }
  });
});

// ─── listRecords SQL shape ───────────────────────────────────────────────────

describe('recordService Kysely SQL — listRecords', () => {
  it('runs a SEPARATE COUNT(*) query (not chained onto selectAll)', async () => {
    await listRecords({
      tenantId: TENANT_ID,
      apiName: 'account',
      ownerId: OWNER_ID,
      limit: 20,
      offset: 0,
    });

    const qs = dataQueries().map((q) => normalise(q.sql));
    const countQueries = qs.filter(
      (s) => s.includes('COUNT(*)') && s.includes('AS TOTAL'),
    );
    const dataSelects = qs.filter(
      (s) =>
        s.startsWith('SELECT R.') &&
        s.includes('LIMIT') &&
        !s.includes('COUNT('),
    );
    expect(countQueries.length).toBe(1);
    expect(dataSelects.length).toBe(1);
    // The COUNT query must NOT have a LIMIT — that would be the spike bug.
    expect(countQueries[0]).not.toContain('LIMIT');
    // The data query must NOT contain COUNT — that would be the spike bug.
    expect(dataSelects[0]).not.toContain('COUNT(');
  });

  it('search path uses parameterised JSONB ->> access (no key interpolation)', async () => {
    await listRecords({
      tenantId: TENANT_ID,
      apiName: 'account',
      ownerId: OWNER_ID,
      search: 'acme',
      limit: 20,
      offset: 0,
    });

    const searchQueries = dataQueries().filter((q) => {
      const s = normalise(q.sql);
      return /FROM RECORDS (AS )?R\b/.test(s);
    });
    expect(searchQueries.length).toBeGreaterThanOrEqual(2); // count + data

    for (const q of searchQueries) {
      // JSONB `->>` must be present and the key must be a $N placeholder
      // (proving tf.apiName was bound as a parameter, not interpolated).
      expect(q.sql).toMatch(/field_values->>\$\d+/);
      // The raw key names must NOT appear anywhere in the SQL string.
      expect(q.sql).not.toContain("'full_name'");
      expect(q.sql).not.toContain("'email'");
      expect(q.sql).not.toContain("'notes'");

      // And the user-supplied search term must also be a bound parameter:
      // every ILIKE operand is a placeholder, never an inline literal.
      expect(q.sql).not.toContain("'%acme%'");

      // Every $N placeholder must have a corresponding parameter.
      const placeholders = [...q.sql.matchAll(/\$(\d+)/g)].map((m) =>
        parseInt(m[1]!, 10),
      );
      if (placeholders.length > 0) {
        expect(Math.max(...placeholders)).toBeLessThanOrEqual(q.params.length);
      }
    }
  });

  it('search ILIKE targets every safe text field plus name', async () => {
    await listRecords({
      tenantId: TENANT_ID,
      apiName: 'account',
      ownerId: OWNER_ID,
      search: 'acme',
      limit: 20,
      offset: 0,
    });

    const searchQueries = dataQueries().filter((q) =>
      /FROM RECORDS (AS )?R\b/.test(normalise(q.sql)),
    );
    for (const q of searchQueries) {
      const s = normalise(q.sql);
      // One ILIKE for the name column and one for each JSONB text field.
      // The 3 seeded fields (full_name, email, notes) are all
      // text-like, plus name → 4 ILIKE operators total.
      const ilikeCount = (s.match(/ ILIKE /g) || []).length;
      expect(ilikeCount).toBe(4);
      expect(s).toContain('R.NAME ILIKE');
    }
  });

  it('sort by unsafe/unknown column falls back to created_at DESC (no SQL injection)', async () => {
    await listRecords({
      tenantId: TENANT_ID,
      apiName: 'account',
      ownerId: OWNER_ID,
      sortBy: 'DROP TABLE records;--',
      sortDir: 'asc',
      limit: 20,
      offset: 0,
    });

    const dataSelect = dataQueries().find((q) => {
      const s = normalise(q.sql);
      return (
        /FROM RECORDS (AS )?R\b/.test(s) &&
        s.includes('LIMIT') &&
        !s.includes('COUNT(')
      );
    });
    expect(dataSelect).toBeDefined();
    const s = normalise(dataSelect!.sql);
    // Must not have leaked the user input anywhere in the SQL.
    expect(s).not.toContain('DROP');
    expect(s).not.toContain(';--');
    // Must have fallen back to the safe default.
    expect(s).toContain('ORDER BY R.CREATED_AT DESC');
  });

  it('sort by a safe field name binds the JSONB key as a parameter', async () => {
    await listRecords({
      tenantId: TENANT_ID,
      apiName: 'account',
      ownerId: OWNER_ID,
      sortBy: 'full_name',
      sortDir: 'asc',
      limit: 20,
      offset: 0,
    });

    const dataSelect = dataQueries().find((q) => {
      const s = normalise(q.sql);
      return (
        /FROM RECORDS (AS )?R\b/.test(s) &&
        s.includes('LIMIT') &&
        !s.includes('COUNT(')
      );
    });
    expect(dataSelect).toBeDefined();
    // Field name must be a parameter, not interpolated.
    expect(dataSelect!.sql).toMatch(/order by r\.field_values->>\$\d+ asc/i);
    expect(dataSelect!.sql).not.toContain("'full_name'");
  });
});

// ─── createRecord transaction / RLS proxy wiring ─────────────────────────────

describe('recordService Kysely SQL — createRecord transaction wiring', () => {
  it('runs INSERT + refetch inside a BEGIN/COMMIT on a checked-out client', async () => {
    await createRecord(
      TENANT_ID,
      'account',
      { full_name: 'Acme Co' },
      OWNER_ID,
    );

    const sqls = capturedQueries.map((q) => normalise(q.sql));
    const beginIdx = sqls.indexOf('BEGIN');
    const commitIdx = sqls.indexOf('COMMIT');
    expect(beginIdx, 'Expected a BEGIN').toBeGreaterThanOrEqual(0);
    expect(commitIdx).toBeGreaterThan(beginIdx);

    // Every query between BEGIN and COMMIT (inclusive) must come via the
    // checked-out client, which is how the RLS proxy sets
    // app.current_tenant_id before the transaction runs.
    for (let i = beginIdx; i <= commitIdx; i++) {
      expect(
        capturedQueries[i]!.via,
        `Query ${i} (${sqls[i]}) should run via the checked-out client, not pool.query`,
      ).toBe('client');
    }

    // The INSERT and the refetch must both be inside the transaction.
    // The refetch now scopes by id + object_id + tenant_id.
    const insertIdx = sqls.findIndex((s) => s.startsWith('INSERT INTO RECORDS'));
    const refetchIdx = sqls.findIndex(
      (s) =>
        s.startsWith('SELECT * FROM RECORDS WHERE ID') &&
        s.includes('OBJECT_ID') &&
        s.includes('TENANT_ID'),
    );
    expect(insertIdx).toBeGreaterThan(beginIdx);
    expect(insertIdx).toBeLessThan(commitIdx);
    expect(refetchIdx).toBeGreaterThan(insertIdx);
    expect(refetchIdx).toBeLessThan(commitIdx);
  });

  it('calls pool.connect() at least once, exercising the RLS proxy', async () => {
    const before = mockConnect.mock.calls.length;
    await createRecord(
      TENANT_ID,
      'account',
      { full_name: 'Acme Co' },
      OWNER_ID,
    );
    expect(mockConnect.mock.calls.length).toBeGreaterThan(before);
  });

  it('field_values is serialized as JSON text (single parameter), not interpolated', async () => {
    await createRecord(
      TENANT_ID,
      'account',
      { full_name: 'Acme Co', email: 'a@b.c' },
      OWNER_ID,
    );

    const insert = capturedQueries.find((q) =>
      normalise(q.sql).startsWith('INSERT INTO RECORDS'),
    );
    expect(insert).toBeDefined();
    // None of the user-supplied values may appear in the SQL string.
    expect(insert!.sql).not.toContain('Acme Co');
    expect(insert!.sql).not.toContain('a@b.c');
    // The field_values parameter must be a JSON *string*.
    const jsonParam = insert!.params.find(
      (p) => typeof p === 'string' && p.startsWith('{') && p.includes('full_name'),
    );
    expect(jsonParam).toBeDefined();
  });
});

// ─── Cross-tenant isolation at the SQL layer ─────────────────────────────────

describe('recordService Kysely SQL — cross-tenant isolation', () => {
  it('listRecords with a mismatched tenant rejects before hitting records', async () => {
    // OTHER_TENANT_ID has no object_definitions seeded.
    await expect(
      listRecords({
        tenantId: OTHER_TENANT_ID,
        apiName: 'account',
        ownerId: OWNER_ID,
        limit: 20,
        offset: 0,
      }),
    ).rejects.toThrow(/not found/i);

    // Must NOT have reached the records table at all.
    const touched = dataQueries().some((q) => {
      const s = normalise(q.sql);
      return (
        /FROM RECORDS (AS )?R\b/.test(s) ||
        s.startsWith('INSERT INTO RECORDS') ||
        s.startsWith('UPDATE RECORDS') ||
        s.startsWith('DELETE FROM RECORDS')
      );
    });
    expect(touched).toBe(false);
  });

  it('all data queries bind the tenant_id parameter explicitly', async () => {
    await listRecords({
      tenantId: TENANT_ID,
      apiName: 'account',
      ownerId: OWNER_ID,
      limit: 20,
      offset: 0,
    });

    for (const q of dataQueries()) {
      if (!normalise(q.sql).includes('TENANT_ID')) continue;
      // The tenant_id must appear as a bound parameter somewhere in params.
      expect(q.params).toContain(TENANT_ID);
    }
  });
});

// ─── Final safety net: no raw-SQL leaks ─────────────────────────────────────

describe('recordService Kysely SQL — compiled SQL sanity', () => {
  it('exercising every service path produces valid parameterised SQL', async () => {
    const created = await createRecord(
      TENANT_ID,
      'account',
      { full_name: 'Acme Co' },
      OWNER_ID,
    );
    await listRecords({
      tenantId: TENANT_ID,
      apiName: 'account',
      ownerId: OWNER_ID,
      limit: 20,
      offset: 0,
    });
    await listRecords({
      tenantId: TENANT_ID,
      apiName: 'account',
      ownerId: OWNER_ID,
      search: 'acme',
      limit: 20,
      offset: 0,
    });
    await getRecord(TENANT_ID, 'account', created.id, OWNER_ID);
    await updateRecord(
      TENANT_ID,
      'account',
      created.id,
      { full_name: 'Renamed' },
      OWNER_ID,
    );
    await deleteRecord(TENANT_ID, 'account', created.id, OWNER_ID);

    for (const q of capturedQueries) {
      expect(typeof q.sql).toBe('string');
      expect(q.sql.length).toBeGreaterThan(0);
      if (q.params.length > 0) {
        expect(q.sql).toMatch(/\$\d+/);
      }
    }
  });
});

// keep unused helper out of lint
void seedObject;
