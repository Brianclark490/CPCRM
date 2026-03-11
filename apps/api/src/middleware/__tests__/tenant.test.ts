import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../auth.js';
import { requireTenant } from '../tenant.js';

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
  });

  it('returns 403 when req.user is not set (requireAuth not called)', () => {
    const req = { path: '/accounts' } as AuthenticatedRequest;
    const res = mockRes();

    requireTenant(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'No active tenant context for this user' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when req.user is set but tenantId is absent', () => {
    const req = {
      path: '/accounts',
      user: { userId: 'user123', email: 'user@example.com' },
    } as AuthenticatedRequest;
    const res = mockRes();

    requireTenant(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'No active tenant context for this user' });
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next when tenantId is present on req.user', () => {
    const req = {
      path: '/accounts',
      user: { userId: 'user123', tenantId: 'tenant-abc' },
    } as AuthenticatedRequest;
    const res = mockRes();

    requireTenant(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });
});
