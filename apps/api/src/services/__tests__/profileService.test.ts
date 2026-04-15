import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getOrCreateProfile,
  getProfile,
  updateProfile,
  validateTextField,
} from '../profileService.js';

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ─── Fake DB pool ─────────────────────────────────────────────────────────────
//
// Kysely's PostgresDialect acquires a client per query via `pool.connect()`,
// so we route both `pool.query` and `pool.connect().query` through the same
// underlying `mockQuery`. Callers can keep using `mockResolvedValueOnce` on
// `mockQuery` to queue up responses in query order — the RLS preamble
// `SELECT set_config(...)` and transaction control statements are intercepted
// in the client wrapper so they don't consume a queued response.

const { mockQuery, mockConnect } = vi.hoisted(() => {
  const mockQuery = vi.fn();

  const isPassthrough = (rawSql: string) => {
    const s = rawSql.replace(/\s+/g, ' ').trim().toUpperCase();
    return (
      s === 'BEGIN' ||
      s === 'COMMIT' ||
      s === 'ROLLBACK' ||
      s.startsWith('SELECT SET_CONFIG')
    );
  };

  const mockConnect = vi.fn(async () => ({
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      const rawSql =
        typeof sql === 'string' ? sql : (sql as { text: string }).text;
      if (isPassthrough(rawSql)) return { rows: [] };
      return mockQuery(rawSql, params);
    }),
    release: vi.fn(),
  }));

  return { mockQuery, mockConnect };
});

vi.mock('../../db/client.js', () => ({
  pool: { query: mockQuery, connect: mockConnect },
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeProfileRow(overrides: Record<string, unknown> = {}) {
  const now = new Date();
  return {
    id: 'profile-uuid',
    user_id: 'user-123',
    display_name: null,
    job_title: null,
    updated_by: 'user-123',
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

// ─── validateTextField ────────────────────────────────────────────────────────

describe('validateTextField', () => {
  it('returns null for undefined (field not provided)', () => {
    expect(validateTextField(undefined, 'Display name')).toBeNull();
  });

  it('returns null for null (clearing the field)', () => {
    expect(validateTextField(null, 'Display name')).toBeNull();
  });

  it('returns null for a valid string', () => {
    expect(validateTextField('Alice', 'Display name')).toBeNull();
  });

  it('returns an error for an empty string', () => {
    expect(validateTextField('', 'Display name')).toBe('Display name must not be blank');
  });

  it('returns an error for a whitespace-only string', () => {
    expect(validateTextField('   ', 'Display name')).toBe('Display name must not be blank');
  });

  it('returns an error for a non-string value', () => {
    expect(validateTextField(42, 'Display name')).toBe('Display name must be a string');
  });

  it('returns an error when value exceeds 100 characters', () => {
    expect(validateTextField('a'.repeat(101), 'Display name')).toBe(
      'Display name must be 100 characters or fewer',
    );
  });

  it('returns null for exactly 100 characters', () => {
    expect(validateTextField('a'.repeat(100), 'Display name')).toBeNull();
  });
});

// ─── getOrCreateProfile ───────────────────────────────────────────────────────

describe('getOrCreateProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the existing profile when one is found', async () => {
    const row = makeProfileRow({ display_name: 'Alice', job_title: 'Engineer' });
    mockQuery.mockResolvedValueOnce({ rows: [row] });

    const result = await getOrCreateProfile('user-123');

    expect(result.userId).toBe('user-123');
    expect(result.displayName).toBe('Alice');
    expect(result.jobTitle).toBe('Engineer');
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('creates and returns a new profile when none exists', async () => {
    const row = makeProfileRow();
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // SELECT returns nothing
      .mockResolvedValueOnce({ rows: [row] }); // INSERT returns new row

    const result = await getOrCreateProfile('user-123');

    expect(result.userId).toBe('user-123');
    expect(result.displayName).toBeUndefined();
    expect(result.jobTitle).toBeUndefined();
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it('maps null display_name and job_title to undefined', async () => {
    const row = makeProfileRow({ display_name: null, job_title: null });
    mockQuery.mockResolvedValueOnce({ rows: [row] });

    const result = await getOrCreateProfile('user-123');

    expect(result.displayName).toBeUndefined();
    expect(result.jobTitle).toBeUndefined();
  });
});

// ─── getProfile ───────────────────────────────────────────────────────────────

describe('getProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the profile when found', async () => {
    const row = makeProfileRow({ display_name: 'Bob' });
    mockQuery.mockResolvedValueOnce({ rows: [row] });

    const result = await getProfile('user-123');

    expect(result).not.toBeNull();
    expect(result?.displayName).toBe('Bob');
  });

  it('returns null when no profile is found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const result = await getProfile('user-unknown');

    expect(result).toBeNull();
  });
});

// ─── updateProfile ────────────────────────────────────────────────────────────

describe('updateProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates display name and returns the updated profile', async () => {
    const existing = makeProfileRow();
    const updated = makeProfileRow({ display_name: 'Alice Updated' });
    mockQuery
      .mockResolvedValueOnce({ rows: [existing] }) // SELECT
      .mockResolvedValueOnce({ rows: [updated] }); // UPDATE

    const result = await updateProfile('user-123', { displayName: 'Alice Updated' }, 'user-123');

    expect(result.displayName).toBe('Alice Updated');
  });

  it('updates job title and returns the updated profile', async () => {
    const existing = makeProfileRow();
    const updated = makeProfileRow({ job_title: 'Senior Engineer' });
    mockQuery
      .mockResolvedValueOnce({ rows: [existing] })
      .mockResolvedValueOnce({ rows: [updated] });

    const result = await updateProfile('user-123', { jobTitle: 'Senior Engineer' }, 'user-123');

    expect(result.jobTitle).toBe('Senior Engineer');
  });

  it('throws VALIDATION_ERROR when displayName is an empty string', async () => {
    await expect(
      updateProfile('user-123', { displayName: '' }, 'user-123'),
    ).rejects.toMatchObject({
      message: 'Display name must not be blank',
      code: 'VALIDATION_ERROR',
    });
  });

  it('throws VALIDATION_ERROR when displayName exceeds 100 characters', async () => {
    await expect(
      updateProfile('user-123', { displayName: 'a'.repeat(101) }, 'user-123'),
    ).rejects.toMatchObject({
      message: 'Display name must be 100 characters or fewer',
      code: 'VALIDATION_ERROR',
    });
  });

  it('throws VALIDATION_ERROR when jobTitle is an empty string', async () => {
    await expect(
      updateProfile('user-123', { jobTitle: '' }, 'user-123'),
    ).rejects.toMatchObject({
      message: 'Job title must not be blank',
      code: 'VALIDATION_ERROR',
    });
  });

  it('throws NOT_FOUND when the profile does not exist', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await expect(
      updateProfile('user-missing', { displayName: 'Alice' }, 'user-missing'),
    ).rejects.toMatchObject({
      message: 'Profile not found',
      code: 'NOT_FOUND',
    });
  });

  it('sets updatedBy to the requesting user ID', async () => {
    const existing = makeProfileRow();
    const updated = makeProfileRow({ updated_by: 'user-123' });
    mockQuery
      .mockResolvedValueOnce({ rows: [existing] })
      .mockResolvedValueOnce({ rows: [updated] });

    const result = await updateProfile('user-123', { displayName: 'Alice' }, 'user-123');

    expect(result.updatedBy).toBe('user-123');
  });
});
