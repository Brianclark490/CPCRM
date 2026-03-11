import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createOpportunity, validateTitle, validateAccountId } from '../opportunityService.js';

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe('validateTitle', () => {
  it('returns null for a valid title', () => {
    expect(validateTitle('New Partnership Deal')).toBeNull();
  });

  it('returns an error for an empty string', () => {
    expect(validateTitle('')).toBe('Opportunity title is required');
  });

  it('returns an error for a whitespace-only string', () => {
    expect(validateTitle('   ')).toBe('Opportunity title is required');
  });

  it('returns an error for a non-string value', () => {
    expect(validateTitle(undefined)).toBe('Opportunity title is required');
    expect(validateTitle(null)).toBe('Opportunity title is required');
    expect(validateTitle(42)).toBe('Opportunity title is required');
  });

  it('returns an error when title exceeds 200 characters', () => {
    expect(validateTitle('a'.repeat(201))).toBe(
      'Opportunity title must be 200 characters or fewer',
    );
  });

  it('returns null for a title of exactly 200 characters', () => {
    expect(validateTitle('a'.repeat(200))).toBeNull();
  });
});

describe('validateAccountId', () => {
  it('returns null for a valid accountId', () => {
    expect(validateAccountId('account-uuid-123')).toBeNull();
  });

  it('returns an error for an empty string', () => {
    expect(validateAccountId('')).toBe('Account is required');
  });

  it('returns an error for a whitespace-only string', () => {
    expect(validateAccountId('   ')).toBe('Account is required');
  });

  it('returns an error for a non-string value', () => {
    expect(validateAccountId(undefined)).toBe('Account is required');
    expect(validateAccountId(null)).toBe('Account is required');
  });
});

describe('createOpportunity', () => {
  const baseParams = {
    title: 'New Partnership Deal',
    accountId: 'account-uuid-123',
    tenantId: 'tenant-abc',
    requestingUserId: 'user-123',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns an opportunity with the correct title and tenantId', async () => {
    const result = await createOpportunity(baseParams);

    expect(result.title).toBe('New Partnership Deal');
    expect(result.tenantId).toBe('tenant-abc');
  });

  it('sets the initial stage to "prospecting"', async () => {
    const result = await createOpportunity(baseParams);

    expect(result.stage).toBe('prospecting');
  });

  it('sets the ownerId and createdBy to the requesting user', async () => {
    const result = await createOpportunity(baseParams);

    expect(result.ownerId).toBe('user-123');
    expect(result.createdBy).toBe('user-123');
  });

  it('sets the accountId correctly', async () => {
    const result = await createOpportunity(baseParams);

    expect(result.accountId).toBe('account-uuid-123');
  });

  it('trims whitespace from title and accountId', async () => {
    const result = await createOpportunity({
      ...baseParams,
      title: '  New Deal  ',
      accountId: '  account-uuid  ',
    });

    expect(result.title).toBe('New Deal');
    expect(result.accountId).toBe('account-uuid');
  });

  it('creates the opportunity with a UUID id', async () => {
    const result = await createOpportunity(baseParams);

    expect(result.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('sets optional value and currency when provided', async () => {
    const result = await createOpportunity({
      ...baseParams,
      value: 50000,
      currency: 'GBP',
    });

    expect(result.value).toBe(50000);
    expect(result.currency).toBe('GBP');
  });

  it('leaves value and currency undefined when not provided', async () => {
    const result = await createOpportunity(baseParams);

    expect(result.value).toBeUndefined();
    expect(result.currency).toBeUndefined();
  });

  it('sets expectedCloseDate when provided as an ISO 8601 string', async () => {
    const result = await createOpportunity({
      ...baseParams,
      expectedCloseDate: '2025-12-31',
    });

    expect(result.expectedCloseDate).toBeInstanceOf(Date);
  });

  it('leaves expectedCloseDate undefined when not provided', async () => {
    const result = await createOpportunity(baseParams);

    expect(result.expectedCloseDate).toBeUndefined();
  });

  it('sets description when provided', async () => {
    const result = await createOpportunity({
      ...baseParams,
      description: 'Q4 strategic partnership',
    });

    expect(result.description).toBe('Q4 strategic partnership');
  });

  it('leaves description undefined when not provided', async () => {
    const result = await createOpportunity(baseParams);

    expect(result.description).toBeUndefined();
  });

  it('throws a VALIDATION_ERROR when title is empty', async () => {
    await expect(createOpportunity({ ...baseParams, title: '' })).rejects.toMatchObject({
      message: 'Opportunity title is required',
      code: 'VALIDATION_ERROR',
    });
  });

  it('throws a VALIDATION_ERROR when title exceeds 200 characters', async () => {
    await expect(
      createOpportunity({ ...baseParams, title: 'x'.repeat(201) }),
    ).rejects.toMatchObject({
      message: 'Opportunity title must be 200 characters or fewer',
      code: 'VALIDATION_ERROR',
    });
  });

  it('throws a VALIDATION_ERROR when accountId is empty', async () => {
    await expect(createOpportunity({ ...baseParams, accountId: '' })).rejects.toMatchObject({
      message: 'Account is required',
      code: 'VALIDATION_ERROR',
    });
  });
});
