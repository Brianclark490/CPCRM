import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

// ─── Mock the database pool ──────────────────────────────────────────────────

const mockQuery = vi.fn();

vi.mock('../../db/client.js', () => ({
  pool: { query: mockQuery },
}));

// ─── Mock logger so tests stay silent ────────────────────────────────────────

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { handleHealthCheck } = await import('../health.js');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mockRes() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

// ─── GET /health ─────────────────────────────────────────────────────────────

describe('GET /health', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('returns 200 with status ok when the database is reachable', async () => {
    mockQuery.mockResolvedValue({ rows: [{ '?column?': 1 }] });

    const res = mockRes();

    await handleHealthCheck({} as Request, res);

    expect(mockQuery).toHaveBeenCalledWith('SELECT 1');
    expect(res.json).toHaveBeenCalledWith({ status: 'ok' });
  });

  it('returns 503 with degraded status when the database is unreachable', async () => {
    mockQuery.mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:5432'));

    const res = mockRes();

    await handleHealthCheck({} as Request, res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({
      status: 'degraded',
      error: 'Database connection failed',
    });
  });

  it('logs the error when the database check fails', async () => {
    const { logger } = await import('../../lib/logger.js');
    const dbError = new Error('connection timeout');
    mockQuery.mockRejectedValue(dbError);

    const res = mockRes();

    await handleHealthCheck({} as Request, res);

    expect(logger.error).toHaveBeenCalledWith(
      { err: dbError },
      'Health check failed: database unreachable',
    );
  });
});
