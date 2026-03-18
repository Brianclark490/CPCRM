import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../auth.js';
import { requirePermission, requireRole } from '../permission.js';

vi.mock('../../lib/logger.js', () => ({
  logger: {
    warn: vi.fn(),
  },
}));

function mockRes(): Response {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

function mockReq(overrides: Partial<AuthenticatedRequest['user']> = {}): AuthenticatedRequest {
  return {
    path: '/test',
    user: {
      userId: 'user123',
      roles: [],
      permissions: [],
      ...overrides,
    },
  } as AuthenticatedRequest;
}

describe('requirePermission middleware', () => {
  let next: NextFunction;

  beforeEach(() => {
    next = vi.fn();
  });

  it('calls next when the user has the required permission', () => {
    const req = mockReq({ permissions: ['records:read', 'records:create'] });
    const res = mockRes();

    requirePermission('records:read')(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('calls next when the user has all required permissions', () => {
    const req = mockReq({
      permissions: ['records:read', 'records:create', 'records:update'],
    });
    const res = mockRes();

    requirePermission('records:read', 'records:create')(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 403 when the user lacks a required permission', () => {
    const req = mockReq({ permissions: ['records:read'] });
    const res = mockRes();

    requirePermission('records:delete')(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Forbidden: insufficient permissions' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when the user has some but not all required permissions', () => {
    const req = mockReq({ permissions: ['records:read'] });
    const res = mockRes();

    requirePermission('records:read', 'objects:manage')(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when req.user is not set', () => {
    const req = { path: '/test' } as AuthenticatedRequest;
    const res = mockRes();

    requirePermission('records:read')(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when the user has no permissions at all', () => {
    const req = mockReq({ permissions: [] });
    const res = mockRes();

    requirePermission('admin:access')(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('requireRole middleware', () => {
  let next: NextFunction;

  beforeEach(() => {
    next = vi.fn();
  });

  it('calls next when the user has the required role', () => {
    const req = mockReq({ roles: ['admin'] });
    const res = mockRes();

    requireRole('admin')(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('calls next when the user has one of the allowed roles', () => {
    const req = mockReq({ roles: ['manager'] });
    const res = mockRes();

    requireRole('admin', 'manager')(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 403 when the user lacks the required role', () => {
    const req = mockReq({ roles: ['user'] });
    const res = mockRes();

    requireRole('admin')(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Forbidden: insufficient role' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when the user has no roles', () => {
    const req = mockReq({ roles: [] });
    const res = mockRes();

    requireRole('admin')(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when req.user is not set', () => {
    const req = { path: '/test' } as AuthenticatedRequest;
    const res = mockRes();

    requireRole('admin')(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
