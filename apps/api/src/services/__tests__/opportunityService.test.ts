import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createOpportunity,
  listOpportunities,
  getOpportunity,
  updateOpportunity,
  validateTitle,
  validateAccountId,
  validateValue,
  validateExpectedCloseDate,
  validateStage,
} from '../opportunityService.js';

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

describe('validateValue', () => {
  it('returns null when value is undefined', () => {
    expect(validateValue(undefined)).toBeNull();
  });

  it('returns null when value is null', () => {
    expect(validateValue(null)).toBeNull();
  });

  it('returns null for a valid positive number', () => {
    expect(validateValue(50000)).toBeNull();
  });

  it('returns null for zero', () => {
    expect(validateValue(0)).toBeNull();
  });

  it('returns an error for NaN', () => {
    expect(validateValue(NaN)).toBe('Estimated value must be a valid number');
  });

  it('returns an error for a non-numeric string', () => {
    expect(validateValue('abc')).toBe('Estimated value must be a valid number');
  });

  it('returns null for a numeric string', () => {
    expect(validateValue('50000')).toBeNull();
  });
});

describe('validateExpectedCloseDate', () => {
  it('returns null when date is undefined', () => {
    expect(validateExpectedCloseDate(undefined)).toBeNull();
  });

  it('returns null when date is null', () => {
    expect(validateExpectedCloseDate(null)).toBeNull();
  });

  it('returns null when date is an empty string', () => {
    expect(validateExpectedCloseDate('')).toBeNull();
  });

  it('returns null for a valid ISO 8601 date string', () => {
    expect(validateExpectedCloseDate('2025-12-31')).toBeNull();
  });

  it('returns an error for an invalid date string', () => {
    expect(validateExpectedCloseDate('not-a-date')).toBe('Close date must be a valid date');
  });
});

describe('validateStage', () => {
  it('returns null when stage is undefined', () => {
    expect(validateStage(undefined)).toBeNull();
  });

  it('returns null for each valid stage', () => {
    const stages = [
      'prospecting',
      'qualification',
      'proposal',
      'negotiation',
      'closed_won',
      'closed_lost',
    ];
    for (const stage of stages) {
      expect(validateStage(stage)).toBeNull();
    }
  });

  it('returns an error for an invalid stage', () => {
    expect(validateStage('invalid_stage')).toContain('Stage must be one of:');
  });
});

// ─── Shared setup for store-dependent tests ───────────────────────────────────

const storeBaseParams = {
  title: 'Store Test Deal',
  accountId: 'account-store-001',
  tenantId: 'tenant-store',
  requestingUserId: 'user-store',
};

describe('listOpportunities', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns opportunities belonging to the requested tenant', async () => {
    const tenantId = `tenant-list-${Date.now()}`;
    const opp1 = await createOpportunity({ ...storeBaseParams, tenantId, title: 'Deal A' });
    const opp2 = await createOpportunity({ ...storeBaseParams, tenantId, title: 'Deal B' });

    const result = await listOpportunities(tenantId);

    expect(result.map((o) => o.id)).toContain(opp1.id);
    expect(result.map((o) => o.id)).toContain(opp2.id);
  });

  it('does not return opportunities from other tenants', async () => {
    const tenantA = `tenant-list-a-${Date.now()}`;
    const tenantB = `tenant-list-b-${Date.now()}`;
    await createOpportunity({ ...storeBaseParams, tenantId: tenantA });

    const result = await listOpportunities(tenantB);

    expect(result.map((o) => o.tenantId)).not.toContain(tenantA);
  });

  it('returns an empty array when the tenant has no opportunities', async () => {
    const result = await listOpportunities('tenant-no-opps');
    expect(result).toEqual([]);
  });
});

describe('getOpportunity', () => {
  it('returns the opportunity when it exists and belongs to the tenant', async () => {
    const tenantId = `tenant-get-${Date.now()}`;
    const created = await createOpportunity({ ...storeBaseParams, tenantId });

    const result = await getOpportunity(created.id, tenantId);

    expect(result).not.toBeNull();
    expect(result?.id).toBe(created.id);
    expect(result?.tenantId).toBe(tenantId);
  });

  it('returns null when the opportunity does not exist', async () => {
    const result = await getOpportunity('non-existent-id', 'tenant-abc');
    expect(result).toBeNull();
  });

  it('returns null when the opportunity belongs to a different tenant', async () => {
    const tenantA = `tenant-isolation-a-${Date.now()}`;
    const tenantB = `tenant-isolation-b-${Date.now()}`;
    const created = await createOpportunity({ ...storeBaseParams, tenantId: tenantA });

    const result = await getOpportunity(created.id, tenantB);
    expect(result).toBeNull();
  });
});

describe('updateOpportunity', () => {
  it('updates the title of an existing opportunity', async () => {
    const tenantId = `tenant-update-${Date.now()}`;
    const created = await createOpportunity({ ...storeBaseParams, tenantId });

    const updated = await updateOpportunity(
      created.id,
      tenantId,
      { title: 'Updated Title' },
      storeBaseParams.requestingUserId,
    );

    expect(updated.title).toBe('Updated Title');
    expect(updated.tenantId).toBe(tenantId);
  });

  it('updates the stage of an existing opportunity', async () => {
    const tenantId = `tenant-update-stage-${Date.now()}`;
    const created = await createOpportunity({ ...storeBaseParams, tenantId });

    const updated = await updateOpportunity(
      created.id,
      tenantId,
      { stage: 'proposal' },
      storeBaseParams.requestingUserId,
    );

    expect(updated.stage).toBe('proposal');
  });

  it('refreshes updatedAt when the opportunity is updated', async () => {
    const tenantId = `tenant-update-ts-${Date.now()}`;
    const created = await createOpportunity({ ...storeBaseParams, tenantId });

    // Small delay to ensure timestamps differ
    await new Promise((resolve) => setTimeout(resolve, 5));

    const updated = await updateOpportunity(
      created.id,
      tenantId,
      { title: 'Changed Title' },
      storeBaseParams.requestingUserId,
    );

    expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(created.updatedAt.getTime());
  });

  it('does not change fields that are not included in the update params', async () => {
    const tenantId = `tenant-partial-update-${Date.now()}`;
    const created = await createOpportunity({
      ...storeBaseParams,
      tenantId,
      description: 'Original description',
    });

    const updated = await updateOpportunity(
      created.id,
      tenantId,
      { title: 'New Title Only' },
      storeBaseParams.requestingUserId,
    );

    expect(updated.description).toBe('Original description');
    expect(updated.accountId).toBe(created.accountId);
  });

  it('throws a VALIDATION_ERROR when title is set to an empty string', async () => {
    const tenantId = `tenant-val-${Date.now()}`;
    const created = await createOpportunity({ ...storeBaseParams, tenantId });

    await expect(
      updateOpportunity(created.id, tenantId, { title: '' }, storeBaseParams.requestingUserId),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('throws a VALIDATION_ERROR for an invalid value', async () => {
    const tenantId = `tenant-val-value-${Date.now()}`;
    const created = await createOpportunity({ ...storeBaseParams, tenantId });

    await expect(
      updateOpportunity(
        created.id,
        tenantId,
        { value: NaN },
        storeBaseParams.requestingUserId,
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('throws a VALIDATION_ERROR for an invalid stage', async () => {
    const tenantId = `tenant-val-stage-${Date.now()}`;
    const created = await createOpportunity({ ...storeBaseParams, tenantId });

    await expect(
      updateOpportunity(
        created.id,
        tenantId,
        { stage: 'invalid_stage' as never },
        storeBaseParams.requestingUserId,
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('throws a NOT_FOUND error when the opportunity does not exist', async () => {
    await expect(
      updateOpportunity('non-existent-id', 'tenant-abc', { title: 'New' }, 'user-123'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('throws a NOT_FOUND error when the opportunity belongs to a different tenant', async () => {
    const tenantA = `tenant-isol-a-${Date.now()}`;
    const tenantB = `tenant-isol-b-${Date.now()}`;
    const created = await createOpportunity({ ...storeBaseParams, tenantId: tenantA });

    await expect(
      updateOpportunity(created.id, tenantB, { title: 'New' }, storeBaseParams.requestingUserId),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
