/**
 * Kysely SQL regression suite for recordRelationshipService.
 *
 * Complements `recordRelationshipService.test.ts` (behavioural
 * assertions) by asserting directly on the SQL Kysely emits for each
 * exported service function. It exists to:
 *
 *   1. Catch drift in the generated SQL as Kysely is upgraded or the
 *      service is refactored.
 *   2. Audit that every tenant-scoped query — including each branch of
 *      the UNION in getRelatedRecords and both sides of the
 *      `record_relationships ⋈ records` join — carries a `tenant_id`
 *      filter as defence-in-depth against an RLS misconfiguration
 *      (ADR-006).
 *   3. Pin the latent duplicate-check / parent-check / related-records
 *      tenant_id fixes so a future refactor doesn't reintroduce the
 *      defence-in-depth gap.
 *
 * No real Postgres — the pg pool is mocked and captures every compiled
 * SQL string Kysely hands down.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const TENANT_ID = 'sql-tenant-001';
const SOURCE_RECORD_ID = 'rec-source-001';
const TARGET_RECORD_ID = 'rec-target-001';
const RELATIONSHIP_ID = 'rel-test-001';
const LINK_ID = 'link-test-001';
const SOURCE_OBJECT_ID = 'obj-source-001';
const TARGET_OBJECT_ID = 'obj-target-001';

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

      // Transaction control + RLS preamble
      if (s === 'BEGIN' || s === 'COMMIT' || s === 'ROLLBACK') {
        return { rows: [] };
      }
      if (s.startsWith('SELECT SET_CONFIG')) {
        return { rows: [] };
      }

      // getRelatedRecords count wrapping the UNION subquery
      if (s.includes('COUNT(*)') && s.includes('AS RELATED')) {
        return { rows: [{ total: '0' }] };
      }
      // getRelatedRecords data wrapping the UNION subquery
      if (s.includes('FROM RELATED') || s.includes('AS RELATED')) {
        return { rows: [] };
      }

      // linkRecords — SELECT id, object_id FROM records WHERE id = $1 AND tenant_id = $2
      if (
        s.startsWith('SELECT') &&
        s.includes('FROM RECORDS') &&
        s.includes('OBJECT_ID') &&
        s.includes('WHERE ID =') &&
        !s.includes('FROM RELATIONSHIP_DEFINITIONS')
      ) {
        return {
          rows: [
            {
              id: params?.[0] ?? SOURCE_RECORD_ID,
              object_id:
                params?.[0] === TARGET_RECORD_ID
                  ? TARGET_OBJECT_ID
                  : SOURCE_OBJECT_ID,
            },
          ],
        };
      }

      // unlinkRecords — SELECT id FROM records WHERE id = $1 AND tenant_id = $2
      if (
        s.startsWith('SELECT ID FROM RECORDS') &&
        !s.includes('OBJECT_ID')
      ) {
        return { rows: [{ id: params?.[0] ?? SOURCE_RECORD_ID }] };
      }

      // linkRecords — SELECT * FROM relationship_definitions WHERE id = $1 AND tenant_id = $2
      if (
        s.startsWith('SELECT') &&
        s.includes('FROM RELATIONSHIP_DEFINITIONS') &&
        s.includes('WHERE ID =')
      ) {
        return {
          rows: [
            {
              id: RELATIONSHIP_ID,
              tenant_id: TENANT_ID,
              source_object_id: SOURCE_OBJECT_ID,
              target_object_id: TARGET_OBJECT_ID,
              relationship_type: 'lookup',
              api_name: 'opportunity_account',
              label: 'Account',
              reverse_label: null,
              required: false,
              created_at: new Date(),
            },
          ],
        };
      }

      // linkRecords duplicate check — SELECT id FROM record_relationships WHERE
      //   relationship_id AND source_record_id AND target_record_id AND tenant_id
      if (
        s.startsWith('SELECT') &&
        s.includes('FROM RECORD_RELATIONSHIPS') &&
        s.includes('RELATIONSHIP_ID =') &&
        s.includes('SOURCE_RECORD_ID =') &&
        s.includes('TARGET_RECORD_ID =')
      ) {
        return { rows: [] };
      }

      // linkRecords parent check — SELECT id FROM record_relationships WHERE
      //   relationship_id AND source_record_id AND tenant_id (no target)
      if (
        s.startsWith('SELECT') &&
        s.includes('FROM RECORD_RELATIONSHIPS') &&
        s.includes('RELATIONSHIP_ID =') &&
        s.includes('SOURCE_RECORD_ID =') &&
        !s.includes('TARGET_RECORD_ID')
      ) {
        return { rows: [] };
      }

      // unlinkRecords lookup — SELECT id FROM record_relationships WHERE
      //   id AND tenant_id AND (source = $ OR target = $)
      if (
        s.startsWith('SELECT') &&
        s.includes('FROM RECORD_RELATIONSHIPS') &&
        s.includes('ID =') &&
        s.includes('SOURCE_RECORD_ID =') &&
        s.includes('TARGET_RECORD_ID =')
      ) {
        return { rows: [{ id: LINK_ID }] };
      }

      // INSERT INTO record_relationships
      if (s.startsWith('INSERT INTO RECORD_RELATIONSHIPS')) {
        return {
          rows: [
            {
              id: LINK_ID,
              tenant_id: TENANT_ID,
              relationship_id: RELATIONSHIP_ID,
              source_record_id: SOURCE_RECORD_ID,
              target_record_id: TARGET_RECORD_ID,
              created_at: new Date(),
            },
          ],
        };
      }

      // DELETE FROM record_relationships
      if (s.startsWith('DELETE FROM RECORD_RELATIONSHIPS')) {
        return { rows: [] };
      }

      // getRelatedRecords — resolve object type
      if (
        s.startsWith('SELECT') &&
        s.includes('FROM OBJECT_DEFINITIONS') &&
        s.includes('API_NAME =')
      ) {
        return { rows: [{ id: TARGET_OBJECT_ID }] };
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

const { linkRecords, unlinkRecords, getRelatedRecords } = await import(
  '../recordRelationshipService.js'
);

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

describe('recordRelationshipService Kysely SQL — tenant_id defence-in-depth', () => {
  it('every data query on linkRecords references tenant_id', async () => {
    await linkRecords(
      TENANT_ID,
      SOURCE_RECORD_ID,
      RELATIONSHIP_ID,
      TARGET_RECORD_ID,
      'user-123',
    );

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

  it('every data query on unlinkRecords references tenant_id', async () => {
    await unlinkRecords(TENANT_ID, SOURCE_RECORD_ID, LINK_ID, 'user-123');

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

  it('every data query on getRelatedRecords references tenant_id', async () => {
    await getRelatedRecords(
      TENANT_ID,
      SOURCE_RECORD_ID,
      'account',
      'user-123',
      20,
      0,
    );

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

  it('linkRecords duplicate check binds tenant_id (latent bug fix)', async () => {
    // Historical bug: the raw-pg implementation omitted tenant_id on
    // the duplicate-link check, leaving it reliant on RLS alone. The
    // Kysely migration adds tenant_id as defence-in-depth and this
    // assertion pins the fix.
    await linkRecords(
      TENANT_ID,
      SOURCE_RECORD_ID,
      RELATIONSHIP_ID,
      TARGET_RECORD_ID,
      'user-123',
    );

    const duplicateChecks = dataQueries().filter((q) => {
      const s = normalise(q.sql);
      return (
        s.startsWith('SELECT') &&
        s.includes('FROM RECORD_RELATIONSHIPS') &&
        s.includes('RELATIONSHIP_ID =') &&
        s.includes('SOURCE_RECORD_ID =') &&
        s.includes('TARGET_RECORD_ID =')
      );
    });
    expect(duplicateChecks.length).toBe(1);

    const s = normalise(duplicateChecks[0]!.sql);
    expect(s).toContain('TENANT_ID =');
    expect(duplicateChecks[0]!.params).toContain(TENANT_ID);
  });

  it('getRelatedRecords UNION subquery binds tenant_id on both rr and r in both branches (latent bug fix)', async () => {
    // Historical bug: the raw-pg UNION query omitted tenant_id on both
    // the record_relationships join table and the records table in
    // both halves of the UNION. The Kysely migration adds tenant_id
    // defence-in-depth to all four positions.
    await getRelatedRecords(
      TENANT_ID,
      SOURCE_RECORD_ID,
      'account',
      'user-123',
      20,
      0,
    );

    const unionQueries = dataQueries().filter((q) => {
      const s = normalise(q.sql);
      return (
        s.includes('FROM RECORD_RELATIONSHIPS AS RR') &&
        s.includes('INNER JOIN RECORDS AS R') &&
        s.includes('UNION')
      );
    });
    // Both the count query and the data query wrap the same UNION.
    expect(unionQueries.length).toBeGreaterThanOrEqual(2);

    for (const q of unionQueries) {
      const s = normalise(q.sql);
      // tenant_id appears at least 4 times — rr + r on each side of
      // the union.
      const tenantMatches = s.match(/TENANT_ID/g) ?? [];
      expect(
        tenantMatches.length,
        `Expected ≥4 TENANT_ID references in union query:\n  ${q.sql}`,
      ).toBeGreaterThanOrEqual(4);

      // And the params bind TENANT_ID at least 4 times.
      const tenantBindCount = q.params.filter((p) => p === TENANT_ID).length;
      expect(tenantBindCount).toBeGreaterThanOrEqual(4);
    }
  });
});

describe('recordRelationshipService Kysely SQL — generated SQL shape', () => {
  it('linkRecords INSERT carries all 6 columns with tenant_id as second bind', async () => {
    await linkRecords(
      TENANT_ID,
      SOURCE_RECORD_ID,
      RELATIONSHIP_ID,
      TARGET_RECORD_ID,
      'user-123',
    );

    const inserts = dataQueries().filter((q) =>
      normalise(q.sql).startsWith('INSERT INTO RECORD_RELATIONSHIPS'),
    );
    expect(inserts.length).toBe(1);
    // id, tenant_id, relationship_id, source_record_id, target_record_id, created_at
    expect(inserts[0]!.params.length).toBe(6);
    expect(inserts[0]!.params[1]).toBe(TENANT_ID);
    expect(inserts[0]!.params[2]).toBe(RELATIONSHIP_ID);
    expect(inserts[0]!.params[3]).toBe(SOURCE_RECORD_ID);
    expect(inserts[0]!.params[4]).toBe(TARGET_RECORD_ID);
  });

  it('linkRecords validates both records and the relationship definition before the INSERT', async () => {
    await linkRecords(
      TENANT_ID,
      SOURCE_RECORD_ID,
      RELATIONSHIP_ID,
      TARGET_RECORD_ID,
      'user-123',
    );

    const recordLookups = dataQueries().filter((q) => {
      const s = normalise(q.sql);
      return (
        s.startsWith('SELECT') &&
        s.includes('FROM RECORDS') &&
        s.includes('OBJECT_ID') &&
        s.includes('WHERE ID =')
      );
    });
    // One for source, one for target.
    expect(recordLookups.length).toBe(2);

    const relDefLookups = dataQueries().filter((q) => {
      const s = normalise(q.sql);
      return (
        s.startsWith('SELECT') &&
        s.includes('FROM RELATIONSHIP_DEFINITIONS') &&
        s.includes('WHERE ID =')
      );
    });
    expect(relDefLookups.length).toBe(1);
  });

  it('unlinkRecords lookup uses (source_record_id = $ OR target_record_id = $) disjunction and scopes by tenant_id', async () => {
    await unlinkRecords(TENANT_ID, SOURCE_RECORD_ID, LINK_ID, 'user-123');

    const lookups = dataQueries().filter((q) => {
      const s = normalise(q.sql);
      return (
        s.startsWith('SELECT') &&
        s.includes('FROM RECORD_RELATIONSHIPS') &&
        s.includes('SOURCE_RECORD_ID =') &&
        s.includes('TARGET_RECORD_ID =')
      );
    });
    expect(lookups.length).toBe(1);

    const s = normalise(lookups[0]!.sql);
    expect(s).toContain('WHERE');
    expect(s).toContain('ID =');
    expect(s).toContain('TENANT_ID =');
    expect(s).toContain('OR');
  });

  it('unlinkRecords issues exactly one DELETE scoped by id + tenant_id', async () => {
    await unlinkRecords(TENANT_ID, SOURCE_RECORD_ID, LINK_ID, 'user-123');

    const deletes = dataQueries().filter((q) =>
      normalise(q.sql).startsWith('DELETE FROM RECORD_RELATIONSHIPS'),
    );
    expect(deletes.length).toBe(1);

    const s = normalise(deletes[0]!.sql);
    expect(s).toContain('WHERE');
    expect(s).toContain('ID =');
    expect(s).toContain('TENANT_ID =');
  });

  it('getRelatedRecords emits both a COUNT(*) query and a paginated data query over the union alias', async () => {
    await getRelatedRecords(
      TENANT_ID,
      SOURCE_RECORD_ID,
      'account',
      'user-123',
      20,
      5,
    );

    const countQueries = dataQueries().filter((q) => {
      const s = normalise(q.sql);
      return s.includes('COUNT(*)') && s.includes('AS RELATED');
    });
    expect(countQueries.length).toBe(1);

    const dataPage = dataQueries().filter((q) => {
      const s = normalise(q.sql);
      return (
        s.includes('AS RELATED') &&
        s.includes('LIMIT') &&
        s.includes('OFFSET')
      );
    });
    expect(dataPage.length).toBe(1);

    const pageSql = normalise(dataPage[0]!.sql);
    expect(pageSql).toContain('ORDER BY CREATED_AT DESC');
    // Both halves of the UNION project the same 5 columns.
    expect(pageSql.match(/R\.ID/g)!.length).toBeGreaterThanOrEqual(2);
    expect(pageSql.match(/R\.NAME/g)!.length).toBeGreaterThanOrEqual(2);
    expect(pageSql.match(/R\.FIELD_VALUES/g)!.length).toBeGreaterThanOrEqual(2);
    expect(pageSql.match(/R\.CREATED_AT/g)!.length).toBeGreaterThanOrEqual(2);
    expect(pageSql.match(/R\.UPDATED_AT/g)!.length).toBeGreaterThanOrEqual(2);
    expect(pageSql).toContain('UNION');

    // The LIMIT/OFFSET binds should be at the tail of the params.
    const p = dataPage[0]!.params;
    expect(p).toContain(20);
    expect(p).toContain(5);
  });
});

describe('recordRelationshipService Kysely SQL — non-transactional paths', () => {
  it('linkRecords runs without opening an explicit transaction', async () => {
    await linkRecords(
      TENANT_ID,
      SOURCE_RECORD_ID,
      RELATIONSHIP_ID,
      TARGET_RECORD_ID,
      'user-123',
    );
    const sqls = capturedQueries.map((q) => normalise(q.sql));
    expect(sqls).not.toContain('BEGIN');
    expect(sqls).not.toContain('COMMIT');
  });

  it('unlinkRecords runs without opening an explicit transaction', async () => {
    await unlinkRecords(TENANT_ID, SOURCE_RECORD_ID, LINK_ID, 'user-123');
    const sqls = capturedQueries.map((q) => normalise(q.sql));
    expect(sqls).not.toContain('BEGIN');
    expect(sqls).not.toContain('COMMIT');
  });

  it('getRelatedRecords runs without opening an explicit transaction', async () => {
    await getRelatedRecords(
      TENANT_ID,
      SOURCE_RECORD_ID,
      'account',
      'user-123',
      20,
      0,
    );
    const sqls = capturedQueries.map((q) => normalise(q.sql));
    expect(sqls).not.toContain('BEGIN');
    expect(sqls).not.toContain('COMMIT');
  });
});
