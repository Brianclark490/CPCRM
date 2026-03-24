import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../../middleware/auth.js';

// ─── Mock middleware ──────────────────────────────────────────────────────────

vi.mock('../../middleware/auth.js', () => ({
  requireAuth: vi.fn((_req: AuthenticatedRequest, _res: Response, next: NextFunction) => next()),
}));

vi.mock('../../middleware/tenant.js', () => ({
  requireTenant: vi.fn((_req: AuthenticatedRequest, _res: Response, next: NextFunction) => next()),
}));

// ─── Mock the service ────────────────────────────────────────────────────────

const mockUpsertTarget = vi.fn();
const mockListTargets = vi.fn();
const mockDeleteTarget = vi.fn();

vi.mock('../../services/salesTargetService.js', () => ({
  upsertTarget: mockUpsertTarget,
  listTargets: mockListTargets,
  deleteTarget: mockDeleteTarget,
}));

// ─── Mock logger so tests stay silent ────────────────────────────────────────

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const {
  handleCreateTarget,
  handleListTargets,
  handleDeleteTarget,
} = await import('../adminTargets.js');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mockReq(
  body: unknown = {},
  params: Record<string, string> = {},
  query: Record<string, string> = {},
) {
  return {
    body,
    path: '/admin/targets',
    user: { userId: 'user-123', tenantId: 'tenant-abc', roles: [], permissions: [] },
    params,
    query,
  } as unknown as AuthenticatedRequest;
}

function mockRes() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    end: vi.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

// ─── Tests: POST /admin/targets ─────────────────────────────────────────────

describe('POST /admin/targets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 201 with created target', async () => {
    const target = {
      id: 'target-1',
      tenant_id: 'tenant-abc',
      target_type: 'business',
      target_entity_id: null,
      period_type: 'quarterly',
      period_start: '2026-01-01',
      period_end: '2026-04-01',
      target_value: 500000,
      currency: 'GBP',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };

    mockUpsertTarget.mockResolvedValue(target);

    const req = mockReq({
      target_type: 'business',
      period_type: 'quarterly',
      period_start: '2026-01-01',
      period_end: '2026-04-01',
      target_value: 500000,
    });
    const res = mockRes();

    await handleCreateTarget(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(target);
    expect(mockUpsertTarget).toHaveBeenCalledWith('tenant-abc', {
      targetType: 'business',
      targetEntityId: undefined,
      periodType: 'quarterly',
      periodStart: '2026-01-01',
      periodEnd: '2026-04-01',
      targetValue: 500000,
      currency: undefined,
    });
  });

  it('accepts camelCase body params', async () => {
    const target = {
      id: 'target-2',
      target_type: 'user',
      target_value: 100000,
    };

    mockUpsertTarget.mockResolvedValue(target);

    const req = mockReq({
      targetType: 'user',
      targetEntityId: 'user-rec-1',
      periodType: 'monthly',
      periodStart: '2026-03-01',
      periodEnd: '2026-04-01',
      targetValue: 100000,
      currency: 'USD',
    });
    const res = mockRes();

    await handleCreateTarget(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(mockUpsertTarget).toHaveBeenCalledWith('tenant-abc', {
      targetType: 'user',
      targetEntityId: 'user-rec-1',
      periodType: 'monthly',
      periodStart: '2026-03-01',
      periodEnd: '2026-04-01',
      targetValue: 100000,
      currency: 'USD',
    });
  });

  it('returns 400 on validation error', async () => {
    const err = new Error('target_type must be one of: business, team, user') as Error & { code: string };
    err.code = 'VALIDATION_ERROR';
    mockUpsertTarget.mockRejectedValue(err);

    const req = mockReq({ target_type: 'invalid' });
    const res = mockRes();

    await handleCreateTarget(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'target_type must be one of: business, team, user',
      code: 'VALIDATION_ERROR',
    });
  });

  it('returns 500 on unexpected error', async () => {
    mockUpsertTarget.mockRejectedValue(new Error('DB down'));

    const req = mockReq({ target_type: 'business' });
    const res = mockRes();

    await handleCreateTarget(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'An unexpected error occurred' });
  });
});

// ─── Tests: GET /admin/targets ──────────────────────────────────────────────

describe('GET /admin/targets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with targets list', async () => {
    const targets = [
      { id: 'target-1', target_type: 'business', target_value: 500000 },
      { id: 'target-2', target_type: 'team', target_value: 300000 },
    ];

    mockListTargets.mockResolvedValue(targets);

    const req = mockReq({}, {}, {});
    const res = mockRes();

    await handleListTargets(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(targets);
    expect(mockListTargets).toHaveBeenCalledWith('tenant-abc', undefined, undefined);
  });

  it('passes period filters to service', async () => {
    mockListTargets.mockResolvedValue([]);

    const req = mockReq({}, {}, { period_start: '2026-01-01', period_end: '2026-04-01' });
    const res = mockRes();

    await handleListTargets(req, res);

    expect(mockListTargets).toHaveBeenCalledWith('tenant-abc', '2026-01-01', '2026-04-01');
  });

  it('returns 500 on unexpected error', async () => {
    mockListTargets.mockRejectedValue(new Error('DB down'));

    const req = mockReq();
    const res = mockRes();

    await handleListTargets(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'An unexpected error occurred' });
  });
});

// ─── Tests: DELETE /admin/targets/:id ───────────────────────────────────────

describe('DELETE /admin/targets/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 204 on successful deletion', async () => {
    mockDeleteTarget.mockResolvedValue(undefined);

    const req = mockReq({}, { id: 'target-1' });
    const res = mockRes();

    await handleDeleteTarget(req, res);

    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.end).toHaveBeenCalled();
    expect(mockDeleteTarget).toHaveBeenCalledWith('tenant-abc', 'target-1');
  });

  it('returns 404 when target not found', async () => {
    const err = new Error('Target not found') as Error & { code: string };
    err.code = 'NOT_FOUND';
    mockDeleteTarget.mockRejectedValue(err);

    const req = mockReq({}, { id: 'nonexistent' });
    const res = mockRes();

    await handleDeleteTarget(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Target not found',
      code: 'NOT_FOUND',
    });
  });

  it('returns 500 on unexpected error', async () => {
    mockDeleteTarget.mockRejectedValue(new Error('DB down'));

    const req = mockReq({}, { id: 'target-1' });
    const res = mockRes();

    await handleDeleteTarget(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'An unexpected error occurred' });
  });
});
