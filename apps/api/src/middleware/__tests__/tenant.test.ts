import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../auth.js';

const mockQuery = vi.fn();
const mockLoggerWarn = vi.fn();
const mockLoggerError = vi.fn();

vi.mock('../../db/client.js', () => ({
  pool: {
    query: (...args: unknown[]) => mockQuery(...args),
  },
}));

vi.mock('../../lib/logger.js', () => ({
  logger: {
    warn: mockLoggerWarn,
    error: mockLoggerError,
  },
}));

const { requireTenant } = await import('../tenant.js');

function mockRes(): Response {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

describe('requireTenant middleware', () => {
  let next: NextFunction;

  beforeEach(() => {
    next = vi.fn();
    mockQuery.mockReset();
    mockLoggerWarn.mockReset();
    mockLoggerError.mockReset();
  });

  it('returns 403 NO_TENANT when req.user is not set (requireAuth not called)', async () => {
    const req = { path: '/accounts' } as AuthenticatedRequest;
    const res = mockRes();

    await requireTenant(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: 'No tenant selected. User must belong to a tenant.',
      code: 'NO_TENANT',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 NO_TENANT when req.user is set but tenantId is absent', async () => {
    const req = {
      path: '/accounts',
      user: { userId: 'user123', email: 'user@example.com' },
    } as AuthenticatedRequest;
    const res = mockRes();

    await requireTenant(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: 'No tenant selected. User must belong to a tenant.',
      code: 'NO_TENANT',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 INVALID_TENANT when tenant is not found in the database', async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    const req = {
      path: '/accounts',
      user: { userId: 'user123', tenantId: 'tenant-unknown' },
    } as AuthenticatedRequest;
    const res = mockRes();

    await requireTenant(req, res, next);

    expect(mockQuery).toHaveBeenCalledWith(
      'SELECT id, status FROM tenants WHERE id = $1',
      ['tenant-unknown'],
    );
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Tenant not found', code: 'INVALID_TENANT' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 TENANT_SUSPENDED when tenant exists but is not active', async () => {
    mockQuery.mockResolvedValue({ rows: [{ id: 'tenant-abc', status: 'suspended' }] });

    const req = {
      path: '/accounts',
      user: { userId: 'user123', tenantId: 'tenant-abc' },
    } as AuthenticatedRequest;
    const res = mockRes();

    await requireTenant(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Tenant is suspended', code: 'TENANT_SUSPENDED' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 TENANT_SUSPENDED when tenant status is inactive', async () => {
    mockQuery.mockResolvedValue({ rows: [{ id: 'tenant-abc', status: 'inactive' }] });

    const req = {
      path: '/accounts',
      user: { userId: 'user123', tenantId: 'tenant-abc' },
    } as AuthenticatedRequest;
    const res = mockRes();

    await requireTenant(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Tenant is suspended', code: 'TENANT_SUSPENDED' });
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next when tenant exists and is active', async () => {
    mockQuery.mockResolvedValue({ rows: [{ id: 'tenant-abc', status: 'active' }] });

    const req = {
      path: '/accounts',
      user: { userId: 'user123', tenantId: 'tenant-abc' },
    } as AuthenticatedRequest;
    const res = mockRes();

    await requireTenant(req, res, next);

    expect(mockQuery).toHaveBeenCalledWith(
      'SELECT id, status FROM tenants WHERE id = $1',
      ['tenant-abc'],
    );
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('returns 503 when the database query fails', async () => {
    mockQuery.mockRejectedValue(new Error('Connection refused'));

    const req = {
      path: '/accounts',
      user: { userId: 'user123', tenantId: 'tenant-abc' },
    } as AuthenticatedRequest;
    const res = mockRes();

    await requireTenant(req, res, next);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({ error: 'Tenant validation service unavailable' });
    expect(next).not.toHaveBeenCalled();
  });
});
