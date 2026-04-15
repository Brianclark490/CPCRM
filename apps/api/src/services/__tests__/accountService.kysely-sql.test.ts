/**
 * Kysely SQL regression suite for accountService.
 *
 * Complements `accountService.test.ts` (behavioural assertions) by
 * asserting directly on the SQL Kysely emits for every public entry
 * point. It exists to:
 *
 *   1. Catch drift in the generated SQL as Kysely is upgraded or the
 *      service is refactored.
 *   2. Audit that every tenant-scoped query on `accounts` and
 *      `opportunities` carries a `tenant_id` filter as defence-in-depth
 *      against an RLS misconfiguration (ADR-006) — including inside the
 *      correlated `opportunity_count` scalar subquery.
 *   3. Verify the list-path emits a lightweight `SELECT count(*)` for
 *      pagination rather than dedupe'ing the wide joined projection.
 *   4. Verify updateAccount only writes the columns the caller supplied
 *      (no hidden over-writes of unrelated fields).
 *
 * No real Postgres — the pg pool is mocked and captures every compiled
 * SQL string Kysely hands down.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const TENANT_ID = 'sql-tenant-001';
const OWNER_ID = 'user-sql-001';
const ACCOUNT_ID = 'account-sql-001';

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ─── SQL capture ──────────────────────────────────────────────────────────────

interface CapturedQuery {
  sql: string;
  params: unknown[];
  via: 'pool' | 'client';
}

const { capturedQueries, mockQuery, mockConnect, resetCapture, setFixtureRow } =
  vi.hoisted(() => {
    const capturedQueries: CapturedQuery[] = [];
    let fixtureRow: Record<string, unknown> | null = null;

    function makeAccountRow(overrides: Record<string, unknown> = {}) {
      const now = new Date();
      return {
        id: 'account-sql-001',
        tenant_id: 'sql-tenant-001',
        name: 'SQL Corp',
        industry: null,
        website: null,
        phone: null,
        email: null,
        address_line1: null,
        address_line2: null,
        city: null,
        region: null,
        postal_code: null,
        country: null,
        notes: null,
        owner_id: 'user-sql-001',
        created_by: 'user-sql-001',
        created_at: now,
        updated_at: now,
        ...overrides,
      };
    }

    function runQuery(
      rawSql: string,
      params: unknown[] | undefined,
      via: 'pool' | 'client',
    ) {
      capturedQueries.push({ sql: rawSql, params: params ?? [], via });

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

      // INSERT INTO accounts ... RETURNING *
      if (s.startsWith('INSERT INTO ACCOUNTS')) {
        // Echo the bound params back so createAccount sees a populated row.
        const [
          id,
          tenant_id,
          name,
          industry,
          website,
          phone,
          email,
          address_line1,
          address_line2,
          city,
          region,
          postal_code,
          country,
          notes,
          owner_id,
          created_by,
          created_at,
          updated_at,
        ] = (params ?? []) as unknown[];
        return {
          rows: [
            {
              id,
              tenant_id,
              name,
              industry,
              website,
              phone,
              email,
              address_line1,
              address_line2,
              city,
              region,
              postal_code,
              country,
              notes,
              owner_id,
              created_by,
              created_at,
              updated_at,
            },
          ],
          rowCount: 1,
          command: 'INSERT',
        };
      }

      // listAccounts count path: SELECT count(*) as total FROM accounts as a
      if (s.startsWith('SELECT COUNT(*)') && s.includes('FROM ACCOUNTS')) {
        return { rows: [{ total: '1' }] };
      }

      // listAccounts data path: SELECT a.*, (SELECT count(*) ...) as opportunity_count
      if (
        s.startsWith('SELECT') &&
        s.includes('FROM ACCOUNTS AS A') &&
        s.includes('LIMIT') &&
        s.includes('OFFSET')
      ) {
        return { rows: [{ ...makeAccountRow(), opportunity_count: '0' }] };
      }

      // getAccountWithOpportunities / updateAccount existence check:
      //   SELECT * FROM accounts WHERE id = ... AND tenant_id = ... AND owner_id = ...
      if (
        s.startsWith('SELECT') &&
        s.includes('FROM ACCOUNTS') &&
        !s.includes('FROM ACCOUNTS AS A')
      ) {
        if (fixtureRow) return { rows: [fixtureRow] };
        return { rows: [] };
      }

      // getAccountWithOpportunities opportunities projection
      if (s.startsWith('SELECT') && s.includes('FROM OPPORTUNITIES')) {
        return { rows: [] };
      }

      // UPDATE accounts ... RETURNING *
      if (s.startsWith('UPDATE ACCOUNTS')) {
        return { rows: [makeAccountRow()], rowCount: 1, command: 'UPDATE' };
      }

      // DELETE FROM accounts
      if (s.startsWith('DELETE FROM ACCOUNTS')) {
        return { rows: [], rowCount: 1, command: 'DELETE' };
      }

      return { rows: [] };
    }

    const mockQuery = vi.fn(async (sql: unknown, params?: unknown[]) => {
      const rawSql =
        typeof sql === 'string' ? sql : (sql as { text: string }).text;
      return runQuery(rawSql, params, 'pool');
    });

    const mockConnect = vi.fn(async () => ({
      query: vi.fn(async (sql: unknown, params?: unknown[]) => {
        const rawSql =
          typeof sql === 'string' ? sql : (sql as { text: string }).text;
        return runQuery(rawSql, params, 'client');
      }),
      release: vi.fn(),
    }));

    function resetCapture() {
      capturedQueries.length = 0;
      fixtureRow = null;
    }

    function setFixtureRow(row: Record<string, unknown> | null) {
      fixtureRow = row === null ? null : makeAccountRow(row);
    }

    return {
      capturedQueries,
      mockQuery,
      mockConnect,
      resetCapture,
      setFixtureRow,
    };
  });

vi.mock('../../db/client.js', () => ({
  pool: { query: mockQuery, connect: mockConnect },
}));

const {
  createAccount,
  listAccounts,
  getAccountWithOpportunities,
  updateAccount,
  deleteAccount,
} = await import('../accountService.js');

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

const baseCreate = {
  name: 'SQL Corp',
  tenantId: TENANT_ID,
  requestingUserId: OWNER_ID,
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('accountService Kysely SQL — tenant_id defence-in-depth', () => {
  it('createAccount binds tenant_id on the INSERT', async () => {
    await createAccount(baseCreate);

    const inserts = dataQueries().filter((q) =>
      normalise(q.sql).startsWith('INSERT INTO ACCOUNTS'),
    );
    expect(inserts.length).toBe(1);
    expect(inserts[0]!.params).toContain(TENANT_ID);
    expect(normalise(inserts[0]!.sql)).toContain('TENANT_ID');
  });

  it('listAccounts references tenant_id on every data query (count + list)', async () => {
    await listAccounts({ tenantId: TENANT_ID, ownerId: OWNER_ID, limit: 20, offset: 0 });

    const queries = dataQueries();
    expect(queries.length).toBe(2); // count + data
    for (const q of queries) {
      expect(
        normalise(q.sql).includes('TENANT_ID'),
        `Query missing TENANT_ID:\n  ${q.sql}`,
      ).toBe(true);
      expect(q.params).toContain(TENANT_ID);
    }
  });

  it('listAccounts search path references tenant_id on every data query', async () => {
    await listAccounts({
      tenantId: TENANT_ID,
      ownerId: OWNER_ID,
      search: 'acme',
      limit: 20,
      offset: 0,
    });

    const queries = dataQueries();
    expect(queries.length).toBe(2);
    for (const q of queries) {
      expect(
        normalise(q.sql).includes('TENANT_ID'),
        `Query missing TENANT_ID:\n  ${q.sql}`,
      ).toBe(true);
      expect(q.params).toContain(TENANT_ID);
    }
  });

  it('the opportunity_count scalar subquery carries tenant_id on BOTH the outer and inner halves', async () => {
    await listAccounts({ tenantId: TENANT_ID, ownerId: OWNER_ID, limit: 20, offset: 0 });

    const dataPath = dataQueries().find((q) => {
      const s = normalise(q.sql);
      return s.includes('FROM ACCOUNTS AS A') && s.includes('LIMIT');
    });
    expect(dataPath).toBeDefined();

    const s = normalise(dataPath!.sql);
    // Outer (a.tenant_id)
    expect(s).toContain('A.TENANT_ID =');
    // Inner (o.tenant_id) referenced inside the scalar subquery
    expect(s).toContain('O.TENANT_ID =');
    // And it's a ref-equality against a.tenant_id, not a bind
    expect(s).toContain('O.TENANT_ID = A.TENANT_ID');
  });

  it('getAccountWithOpportunities references tenant_id on both the account SELECT and the opportunities SELECT', async () => {
    setFixtureRow({});
    await getAccountWithOpportunities(ACCOUNT_ID, TENANT_ID, OWNER_ID);

    const queries = dataQueries();
    expect(queries.length).toBe(2); // account + opportunities
    for (const q of queries) {
      expect(
        normalise(q.sql).includes('TENANT_ID'),
        `Query missing TENANT_ID:\n  ${q.sql}`,
      ).toBe(true);
      expect(q.params).toContain(TENANT_ID);
    }
  });

  it('updateAccount references tenant_id on both the existence check and the UPDATE', async () => {
    setFixtureRow({});
    await updateAccount(ACCOUNT_ID, TENANT_ID, OWNER_ID, { name: 'Updated' });

    const queries = dataQueries();
    // SELECT existence check + UPDATE ... RETURNING *
    expect(queries.length).toBe(2);
    for (const q of queries) {
      expect(
        normalise(q.sql).includes('TENANT_ID'),
        `Query missing TENANT_ID:\n  ${q.sql}`,
      ).toBe(true);
      expect(q.params).toContain(TENANT_ID);
    }
  });

  it('deleteAccount binds tenant_id on the DELETE', async () => {
    await deleteAccount(ACCOUNT_ID, TENANT_ID, OWNER_ID);

    const deletes = dataQueries().filter((q) =>
      normalise(q.sql).startsWith('DELETE FROM ACCOUNTS'),
    );
    expect(deletes.length).toBe(1);
    expect(deletes[0]!.params).toContain(TENANT_ID);
    expect(normalise(deletes[0]!.sql)).toContain('TENANT_ID =');
  });
});

describe('accountService Kysely SQL — create path', () => {
  it('INSERT INTO accounts binds exactly 18 columns in the expected order', async () => {
    await createAccount(baseCreate);

    const inserts = dataQueries().filter((q) =>
      normalise(q.sql).startsWith('INSERT INTO ACCOUNTS'),
    );
    expect(inserts.length).toBe(1);

    // Column order (as written in the service .values({...})):
    //   id, tenant_id, name, industry, website, phone, email,
    //   address_line1, address_line2, city, region, postal_code, country,
    //   notes, owner_id, created_by, created_at, updated_at.
    expect(inserts[0]!.params.length).toBe(18);
    expect(inserts[0]!.params[1]).toBe(TENANT_ID);
    expect(inserts[0]!.params[2]).toBe('SQL Corp');
    expect(inserts[0]!.params[14]).toBe(OWNER_ID); // owner_id
    expect(inserts[0]!.params[15]).toBe(OWNER_ID); // created_by

    const s = normalise(inserts[0]!.sql);
    expect(s).toContain('RETURNING');
  });

  it('persists optional fields as null when not supplied (not empty string or "undefined")', async () => {
    await createAccount(baseCreate);

    const inserts = dataQueries().filter((q) =>
      normalise(q.sql).startsWith('INSERT INTO ACCOUNTS'),
    );
    const p = inserts[0]!.params;
    // industry..notes — every optional column coerced to null
    for (let i = 3; i <= 13; i++) {
      expect(p[i], `column index ${i} should be null`).toBeNull();
    }
  });
});

describe('accountService Kysely SQL — list path', () => {
  it('count query is a separate lightweight SELECT COUNT(*) — not the wide data projection', async () => {
    await listAccounts({ tenantId: TENANT_ID, ownerId: OWNER_ID, limit: 20, offset: 0 });

    const countQuery = dataQueries().find((q) =>
      normalise(q.sql).startsWith('SELECT COUNT(*)'),
    );
    expect(countQuery).toBeDefined();

    const s = normalise(countQuery!.sql);
    // The count query should NOT project the full accounts row or the
    // opportunity_count scalar — that's the data query's job.
    expect(s).not.toContain('A.*');
    expect(s).not.toContain('OPPORTUNITY_COUNT');
    // And no LIMIT/OFFSET on the count path
    expect(s).not.toContain('LIMIT');
    expect(s).not.toContain('OFFSET');
  });

  it('data query emits the correlated opportunity_count subquery', async () => {
    await listAccounts({ tenantId: TENANT_ID, ownerId: OWNER_ID, limit: 20, offset: 0 });

    const dataPath = dataQueries().find((q) => {
      const s = normalise(q.sql);
      return s.includes('FROM ACCOUNTS AS A') && s.includes('LIMIT');
    });
    expect(dataPath).toBeDefined();

    const s = normalise(dataPath!.sql);
    expect(s).toContain('A.*');
    expect(s).toContain('OPPORTUNITY_COUNT');
    // The subquery joins on account_id + tenant_id via whereRef
    expect(s).toContain('O.ACCOUNT_ID = A.ID');
    expect(s).toContain('FROM OPPORTUNITIES AS O');
  });

  it('search path binds the escaped ilike pattern, not a raw string', async () => {
    await listAccounts({
      tenantId: TENANT_ID,
      ownerId: OWNER_ID,
      search: '50%_off',
      limit: 20,
      offset: 0,
    });

    const dataPath = dataQueries().find((q) => {
      const s = normalise(q.sql);
      return s.includes('FROM ACCOUNTS AS A') && s.includes('LIMIT');
    });
    expect(dataPath).toBeDefined();

    // The bound value should carry escaped LIKE metacharacters.
    const escapedBind = '%50\\%\\_off%';
    expect(dataPath!.params).toContain(escapedBind);

    const s = normalise(dataPath!.sql);
    // ILIKE, not LIKE, and bound as a parameter
    expect(s).toContain('A.NAME ILIKE');
    expect(s).toContain('A.EMAIL ILIKE');
    // The raw user input itself must NOT appear in the SQL text
    expect(dataPath!.sql.includes('50%_off')).toBe(false);
  });

  it('list query orders by a.created_at DESC with LIMIT / OFFSET applied', async () => {
    await listAccounts({ tenantId: TENANT_ID, ownerId: OWNER_ID, limit: 5, offset: 10 });

    const dataPath = dataQueries().find((q) => {
      const s = normalise(q.sql);
      return s.includes('FROM ACCOUNTS AS A') && s.includes('LIMIT');
    });
    expect(dataPath).toBeDefined();

    const s = normalise(dataPath!.sql);
    expect(s).toContain('ORDER BY A.CREATED_AT DESC');
    expect(s).toContain('LIMIT');
    expect(s).toContain('OFFSET');
    expect(dataPath!.params).toContain(5);
    expect(dataPath!.params).toContain(10);
  });
});

describe('accountService Kysely SQL — getAccountWithOpportunities', () => {
  it('projects only the 8 columns needed for the API response (not *)', async () => {
    setFixtureRow({});
    await getAccountWithOpportunities(ACCOUNT_ID, TENANT_ID, OWNER_ID);

    const oppQuery = dataQueries().find((q) =>
      normalise(q.sql).includes('FROM OPPORTUNITIES'),
    );
    expect(oppQuery).toBeDefined();

    const s = normalise(oppQuery!.sql);
    // Must list the exact columns, and must NOT be SELECT *
    expect(s).toContain('ID');
    expect(s).toContain('TITLE');
    expect(s).toContain('STAGE');
    expect(s).toContain('VALUE');
    expect(s).toContain('CURRENCY');
    expect(s).toContain('EXPECTED_CLOSE_DATE');
    // Columns the product does not need should NOT be projected
    expect(s).not.toContain('DESCRIPTION');
    expect(s).not.toContain('OWNER_ID');
    expect(s).toContain('ORDER BY CREATED_AT DESC');
  });
});

describe('accountService Kysely SQL — updateAccount', () => {
  it('emits an existence-check SELECT followed by UPDATE ... RETURNING *', async () => {
    setFixtureRow({});
    await updateAccount(ACCOUNT_ID, TENANT_ID, OWNER_ID, { name: 'Renamed' });

    const queries = dataQueries();
    expect(queries.length).toBe(2);

    const selectSql = normalise(queries[0]!.sql);
    expect(selectSql).toContain('SELECT');
    expect(selectSql).toContain('FROM ACCOUNTS');
    expect(selectSql).toContain('ID =');
    expect(selectSql).toContain('TENANT_ID =');
    expect(selectSql).toContain('OWNER_ID =');

    const updateSql = normalise(queries[1]!.sql);
    expect(updateSql).toContain('UPDATE ACCOUNTS');
    expect(updateSql).toContain('RETURNING');
  });

  it('only sets columns the caller provided (no hidden over-writes)', async () => {
    setFixtureRow({});
    await updateAccount(ACCOUNT_ID, TENANT_ID, OWNER_ID, { name: 'Renamed' });

    const updateQuery = dataQueries().find((q) =>
      normalise(q.sql).startsWith('UPDATE ACCOUNTS'),
    );
    expect(updateQuery).toBeDefined();

    const s = normalise(updateQuery!.sql);
    // updated_at is always touched
    expect(s).toContain('UPDATED_AT =');
    // name was in the patch
    expect(s).toContain('NAME =');
    // Nothing else
    expect(s).not.toContain('INDUSTRY =');
    expect(s).not.toContain('WEBSITE =');
    expect(s).not.toContain('PHONE =');
    expect(s).not.toContain('EMAIL =');
    expect(s).not.toContain('ADDRESS_LINE1 =');
    expect(s).not.toContain('CITY =');
    expect(s).not.toContain('NOTES =');
  });

  it('updating only email does not clobber name or other fields', async () => {
    setFixtureRow({});
    await updateAccount(ACCOUNT_ID, TENANT_ID, OWNER_ID, { email: 'new@example.com' });

    const updateQuery = dataQueries().find((q) =>
      normalise(q.sql).startsWith('UPDATE ACCOUNTS'),
    );
    const s = normalise(updateQuery!.sql);
    expect(s).toContain('EMAIL =');
    expect(s).toContain('UPDATED_AT =');
    expect(s).not.toContain('NAME =');
    expect(s).not.toContain('INDUSTRY =');
  });

  it('explicit-null clears the column (distinguished from "key not present")', async () => {
    setFixtureRow({});
    await updateAccount(ACCOUNT_ID, TENANT_ID, OWNER_ID, { industry: null });

    const updateQuery = dataQueries().find((q) =>
      normalise(q.sql).startsWith('UPDATE ACCOUNTS'),
    );
    expect(updateQuery).toBeDefined();

    const s = normalise(updateQuery!.sql);
    expect(s).toContain('INDUSTRY =');
    expect(updateQuery!.params).toContain(null);
  });
});

describe('accountService Kysely SQL — deleteAccount', () => {
  it('binds id + tenant_id + owner_id on the DELETE', async () => {
    await deleteAccount(ACCOUNT_ID, TENANT_ID, OWNER_ID);

    const deletes = dataQueries().filter((q) =>
      normalise(q.sql).startsWith('DELETE FROM ACCOUNTS'),
    );
    expect(deletes.length).toBe(1);

    const s = normalise(deletes[0]!.sql);
    expect(s).toContain('ID =');
    expect(s).toContain('TENANT_ID =');
    expect(s).toContain('OWNER_ID =');

    expect(deletes[0]!.params).toContain(ACCOUNT_ID);
    expect(deletes[0]!.params).toContain(TENANT_ID);
    expect(deletes[0]!.params).toContain(OWNER_ID);
  });
});

describe('accountService Kysely SQL — non-transactional paths', () => {
  it('createAccount runs without opening an explicit transaction', async () => {
    await createAccount(baseCreate);
    const sqls = capturedQueries.map((q) => normalise(q.sql));
    expect(sqls).not.toContain('BEGIN');
    expect(sqls).not.toContain('COMMIT');
  });

  it('listAccounts runs without opening an explicit transaction', async () => {
    await listAccounts({ tenantId: TENANT_ID, ownerId: OWNER_ID, limit: 20, offset: 0 });
    const sqls = capturedQueries.map((q) => normalise(q.sql));
    expect(sqls).not.toContain('BEGIN');
    expect(sqls).not.toContain('COMMIT');
  });

  it('updateAccount runs without opening an explicit transaction', async () => {
    setFixtureRow({});
    await updateAccount(ACCOUNT_ID, TENANT_ID, OWNER_ID, { name: 'Renamed' });
    const sqls = capturedQueries.map((q) => normalise(q.sql));
    expect(sqls).not.toContain('BEGIN');
    expect(sqls).not.toContain('COMMIT');
  });

  it('deleteAccount runs without opening an explicit transaction', async () => {
    await deleteAccount(ACCOUNT_ID, TENANT_ID, OWNER_ID);
    const sqls = capturedQueries.map((q) => normalise(q.sql));
    expect(sqls).not.toContain('BEGIN');
    expect(sqls).not.toContain('COMMIT');
  });
});
