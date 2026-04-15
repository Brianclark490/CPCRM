/**
 * Kysely SQL regression suite for fieldDefinitionService.
 *
 * Complements `fieldDefinitionService.test.ts` (behavioural assertions)
 * by asserting directly on the SQL Kysely emits for each exported
 * service function. It exists to:
 *
 *   1. Catch drift in the generated SQL as Kysely is upgraded or the
 *      service is refactored.
 *   2. Audit that every tenant-scoped query carries a `tenant_id` filter
 *      as defence-in-depth against an RLS misconfiguration (ADR-006).
 *   3. Pin the latent layout_fields.tenant_id fix so a future refactor
 *      doesn't reintroduce the NOT-NULL violation.
 *
 * No real Postgres — the pg pool is mocked and captures every compiled
 * SQL string Kysely hands down.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const TENANT_ID = 'sql-tenant-001';
const OBJECT_ID = 'obj-test-001';
const FIELD_ID = 'field-test-001';
const LAYOUT_ID = 'layout-test-001';

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
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

    function runQuery(
      rawSql: string,
      params: unknown[] | undefined,
      via: 'pool' | 'client',
    ) {
      capturedQueries.push({ sql: rawSql, params: params ?? [], via });

      const s = rawSql.replace(/\s+/g, ' ').replace(/"/g, '').trim().toUpperCase();

      // assertObjectExists
      if (
        s.startsWith('SELECT ID FROM OBJECT_DEFINITIONS') &&
        s.includes('WHERE ID')
      ) {
        return { rows: [{ id: OBJECT_ID }] };
      }

      // uniqueness check: SELECT id FROM field_definitions WHERE object_id AND api_name
      if (
        s.startsWith('SELECT ID FROM FIELD_DEFINITIONS') &&
        s.includes('API_NAME')
      ) {
        return { rows: [] };
      }

      // reorder existence check: SELECT id FROM field_definitions WHERE object_id (no api_name)
      if (
        s.startsWith('SELECT ID FROM FIELD_DEFINITIONS') &&
        s.includes('OBJECT_ID') &&
        !s.includes('API_NAME')
      ) {
        return { rows: [{ id: FIELD_ID }, { id: 'field-2' }] };
      }

      // MAX(sort_order) FROM field_definitions
      if (
        s.includes('MAX(SORT_ORDER)') &&
        s.includes('FIELD_DEFINITIONS')
      ) {
        return { rows: [{ max_sort: '0' }] };
      }

      // MAX(sort_order) FROM layout_fields
      if (s.includes('MAX(SORT_ORDER)') && s.includes('LAYOUT_FIELDS')) {
        return { rows: [{ max_sort: '0' }] };
      }

      // INSERT INTO field_definitions
      if (s.startsWith('INSERT INTO FIELD_DEFINITIONS')) {
        return {
          rows: [
            {
              id: FIELD_ID,
              tenant_id: TENANT_ID,
              object_id: OBJECT_ID,
              api_name: 'test_field',
              label: 'Test Field',
              field_type: 'text',
              description: null,
              required: false,
              default_value: null,
              options: {},
              sort_order: 1,
              is_system: false,
              created_at: new Date(),
              updated_at: new Date(),
            },
          ],
        };
      }

      // SELECT id FROM layout_definitions WHERE object_id AND layout_type = 'form' AND is_default
      if (
        s.includes('FROM LAYOUT_DEFINITIONS') &&
        s.includes('LAYOUT_TYPE') &&
        s.includes('IS_DEFAULT')
      ) {
        return { rows: [{ id: LAYOUT_ID }] };
      }

      // INSERT INTO layout_fields
      if (s.startsWith('INSERT INTO LAYOUT_FIELDS')) {
        return { rows: [] };
      }

      // SELECT * FROM field_definitions (lookup before update/delete)
      if (
        s.startsWith('SELECT') &&
        s.includes('FROM FIELD_DEFINITIONS') &&
        s.includes('WHERE ID =')
      ) {
        return {
          rows: [
            {
              id: FIELD_ID,
              tenant_id: TENANT_ID,
              object_id: OBJECT_ID,
              api_name: 'test_field',
              label: 'Test Field',
              field_type: 'text',
              description: null,
              required: false,
              default_value: null,
              options: {},
              sort_order: 1,
              is_system: false,
              created_at: new Date(),
              updated_at: new Date(),
            },
          ],
        };
      }

      // listFieldDefinitions / reorder return — SELECT * ... ORDER BY sort_order
      if (
        s.startsWith('SELECT') &&
        s.includes('FROM FIELD_DEFINITIONS') &&
        s.includes('ORDER BY')
      ) {
        return { rows: [] };
      }

      // UPDATE field_definitions RETURNING *
      if (s.startsWith('UPDATE FIELD_DEFINITIONS SET')) {
        return {
          rows: [
            {
              id: FIELD_ID,
              tenant_id: TENANT_ID,
              object_id: OBJECT_ID,
              api_name: 'test_field',
              label: 'Updated',
              field_type: 'text',
              description: null,
              required: false,
              default_value: null,
              options: {},
              sort_order: 1,
              is_system: false,
              created_at: new Date(),
              updated_at: new Date(),
            },
          ],
        };
      }

      // COUNT(*) FROM records
      if (s.includes('FROM RECORDS') && s.includes('COUNT(*)')) {
        return { rows: [{ count: '0' }] };
      }

      // DELETE FROM field_definitions
      if (s.startsWith('DELETE FROM FIELD_DEFINITIONS')) {
        return { rows: [] };
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
    }

    return { capturedQueries, mockQuery, mockConnect, resetCapture };
  },
);

vi.mock('../../db/client.js', () => ({
  pool: { query: mockQuery, connect: mockConnect },
}));

const {
  createFieldDefinition,
  listFieldDefinitions,
  updateFieldDefinition,
  deleteFieldDefinition,
  reorderFieldDefinitions,
} = await import('../fieldDefinitionService.js');

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

describe('fieldDefinitionService Kysely SQL — tenant_id defence-in-depth', () => {
  it('every data query on createFieldDefinition references tenant_id', async () => {
    await createFieldDefinition(TENANT_ID, OBJECT_ID, {
      apiName: 'company_name',
      label: 'Company Name',
      fieldType: 'text',
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

  it('every data query on listFieldDefinitions references tenant_id', async () => {
    await listFieldDefinitions(TENANT_ID, OBJECT_ID);

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

  it('every data query on updateFieldDefinition references tenant_id', async () => {
    await updateFieldDefinition(TENANT_ID, OBJECT_ID, FIELD_ID, {
      label: 'New Label',
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

  it('every data query on deleteFieldDefinition references tenant_id', async () => {
    await deleteFieldDefinition(TENANT_ID, OBJECT_ID, FIELD_ID);

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

  it('every data query on reorderFieldDefinitions references tenant_id', async () => {
    await reorderFieldDefinitions(TENANT_ID, OBJECT_ID, [FIELD_ID]);

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

describe('fieldDefinitionService Kysely SQL — generated SQL shape', () => {
  it('createFieldDefinition INSERT carries all 14 columns with tenant_id as second bind', async () => {
    await createFieldDefinition(TENANT_ID, OBJECT_ID, {
      apiName: 'company_name',
      label: 'Company Name',
      fieldType: 'text',
    });

    const inserts = dataQueries().filter((q) =>
      normalise(q.sql).startsWith('INSERT INTO FIELD_DEFINITIONS'),
    );
    expect(inserts.length).toBe(1);
    // id, tenant_id, object_id, api_name, label, field_type,
    // description, required, default_value, options, sort_order,
    // is_system, created_at, updated_at
    expect(inserts[0]!.params.length).toBe(14);
    expect(inserts[0]!.params[1]).toBe(TENANT_ID);
    expect(inserts[0]!.params[2]).toBe(OBJECT_ID);
    expect(inserts[0]!.params[3]).toBe('company_name');
    expect(inserts[0]!.params[4]).toBe('Company Name');
    expect(inserts[0]!.params[5]).toBe('text');
  });

  it('createFieldDefinition INSERT into layout_fields includes tenant_id (latent bug fix)', async () => {
    // Historical bug: the raw-pg implementation omitted tenant_id on the
    // layout_fields insert, which would have failed the NOT NULL
    // constraint on a real database. The Kysely migration fixes this
    // and this assertion pins the fix.
    await createFieldDefinition(TENANT_ID, OBJECT_ID, {
      apiName: 'company_name',
      label: 'Company Name',
      fieldType: 'text',
    });

    const layoutInserts = dataQueries().filter((q) =>
      normalise(q.sql).startsWith('INSERT INTO LAYOUT_FIELDS'),
    );
    expect(layoutInserts.length).toBe(1);

    const s = normalise(layoutInserts[0]!.sql);
    expect(s).toContain('TENANT_ID');
    // id, tenant_id, layout_id, field_id, section, sort_order, width
    expect(layoutInserts[0]!.params.length).toBe(7);
    // tenant_id is the second bind (after id)
    expect(layoutInserts[0]!.params[1]).toBe(TENANT_ID);
  });

  it('listFieldDefinitions orders by sort_order ascending', async () => {
    await listFieldDefinitions(TENANT_ID, OBJECT_ID);

    const selects = dataQueries().filter((q) => {
      const s = normalise(q.sql);
      return (
        s.startsWith('SELECT') &&
        s.includes('FROM FIELD_DEFINITIONS') &&
        s.includes('ORDER BY')
      );
    });
    expect(selects.length).toBe(1);

    const s = normalise(selects[0]!.sql);
    expect(s).toContain('SORT_ORDER ASC');
    expect(s).toContain('OBJECT_ID');
    expect(s).toContain('TENANT_ID');
  });

  it('updateFieldDefinition with only label updates only the label and updated_at columns', async () => {
    await updateFieldDefinition(TENANT_ID, OBJECT_ID, FIELD_ID, {
      label: 'New Label',
    });

    const updates = dataQueries().filter((q) =>
      normalise(q.sql).startsWith('UPDATE FIELD_DEFINITIONS SET'),
    );
    expect(updates.length).toBe(1);

    const s = normalise(updates[0]!.sql);
    expect(s).toContain('LABEL =');
    expect(s).toContain('UPDATED_AT =');
    expect(s).not.toContain('FIELD_TYPE =');
    expect(s).not.toContain('REQUIRED =');
    expect(s).not.toContain('OPTIONS =');
    // WHERE is scoped by id + object_id + tenant_id
    expect(s).toContain('WHERE');
    expect(s).toContain('ID =');
    expect(s).toContain('OBJECT_ID =');
    expect(s).toContain('TENANT_ID =');
    // RETURNING used to avoid a follow-up SELECT
    expect(s).toContain('RETURNING');
  });

  it('updateFieldDefinition with no fields skips the UPDATE entirely', async () => {
    await updateFieldDefinition(TENANT_ID, OBJECT_ID, FIELD_ID, {});

    const updates = dataQueries().filter((q) =>
      normalise(q.sql).startsWith('UPDATE FIELD_DEFINITIONS SET'),
    );
    expect(updates.length).toBe(0);
  });

  it('deleteFieldDefinition issues exactly one DELETE scoped by id + object_id + tenant_id', async () => {
    await deleteFieldDefinition(TENANT_ID, OBJECT_ID, FIELD_ID);

    const deletes = dataQueries().filter((q) =>
      normalise(q.sql).startsWith('DELETE FROM FIELD_DEFINITIONS'),
    );
    expect(deletes.length).toBe(1);

    const s = normalise(deletes[0]!.sql);
    expect(s).toContain('WHERE');
    expect(s).toContain('ID =');
    expect(s).toContain('OBJECT_ID =');
    expect(s).toContain('TENANT_ID =');
  });

  it('reorderFieldDefinitions issues one UPDATE per field_id scoped by object_id + tenant_id', async () => {
    await reorderFieldDefinitions(TENANT_ID, OBJECT_ID, [FIELD_ID, 'field-2']);

    const updates = dataQueries().filter((q) =>
      normalise(q.sql).startsWith('UPDATE FIELD_DEFINITIONS SET SORT_ORDER'),
    );
    expect(updates.length).toBe(2);

    for (const u of updates) {
      const s = normalise(u.sql);
      expect(s).toContain('SORT_ORDER =');
      expect(s).toContain('UPDATED_AT =');
      expect(s).toContain('OBJECT_ID =');
      expect(s).toContain('TENANT_ID =');
    }
  });
});

describe('fieldDefinitionService Kysely SQL — no BEGIN/COMMIT (no explicit transactions)', () => {
  it('createFieldDefinition runs without opening an explicit transaction', async () => {
    await createFieldDefinition(TENANT_ID, OBJECT_ID, {
      apiName: 'company_name',
      label: 'Company Name',
      fieldType: 'text',
    });
    const sqls = capturedQueries.map((q) => normalise(q.sql));
    expect(sqls).not.toContain('BEGIN');
    expect(sqls).not.toContain('COMMIT');
  });

  it('updateFieldDefinition runs without opening an explicit transaction', async () => {
    await updateFieldDefinition(TENANT_ID, OBJECT_ID, FIELD_ID, {
      label: 'Updated',
    });
    const sqls = capturedQueries.map((q) => normalise(q.sql));
    expect(sqls).not.toContain('BEGIN');
    expect(sqls).not.toContain('COMMIT');
  });

  it('deleteFieldDefinition runs without opening an explicit transaction', async () => {
    await deleteFieldDefinition(TENANT_ID, OBJECT_ID, FIELD_ID);
    const sqls = capturedQueries.map((q) => normalise(q.sql));
    expect(sqls).not.toContain('BEGIN');
    expect(sqls).not.toContain('COMMIT');
  });
});
