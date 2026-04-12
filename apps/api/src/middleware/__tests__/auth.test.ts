import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../auth.js';

const mockValidateSession = vi.fn();
const mockLoggerWarn = vi.fn();
const mockLoggerError = vi.fn();

vi.mock('@descope/node-sdk', () => ({
  default: vi.fn(() => ({
    validateSession: mockValidateSession,
  })),
}));

vi.mock('../../lib/logger.js', () => ({
  logger: {
    warn: mockLoggerWarn,
    error: mockLoggerError,
  },
}));

vi.stubEnv('DESCOPE_PROJECT_ID', 'P_test_project_id');

const { requireAuth } = await import('../auth.js');

function mockRes(): Response {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

function mockReq(
  overrides: {
    headers?: Record<string, string>;
    cookies?: Record<string, string>;
    path?: string;
  } = {},
): AuthenticatedRequest {
  return {
    headers: {},
    cookies: {},
    ...overrides,
  } as unknown as AuthenticatedRequest;
}

describe('requireAuth middleware', () => {
  let next: NextFunction;

  beforeEach(() => {
    next = vi.fn();
    mockValidateSession.mockReset();
    mockLoggerWarn.mockReset();
    mockLoggerError.mockReset();
  });

  it('returns 401 when neither cookie nor Authorization header is present', async () => {
    const req = mockReq();
    const res = mockRes();

    await requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Missing authentication credentials' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when Authorization header does not start with Bearer', async () => {
    const req = mockReq({ headers: { authorization: 'Basic abc123' } });
    const res = mockRes();

    await requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when token validation fails (Bearer header)', async () => {
    mockValidateSession.mockRejectedValue(new Error('Invalid token'));

    const req = mockReq({ headers: { authorization: 'Bearer invalid_token' } });
    const res = mockRes();

    await requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when token is valid but missing subject claim', async () => {
    mockValidateSession.mockResolvedValue({
      token: { sub: undefined, email: 'user@example.com', name: 'Test User' },
    });

    const req = mockReq({ headers: { authorization: 'Bearer valid_token' } });
    const res = mockRes();

    await requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid token: missing subject claim' });
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next and sets req.user when token is valid without tenant claim (Bearer header)', async () => {
    mockValidateSession.mockResolvedValue({
      token: { sub: 'user123', email: 'user@example.com', name: 'Test User' },
    });

    const req = mockReq({ headers: { authorization: 'Bearer valid_token' } });
    const res = mockRes();

    await requireAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toEqual({
      userId: 'user123',
      email: 'user@example.com',
      name: 'Test User',
      tenantId: undefined,
      roles: [],
      permissions: [],
    });
  });

  it('reads the session token from the cpcrm_session cookie', async () => {
    mockValidateSession.mockResolvedValue({
      token: { sub: 'user123', email: 'user@example.com', name: 'Test User' },
    });

    const req = mockReq({ cookies: { cpcrm_session: 'cookie-token' } });
    const res = mockRes();

    await requireAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(mockValidateSession).toHaveBeenCalledWith('cookie-token');
    expect(req.user?.userId).toBe('user123');
  });

  it('prefers the cookie over the Authorization header when both are present', async () => {
    mockValidateSession.mockResolvedValue({
      token: { sub: 'user123', email: 'user@example.com', name: 'Test User' },
    });

    const req = mockReq({
      headers: { authorization: 'Bearer header-token' },
      cookies: { cpcrm_session: 'cookie-token' },
    });
    const res = mockRes();

    await requireAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(mockValidateSession).toHaveBeenCalledWith('cookie-token');
  });

  it('falls back to Authorization header when no cookie is present', async () => {
    mockValidateSession.mockResolvedValue({
      token: { sub: 'user123', email: 'user@example.com', name: 'Test User' },
    });

    const req = mockReq({ headers: { authorization: 'Bearer header-token' } });
    const res = mockRes();

    await requireAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(mockValidateSession).toHaveBeenCalledWith('header-token');
  });

  it('resolves tenantId from the JWT tenants claim', async () => {
    mockValidateSession.mockResolvedValue({
      token: {
        sub: 'user123',
        email: 'user@example.com',
        name: 'Test User',
        tenants: { 'tenant-abc': { role: 'member' } },
      },
    });

    const req = mockReq({ cookies: { cpcrm_session: 'valid_token' } });
    const res = mockRes();

    await requireAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toEqual({
      userId: 'user123',
      email: 'user@example.com',
      name: 'Test User',
      tenantId: 'tenant-abc',
      roles: [],
      permissions: [],
    });
  });

  it('resolves tenantId from the dct claim when present', async () => {
    mockValidateSession.mockResolvedValue({
      token: {
        sub: 'user123',
        email: 'user@example.com',
        name: 'Test User',
        dct: 'tenant-from-dct',
        tenants: {
          'tenant-from-dct': {
            roles: ['admin'],
            permissions: ['objects:manage', 'admin:access'],
          },
        },
      },
    });

    const req = mockReq({ cookies: { cpcrm_session: 'valid_token' } });
    const res = mockRes();

    await requireAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toEqual({
      userId: 'user123',
      email: 'user@example.com',
      name: 'Test User',
      tenantId: 'tenant-from-dct',
      roles: ['admin'],
      permissions: ['objects:manage', 'admin:access'],
    });
  });

  it('prefers dct claim over tenants map when both are present with multiple tenants', async () => {
    mockValidateSession.mockResolvedValue({
      token: {
        sub: 'user123',
        dct: 'tenant-xyz',
        tenants: {
          'tenant-abc': { roles: ['user'], permissions: ['records:read'] },
          'tenant-xyz': { roles: ['admin'], permissions: ['admin:access'] },
        },
      },
    });

    const req = mockReq({ cookies: { cpcrm_session: 'valid_token' }, path: '/accounts' });
    const res = mockRes();

    await requireAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user?.tenantId).toBe('tenant-xyz');
    expect(req.user?.roles).toEqual(['admin']);
    expect(req.user?.permissions).toEqual(['admin:access']);
    expect(mockLoggerWarn).not.toHaveBeenCalled();
  });

  it('uses dct claim even when tenant is not in tenants map', async () => {
    mockValidateSession.mockResolvedValue({
      token: {
        sub: 'user123',
        dct: 'tenant-not-in-map',
        tenants: {
          'tenant-abc': { roles: ['user'] },
        },
      },
    });

    const req = mockReq({ cookies: { cpcrm_session: 'valid_token' } });
    const res = mockRes();

    await requireAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user?.tenantId).toBe('tenant-not-in-map');
    expect(req.user?.roles).toEqual([]);
    expect(req.user?.permissions).toEqual([]);
  });

  it('sets tenantId to undefined when the JWT tenants claim is an empty object', async () => {
    mockValidateSession.mockResolvedValue({
      token: { sub: 'user123', tenants: {} },
    });

    const req = mockReq({ cookies: { cpcrm_session: 'valid_token' } });
    const res = mockRes();

    await requireAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user?.tenantId).toBeUndefined();
  });

  it('resolves to the first tenantId and warns when JWT carries multiple tenant claims without dct', async () => {
    mockValidateSession.mockResolvedValue({
      token: {
        sub: 'user123',
        tenants: {
          'tenant-abc': { role: 'member' },
          'tenant-xyz': { role: 'admin' },
        },
      },
    });

    const req = mockReq({ cookies: { cpcrm_session: 'valid_token' }, path: '/accounts' });
    const res = mockRes();

    await requireAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user?.tenantId).toBe('tenant-abc');
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user123', tenantCount: 2 }),
      expect.stringContaining('Ambiguous tenant context'),
    );
  });

  it('resolves roles and permissions from the JWT tenant claim', async () => {
    mockValidateSession.mockResolvedValue({
      token: {
        sub: 'user123',
        email: 'admin@example.com',
        tenants: {
          'tenant-abc': {
            roles: ['admin'],
            permissions: ['objects:manage', 'records:create', 'records:read', 'admin:access'],
          },
        },
      },
    });

    const req = mockReq({ cookies: { cpcrm_session: 'valid_token' } });
    const res = mockRes();

    await requireAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toEqual({
      userId: 'user123',
      email: 'admin@example.com',
      name: undefined,
      tenantId: 'tenant-abc',
      roles: ['admin'],
      permissions: ['objects:manage', 'records:create', 'records:read', 'admin:access'],
    });
  });

  it('falls back to top-level roles/permissions when no tenant claim is present', async () => {
    mockValidateSession.mockResolvedValue({
      token: {
        sub: 'user123',
        roles: ['read_only'],
        permissions: ['records:read'],
      },
    });

    const req = mockReq({ cookies: { cpcrm_session: 'valid_token' } });
    const res = mockRes();

    await requireAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toEqual({
      userId: 'user123',
      email: undefined,
      name: undefined,
      tenantId: undefined,
      roles: ['read_only'],
      permissions: ['records:read'],
    });
  });

  it('returns empty roles and permissions when tenant claim has no RBAC data', async () => {
    mockValidateSession.mockResolvedValue({
      token: {
        sub: 'user123',
        tenants: { 'tenant-abc': {} },
      },
    });

    const req = mockReq({ cookies: { cpcrm_session: 'valid_token' } });
    const res = mockRes();

    await requireAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user?.roles).toEqual([]);
    expect(req.user?.permissions).toEqual([]);
  });
});
