import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createAccount,
  listAccounts,
  getAccountWithOpportunities,
  updateAccount,
  deleteAccount,
  validateName,
  validateEmail,
  validatePhone,
  validateWebsite,
} from '../accountService.js';

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ─── Fake DB pool ─────────────────────────────────────────────────────────────
//
// Kysely's PostgresDialect acquires a client per query via `pool.connect()`,
// so the mock routes both `pool.query` and `pool.connect().query` through the
// same `runQuery` dispatcher. SQL identifier quotes are stripped so the
// matchers are quote-agnostic.

const { fakeRows, mockQuery, mockConnect } = vi.hoisted(() => {
  const fakeRows = new Map<string, Record<string, unknown>>();

  function runQuery(rawSql: string, params: unknown[] | undefined) {
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

    // INSERT INTO accounts (... 18 columns ...) VALUES ($1, ..., $18) RETURNING *
    if (s.startsWith('INSERT INTO ACCOUNTS')) {
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
      ] = params as unknown[];
      const row: Record<string, unknown> = {
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
      };
      fakeRows.set(id as string, row);
      return { rows: [row] };
    }

    // listAccounts count path:
    //   SELECT count(*) as total FROM accounts as a
    //     WHERE a.tenant_id = $1 AND a.owner_id = $2
    //     [AND (a.name ilike $3 OR a.email ilike $4)]
    //
    // Note: the data query also contains COUNT(*) (inside its scalar
    // subquery), so we anchor on `SELECT COUNT(*)` at the start of the
    // compiled SQL — not just `includes('COUNT(*)')` — to disambiguate.
    if (s.startsWith('SELECT COUNT(*)') && s.includes('FROM ACCOUNTS')) {
      const [tenant_id, owner_id] = params as string[];
      let matching = [...fakeRows.values()].filter(
        (r) => r.tenant_id === tenant_id && r.owner_id === owner_id,
      );
      if (params && params.length > 2 && typeof params[2] === 'string') {
        const term = (params[2] as string).replace(/%/g, '').toLowerCase();
        matching = matching.filter(
          (r) =>
            (r.name as string).toLowerCase().includes(term) ||
            ((r.email as string | null) ?? '').toLowerCase().includes(term),
        );
      }
      return { rows: [{ total: String(matching.length) }] };
    }

    // listAccounts data path:
    //   SELECT a.*, (select count(*) ... opportunities ...) as opportunity_count
    //     FROM accounts as a
    //     WHERE a.tenant_id = $1 AND a.owner_id = $2
    //     [AND (a.name ilike $3 OR a.email ilike $4)]
    //     ORDER BY a.created_at DESC LIMIT $N OFFSET $N+1
    if (
      s.startsWith('SELECT') &&
      s.includes('FROM ACCOUNTS AS A') &&
      s.includes('LIMIT') &&
      s.includes('OFFSET')
    ) {
      const [tenant_id, owner_id] = params as string[];
      let matching = [...fakeRows.values()].filter(
        (r) => r.tenant_id === tenant_id && r.owner_id === owner_id,
      );

      // With search: params = [tenantId, ownerId, searchTerm, searchTerm, limit, offset]
      // Without:     params = [tenantId, ownerId, limit, offset]
      const hasSearch =
        params &&
        params.length > 4 &&
        typeof params[2] === 'string' &&
        (params[2] as string).includes('%');

      if (hasSearch) {
        const term = (params![2] as string).replace(/%/g, '').toLowerCase();
        matching = matching.filter(
          (r) =>
            (r.name as string).toLowerCase().includes(term) ||
            ((r.email as string | null) ?? '').toLowerCase().includes(term),
        );
      }

      const limit = (hasSearch ? params![4] : params![2]) as number;
      const offset = (hasSearch ? params![5] : params![3]) as number;

      return {
        rows: matching
          .slice(offset, offset + limit)
          .map((r) => ({ ...r, opportunity_count: '0' })),
      };
    }

    // getAccountWithOpportunities account lookup:
    //   SELECT * FROM accounts WHERE id = $1 AND tenant_id = $2 AND owner_id = $3
    if (
      s.startsWith('SELECT') &&
      s.includes('FROM ACCOUNTS') &&
      !s.includes('FROM ACCOUNTS AS A') &&
      s.includes('ID =') &&
      s.includes('TENANT_ID =') &&
      s.includes('OWNER_ID =')
    ) {
      const [id, tenant_id, owner_id] = params as string[];
      const row = fakeRows.get(id);
      if (row && row.tenant_id === tenant_id && row.owner_id === owner_id) {
        // If the projection is only `id` (updateAccount existence check),
        // the same row still passes the match — Kysely narrows the fields
        // server-side so we can return the full row object.
        return { rows: [row] };
      }
      return { rows: [] };
    }

    // getAccountWithOpportunities opportunities lookup:
    //   SELECT id, title, stage, value, currency, expected_close_date,
    //          created_at, updated_at
    //     FROM opportunities
    //     WHERE account_id = $1 AND tenant_id = $2
    //     ORDER BY created_at DESC
    if (s.startsWith('SELECT') && s.includes('FROM OPPORTUNITIES')) {
      return { rows: [] };
    }

    // updateAccount UPDATE ... RETURNING *
    if (s.startsWith('UPDATE ACCOUNTS')) {
      // The WHERE clause binds [id, tenant_id, owner_id] at the tail, so
      // the id is at params.length - 3.
      const idIdx = params!.length - 3;
      const id = params![idIdx] as string;
      const existing = fakeRows.get(id);
      if (!existing) return { rows: [] };
      const updated = { ...existing, updated_at: new Date() };
      fakeRows.set(id, updated);
      return { rows: [updated] };
    }

    // deleteAccount: Kysely's PostgresDriver reads `rowCount` into
    // `numAffectedRows` ONLY when `command` is 'INSERT' | 'UPDATE' |
    // 'DELETE' | 'MERGE' on the pg result, so the mock must emit the
    // command marker or `numDeletedRows` comes back as 0n.
    if (s.startsWith('DELETE FROM ACCOUNTS')) {
      const [id, tenant_id, owner_id] = params as string[];
      const row = fakeRows.get(id);
      if (row && row.tenant_id === tenant_id && row.owner_id === owner_id) {
        fakeRows.delete(id);
        return { rows: [], rowCount: 1, command: 'DELETE' };
      }
      return { rows: [], rowCount: 0, command: 'DELETE' };
    }

    return { rows: [] };
  }

  // Kysely's pg driver calls `client.query({ text, values })` with a single
  // query-config object. The shim unwraps both the string- and object-form
  // call shapes so the dispatcher sees consistent (sql, params) tuples.
  function unwrap(
    sql: unknown,
    params: unknown[] | undefined,
  ): { rawSql: string; rawParams: unknown[] | undefined } {
    if (typeof sql === 'string') return { rawSql: sql, rawParams: params };
    const obj = sql as { text: string; values?: unknown[] };
    return { rawSql: obj.text, rawParams: obj.values ?? params };
  }

  const mockQuery = vi.fn(async (sql: unknown, params?: unknown[]) => {
    const { rawSql, rawParams } = unwrap(sql, params);
    return runQuery(rawSql, rawParams);
  });

  const mockConnect = vi.fn(async () => ({
    query: vi.fn(async (sql: unknown, params?: unknown[]) => {
      const { rawSql, rawParams } = unwrap(sql, params);
      return runQuery(rawSql, rawParams);
    }),
    release: vi.fn(),
  }));

  return { fakeRows, mockQuery, mockConnect };
});

vi.mock('../../db/client.js', () => ({
  pool: { query: mockQuery, connect: mockConnect },
}));

// ─── Validation tests ─────────────────────────────────────────────────────────

describe('validateName', () => {
  it('returns null for a valid name', () => {
    expect(validateName('Acme Corp')).toBeNull();
  });

  it('returns an error for an empty string', () => {
    expect(validateName('')).toBe('Account name is required');
  });

  it('returns an error for a whitespace-only string', () => {
    expect(validateName('   ')).toBe('Account name is required');
  });

  it('returns an error for non-string values', () => {
    expect(validateName(undefined)).toBe('Account name is required');
    expect(validateName(null)).toBe('Account name is required');
    expect(validateName(42)).toBe('Account name is required');
  });

  it('returns an error when name exceeds 200 characters', () => {
    expect(validateName('a'.repeat(201))).toBe('Account name must be 200 characters or fewer');
  });

  it('returns null for a name of exactly 200 characters', () => {
    expect(validateName('a'.repeat(200))).toBeNull();
  });
});

describe('validateEmail', () => {
  it('returns null for undefined', () => {
    expect(validateEmail(undefined)).toBeNull();
  });

  it('returns null for null', () => {
    expect(validateEmail(null)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(validateEmail('')).toBeNull();
  });

  it('returns null for a valid email', () => {
    expect(validateEmail('user@example.com')).toBeNull();
  });

  it('returns an error for an invalid email', () => {
    expect(validateEmail('not-an-email')).toBe('Email must be a valid email address');
  });

  it('returns an error for an email missing domain', () => {
    expect(validateEmail('user@')).toBe('Email must be a valid email address');
  });

  it('returns an error for non-string values', () => {
    expect(validateEmail(42)).toBe('Email must be a string');
  });

  it('completes quickly for a crafted ReDoS input', () => {
    const redosInput = 'a@' + 'a.'.repeat(50) + '!';
    const start = Date.now();
    validateEmail(redosInput);
    expect(Date.now() - start).toBeLessThan(500);
  });
});

describe('validatePhone', () => {
  it('returns null for undefined', () => {
    expect(validatePhone(undefined)).toBeNull();
  });

  it('returns null for null', () => {
    expect(validatePhone(null)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(validatePhone('')).toBeNull();
  });

  it('returns null for a valid phone number', () => {
    expect(validatePhone('+44 20 1234 5678')).toBeNull();
  });

  it('returns null for a simple phone number', () => {
    expect(validatePhone('1234567')).toBeNull();
  });

  it('returns an error for an invalid phone number', () => {
    expect(validatePhone('abc')).toBe('Phone must be a valid phone number');
  });

  it('returns an error for non-string values', () => {
    expect(validatePhone(42)).toBe('Phone must be a string');
  });
});

describe('validateWebsite', () => {
  it('returns null for undefined', () => {
    expect(validateWebsite(undefined)).toBeNull();
  });

  it('returns null for null', () => {
    expect(validateWebsite(null)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(validateWebsite('')).toBeNull();
  });

  it('returns null for a valid https URL', () => {
    expect(validateWebsite('https://acme.com')).toBeNull();
  });

  it('returns null for a valid http URL', () => {
    expect(validateWebsite('http://acme.com')).toBeNull();
  });

  it('returns an error for an invalid URL', () => {
    expect(validateWebsite('not-a-url')).toBe('Website must be a valid URL');
  });

  it('returns an error for non-string values', () => {
    expect(validateWebsite(42)).toBe('Website must be a string');
  });

  it('rejects javascript: protocol', () => {
    expect(validateWebsite('javascript:alert(1)')).toBe('Website must use http or https protocol');
  });

  it('rejects data: protocol', () => {
    expect(validateWebsite('data:text/html,<h1>hi</h1>')).toBe('Website must use http or https protocol');
  });

  it('rejects ftp: protocol', () => {
    expect(validateWebsite('ftp://files.example.com')).toBe('Website must use http or https protocol');
  });
});

// ─── createAccount ────────────────────────────────────────────────────────────

describe('createAccount', () => {
  const baseParams = {
    name: 'Acme Corp',
    tenantId: 'tenant-abc',
    requestingUserId: 'user-123',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    fakeRows.clear();
  });

  it('returns an account with the correct name and tenantId', async () => {
    const result = await createAccount(baseParams);

    expect(result.name).toBe('Acme Corp');
    expect(result.tenantId).toBe('tenant-abc');
  });

  it('sets the ownerId and createdBy to the requesting user', async () => {
    const result = await createAccount(baseParams);

    expect(result.ownerId).toBe('user-123');
    expect(result.createdBy).toBe('user-123');
  });

  it('creates the account with a UUID id', async () => {
    const result = await createAccount(baseParams);

    expect(result.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('trims whitespace from name', async () => {
    const result = await createAccount({ ...baseParams, name: '  Acme Corp  ' });

    expect(result.name).toBe('Acme Corp');
  });

  it('sets optional fields when provided', async () => {
    const result = await createAccount({
      ...baseParams,
      email: 'info@acme.com',
      phone: '+44 20 1234 5678',
      industry: 'Technology',
    });

    expect(result.email).toBe('info@acme.com');
    expect(result.phone).toBe('+44 20 1234 5678');
    expect(result.industry).toBe('Technology');
  });

  it('leaves optional fields undefined when not provided', async () => {
    const result = await createAccount(baseParams);

    expect(result.email).toBeUndefined();
    expect(result.phone).toBeUndefined();
    expect(result.industry).toBeUndefined();
    expect(result.website).toBeUndefined();
  });

  it('throws a VALIDATION_ERROR when name is empty', async () => {
    await expect(createAccount({ ...baseParams, name: '' })).rejects.toMatchObject({
      message: 'Account name is required',
      code: 'VALIDATION_ERROR',
    });
  });

  it('throws a VALIDATION_ERROR when name exceeds 200 characters', async () => {
    await expect(
      createAccount({ ...baseParams, name: 'x'.repeat(201) }),
    ).rejects.toMatchObject({
      message: 'Account name must be 200 characters or fewer',
      code: 'VALIDATION_ERROR',
    });
  });

  it('throws a VALIDATION_ERROR for invalid email', async () => {
    await expect(
      createAccount({ ...baseParams, email: 'not-an-email' }),
    ).rejects.toMatchObject({
      message: 'Email must be a valid email address',
      code: 'VALIDATION_ERROR',
    });
  });

  it('throws a VALIDATION_ERROR for invalid phone', async () => {
    await expect(
      createAccount({ ...baseParams, phone: 'abc' }),
    ).rejects.toMatchObject({
      message: 'Phone must be a valid phone number',
      code: 'VALIDATION_ERROR',
    });
  });

  it('throws a VALIDATION_ERROR for invalid website', async () => {
    await expect(
      createAccount({ ...baseParams, website: 'not-a-url' }),
    ).rejects.toMatchObject({
      message: 'Website must be a valid URL',
      code: 'VALIDATION_ERROR',
    });
  });
});

// ─── listAccounts ─────────────────────────────────────────────────────────────

describe('listAccounts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakeRows.clear();
  });

  it('returns paginated results with total count', async () => {
    await createAccount({ name: 'Account 1', tenantId: 'tenant-abc', requestingUserId: 'user-123' });
    await createAccount({ name: 'Account 2', tenantId: 'tenant-abc', requestingUserId: 'user-123' });

    const result = await listAccounts({
      tenantId: 'tenant-abc',
      ownerId: 'user-123',
      limit: 20,
      offset: 0,
    });

    expect(result.data).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(result.offset).toBe(0);
    expect(result.limit).toBe(20);
  });

  it('returns empty results when no accounts match', async () => {
    const result = await listAccounts({
      tenantId: 'tenant-abc',
      ownerId: 'user-123',
      limit: 20,
      offset: 0,
    });

    expect(result.data).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it('filters by owner_id — does not return other users accounts', async () => {
    await createAccount({ name: 'My Account', tenantId: 'tenant-abc', requestingUserId: 'user-123' });
    await createAccount({ name: 'Other Account', tenantId: 'tenant-abc', requestingUserId: 'user-456' });

    const result = await listAccounts({
      tenantId: 'tenant-abc',
      ownerId: 'user-123',
      limit: 20,
      offset: 0,
    });

    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.name).toBe('My Account');
  });
});

// ─── getAccountWithOpportunities ─────────────────────────────────────────────

describe('getAccountWithOpportunities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakeRows.clear();
  });

  it('returns the account with an opportunities array when found', async () => {
    const created = await createAccount({ name: 'Acme Corp', tenantId: 'tenant-abc', requestingUserId: 'user-123' });

    const result = await getAccountWithOpportunities(created.id, 'tenant-abc', 'user-123');

    expect(result).not.toBeNull();
    expect(result!.name).toBe('Acme Corp');
    expect(result!.opportunities).toEqual([]);
  });

  it('returns null when the account does not exist', async () => {
    const result = await getAccountWithOpportunities('missing-id', 'tenant-abc', 'user-123');

    expect(result).toBeNull();
  });

  it('returns null when the account belongs to a different owner', async () => {
    const created = await createAccount({ name: 'Acme Corp', tenantId: 'tenant-abc', requestingUserId: 'user-456' });

    const result = await getAccountWithOpportunities(created.id, 'tenant-abc', 'user-123');

    expect(result).toBeNull();
  });
});

// ─── updateAccount ────────────────────────────────────────────────────────────

describe('updateAccount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakeRows.clear();
  });

  it('returns the updated account', async () => {
    const created = await createAccount({ name: 'Acme Corp', tenantId: 'tenant-abc', requestingUserId: 'user-123' });

    const result = await updateAccount(created.id, 'tenant-abc', 'user-123', { name: 'Updated Corp' });

    expect(result).toBeDefined();
  });

  it('throws NOT_FOUND when the account does not exist', async () => {
    await expect(
      updateAccount('missing-id', 'tenant-abc', 'user-123', { name: 'Updated' }),
    ).rejects.toMatchObject({
      message: 'Account not found',
      code: 'NOT_FOUND',
    });
  });

  it('throws NOT_FOUND when the account belongs to a different owner', async () => {
    const created = await createAccount({ name: 'Acme Corp', tenantId: 'tenant-abc', requestingUserId: 'user-456' });

    await expect(
      updateAccount(created.id, 'tenant-abc', 'user-123', { name: 'Updated' }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('throws VALIDATION_ERROR when name is empty', async () => {
    const created = await createAccount({ name: 'Acme Corp', tenantId: 'tenant-abc', requestingUserId: 'user-123' });

    await expect(
      updateAccount(created.id, 'tenant-abc', 'user-123', { name: '' }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('throws VALIDATION_ERROR for invalid email', async () => {
    const created = await createAccount({ name: 'Acme Corp', tenantId: 'tenant-abc', requestingUserId: 'user-123' });

    await expect(
      updateAccount(created.id, 'tenant-abc', 'user-123', { email: 'bad' }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });
});

// ─── deleteAccount ────────────────────────────────────────────────────────────

describe('deleteAccount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakeRows.clear();
  });

  it('deletes the account successfully', async () => {
    const created = await createAccount({ name: 'Acme Corp', tenantId: 'tenant-abc', requestingUserId: 'user-123' });

    await expect(deleteAccount(created.id, 'tenant-abc', 'user-123')).resolves.toBeUndefined();
  });

  it('throws NOT_FOUND when the account does not exist', async () => {
    await expect(
      deleteAccount('missing-id', 'tenant-abc', 'user-123'),
    ).rejects.toMatchObject({
      message: 'Account not found',
      code: 'NOT_FOUND',
    });
  });

  it('throws NOT_FOUND when the account belongs to a different owner', async () => {
    const created = await createAccount({ name: 'Acme Corp', tenantId: 'tenant-abc', requestingUserId: 'user-456' });

    await expect(
      deleteAccount(created.id, 'tenant-abc', 'user-123'),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
