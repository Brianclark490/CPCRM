/**
 * Kysely SQL regression suite for organisationService.
 *
 * Complements `organisationService.test.ts` (behavioural assertions) by
 * asserting directly on the SQL Kysely emits for `provisionOrganisation`.
 * It exists to:
 *
 *   1. Catch drift in the generated SQL as Kysely is upgraded or the
 *      service is refactored.
 *   2. Audit that every tenant-scoped query carries a `tenant_id` bind
 *      as defence-in-depth against an RLS misconfiguration (ADR-006).
 *
 * No real Postgres — the pg pool is mocked and captures every compiled
 * SQL string Kysely hands down.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const TENANT_ID = 'sql-tenant-001';
const USER_ID = 'user-sql-001';

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

      if (s === 'BEGIN' || s === 'COMMIT' || s === 'ROLLBACK') {
        return { rows: [] };
      }
      if (s.startsWith('SELECT SET_CONFIG')) {
        return { rows: [] };
      }

      // INSERT INTO organisations RETURNING *
      if (s.startsWith('INSERT INTO ORGANISATIONS')) {
        const [id, tenant_id, name, description, created_at, updated_at] =
          params as unknown[];
        return {
          rows: [
            {
              id,
              tenant_id,
              name,
              description: description ?? null,
              created_at,
              updated_at,
            },
          ],
        };
      }

      // INSERT INTO tenant_memberships RETURNING *
      if (s.startsWith('INSERT INTO TENANT_MEMBERSHIPS')) {
        const [id, tenant_id, user_id, organisation_id, role, created_at, updated_at] =
          params as unknown[];
        return {
          rows: [
            {
              id,
              tenant_id,
              user_id,
              organisation_id,
              role,
              created_at,
              updated_at,
            },
          ],
        };
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

const { provisionOrganisation } = await import('../organisationService.js');

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

const baseParams = {
  name: 'Acme Corp',
  description: 'Primary organisation',
  tenantId: TENANT_ID,
  requestingUserId: USER_ID,
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('organisationService Kysely SQL — tenant_id defence-in-depth', () => {
  it('every data query on provisionOrganisation references tenant_id', async () => {
    await provisionOrganisation(baseParams);

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

  it('both INSERT statements bind the tenant_id from the authenticated session', async () => {
    await provisionOrganisation(baseParams);

    const inserts = dataQueries().filter((q) =>
      normalise(q.sql).startsWith('INSERT INTO'),
    );
    expect(inserts.length).toBe(2);
    for (const q of inserts) {
      expect(q.params).toContain(TENANT_ID);
    }
  });
});

describe('organisationService Kysely SQL — generated SQL shape', () => {
  it('provisionOrganisation emits INSERT INTO organisations with 6 bound columns', async () => {
    await provisionOrganisation(baseParams);

    const orgInserts = dataQueries().filter((q) =>
      normalise(q.sql).startsWith('INSERT INTO ORGANISATIONS'),
    );
    expect(orgInserts.length).toBe(1);

    // Column order: id, tenant_id, name, description, created_at, updated_at.
    expect(orgInserts[0]!.params.length).toBe(6);
    expect(orgInserts[0]!.params[1]).toBe(TENANT_ID);
    expect(orgInserts[0]!.params[2]).toBe('Acme Corp');
    expect(orgInserts[0]!.params[3]).toBe('Primary organisation');

    const s = normalise(orgInserts[0]!.sql);
    expect(s).toContain('RETURNING');
  });

  it('provisionOrganisation emits INSERT INTO tenant_memberships with role="owner"', async () => {
    await provisionOrganisation(baseParams);

    const memberInserts = dataQueries().filter((q) =>
      normalise(q.sql).startsWith('INSERT INTO TENANT_MEMBERSHIPS'),
    );
    expect(memberInserts.length).toBe(1);

    // Column order: id, tenant_id, user_id, organisation_id, role, created_at, updated_at.
    expect(memberInserts[0]!.params.length).toBe(7);
    expect(memberInserts[0]!.params[1]).toBe(TENANT_ID);
    expect(memberInserts[0]!.params[2]).toBe(USER_ID);
    expect(memberInserts[0]!.params[4]).toBe('owner');

    const s = normalise(memberInserts[0]!.sql);
    expect(s).toContain('RETURNING');
  });

  it('membership insert points at the freshly-created organisation id', async () => {
    const result = await provisionOrganisation(baseParams);

    const memberInserts = dataQueries().filter((q) =>
      normalise(q.sql).startsWith('INSERT INTO TENANT_MEMBERSHIPS'),
    );
    expect(memberInserts[0]!.params[3]).toBe(result.organisation.id);
  });

  it('persists description=null when not provided (not empty string or "undefined")', async () => {
    await provisionOrganisation({
      name: 'No Desc Org',
      tenantId: TENANT_ID,
      requestingUserId: USER_ID,
    });

    const orgInserts = dataQueries().filter((q) =>
      normalise(q.sql).startsWith('INSERT INTO ORGANISATIONS'),
    );
    expect(orgInserts[0]!.params[3]).toBeNull();
  });
});

describe('organisationService Kysely SQL — non-transactional path', () => {
  it('provisionOrganisation runs without opening an explicit transaction', async () => {
    await provisionOrganisation(baseParams);
    const sqls = capturedQueries.map((q) => normalise(q.sql));
    expect(sqls).not.toContain('BEGIN');
    expect(sqls).not.toContain('COMMIT');
  });
});
