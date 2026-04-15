/**
 * Kysely SQL regression suite for profileService.
 *
 * Complements `profileService.test.ts` (behavioural assertions) by
 * asserting directly on the SQL Kysely emits for `getOrCreateProfile`,
 * `getProfile`, and `updateProfile`.
 *
 * Note: `user_profiles` is a global table (no `tenant_id` column) —
 * profiles follow the Descope user across tenants — so this suite does
 * not assert tenant_id defence-in-depth.
 *
 * No real Postgres — the pg pool is mocked and captures every compiled
 * SQL string Kysely hands down.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

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

const { capturedQueries, mockQuery, mockConnect, resetCapture, setExistingProfile } =
  vi.hoisted(() => {
    const capturedQueries: CapturedQuery[] = [];
    let existingProfileRow: Record<string, unknown> | null = null;

    function makeRow(overrides: Record<string, unknown> = {}) {
      const now = new Date();
      return {
        id: 'profile-uuid',
        user_id: 'user-sql-001',
        display_name: null,
        job_title: null,
        updated_by: 'user-sql-001',
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

      const s = rawSql.replace(/\s+/g, ' ').replace(/"/g, '').trim().toUpperCase();

      if (s === 'BEGIN' || s === 'COMMIT' || s === 'ROLLBACK') {
        return { rows: [] };
      }
      if (s.startsWith('SELECT SET_CONFIG')) {
        return { rows: [] };
      }

      // SELECT * FROM user_profiles WHERE user_id = $1
      if (s.startsWith('SELECT') && s.includes('FROM USER_PROFILES')) {
        if (existingProfileRow) {
          return { rows: [existingProfileRow] };
        }
        return { rows: [] };
      }

      // INSERT INTO user_profiles ... RETURNING *
      if (s.startsWith('INSERT INTO USER_PROFILES')) {
        const [id, user_id, display_name, job_title, updated_by, created_at, updated_at] =
          params as unknown[];
        return {
          rows: [
            {
              id,
              user_id,
              display_name: display_name ?? null,
              job_title: job_title ?? null,
              updated_by,
              created_at,
              updated_at,
            },
          ],
        };
      }

      // UPDATE user_profiles SET ... WHERE user_id = $N RETURNING *
      if (s.startsWith('UPDATE USER_PROFILES')) {
        return { rows: [makeRow({ display_name: 'Alice' })] };
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
      existingProfileRow = null;
    }

    function setExistingProfile(row: Record<string, unknown> | null) {
      existingProfileRow = row === null ? null : makeRow(row);
    }

    return {
      capturedQueries,
      mockQuery,
      mockConnect,
      resetCapture,
      setExistingProfile,
    };
  });

vi.mock('../../db/client.js', () => ({
  pool: { query: mockQuery, connect: mockConnect },
}));

const { getOrCreateProfile, getProfile, updateProfile } = await import(
  '../profileService.js'
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

describe('profileService Kysely SQL — getOrCreateProfile', () => {
  it('returns the existing profile with a single SELECT when one is found', async () => {
    setExistingProfile({});
    await getOrCreateProfile(USER_ID);

    const queries = dataQueries();
    expect(queries.length).toBe(1);
    const s = normalise(queries[0]!.sql);
    expect(s).toContain('SELECT');
    expect(s).toContain('FROM USER_PROFILES');
    expect(s).toContain('USER_ID =');
    expect(queries[0]!.params).toContain(USER_ID);
  });

  it('creates a new profile via INSERT ... RETURNING * when none exists', async () => {
    await getOrCreateProfile(USER_ID);

    const inserts = dataQueries().filter((q) =>
      normalise(q.sql).startsWith('INSERT INTO USER_PROFILES'),
    );
    expect(inserts.length).toBe(1);

    // Column order: id, user_id, display_name, job_title, updated_by, created_at, updated_at.
    expect(inserts[0]!.params.length).toBe(7);
    expect(inserts[0]!.params[1]).toBe(USER_ID);
    expect(inserts[0]!.params[2]).toBeNull();
    expect(inserts[0]!.params[3]).toBeNull();
    expect(inserts[0]!.params[4]).toBe(USER_ID);

    const s = normalise(inserts[0]!.sql);
    expect(s).toContain('RETURNING');
  });
});

describe('profileService Kysely SQL — getProfile', () => {
  it('issues exactly one SELECT scoped by user_id', async () => {
    setExistingProfile({ display_name: 'Bob' });
    const result = await getProfile(USER_ID);

    expect(result).not.toBeNull();
    const queries = dataQueries();
    expect(queries.length).toBe(1);

    const s = normalise(queries[0]!.sql);
    expect(s).toContain('SELECT');
    expect(s).toContain('FROM USER_PROFILES');
    expect(s).toContain('USER_ID =');
  });
});

describe('profileService Kysely SQL — updateProfile', () => {
  it('emits a SELECT existence check followed by UPDATE ... RETURNING *', async () => {
    setExistingProfile({});
    await updateProfile(USER_ID, { displayName: 'Alice' }, USER_ID);

    const queries = dataQueries();
    // One SELECT (existence check) + one UPDATE
    expect(queries.length).toBe(2);

    expect(normalise(queries[0]!.sql)).toContain('SELECT');
    expect(normalise(queries[0]!.sql)).toContain('FROM USER_PROFILES');

    const updateSql = normalise(queries[1]!.sql);
    expect(updateSql).toContain('UPDATE USER_PROFILES');
    expect(updateSql).toContain('DISPLAY_NAME =');
    expect(updateSql).toContain('UPDATED_BY =');
    expect(updateSql).toContain('UPDATED_AT =');
    expect(updateSql).toContain('USER_ID =');
    expect(updateSql).toContain('RETURNING');
  });

  it('only sets columns the caller provided (no hidden over-writes)', async () => {
    setExistingProfile({});
    await updateProfile(USER_ID, { displayName: 'Alice' }, USER_ID);

    const updates = dataQueries().filter((q) =>
      normalise(q.sql).startsWith('UPDATE USER_PROFILES'),
    );
    expect(updates.length).toBe(1);

    const s = normalise(updates[0]!.sql);
    expect(s).toContain('DISPLAY_NAME =');
    // job_title was NOT in the params — it should not appear in the SET list
    expect(s).not.toContain('JOB_TITLE =');
  });

  it('updating only jobTitle does not clobber display_name', async () => {
    setExistingProfile({});
    await updateProfile(USER_ID, { jobTitle: 'Engineer' }, USER_ID);

    const updates = dataQueries().filter((q) =>
      normalise(q.sql).startsWith('UPDATE USER_PROFILES'),
    );
    expect(updates.length).toBe(1);

    const s = normalise(updates[0]!.sql);
    expect(s).toContain('JOB_TITLE =');
    expect(s).not.toContain('DISPLAY_NAME =');
  });
});

describe('profileService Kysely SQL — non-transactional paths', () => {
  it('getOrCreateProfile runs without opening an explicit transaction', async () => {
    await getOrCreateProfile(USER_ID);
    const sqls = capturedQueries.map((q) => normalise(q.sql));
    expect(sqls).not.toContain('BEGIN');
    expect(sqls).not.toContain('COMMIT');
  });

  it('updateProfile runs without opening an explicit transaction', async () => {
    setExistingProfile({});
    await updateProfile(USER_ID, { displayName: 'Alice' }, USER_ID);
    const sqls = capturedQueries.map((q) => normalise(q.sql));
    expect(sqls).not.toContain('BEGIN');
    expect(sqls).not.toContain('COMMIT');
  });
});
