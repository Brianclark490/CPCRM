import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../../middleware/auth.js';

// ─── Mock middleware ──────────────────────────────────────────────────────────

vi.mock('../../middleware/auth.js', () => ({
  requireAuth: vi.fn((_req: AuthenticatedRequest, _res: Response, next: NextFunction) => next()),
}));

vi.mock('../../middleware/tenant.js', () => ({
  requireTenant: vi.fn((_req: AuthenticatedRequest, _res: Response, next: NextFunction) =>
    next(),
  ),
}));

// ─── Mock the opportunity service ────────────────────────────────────────────

const mockCreateOpportunity = vi.fn();
const mockListOpportunities = vi.fn();
const mockGetOpportunity = vi.fn();
const mockUpdateOpportunity = vi.fn();

vi.mock('../../services/opportunityService.js', () => ({
  createOpportunity: mockCreateOpportunity,
  listOpportunities: mockListOpportunities,
  getOpportunity: mockGetOpportunity,
  updateOpportunity: mockUpdateOpportunity,
}));

// ─── Mock logger so tests stay silent ────────────────────────────────────────

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const {
  handleCreateOpportunity,
  handleListOpportunities,
  handleGetOpportunity,
  handleUpdateOpportunity,
} = await import('../opportunities.js');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mockReq(
  body: unknown,
  user = { userId: 'user-123', tenantId: 'tenant-abc' },
  params: Record<string, string> = {},
) {
  return {
    body,
    path: '/opportunities',
    user,
    params,
  } as unknown as AuthenticatedRequest;
}

function mockRes() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('POST /opportunities', () => {
  beforeEach(() => {
    mockCreateOpportunity.mockReset();
  });

  it('returns 201 with the created opportunity on success', async () => {
    const now = new Date();
    const expectedOpportunity = {
      id: 'opp-uuid',
      tenantId: 'tenant-abc',
      accountId: 'account-uuid',
      ownerId: 'user-123',
      title: 'New Partnership Deal',
      stage: 'prospecting',
      value: undefined,
      currency: undefined,
      expectedCloseDate: undefined,
      description: undefined,
      createdAt: now,
      updatedAt: now,
      createdBy: 'user-123',
    };

    mockCreateOpportunity.mockResolvedValue(expectedOpportunity);

    const req = mockReq({ title: 'New Partnership Deal', accountId: 'account-uuid' });
    const res = mockRes();

    await handleCreateOpportunity(req, res);

    expect(mockCreateOpportunity).toHaveBeenCalledWith({
      title: 'New Partnership Deal',
      accountId: 'account-uuid',
      value: undefined,
      currency: undefined,
      expectedCloseDate: undefined,
      description: undefined,
      tenantId: 'tenant-abc',
      requestingUserId: 'user-123',
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expectedOpportunity);
  });

  it('returns 201 and passes optional fields when provided', async () => {
    const now = new Date();
    mockCreateOpportunity.mockResolvedValue({
      id: 'opp-uuid',
      tenantId: 'tenant-abc',
      accountId: 'account-uuid',
      ownerId: 'user-123',
      title: 'Q4 Deal',
      stage: 'prospecting',
      value: 50000,
      currency: 'GBP',
      expectedCloseDate: new Date('2025-12-31'),
      description: 'Strategic partnership',
      createdAt: now,
      updatedAt: now,
      createdBy: 'user-123',
    });

    const req = mockReq({
      title: 'Q4 Deal',
      accountId: 'account-uuid',
      value: 50000,
      currency: 'GBP',
      expectedCloseDate: '2025-12-31',
      description: 'Strategic partnership',
    });
    const res = mockRes();

    await handleCreateOpportunity(req, res);

    expect(mockCreateOpportunity).toHaveBeenCalledWith(
      expect.objectContaining({
        value: 50000,
        currency: 'GBP',
        expectedCloseDate: '2025-12-31',
        description: 'Strategic partnership',
      }),
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('returns 400 when the service throws a VALIDATION_ERROR for missing title', async () => {
    const validationErr = Object.assign(new Error('Opportunity title is required'), {
      code: 'VALIDATION_ERROR',
    });
    mockCreateOpportunity.mockRejectedValue(validationErr);

    const req = mockReq({ title: '', accountId: 'account-uuid' });
    const res = mockRes();

    await handleCreateOpportunity(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Opportunity title is required' });
  });

  it('returns 400 when the service throws a VALIDATION_ERROR for missing accountId', async () => {
    const validationErr = Object.assign(new Error('Account is required'), {
      code: 'VALIDATION_ERROR',
    });
    mockCreateOpportunity.mockRejectedValue(validationErr);

    const req = mockReq({ title: 'New Deal', accountId: '' });
    const res = mockRes();

    await handleCreateOpportunity(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Account is required' });
  });

  it('returns 400 when title is missing from the request body', async () => {
    const validationErr = Object.assign(new Error('Opportunity title is required'), {
      code: 'VALIDATION_ERROR',
    });
    mockCreateOpportunity.mockRejectedValue(validationErr);

    const req = mockReq({ accountId: 'account-uuid' });
    const res = mockRes();

    await handleCreateOpportunity(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Opportunity title is required' });
  });

  it('returns 500 when the service throws an unexpected error', async () => {
    mockCreateOpportunity.mockRejectedValue(new Error('Database connection failed'));

    const req = mockReq({ title: 'New Deal', accountId: 'account-uuid' });
    const res = mockRes();

    await handleCreateOpportunity(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'An unexpected error occurred' });
  });
});

// ─── GET /opportunities ───────────────────────────────────────────────────────

describe('GET /opportunities', () => {
  beforeEach(() => {
    mockListOpportunities.mockReset();
  });

  it('returns 200 with an array of opportunities', async () => {
    const now = new Date();
    const opportunities = [
      {
        id: 'opp-1',
        tenantId: 'tenant-abc',
        accountId: 'account-uuid',
        ownerId: 'user-123',
        title: 'Deal One',
        stage: 'prospecting',
        createdAt: now,
        updatedAt: now,
        createdBy: 'user-123',
      },
    ];

    mockListOpportunities.mockResolvedValue(opportunities);

    const req = mockReq({});
    const res = mockRes();

    await handleListOpportunities(req, res);

    expect(mockListOpportunities).toHaveBeenCalledWith('tenant-abc');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(opportunities);
  });

  it('returns 200 with an empty array when no opportunities exist', async () => {
    mockListOpportunities.mockResolvedValue([]);

    const req = mockReq({});
    const res = mockRes();

    await handleListOpportunities(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith([]);
  });

  it('returns 500 when the service throws an unexpected error', async () => {
    mockListOpportunities.mockRejectedValue(new Error('Database error'));

    const req = mockReq({});
    const res = mockRes();

    await handleListOpportunities(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'An unexpected error occurred' });
  });
});

// ─── GET /opportunities/:id ───────────────────────────────────────────────────

describe('GET /opportunities/:id', () => {
  beforeEach(() => {
    mockGetOpportunity.mockReset();
  });

  it('returns 200 with the opportunity when found', async () => {
    const now = new Date();
    const opportunity = {
      id: 'opp-uuid',
      tenantId: 'tenant-abc',
      accountId: 'account-uuid',
      ownerId: 'user-123',
      title: 'New Partnership Deal',
      stage: 'prospecting',
      createdAt: now,
      updatedAt: now,
      createdBy: 'user-123',
    };

    mockGetOpportunity.mockResolvedValue(opportunity);

    const req = mockReq({}, { userId: 'user-123', tenantId: 'tenant-abc' }, { id: 'opp-uuid' });
    const res = mockRes();

    await handleGetOpportunity(req, res);

    expect(mockGetOpportunity).toHaveBeenCalledWith('opp-uuid', 'tenant-abc');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(opportunity);
  });

  it('returns 404 when the opportunity is not found', async () => {
    mockGetOpportunity.mockResolvedValue(null);

    const req = mockReq({}, { userId: 'user-123', tenantId: 'tenant-abc' }, { id: 'missing-id' });
    const res = mockRes();

    await handleGetOpportunity(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Opportunity not found' });
  });

  it('returns 500 when the service throws an unexpected error', async () => {
    mockGetOpportunity.mockRejectedValue(new Error('Database error'));

    const req = mockReq({}, { userId: 'user-123', tenantId: 'tenant-abc' }, { id: 'opp-uuid' });
    const res = mockRes();

    await handleGetOpportunity(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'An unexpected error occurred' });
  });
});

// ─── PUT /opportunities/:id ───────────────────────────────────────────────────

describe('PUT /opportunities/:id', () => {
  beforeEach(() => {
    mockUpdateOpportunity.mockReset();
  });

  it('returns 200 with the updated opportunity on success', async () => {
    const now = new Date();
    const updatedOpportunity = {
      id: 'opp-uuid',
      tenantId: 'tenant-abc',
      accountId: 'account-uuid',
      ownerId: 'user-123',
      title: 'Updated Deal',
      stage: 'qualification',
      createdAt: now,
      updatedAt: now,
      createdBy: 'user-123',
    };

    mockUpdateOpportunity.mockResolvedValue(updatedOpportunity);

    const req = mockReq(
      { title: 'Updated Deal', stage: 'qualification' },
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { id: 'opp-uuid' },
    );
    const res = mockRes();

    await handleUpdateOpportunity(req, res);

    expect(mockUpdateOpportunity).toHaveBeenCalledWith(
      'opp-uuid',
      'tenant-abc',
      expect.objectContaining({ title: 'Updated Deal', stage: 'qualification' }),
      'user-123',
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(updatedOpportunity);
  });

  it('returns 400 when the service throws a VALIDATION_ERROR', async () => {
    const validationErr = Object.assign(new Error('Opportunity title is required'), {
      code: 'VALIDATION_ERROR',
    });
    mockUpdateOpportunity.mockRejectedValue(validationErr);

    const req = mockReq(
      { title: '' },
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { id: 'opp-uuid' },
    );
    const res = mockRes();

    await handleUpdateOpportunity(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Opportunity title is required' });
  });

  it('returns 404 when the service throws a NOT_FOUND error', async () => {
    const notFoundErr = Object.assign(new Error('Opportunity not found'), { code: 'NOT_FOUND' });
    mockUpdateOpportunity.mockRejectedValue(notFoundErr);

    const req = mockReq(
      { title: 'Updated Deal' },
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { id: 'missing-id' },
    );
    const res = mockRes();

    await handleUpdateOpportunity(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Opportunity not found' });
  });

  it('returns 500 when the service throws an unexpected error', async () => {
    mockUpdateOpportunity.mockRejectedValue(new Error('Database error'));

    const req = mockReq(
      { title: 'Updated Deal' },
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { id: 'opp-uuid' },
    );
    const res = mockRes();

    await handleUpdateOpportunity(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'An unexpected error occurred' });
  });

  it('only passes fields present in the request body to the service', async () => {
    const now = new Date();
    mockUpdateOpportunity.mockResolvedValue({
      id: 'opp-uuid',
      tenantId: 'tenant-abc',
      accountId: 'account-uuid',
      ownerId: 'user-123',
      title: 'Unchanged',
      stage: 'proposal',
      createdAt: now,
      updatedAt: now,
      createdBy: 'user-123',
    });

    const req = mockReq(
      { stage: 'proposal' },
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { id: 'opp-uuid' },
    );
    const res = mockRes();

    await handleUpdateOpportunity(req, res);

    expect(mockUpdateOpportunity).toHaveBeenCalledWith(
      'opp-uuid',
      'tenant-abc',
      { stage: 'proposal' },
      'user-123',
    );
  });
});
