import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../auth.js';

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { requireSuperAdmin } = await import('../superAdmin.js');

function mockReq(userId?: string): AuthenticatedRequest {
  return {
    path: '/api/platform/tenants',
    user: userId
      ? { userId, tenantId: undefined, roles: [], permissions: [] }
      : undefined,
  } as unknown as AuthenticatedRequest;
}

function mockRes(): Response {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
}

describe('requireSuperAdmin middleware', () => {
  let next: NextFunction;
  const originalEnv = process.env.SUPER_ADMIN_IDS;

  beforeEach(() => {
    next = vi.fn();
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.SUPER_ADMIN_IDS;
    } else {
      process.env.SUPER_ADMIN_IDS = originalEnv;
    }
  });

  it('calls next() when the user is in SUPER_ADMIN_IDS', () => {
    process.env.SUPER_ADMIN_IDS = 'admin-1,admin-2';
    const req = mockReq('admin-1');
    const res = mockRes();

    requireSuperAdmin(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('calls next() for a second super-admin in the list', () => {
    process.env.SUPER_ADMIN_IDS = 'admin-1,admin-2';
    const req = mockReq('admin-2');
    const res = mockRes();

    requireSuperAdmin(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('returns 403 when the user is not in SUPER_ADMIN_IDS', () => {
    process.env.SUPER_ADMIN_IDS = 'admin-1,admin-2';
    const req = mockReq('regular-user');
    const res = mockRes();

    requireSuperAdmin(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Not a platform admin', code: 'FORBIDDEN' });
  });

  it('returns 403 when SUPER_ADMIN_IDS is not set', () => {
    delete process.env.SUPER_ADMIN_IDS;
    const req = mockReq('any-user');
    const res = mockRes();

    requireSuperAdmin(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('returns 403 when req.user is not set', () => {
    process.env.SUPER_ADMIN_IDS = 'admin-1';
    const req = mockReq();
    const res = mockRes();

    requireSuperAdmin(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('trims whitespace from IDs in SUPER_ADMIN_IDS', () => {
    process.env.SUPER_ADMIN_IDS = ' admin-1 , admin-2 ';
    const req = mockReq('admin-1');
    const res = mockRes();

    requireSuperAdmin(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});
