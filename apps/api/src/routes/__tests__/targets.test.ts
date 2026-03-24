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

const mockGetTargetSummary = vi.fn();
const mockGetUserTarget = vi.fn();

vi.mock('../../services/salesTargetService.js', () => ({
  getTargetSummary: mockGetTargetSummary,
  getUserTarget: mockGetUserTarget,
}));

// ─── Mock logger so tests stay silent ────────────────────────────────────────

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const {
  handleGetTargetSummary,
  handleGetUserTarget,
} = await import('../targets.js');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mockReq(
  params: Record<string, string> = {},
  query: Record<string, string> = {},
) {
  return {
    body: {},
    path: '/targets/summary',
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

// ─── Tests: GET /targets/summary ────────────────────────────────────────────

describe('GET /targets/summary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with target summary', async () => {
    const summaryData = {
      period: { type: 'quarterly', label: 'Q1 2026' },
      business: {
        target: 500000,
        actual: 325000,
        percentage: 65,
        pace: 'on_track',
        currency: 'GBP',
      },
      teams: [
        {
          name: 'Sales UK',
          target: 300000,
          actual: 210000,
          percentage: 70,
          users: [
            { name: 'Brian Clark', target: 200000, actual: 145000, percentage: 73 },
            { name: 'Lewis Walls', target: 100000, actual: 65000, percentage: 65 },
          ],
        },
      ],
    };

    mockGetTargetSummary.mockResolvedValue(summaryData);

    const req = mockReq();
    const res = mockRes();

    await handleGetTargetSummary(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(summaryData);
    expect(mockGetTargetSummary).toHaveBeenCalledWith('tenant-abc', undefined, undefined);
  });

  it('passes period query parameters to service', async () => {
    mockGetTargetSummary.mockResolvedValue({ period: { type: 'annual', label: '2026' }, business: {}, teams: [] });

    const req = mockReq({}, { period_start: '2026-01-01', period_end: '2026-12-31' });
    const res = mockRes();

    await handleGetTargetSummary(req, res);

    expect(mockGetTargetSummary).toHaveBeenCalledWith('tenant-abc', '2026-01-01', '2026-12-31');
  });

  it('returns 500 on unexpected error', async () => {
    mockGetTargetSummary.mockRejectedValue(new Error('DB down'));

    const req = mockReq();
    const res = mockRes();

    await handleGetTargetSummary(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'An unexpected error occurred' });
  });
});

// ─── Tests: GET /targets/user/:userId ───────────────────────────────────────

describe('GET /targets/user/:userId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with user target data', async () => {
    const userData = {
      userId: 'user-456',
      name: 'Brian Clark',
      target: 200000,
      actual: 145000,
      percentage: 73,
      currency: 'GBP',
      period: 'Q1 2026',
    };

    mockGetUserTarget.mockResolvedValue(userData);

    const req = mockReq({ userId: 'user-456' });
    const res = mockRes();

    await handleGetUserTarget(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(userData);
    expect(mockGetUserTarget).toHaveBeenCalledWith('tenant-abc', 'user-456', undefined, undefined);
  });

  it('passes period query parameters to service', async () => {
    mockGetUserTarget.mockResolvedValue({ userId: 'user-456', target: 0, actual: 0, percentage: 0 });

    const req = mockReq({ userId: 'user-456' }, { period_start: '2026-01-01', period_end: '2026-04-01' });
    const res = mockRes();

    await handleGetUserTarget(req, res);

    expect(mockGetUserTarget).toHaveBeenCalledWith('tenant-abc', 'user-456', '2026-01-01', '2026-04-01');
  });

  it('returns 500 on unexpected error', async () => {
    mockGetUserTarget.mockRejectedValue(new Error('DB down'));

    const req = mockReq({ userId: 'user-456' });
    const res = mockRes();

    await handleGetUserTarget(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'An unexpected error occurred' });
  });
});
