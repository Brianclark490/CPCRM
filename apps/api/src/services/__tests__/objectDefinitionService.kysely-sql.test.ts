/**
 * Kysely SQL regression suite for objectDefinitionService.
 *
 * Complements `objectDefinitionService.test.ts` (behavioural assertions)
 * by asserting directly on the SQL Kysely emits for each exported
 * service function. It exists to:
 *
 *   1. Catch drift in the generated SQL as Kysely is upgraded or the
 *      service is refactored.
 *   2. Audit that every tenant-scoped query carries a `tenant_id` filter
 *      as defence-in-depth against an RLS misconfiguration (ADR-006).
 *   3. Pin the latent layout_definitions.tenant_id and
 *      object_permissions.tenant_id fixes so a future refactor doesn't
 *      reintroduce the NOT-NULL violation.
 *
 * No real Postgres — the pg pool is mocked and captures every compiled
 * SQL string Kysely hands down.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const TENANT_ID = 'sql-tenant-001';
const OBJECT_ID = 'obj-test-001';

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

      // Transaction control statements
      if (s === 'BEGIN' || s === 'COMMIT' || s === 'ROLLBACK') {
        return { rows: [] };
      }

      // RLS preamble
      if (s.startsWith('SELECT SET_CONFIG')) {
        return { rows: [] };
      }

      // uniqueness check: SELECT id FROM object_definitions WHERE tenant_id AND api_name
      if (
        s.startsWith('SELECT ID FROM OBJECT_DEFINITIONS') &&
        s.includes('TENANT_ID') &&
        s.includes('API_NAME')
      ) {
        return { rows: [] };
      }

      // MAX(sort_order) FROM object_definitions
      if (s.includes('MAX(SORT_ORDER)') && s.includes('OBJECT_DEFINITIONS')) {
        return { rows: [{ max_sort_order: '0' }] };
      }

      // INSERT INTO object_definitions RETURNING *
      if (s.startsWith('INSERT INTO OBJECT_DEFINITIONS')) {
        return {
          rows: [
            {
              id: OBJECT_ID,
              tenant_id: TENANT_ID,
              api_name: 'custom_project',
              label: 'Custom Project',
              plural_label: 'Custom Projects',
              description: null,
              icon: null,
              is_system: false,
              sort_order: 1,
              owner_id: 'user-1',
              name_field_id: null,
              name_template: null,
              created_at: new Date(),
              updated_at: new Date(),
            },
          ],
        };
      }

      // INSERT INTO layout_definitions
      if (s.startsWith('INSERT INTO LAYOUT_DEFINITIONS')) {
        return { rows: [] };
      }

      // INSERT INTO object_permissions
      if (s.startsWith('INSERT INTO OBJECT_PERMISSIONS')) {
        return { rows: [] };
      }

      // listObjectDefinitions — SELECT with correlated subqueries
      if (
        s.startsWith('SELECT') &&
        s.includes('FROM OBJECT_DEFINITIONS AS OD')
      ) {
        return { rows: [] };
      }

      // SELECT * FROM object_definitions WHERE id = $1 AND tenant_id = $2
      if (
        s.startsWith('SELECT') &&
        s.includes('FROM OBJECT_DEFINITIONS') &&
        s.includes('WHERE ID =')
      ) {
        return {
          rows: [
            {
              id: OBJECT_ID,
              tenant_id: TENANT_ID,
              api_name: 'custom_project',
              label: 'Custom Project',
              plural_label: 'Custom Projects',
              description: null,
              icon: null,
              is_system: false,
              sort_order: 1,
              owner_id: 'user-1',
              name_field_id: null,
              name_template: null,
              created_at: new Date(),
              updated_at: new Date(),
            },
          ],
        };
      }

      // SELECT * FROM field_definitions WHERE object_id AND tenant_id
      if (
        s.startsWith('SELECT') &&
        s.includes('FROM FIELD_DEFINITIONS') &&
        s.includes('OBJECT_ID')
      ) {
        return { rows: [] };
      }

      // SELECT * FROM relationship_definitions WHERE (source OR target) AND tenant_id
      if (
        s.startsWith('SELECT') &&
        s.includes('FROM RELATIONSHIP_DEFINITIONS')
      ) {
        return { rows: [] };
      }

      // SELECT * FROM layout_definitions WHERE object_id AND tenant_id
      if (
        s.startsWith('SELECT') &&
        s.includes('FROM LAYOUT_DEFINITIONS') &&
        s.includes('OBJECT_ID')
      ) {
        return { rows: [] };
      }

      // UPDATE object_definitions ... RETURNING *
      if (s.startsWith('UPDATE OBJECT_DEFINITIONS')) {
        return {
          rows: [
            {
              id: OBJECT_ID,
              tenant_id: TENANT_ID,
              api_name: 'custom_project',
              label: 'Updated',
              plural_label: 'Custom Projects',
              description: null,
              icon: null,
              is_system: false,
              sort_order: 1,
              owner_id: 'user-1',
              name_field_id: null,
              name_template: null,
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

      // DELETE FROM object_definitions
      if (s.startsWith('DELETE FROM OBJECT_DEFINITIONS')) {
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
  createObjectDefinition,
  listObjectDefinitions,
  getObjectDefinitionById,
  updateObjectDefinition,
  deleteObjectDefinition,
  reorderObjectDefinitions,
} = await import('../objectDefinitionService.js');

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

const baseCreateParams = {
  apiName: 'custom_project',
  label: 'Custom Project',
  pluralLabel: 'Custom Projects',
  ownerId: 'user-1',
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('objectDefinitionService Kysely SQL — tenant_id defence-in-depth', () => {
  it('every data query on createObjectDefinition references tenant_id', async () => {
    await createObjectDefinition(TENANT_ID, baseCreateParams);

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

  it('every data query on listObjectDefinitions references tenant_id', async () => {
    await listObjectDefinitions(TENANT_ID);

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

  it('every data query on getObjectDefinitionById references tenant_id', async () => {
    await getObjectDefinitionById(TENANT_ID, OBJECT_ID);

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

  it('every data query on updateObjectDefinition references tenant_id', async () => {
    await updateObjectDefinition(TENANT_ID, OBJECT_ID, { label: 'New Label' });

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

  it('every data query on deleteObjectDefinition references tenant_id', async () => {
    await deleteObjectDefinition(TENANT_ID, OBJECT_ID);

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

  it('every data query on reorderObjectDefinitions references tenant_id', async () => {
    await reorderObjectDefinitions(TENANT_ID, [OBJECT_ID]);

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

describe('objectDefinitionService Kysely SQL — generated SQL shape', () => {
  it('createObjectDefinition INSERT carries all 12 columns with tenant_id as second bind', async () => {
    await createObjectDefinition(TENANT_ID, baseCreateParams);

    const inserts = dataQueries().filter((q) =>
      normalise(q.sql).startsWith('INSERT INTO OBJECT_DEFINITIONS'),
    );
    expect(inserts.length).toBe(1);
    // id, tenant_id, api_name, label, plural_label, description, icon,
    // is_system, sort_order, owner_id, created_at, updated_at
    expect(inserts[0]!.params.length).toBe(12);
    expect(inserts[0]!.params[1]).toBe(TENANT_ID);
    expect(inserts[0]!.params[2]).toBe('custom_project');
    expect(inserts[0]!.params[3]).toBe('Custom Project');
    expect(inserts[0]!.params[4]).toBe('Custom Projects');
  });

  it('createObjectDefinition INSERT into layout_definitions includes tenant_id (latent bug fix)', async () => {
    // Historical bug: the raw-pg implementation omitted tenant_id on the
    // layout_definitions insert, which would have failed the NOT NULL
    // constraint on a real database. The Kysely migration fixes this
    // and this assertion pins the fix.
    await createObjectDefinition(TENANT_ID, baseCreateParams);

    const layoutInserts = dataQueries().filter((q) =>
      normalise(q.sql).startsWith('INSERT INTO LAYOUT_DEFINITIONS'),
    );
    expect(layoutInserts.length).toBe(1);

    const s = normalise(layoutInserts[0]!.sql);
    expect(s).toContain('TENANT_ID');
    // Two rows × 8 columns each (id, tenant_id, object_id, name,
    // layout_type, is_default, created_at, updated_at).
    expect(layoutInserts[0]!.params.length).toBe(16);
    // tenant_id is the second bind of the first row
    expect(layoutInserts[0]!.params[1]).toBe(TENANT_ID);
    // tenant_id is the second bind of the second row (8 columns later)
    expect(layoutInserts[0]!.params[9]).toBe(TENANT_ID);
  });

  it('createObjectDefinition INSERT into object_permissions includes tenant_id (latent bug fix)', async () => {
    // Historical bug: the raw-pg implementation omitted tenant_id on the
    // object_permissions insert, same latent NOT NULL violation.
    await createObjectDefinition(TENANT_ID, baseCreateParams);

    const permInserts = dataQueries().filter((q) =>
      normalise(q.sql).startsWith('INSERT INTO OBJECT_PERMISSIONS'),
    );
    expect(permInserts.length).toBe(1);

    const s = normalise(permInserts[0]!.sql);
    expect(s).toContain('TENANT_ID');
    // Four rows × 8 columns each (id, tenant_id, object_id, role,
    // can_create, can_read, can_update, can_delete).
    expect(permInserts[0]!.params.length).toBe(32);
    // tenant_id is the second bind of each row
    for (let row = 0; row < 4; row++) {
      expect(permInserts[0]!.params[row * 8 + 1]).toBe(TENANT_ID);
    }
  });

  it('createObjectDefinition wraps the three INSERTs in a BEGIN/COMMIT transaction', async () => {
    await createObjectDefinition(TENANT_ID, baseCreateParams);

    // All three INSERTs (object_definitions, layout_definitions,
    // object_permissions) must run on the same transactional client.
    // Kysely emits lowercase "begin" / "commit" on the client.
    const byClient = new Map<
      string,
      { begin: boolean; commit: boolean; inserts: number }
    >();

    // Unique key per client — since runQuery captures a flat list we
    // look for BEGIN and COMMIT interleaved with the INSERTs across
    // the whole sequence. Simpler approach: assert the order of
    // begin → 3 inserts → commit appears somewhere in the captured
    // sequence.
    void byClient;

    const sequence = capturedQueries.map((q) => normalise(q.sql));
    const beginIdx = sequence.indexOf('BEGIN');
    const commitIdx = sequence.indexOf('COMMIT');
    expect(beginIdx).toBeGreaterThanOrEqual(0);
    expect(commitIdx).toBeGreaterThan(beginIdx);

    const inBetween = sequence.slice(beginIdx + 1, commitIdx);
    const insertCount = inBetween.filter(
      (s) =>
        s.startsWith('INSERT INTO OBJECT_DEFINITIONS') ||
        s.startsWith('INSERT INTO LAYOUT_DEFINITIONS') ||
        s.startsWith('INSERT INTO OBJECT_PERMISSIONS'),
    ).length;
    expect(insertCount).toBe(3);
  });

  it('listObjectDefinitions uses correlated subqueries aliased field_count and record_count', async () => {
    await listObjectDefinitions(TENANT_ID);

    const selects = dataQueries().filter((q) => {
      const s = normalise(q.sql);
      return s.startsWith('SELECT') && s.includes('FROM OBJECT_DEFINITIONS AS OD');
    });
    expect(selects.length).toBe(1);

    const s = normalise(selects[0]!.sql);
    expect(s).toContain('FROM OBJECT_DEFINITIONS AS OD');
    expect(s).toContain('FIELD_COUNT');
    expect(s).toContain('RECORD_COUNT');
    expect(s).toContain('FROM FIELD_DEFINITIONS');
    expect(s).toContain('FROM RECORDS');
    // Correlated subqueries reference tenant_id defence-in-depth
    // alongside RLS, both on the outer query and inside each subquery.
    expect(s.match(/TENANT_ID/g)!.length).toBeGreaterThanOrEqual(3);
    expect(s).toContain('ORDER BY OD.SORT_ORDER ASC');
  });

  it('getObjectDefinitionById issues one object lookup plus three parallel child queries', async () => {
    await getObjectDefinitionById(TENANT_ID, OBJECT_ID);

    const queries = dataQueries();

    const objectLookup = queries.filter((q) => {
      const s = normalise(q.sql);
      return (
        s.startsWith('SELECT') &&
        s.includes('FROM OBJECT_DEFINITIONS') &&
        s.includes('WHERE ID =') &&
        !s.includes('AS OD')
      );
    });
    expect(objectLookup.length).toBe(1);

    const fieldLookup = queries.filter((q) => {
      const s = normalise(q.sql);
      return (
        s.startsWith('SELECT') &&
        s.includes('FROM FIELD_DEFINITIONS') &&
        s.includes('OBJECT_ID =') &&
        s.includes('TENANT_ID =')
      );
    });
    expect(fieldLookup.length).toBe(1);

    const relationshipLookup = queries.filter((q) => {
      const s = normalise(q.sql);
      return (
        s.startsWith('SELECT') && s.includes('FROM RELATIONSHIP_DEFINITIONS')
      );
    });
    expect(relationshipLookup.length).toBe(1);
    // OR clause for source_object_id / target_object_id
    const relSql = normalise(relationshipLookup[0]!.sql);
    expect(relSql).toContain('SOURCE_OBJECT_ID');
    expect(relSql).toContain('TARGET_OBJECT_ID');
    expect(relSql).toContain('TENANT_ID');

    const layoutLookup = queries.filter((q) => {
      const s = normalise(q.sql);
      return (
        s.startsWith('SELECT') &&
        s.includes('FROM LAYOUT_DEFINITIONS') &&
        s.includes('OBJECT_ID =')
      );
    });
    expect(layoutLookup.length).toBe(1);
  });

  it('updateObjectDefinition with only label updates only the label and updated_at columns', async () => {
    await updateObjectDefinition(TENANT_ID, OBJECT_ID, { label: 'New Label' });

    const updates = dataQueries().filter((q) =>
      normalise(q.sql).startsWith('UPDATE OBJECT_DEFINITIONS SET'),
    );
    expect(updates.length).toBe(1);

    const s = normalise(updates[0]!.sql);
    expect(s).toContain('LABEL =');
    expect(s).toContain('UPDATED_AT =');
    expect(s).not.toContain('PLURAL_LABEL =');
    expect(s).not.toContain('DESCRIPTION =');
    expect(s).not.toContain('ICON =');
    // WHERE is scoped by id + tenant_id
    expect(s).toContain('WHERE');
    expect(s).toContain('ID =');
    expect(s).toContain('TENANT_ID =');
    // RETURNING used to avoid a follow-up SELECT
    expect(s).toContain('RETURNING');
  });

  it('updateObjectDefinition with no fields skips the UPDATE entirely', async () => {
    await updateObjectDefinition(TENANT_ID, OBJECT_ID, {});

    const updates = dataQueries().filter((q) =>
      normalise(q.sql).startsWith('UPDATE OBJECT_DEFINITIONS SET'),
    );
    expect(updates.length).toBe(0);
  });

  it('deleteObjectDefinition issues exactly one DELETE scoped by id + tenant_id', async () => {
    await deleteObjectDefinition(TENANT_ID, OBJECT_ID);

    const deletes = dataQueries().filter((q) =>
      normalise(q.sql).startsWith('DELETE FROM OBJECT_DEFINITIONS'),
    );
    expect(deletes.length).toBe(1);

    const s = normalise(deletes[0]!.sql);
    expect(s).toContain('WHERE');
    expect(s).toContain('ID =');
    expect(s).toContain('TENANT_ID =');
  });

  it('reorderObjectDefinitions issues one UPDATE per id scoped by tenant_id, wrapped in a transaction', async () => {
    await reorderObjectDefinitions(TENANT_ID, [OBJECT_ID, 'obj-test-002']);

    const updates = dataQueries().filter((q) =>
      normalise(q.sql).startsWith('UPDATE OBJECT_DEFINITIONS SET SORT_ORDER'),
    );
    expect(updates.length).toBe(2);

    for (const u of updates) {
      const s = normalise(u.sql);
      expect(s).toContain('SORT_ORDER =');
      expect(s).toContain('UPDATED_AT =');
      expect(s).toContain('ID =');
      expect(s).toContain('TENANT_ID =');
    }

    // Reorder must run inside a transaction so partial reorders roll back.
    const sequence = capturedQueries.map((q) => normalise(q.sql));
    expect(sequence).toContain('BEGIN');
    expect(sequence).toContain('COMMIT');
  });
});

describe('objectDefinitionService Kysely SQL — non-transactional paths', () => {
  it('listObjectDefinitions runs without opening an explicit transaction', async () => {
    await listObjectDefinitions(TENANT_ID);
    const sqls = capturedQueries.map((q) => normalise(q.sql));
    expect(sqls).not.toContain('BEGIN');
    expect(sqls).not.toContain('COMMIT');
  });

  it('getObjectDefinitionById runs without opening an explicit transaction', async () => {
    await getObjectDefinitionById(TENANT_ID, OBJECT_ID);
    const sqls = capturedQueries.map((q) => normalise(q.sql));
    expect(sqls).not.toContain('BEGIN');
    expect(sqls).not.toContain('COMMIT');
  });

  it('updateObjectDefinition runs without opening an explicit transaction', async () => {
    await updateObjectDefinition(TENANT_ID, OBJECT_ID, { label: 'Updated' });
    const sqls = capturedQueries.map((q) => normalise(q.sql));
    expect(sqls).not.toContain('BEGIN');
    expect(sqls).not.toContain('COMMIT');
  });

  it('deleteObjectDefinition runs without opening an explicit transaction', async () => {
    await deleteObjectDefinition(TENANT_ID, OBJECT_ID);
    const sqls = capturedQueries.map((q) => normalise(q.sql));
    expect(sqls).not.toContain('BEGIN');
    expect(sqls).not.toContain('COMMIT');
  });
});
