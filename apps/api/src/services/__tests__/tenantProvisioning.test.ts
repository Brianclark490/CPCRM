import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateSlug } from '../tenantProvisioning.js';

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ─── Fake DB pool ─────────────────────────────────────────────────────────────
//
// Kysely's PostgresDialect acquires a client per query via `pool.connect()`,
// so the mock routes both `pool.query` and `pool.connect().query` through
// the same `runQuery` dispatcher. Validation tests only need the shape of
// the slug-uniqueness check to resolve — the rest of the provisionTenant
// path is covered by tenantProvisioning.e2e.test.ts.

const { mockQuery, mockConnect } = vi.hoisted(() => {
  const mockQuery = vi.fn();

  const mockConnect = vi.fn(async () => ({
    query: vi.fn(async (sql: unknown, params?: unknown[]) => {
      const rawSql =
        typeof sql === 'string' ? sql : (sql as { text: string }).text;
      return mockQuery(rawSql, params);
    }),
    release: vi.fn(),
  }));

  return { mockQuery, mockConnect };
});

vi.mock('../../db/client.js', () => ({
  pool: { query: mockQuery, connect: mockConnect },
}));

// ─── validateSlug ─────────────────────────────────────────────────────────────

describe('validateSlug', () => {
  it('returns null for a valid slug', () => {
    expect(validateSlug('acme-corp')).toBeNull();
    expect(validateSlug('my-company-123')).toBeNull();
    expect(validateSlug('abc')).toBeNull();
  });

  it('returns error for empty slug', () => {
    expect(validateSlug('')).toBe('Slug is required');
  });

  it('returns error for non-string input', () => {
    expect(validateSlug(null)).toBe('Slug is required');
    expect(validateSlug(undefined)).toBe('Slug is required');
    expect(validateSlug(42)).toBe('Slug is required');
  });

  it('returns error for slug that is too short', () => {
    expect(validateSlug('ab')).toBe('Slug must be between 3 and 63 characters');
  });

  it('returns error for slug that is too long', () => {
    expect(validateSlug('a'.repeat(64))).toBe('Slug must be between 3 and 63 characters');
  });

  it('returns error for slug with uppercase letters', () => {
    expect(validateSlug('Acme-Corp')).toMatch(/lowercase/);
  });

  it('returns error for slug with leading hyphen', () => {
    expect(validateSlug('-acme')).toMatch(/lowercase|hyphen/i);
  });

  it('returns error for slug with trailing hyphen', () => {
    expect(validateSlug('acme-')).toMatch(/lowercase|hyphen/i);
  });

  it('returns error for slug with spaces', () => {
    expect(validateSlug('acme corp')).toMatch(/lowercase/);
  });

  it('allows single-segment slugs without hyphens', () => {
    expect(validateSlug('acme')).toBeNull();
    expect(validateSlug('acme123')).toBeNull();
  });
});

// ─── provisionTenant ─────────────────────────────────────────────────────────

describe('provisionTenant — validation', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    // Default: slug is not in use
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
  });

  it('throws VALIDATION_ERROR when name is empty', async () => {
    const { provisionTenant } = await import('../tenantProvisioning.js');
    await expect(
      provisionTenant({ name: '', slug: 'acme', adminEmail: 'a@b.com', adminName: 'Admin' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', message: 'Tenant name is required' });
  });

  it('throws VALIDATION_ERROR when slug is invalid', async () => {
    const { provisionTenant } = await import('../tenantProvisioning.js');
    await expect(
      provisionTenant({ name: 'Acme', slug: 'Acme Corp', adminEmail: 'a@b.com', adminName: 'Admin' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('throws VALIDATION_ERROR when adminEmail is invalid', async () => {
    const { provisionTenant } = await import('../tenantProvisioning.js');
    await expect(
      provisionTenant({ name: 'Acme', slug: 'acme', adminEmail: 'not-an-email', adminName: 'Admin' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('throws VALIDATION_ERROR when adminName is empty', async () => {
    const { provisionTenant } = await import('../tenantProvisioning.js');
    await expect(
      provisionTenant({ name: 'Acme', slug: 'acme', adminEmail: 'a@b.com', adminName: '' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('throws DUPLICATE_SLUG when slug is already in use', async () => {
    mockQuery.mockResolvedValue({ rows: [{ id: 'acme' }], rowCount: 1 });

    const { provisionTenant } = await import('../tenantProvisioning.js');
    await expect(
      provisionTenant({ name: 'Acme', slug: 'acme', adminEmail: 'a@b.com', adminName: 'Admin' }),
    ).rejects.toMatchObject({ code: 'DUPLICATE_SLUG' });
  });
});
