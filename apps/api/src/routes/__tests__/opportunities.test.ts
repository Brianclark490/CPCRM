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

vi.mock('../../services/opportunityService.js', () => ({
  createOpportunity: mockCreateOpportunity,
}));

// ─── Mock logger so tests stay silent ────────────────────────────────────────

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { handleCreateOpportunity } = await import('../opportunities.js');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mockReq(body: unknown, user = { userId: 'user-123', tenantId: 'tenant-abc' }) {
  return {
    body,
    path: '/opportunities',
    user,
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
