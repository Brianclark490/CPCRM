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

const { fakeRows, mockQuery } = vi.hoisted(() => {
  const fakeRows = new Map<string, Record<string, unknown>>();

  const mockQuery = vi.fn(async (sql: string, params?: unknown[]) => {
    const s = sql.replace(/\s+/g, ' ').trim().toUpperCase();

    if (s.startsWith('INSERT INTO ACCOUNTS')) {
      const [id, tenant_id, name, industry, website, phone, email,
        address_line1, address_line2, city, region, postal_code, country, notes,
        owner_id, created_by, created_at, updated_at] = params as unknown[];
      const row: Record<string, unknown> = {
        id, tenant_id, name, industry, website, phone, email,
        address_line1, address_line2, city, region, postal_code, country, notes,
        owner_id, created_by, created_at, updated_at,
      };
      fakeRows.set(id as string, row);
      return { rows: [row] };
    }

    if (s.startsWith('SELECT COUNT(*)')) {
      const [tenant_id, owner_id] = params as string[];
      const matching = [...fakeRows.values()].filter(
        (r) => r.tenant_id === tenant_id && r.owner_id === owner_id,
      );

      // Handle search filter if present
      if (params && params.length > 2) {
        const searchTerm = (params[2] as string).replace(/%/g, '').toLowerCase();
        const filtered = matching.filter(
          (r) =>
            (r.name as string).toLowerCase().includes(searchTerm) ||
            ((r.email as string | null) ?? '').toLowerCase().includes(searchTerm),
        );
        return { rows: [{ total: String(filtered.length) }] };
      }

      return { rows: [{ total: String(matching.length) }] };
    }

    if (s.includes('FROM ACCOUNTS') && s.includes('LIMIT') && s.includes('OFFSET')) {
      const [tenant_id, owner_id] = params as string[];
      let matching = [...fakeRows.values()].filter(
        (r) => r.tenant_id === tenant_id && r.owner_id === owner_id,
      );

      // Handle search filter
      if (params && params.length > 2 && typeof params[2] === 'string' && (params[2] as string).startsWith('%')) {
        const searchTerm = (params[2] as string).replace(/%/g, '').toLowerCase();
        matching = matching.filter(
          (r) =>
            (r.name as string).toLowerCase().includes(searchTerm) ||
            ((r.email as string | null) ?? '').toLowerCase().includes(searchTerm),
        );
        const limit = params[3] as number;
        const offset = params[4] as number;
        return { rows: matching.slice(offset, offset + limit).map((r) => ({ ...r, opportunity_count: '0' })) };
      }

      // No search — params: [tenant_id, owner_id, limit, offset]
      const limit = params![2] as number;
      const offset = params![3] as number;
      return { rows: matching.slice(offset, offset + limit).map((r) => ({ ...r, opportunity_count: '0' })) };
    }

    if (s.startsWith('SELECT * FROM ACCOUNTS WHERE ID = $1 AND TENANT_ID = $2 AND OWNER_ID = $3')) {
      const [id, tenant_id, owner_id] = params as string[];
      const row = fakeRows.get(id);
      if (row && row.tenant_id === tenant_id && row.owner_id === owner_id) return { rows: [row] };
      return { rows: [] };
    }

    if (s.startsWith('SELECT ID, TITLE, STAGE')) {
      // Opportunities lookup for getAccountWithOpportunities
      return { rows: [] };
    }

    if (s.startsWith('UPDATE ACCOUNTS')) {
      // Find the account to update
      const idIdx = params!.length - 3;
      const id = params![idIdx] as string;
      const existing = fakeRows.get(id);
      if (!existing) return { rows: [] };
      const updated = { ...existing, updated_at: new Date() };
      fakeRows.set(id, updated);
      return { rows: [updated] };
    }

    if (s.startsWith('DELETE FROM ACCOUNTS')) {
      const [id, tenant_id, owner_id] = params as string[];
      const row = fakeRows.get(id);
      if (row && row.tenant_id === tenant_id && row.owner_id === owner_id) {
        fakeRows.delete(id);
        return { rowCount: 1 };
      }
      return { rowCount: 0 };
    }

    return { rows: [] };
  });

  return { fakeRows, mockQuery };
});

vi.mock('../../db/client.js', () => ({
  pool: { query: mockQuery },
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

  it('returns null for a valid URL', () => {
    expect(validateWebsite('https://acme.com')).toBeNull();
  });

  it('returns an error for an invalid URL', () => {
    expect(validateWebsite('not-a-url')).toBe('Website must be a valid URL');
  });

  it('returns an error for non-string values', () => {
    expect(validateWebsite(42)).toBe('Website must be a string');
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
      page: 1,
      limit: 20,
    });

    expect(result.data).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
  });

  it('returns empty results when no accounts match', async () => {
    const result = await listAccounts({
      tenantId: 'tenant-abc',
      ownerId: 'user-123',
      page: 1,
      limit: 20,
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
      page: 1,
      limit: 20,
    });

    expect(result.data).toHaveLength(1);
    expect(result.data[0].name).toBe('My Account');
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
