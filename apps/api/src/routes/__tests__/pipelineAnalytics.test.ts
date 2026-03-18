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

// ─── Mock the analytics service ──────────────────────────────────────────────

const mockGetPipelineSummary = vi.fn();
const mockGetPipelineVelocity = vi.fn();
const mockGetOverdueRecords = vi.fn();

vi.mock('../../services/pipelineAnalyticsService.js', () => ({
  getPipelineSummary: mockGetPipelineSummary,
  getPipelineVelocity: mockGetPipelineVelocity,
  getOverdueRecords: mockGetOverdueRecords,
}));

// ─── Mock logger so tests stay silent ────────────────────────────────────────

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const {
  handleGetSummary,
  handleGetVelocity,
  handleGetOverdue,
} = await import('../pipelineAnalytics.js');

// ─── Constants ───────────────────────────────────────────────────────────────

const PIPELINE_ID = '00000000-0000-0000-0000-000000000001';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mockReq(
  user = { userId: 'user-123', tenantId: 'tenant-abc' },
  params: Record<string, string> = { pipelineId: PIPELINE_ID },
  query: Record<string, string> = {},
) {
  return {
    body: {},
    path: `/pipelines/${PIPELINE_ID}`,
    user,
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

// ─── Tests: GET /pipelines/:pipelineId/summary ─────────────────────────────

describe('GET /pipelines/:pipelineId/summary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with pipeline summary', async () => {
    const summaryData = {
      pipeline: { id: PIPELINE_ID, name: 'Sales Pipeline' },
      stages: [
        {
          id: 'stage-1',
          name: 'Prospecting',
          stageType: 'open',
          recordCount: 5,
          totalValue: 45000,
          weightedValue: 4500,
          avgDaysInStage: 8,
          overdueCount: 1,
        },
      ],
      totals: {
        openDeals: 12,
        totalOpenValue: 185000,
        totalWeightedValue: 92500,
        avgDealSize: 15417,
        wonThisMonth: 3,
        wonValueThisMonth: 55000,
        lostThisMonth: 1,
      },
    };

    mockGetPipelineSummary.mockResolvedValue(summaryData);

    const req = mockReq();
    const res = mockRes();

    await handleGetSummary(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(summaryData);
    expect(mockGetPipelineSummary).toHaveBeenCalledWith(PIPELINE_ID, 'user-123');
  });

  it('returns 404 when pipeline not found', async () => {
    const err = new Error('Pipeline not found') as Error & { code: string };
    err.code = 'NOT_FOUND';
    mockGetPipelineSummary.mockRejectedValue(err);

    const req = mockReq();
    const res = mockRes();

    await handleGetSummary(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Pipeline not found',
      code: 'NOT_FOUND',
    });
  });

  it('returns 500 on unexpected error', async () => {
    mockGetPipelineSummary.mockRejectedValue(new Error('DB down'));

    const req = mockReq();
    const res = mockRes();

    await handleGetSummary(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'An unexpected error occurred' });
  });
});

// ─── Tests: GET /pipelines/:pipelineId/velocity ────────────────────────────

describe('GET /pipelines/:pipelineId/velocity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with default period (30d)', async () => {
    const velocityData = {
      period: '30d',
      stages: [
        {
          name: 'Prospecting',
          entered: 10,
          exited: 7,
          avgDays: 9,
          expectedDays: 14,
          conversionRate: 70,
        },
      ],
      overallConversion: 25,
      avgDaysToClose: 45,
    };

    mockGetPipelineVelocity.mockResolvedValue(velocityData);

    const req = mockReq(undefined, undefined, {});
    const res = mockRes();

    await handleGetVelocity(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(velocityData);
    expect(mockGetPipelineVelocity).toHaveBeenCalledWith(PIPELINE_ID, 'user-123', '30d');
  });

  it('passes period query parameter to service', async () => {
    mockGetPipelineVelocity.mockResolvedValue({ period: '7d', stages: [], overallConversion: 0, avgDaysToClose: 0 });

    const req = mockReq(undefined, undefined, { period: '7d' });
    const res = mockRes();

    await handleGetVelocity(req, res);

    expect(mockGetPipelineVelocity).toHaveBeenCalledWith(PIPELINE_ID, 'user-123', '7d');
  });

  it('returns 400 on invalid period', async () => {
    const err = new Error('period must be one of: 7d, 30d, 90d, all') as Error & { code: string };
    err.code = 'VALIDATION_ERROR';
    mockGetPipelineVelocity.mockRejectedValue(err);

    const req = mockReq(undefined, undefined, { period: 'invalid' });
    const res = mockRes();

    await handleGetVelocity(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'period must be one of: 7d, 30d, 90d, all',
      code: 'VALIDATION_ERROR',
    });
  });

  it('returns 404 when pipeline not found', async () => {
    const err = new Error('Pipeline not found') as Error & { code: string };
    err.code = 'NOT_FOUND';
    mockGetPipelineVelocity.mockRejectedValue(err);

    const req = mockReq();
    const res = mockRes();

    await handleGetVelocity(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 500 on unexpected error', async () => {
    mockGetPipelineVelocity.mockRejectedValue(new Error('DB down'));

    const req = mockReq();
    const res = mockRes();

    await handleGetVelocity(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ─── Tests: GET /pipelines/:pipelineId/overdue ─────────────────────────────

describe('GET /pipelines/:pipelineId/overdue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with overdue records', async () => {
    const overdueData = [
      {
        id: 'rec-1',
        name: 'Big Deal',
        value: 50000,
        daysInStage: 20,
        expectedDays: 14,
        stageName: 'Prospecting',
        ownerId: 'user-123',
      },
    ];

    mockGetOverdueRecords.mockResolvedValue(overdueData);

    const req = mockReq();
    const res = mockRes();

    await handleGetOverdue(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(overdueData);
    expect(mockGetOverdueRecords).toHaveBeenCalledWith(PIPELINE_ID, 'user-123');
  });

  it('returns 404 when pipeline not found', async () => {
    const err = new Error('Pipeline not found') as Error & { code: string };
    err.code = 'NOT_FOUND';
    mockGetOverdueRecords.mockRejectedValue(err);

    const req = mockReq();
    const res = mockRes();

    await handleGetOverdue(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 500 on unexpected error', async () => {
    mockGetOverdueRecords.mockRejectedValue(new Error('DB down'));

    const req = mockReq();
    const res = mockRes();

    await handleGetOverdue(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
