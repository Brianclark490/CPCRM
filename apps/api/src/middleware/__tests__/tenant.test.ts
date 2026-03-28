import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../auth.js';

const mockQuery = vi.fn();
const mockLoggerWarn = vi.fn();
const mockLoggerError = vi.fn();
const mockLoggerInfo = vi.fn();
const mockSeedDefaultObjects = vi.fn();
const mockSyncUserRecord = vi.fn();

vi.mock('../../db/client.js', () => ({
  pool: {
    query: (...args: unknown[]) => mockQuery(...args),
  },
}));

vi.mock('../../lib/logger.js', () => ({
  logger: {
    warn: mockLoggerWarn,
    error: mockLoggerError,
    info: mockLoggerInfo,
  },
}));

vi.mock('../../services/seedDefaultObjects.js', () => ({
  seedDefaultObjects: (...args: unknown[]) => mockSeedDefaultObjects(...args),
}));

vi.mock('../../services/userSyncService.js', () => ({
  syncUserRecord: (...args: unknown[]) => mockSyncUserRecord(...args),
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
    mockLoggerInfo.mockReset();
    mockSeedDefaultObjects.mockReset();
    mockSyncUserRecord.mockReset();
    mockSyncUserRecord.mockResolvedValue({ userRecordId: '', created: false });
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

  it('auto-provisions tenant when not found in the database', async () => {
    // First call: SELECT returns no rows (tenant not found)
    // Second call: INSERT returns the new row
    // Third call: SELECT returns the auto-provisioned row
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // initial SELECT
      .mockResolvedValueOnce({ rows: [{ id: 'tenant-new', status: 'active' }] }) // INSERT RETURNING
      .mockResolvedValueOnce({ rows: [{ id: 'tenant-new', status: 'active' }] }); // re-read SELECT
    mockSeedDefaultObjects.mockResolvedValue({});

    const req = {
      path: '/accounts',
      user: { userId: 'user123', tenantId: 'tenant-new' },
    } as AuthenticatedRequest;
    const res = mockRes();

    await requireTenant(req, res, next);

    expect(mockQuery).toHaveBeenCalledWith(
      'SELECT id, status FROM tenants WHERE id = $1',
      ['tenant-new'],
    );
    expect(mockSeedDefaultObjects).toHaveBeenCalledWith('tenant-new', 'user123');
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 403 INVALID_TENANT when auto-provisioning fails completely', async () => {
    // Initial SELECT: no rows; INSERT: fails; re-read: no rows
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // initial SELECT
      .mockRejectedValueOnce(new Error('insert failed')); // INSERT throws

    const req = {
      path: '/accounts',
      user: { userId: 'user123', tenantId: 'tenant-unknown' },
    } as AuthenticatedRequest;
    const res = mockRes();

    await requireTenant(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Tenant not found', code: 'INVALID_TENANT' });
    expect(next).not.toHaveBeenCalled();
  });

  it('continues even if seeding fails after tenant row is created', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // initial SELECT
      .mockResolvedValueOnce({ rows: [{ id: 'tenant-new', status: 'active' }] }) // INSERT RETURNING
      .mockResolvedValueOnce({ rows: [{ id: 'tenant-new', status: 'active' }] }); // re-read SELECT
    mockSeedDefaultObjects.mockRejectedValue(new Error('seed failure'));

    const req = {
      path: '/accounts',
      user: { userId: 'user123', tenantId: 'tenant-new' },
    } as AuthenticatedRequest;
    const res = mockRes();

    await requireTenant(req, res, next);

    // Should still proceed despite seed failure
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
    expect(mockLoggerError).toHaveBeenCalled();
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
    mockSyncUserRecord.mockResolvedValue({ userRecordId: 'user-record-123', created: false });

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
    expect(req.user?.recordId).toBe('user-record-123');
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

  it('skips seeding when tenant row was created by a concurrent request', async () => {
    // Initial SELECT: no rows; INSERT: ON CONFLICT DO NOTHING (0 rows); re-read: found
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // initial SELECT
      .mockResolvedValueOnce({ rows: [] }) // INSERT with ON CONFLICT DO NOTHING
      .mockResolvedValueOnce({ rows: [{ id: 'tenant-race', status: 'active' }] }); // re-read SELECT

    const req = {
      path: '/accounts',
      user: { userId: 'user123', tenantId: 'tenant-race' },
    } as AuthenticatedRequest;
    const res = mockRes();

    await requireTenant(req, res, next);

    expect(mockSeedDefaultObjects).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });
});
