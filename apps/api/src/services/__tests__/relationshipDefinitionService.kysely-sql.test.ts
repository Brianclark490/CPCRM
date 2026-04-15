/**
 * Kysely SQL regression suite for relationshipDefinitionService.
 *
 * Complements `relationshipDefinitionService.test.ts` (behavioural
 * assertions) by asserting directly on the SQL Kysely emits for each
 * exported service function. It exists to:
 *
 *   1. Catch drift in the generated SQL as Kysely is upgraded or the
 *      service is refactored.
 *   2. Audit that every tenant-scoped query — including each branch of
 *      the `relationship_definitions ⋈ object_definitions` join — carries
 *      a `tenant_id` filter as defence-in-depth against an RLS
 *      misconfiguration (ADR-006).
 *
 * No real Postgres — the pg pool is mocked and captures every compiled
 * SQL string Kysely hands down.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const TENANT_ID = 'sql-tenant-001';
const SOURCE_OBJECT_ID = 'obj-source-001';
const TARGET_OBJECT_ID = 'obj-target-001';
const RELATIONSHIP_ID = 'rel-test-001';

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

      // Source/target object existence check:
      // SELECT id FROM object_definitions WHERE id = $1 AND tenant_id = $2
      if (
        s.startsWith('SELECT ID FROM OBJECT_DEFINITIONS') &&
        s.includes('WHERE ID =') &&
        s.includes('TENANT_ID')
      ) {
        return { rows: [{ id: params?.[0] ?? SOURCE_OBJECT_ID }] };
      }

      // Uniqueness check: SELECT id FROM relationship_definitions WHERE ... api_name ...
      if (
        s.startsWith('SELECT ID FROM RELATIONSHIP_DEFINITIONS') &&
        s.includes('API_NAME')
      ) {
        return { rows: [] };
      }

      // INSERT INTO relationship_definitions RETURNING *
      if (s.startsWith('INSERT INTO RELATIONSHIP_DEFINITIONS')) {
        return {
          rows: [
            {
              id: RELATIONSHIP_ID,
              tenant_id: TENANT_ID,
              source_object_id: SOURCE_OBJECT_ID,
              target_object_id: TARGET_OBJECT_ID,
              relationship_type: 'lookup',
              api_name: 'opportunity_account',
              label: 'Opportunity',
              reverse_label: null,
              required: false,
              created_at: new Date(),
            },
          ],
        };
      }

      // listRelationshipDefinitions — SELECT ... FROM relationship_definitions AS rd
      // INNER JOIN object_definitions AS src / tgt
      // (no WHERE RD.ID = — distinguishes list from delete lookup)
      if (
        s.startsWith('SELECT') &&
        s.includes('FROM RELATIONSHIP_DEFINITIONS AS RD') &&
        !s.includes('WHERE RD.ID =') &&
        !s.includes('RD.ID = ')
      ) {
        return { rows: [] };
      }

      // deleteRelationshipDefinition lookup — SELECT with join AND WHERE rd.id = $1
      if (
        s.startsWith('SELECT') &&
        s.includes('FROM RELATIONSHIP_DEFINITIONS AS RD') &&
        (s.includes('WHERE RD.ID =') || s.includes('RD.ID ='))
      ) {
        return {
          rows: [
            {
              id: RELATIONSHIP_ID,
              source_is_system: false,
              target_is_system: false,
            },
          ],
        };
      }

      // DELETE FROM relationship_definitions
      if (s.startsWith('DELETE FROM RELATIONSHIP_DEFINITIONS')) {
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
  createRelationshipDefinition,
  listRelationshipDefinitions,
  deleteRelationshipDefinition,
} = await import('../relationshipDefinitionService.js');

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
  sourceObjectId: SOURCE_OBJECT_ID,
  targetObjectId: TARGET_OBJECT_ID,
  relationshipType: 'lookup',
  apiName: 'opportunity_account',
  label: 'Account',
  reverseLabel: 'Opportunities',
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('relationshipDefinitionService Kysely SQL — tenant_id defence-in-depth', () => {
  it('every data query on createRelationshipDefinition references tenant_id', async () => {
    await createRelationshipDefinition(TENANT_ID, baseCreateParams);

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

  it('every data query on listRelationshipDefinitions references tenant_id', async () => {
    await listRelationshipDefinitions(TENANT_ID, SOURCE_OBJECT_ID);

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

  it('every data query on deleteRelationshipDefinition references tenant_id', async () => {
    await deleteRelationshipDefinition(TENANT_ID, RELATIONSHIP_ID);

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

  it('listRelationshipDefinitions binds tenant_id in both JOIN ON clauses and the outer WHERE', async () => {
    await listRelationshipDefinitions(TENANT_ID, SOURCE_OBJECT_ID);

    const selects = dataQueries().filter((q) => {
      const s = normalise(q.sql);
      return (
        s.startsWith('SELECT') && s.includes('FROM RELATIONSHIP_DEFINITIONS AS RD')
      );
    });
    expect(selects.length).toBe(1);

    // src join, tgt join, and outer WHERE each bind tenant_id — 3 copies.
    const tenantBindCount = selects[0]!.params.filter(
      (p) => p === TENANT_ID,
    ).length;
    expect(tenantBindCount).toBe(3);
  });

  it('deleteRelationshipDefinition lookup binds tenant_id in both JOIN ON clauses and the outer WHERE', async () => {
    await deleteRelationshipDefinition(TENANT_ID, RELATIONSHIP_ID);

    const lookups = dataQueries().filter((q) => {
      const s = normalise(q.sql);
      return (
        s.startsWith('SELECT') &&
        s.includes('FROM RELATIONSHIP_DEFINITIONS AS RD') &&
        (s.includes('WHERE RD.ID =') || s.includes('RD.ID ='))
      );
    });
    expect(lookups.length).toBe(1);

    const tenantBindCount = lookups[0]!.params.filter(
      (p) => p === TENANT_ID,
    ).length;
    expect(tenantBindCount).toBe(3);
  });
});

describe('relationshipDefinitionService Kysely SQL — generated SQL shape', () => {
  it('createRelationshipDefinition INSERT carries all 10 columns with tenant_id as second bind', async () => {
    await createRelationshipDefinition(TENANT_ID, baseCreateParams);

    const inserts = dataQueries().filter((q) =>
      normalise(q.sql).startsWith('INSERT INTO RELATIONSHIP_DEFINITIONS'),
    );
    expect(inserts.length).toBe(1);
    // id, tenant_id, source_object_id, target_object_id, relationship_type,
    // api_name, label, reverse_label, required, created_at
    expect(inserts[0]!.params.length).toBe(10);
    expect(inserts[0]!.params[1]).toBe(TENANT_ID);
    expect(inserts[0]!.params[2]).toBe(SOURCE_OBJECT_ID);
    expect(inserts[0]!.params[3]).toBe(TARGET_OBJECT_ID);
    expect(inserts[0]!.params[4]).toBe('lookup');
    expect(inserts[0]!.params[5]).toBe('opportunity_account');
    expect(inserts[0]!.params[6]).toBe('Account');
  });

  it('createRelationshipDefinition validates source and target object existence before the INSERT', async () => {
    await createRelationshipDefinition(TENANT_ID, baseCreateParams);

    const objectLookups = dataQueries().filter((q) => {
      const s = normalise(q.sql);
      return (
        s.startsWith('SELECT ID FROM OBJECT_DEFINITIONS') &&
        s.includes('WHERE ID =')
      );
    });
    // One lookup for source, one for target.
    expect(objectLookups.length).toBe(2);
    for (const q of objectLookups) {
      const s = normalise(q.sql);
      expect(s).toContain('TENANT_ID');
    }
  });

  it('createRelationshipDefinition checks api_name uniqueness scoped by source_object_id + tenant_id', async () => {
    await createRelationshipDefinition(TENANT_ID, baseCreateParams);

    const uniqueChecks = dataQueries().filter((q) => {
      const s = normalise(q.sql);
      return (
        s.startsWith('SELECT ID FROM RELATIONSHIP_DEFINITIONS') &&
        s.includes('API_NAME')
      );
    });
    expect(uniqueChecks.length).toBe(1);

    const s = normalise(uniqueChecks[0]!.sql);
    expect(s).toContain('SOURCE_OBJECT_ID =');
    expect(s).toContain('API_NAME =');
    expect(s).toContain('TENANT_ID =');
  });

  it('listRelationshipDefinitions uses aliased INNER JOINs on object_definitions for source and target', async () => {
    await listRelationshipDefinitions(TENANT_ID, SOURCE_OBJECT_ID);

    const selects = dataQueries().filter((q) => {
      const s = normalise(q.sql);
      return (
        s.startsWith('SELECT') && s.includes('FROM RELATIONSHIP_DEFINITIONS AS RD')
      );
    });
    expect(selects.length).toBe(1);

    const s = normalise(selects[0]!.sql);
    expect(s).toContain('FROM RELATIONSHIP_DEFINITIONS AS RD');
    expect(s).toContain('INNER JOIN OBJECT_DEFINITIONS AS SRC');
    expect(s).toContain('INNER JOIN OBJECT_DEFINITIONS AS TGT');
    // Aliased label/plural_label columns surface to UI
    expect(s).toContain('SOURCE_OBJECT_API_NAME');
    expect(s).toContain('SOURCE_OBJECT_LABEL');
    expect(s).toContain('SOURCE_OBJECT_PLURAL_LABEL');
    expect(s).toContain('TARGET_OBJECT_API_NAME');
    expect(s).toContain('TARGET_OBJECT_LABEL');
    expect(s).toContain('TARGET_OBJECT_PLURAL_LABEL');
    // Bidirectional match: object appears as either source or target
    expect(s).toContain('RD.SOURCE_OBJECT_ID =');
    expect(s).toContain('RD.TARGET_OBJECT_ID =');
    expect(s).toContain('ORDER BY RD.CREATED_AT ASC');
  });

  it('listRelationshipDefinitions performs the caller-object existence check against object_definitions', async () => {
    await listRelationshipDefinitions(TENANT_ID, SOURCE_OBJECT_ID);

    const existenceCheck = dataQueries().filter((q) => {
      const s = normalise(q.sql);
      return (
        s.startsWith('SELECT ID FROM OBJECT_DEFINITIONS') &&
        s.includes('WHERE ID =')
      );
    });
    expect(existenceCheck.length).toBe(1);
    const s = normalise(existenceCheck[0]!.sql);
    expect(s).toContain('TENANT_ID');
  });

  it('deleteRelationshipDefinition lookup selects is_system flags from both joined objects', async () => {
    await deleteRelationshipDefinition(TENANT_ID, RELATIONSHIP_ID);

    const lookups = dataQueries().filter((q) => {
      const s = normalise(q.sql);
      return (
        s.startsWith('SELECT') &&
        s.includes('FROM RELATIONSHIP_DEFINITIONS AS RD') &&
        (s.includes('WHERE RD.ID =') || s.includes('RD.ID ='))
      );
    });
    expect(lookups.length).toBe(1);

    const s = normalise(lookups[0]!.sql);
    expect(s).toContain('INNER JOIN OBJECT_DEFINITIONS AS SRC');
    expect(s).toContain('INNER JOIN OBJECT_DEFINITIONS AS TGT');
    expect(s).toContain('SOURCE_IS_SYSTEM');
    expect(s).toContain('TARGET_IS_SYSTEM');
  });

  it('deleteRelationshipDefinition issues exactly one DELETE scoped by id + tenant_id', async () => {
    await deleteRelationshipDefinition(TENANT_ID, RELATIONSHIP_ID);

    const deletes = dataQueries().filter((q) =>
      normalise(q.sql).startsWith('DELETE FROM RELATIONSHIP_DEFINITIONS'),
    );
    expect(deletes.length).toBe(1);

    const s = normalise(deletes[0]!.sql);
    expect(s).toContain('WHERE');
    expect(s).toContain('ID =');
    expect(s).toContain('TENANT_ID =');
  });
});

describe('relationshipDefinitionService Kysely SQL — non-transactional paths', () => {
  it('createRelationshipDefinition runs without opening an explicit transaction', async () => {
    await createRelationshipDefinition(TENANT_ID, baseCreateParams);
    const sqls = capturedQueries.map((q) => normalise(q.sql));
    expect(sqls).not.toContain('BEGIN');
    expect(sqls).not.toContain('COMMIT');
  });

  it('listRelationshipDefinitions runs without opening an explicit transaction', async () => {
    await listRelationshipDefinitions(TENANT_ID, SOURCE_OBJECT_ID);
    const sqls = capturedQueries.map((q) => normalise(q.sql));
    expect(sqls).not.toContain('BEGIN');
    expect(sqls).not.toContain('COMMIT');
  });

  it('deleteRelationshipDefinition runs without opening an explicit transaction', async () => {
    await deleteRelationshipDefinition(TENANT_ID, RELATIONSHIP_ID);
    const sqls = capturedQueries.map((q) => normalise(q.sql));
    expect(sqls).not.toContain('BEGIN');
    expect(sqls).not.toContain('COMMIT');
  });
});
