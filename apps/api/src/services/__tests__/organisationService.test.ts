import { describe, it, expect, vi, beforeEach } from 'vitest';
import { provisionOrganisation, validateName } from '../organisationService.js';

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ─── Fake DB pool ─────────────────────────────────────────────────────────────
//
// Kysely's PostgresDialect acquires a client per query via `pool.connect()`,
// so the mock routes both `pool.query` (legacy) and `pool.connect().query`
// (Kysely) through the same `runQuery` dispatcher.

const { mockQuery, mockConnect } = vi.hoisted(() => {
  function runQuery(rawSql: string, params?: unknown[]) {
    // Strip identifier quoting so matching is quote-agnostic.
    const s = rawSql.replace(/\s+/g, ' ').replace(/"/g, '').trim().toUpperCase();

    // Transaction control statements — no-ops in the fake.
    if (s === 'BEGIN' || s === 'COMMIT' || s === 'ROLLBACK') {
      return { rows: [] };
    }

    // RLS preamble from the Kysely pool proxy.
    if (s.startsWith('SELECT SET_CONFIG')) {
      return { rows: [] };
    }

    // INSERT INTO organisations — Kysely binds values in the column order
    // declared in the service's `.values({...})` call:
    //   id, tenant_id, name, description, created_at, updated_at.
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

    // INSERT INTO tenant_memberships — column order:
    //   id, tenant_id, user_id, organisation_id, role, created_at, updated_at.
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
    return runQuery(rawSql, params);
  });

  const mockConnect = vi.fn(async () => ({
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      const rawSql =
        typeof sql === 'string' ? sql : (sql as { text: string }).text;
      return runQuery(rawSql, params);
    }),
    release: vi.fn(),
  }));

  return { mockQuery, mockConnect };
});

vi.mock('../../db/client.js', () => ({
  pool: { query: mockQuery, connect: mockConnect },
}));

describe('validateName', () => {
  it('returns null for a valid name', () => {
    expect(validateName('Acme Corp')).toBeNull();
  });

  it('returns an error for an empty string', () => {
    expect(validateName('')).toBe('Organisation name is required');
  });

  it('returns an error for a whitespace-only string', () => {
    expect(validateName('   ')).toBe('Organisation name is required');
  });

  it('returns an error for a non-string value', () => {
    expect(validateName(undefined)).toBe('Organisation name is required');
    expect(validateName(null)).toBe('Organisation name is required');
    expect(validateName(42)).toBe('Organisation name is required');
  });

  it('returns an error when name exceeds 100 characters', () => {
    expect(validateName('a'.repeat(101))).toBe(
      'Organisation name must be 100 characters or fewer',
    );
  });

  it('returns null for a name of exactly 100 characters', () => {
    expect(validateName('a'.repeat(100))).toBeNull();
  });
});

describe('provisionOrganisation', () => {
  const baseParams = {
    name: 'Acme Corp',
    tenantId: 'tenant-abc',
    requestingUserId: 'user-123',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns an organisation with the correct name and tenantId', async () => {
    const result = await provisionOrganisation(baseParams);

    expect(result.organisation.name).toBe('Acme Corp');
    expect(result.organisation.tenantId).toBe('tenant-abc');
  });

  it('trims whitespace from the organisation name', async () => {
    const result = await provisionOrganisation({ ...baseParams, name: '  Acme Corp  ' });
    expect(result.organisation.name).toBe('Acme Corp');
  });

  it('sets description when provided', async () => {
    const result = await provisionOrganisation({
      ...baseParams,
      description: 'Our main organisation',
    });
    expect(result.organisation.description).toBe('Our main organisation');
  });

  it('leaves description undefined when not provided', async () => {
    const result = await provisionOrganisation(baseParams);
    expect(result.organisation.description).toBeUndefined();
  });

  it('creates the organisation with a UUID id', async () => {
    const result = await provisionOrganisation(baseParams);
    expect(result.organisation.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('creates a membership with role "owner" for the requesting user', async () => {
    const result = await provisionOrganisation(baseParams);

    expect(result.membership.role).toBe('owner');
    expect(result.membership.userId).toBe('user-123');
    expect(result.membership.tenantId).toBe('tenant-abc');
    expect(result.membership.organisationId).toBe(result.organisation.id);
  });

  it('throws a VALIDATION_ERROR when name is empty', async () => {
    await expect(provisionOrganisation({ ...baseParams, name: '' })).rejects.toMatchObject({
      message: 'Organisation name is required',
      code: 'VALIDATION_ERROR',
    });
  });

  it('throws a VALIDATION_ERROR when name exceeds 100 characters', async () => {
    await expect(
      provisionOrganisation({ ...baseParams, name: 'x'.repeat(101) }),
    ).rejects.toMatchObject({
      message: 'Organisation name must be 100 characters or fewer',
      code: 'VALIDATION_ERROR',
    });
  });
});
