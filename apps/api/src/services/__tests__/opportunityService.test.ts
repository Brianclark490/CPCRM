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
  validateStageTransition,
  ALLOWED_STAGE_TRANSITIONS,
} from '../opportunityService.js';

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ─── Fake DB pool ─────────────────────────────────────────────────────────────
// Maintains an in-memory store that backs pool.query so service tests can run
// without a real database while still exercising the full service logic.
// vi.hoisted is used so the mock reference is available in the vi.mock factory.

const { fakeRows, mockQuery } = vi.hoisted(() => {
  const fakeRows = new Map<string, Record<string, unknown>>();

  const mockQuery = vi.fn(async (sql: string, params?: unknown[]) => {
    const s = sql.replace(/\s+/g, ' ').trim().toUpperCase();

    if (s.startsWith('INSERT INTO OPPORTUNITIES')) {
      const [id, tenant_id, account_id, owner_id, title, value, currency, expected_close_date, description, created_by, created_at, updated_at, stage_history] = params as unknown[];
      const row: Record<string, unknown> = {
        id, tenant_id, account_id, owner_id, title,
        stage: 'prospecting',
        value: value ?? null,
        currency: currency ?? null,
        expected_close_date: expected_close_date ?? null,
        description: description ?? null,
        created_by, created_at, updated_at,
        stage_history: typeof stage_history === 'string' ? JSON.parse(stage_history) : stage_history,
      };
      fakeRows.set(id as string, row);
      return { rows: [row] };
    }

    if (s.startsWith('SELECT * FROM OPPORTUNITIES WHERE ID = $1 AND TENANT_ID = $2')) {
      const [id, tenant_id] = params as string[];
      const row = fakeRows.get(id);
      if (row && row.tenant_id === tenant_id) return { rows: [row] };
      return { rows: [] };
    }

    if (s.startsWith('SELECT * FROM OPPORTUNITIES WHERE TENANT_ID = $1')) {
      const [tenant_id] = params as string[];
      const rows = [...fakeRows.values()]
        .filter((r) => r.tenant_id === tenant_id)
        .sort((a, b) => new Date(b.created_at as string).getTime() - new Date(a.created_at as string).getTime());
      return { rows };
    }

    if (s.startsWith('UPDATE OPPORTUNITIES')) {
      const [id, tenant_id, title, account_id, owner_id, stage, value, currency, expected_close_date, description, stage_history, updated_at] = params as unknown[];
      const existing = fakeRows.get(id as string);
      if (!existing || existing.tenant_id !== tenant_id) return { rows: [] };
      const updated: Record<string, unknown> = {
        ...existing,
        title, account_id, owner_id, stage,
        value: value ?? null,
        currency: currency ?? null,
        expected_close_date: expected_close_date ?? null,
        description: description ?? null,
        stage_history: typeof stage_history === 'string' ? JSON.parse(stage_history) : stage_history,
        updated_at,
      };
      fakeRows.set(id as string, updated);
      return { rows: [updated] };
    }

    return { rows: [] };
  });

  return { fakeRows, mockQuery };
});

vi.mock('../../db/client.js', () => ({
  pool: { query: mockQuery },
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
    fakeRows.clear();
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

  it('initialises stageHistory with a single prospecting entry', async () => {
    const result = await createOpportunity(baseParams);

    expect(result.stageHistory).toHaveLength(1);
    expect(result.stageHistory[0].from).toBeNull();
    expect(result.stageHistory[0].to).toBe('prospecting');
    expect(result.stageHistory[0].changedBy).toBe('user-123');
    expect(result.stageHistory[0].changedAt).toBeInstanceOf(Date);
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

describe('validateStageTransition', () => {
  it('returns null for each allowed transition', () => {
    for (const [from, targets] of Object.entries(ALLOWED_STAGE_TRANSITIONS)) {
      for (const to of targets) {
        expect(
          validateStageTransition(
            from as Parameters<typeof validateStageTransition>[0],
            to as Parameters<typeof validateStageTransition>[1],
          ),
        ).toBeNull();
      }
    }
  });

  it('returns an error when transitioning from prospecting to proposal (skipping qualification)', () => {
    expect(validateStageTransition('prospecting', 'proposal')).toContain(
      "Cannot transition from 'prospecting' to 'proposal'",
    );
  });

  it('returns an error when transitioning from closed_won to prospecting', () => {
    expect(validateStageTransition('closed_won', 'prospecting')).toContain(
      "Cannot transition from 'closed_won' to 'prospecting'",
    );
  });

  it('returns null when reopening a closed_lost opportunity to prospecting', () => {
    expect(validateStageTransition('closed_lost', 'prospecting')).toBeNull();
  });

  it('returns null when reopening a closed_won opportunity to negotiation', () => {
    expect(validateStageTransition('closed_won', 'negotiation')).toBeNull();
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
    fakeRows.clear();
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
      { stage: 'qualification' },
      storeBaseParams.requestingUserId,
    );

    expect(updated.stage).toBe('qualification');
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

  it('throws an INVALID_STAGE_TRANSITION error for a disallowed stage transition', async () => {
    const tenantId = `tenant-invalid-transition-${Date.now()}`;
    const created = await createOpportunity({ ...storeBaseParams, tenantId });

    // prospecting → proposal is not a valid transition (must go through qualification first)
    await expect(
      updateOpportunity(
        created.id,
        tenantId,
        { stage: 'proposal' },
        storeBaseParams.requestingUserId,
      ),
    ).rejects.toMatchObject({ code: 'INVALID_STAGE_TRANSITION' });
  });

  it('records a stage transition in stageHistory when the stage changes', async () => {
    const tenantId = `tenant-history-${Date.now()}`;
    const created = await createOpportunity({ ...storeBaseParams, tenantId });

    const updated = await updateOpportunity(
      created.id,
      tenantId,
      { stage: 'qualification' },
      storeBaseParams.requestingUserId,
    );

    expect(updated.stageHistory).toHaveLength(2);
    expect(updated.stageHistory[1].from).toBe('prospecting');
    expect(updated.stageHistory[1].to).toBe('qualification');
    expect(updated.stageHistory[1].changedBy).toBe(storeBaseParams.requestingUserId);
  });

  it('does not append to stageHistory when the stage is unchanged', async () => {
    const tenantId = `tenant-no-stage-change-${Date.now()}`;
    const created = await createOpportunity({ ...storeBaseParams, tenantId });

    const updated = await updateOpportunity(
      created.id,
      tenantId,
      { title: 'New Title' },
      storeBaseParams.requestingUserId,
    );

    expect(updated.stageHistory).toHaveLength(1);
  });

  it('accumulates multiple stage transitions in stageHistory', async () => {
    const tenantId = `tenant-multi-stage-${Date.now()}`;
    const created = await createOpportunity({ ...storeBaseParams, tenantId });

    const afterQual = await updateOpportunity(
      created.id,
      tenantId,
      { stage: 'qualification' },
      storeBaseParams.requestingUserId,
    );
    const afterProposal = await updateOpportunity(
      afterQual.id,
      tenantId,
      { stage: 'proposal' },
      storeBaseParams.requestingUserId,
    );

    expect(afterProposal.stageHistory).toHaveLength(3);
    expect(afterProposal.stageHistory[0].to).toBe('prospecting');
    expect(afterProposal.stageHistory[1].to).toBe('qualification');
    expect(afterProposal.stageHistory[2].to).toBe('proposal');
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
