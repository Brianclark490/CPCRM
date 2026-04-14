import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../../middleware/auth.js';

// ─── Mock middleware ──────────────────────────────────────────────────────────

vi.mock('../../middleware/auth.js', () => ({
  requireAuth: vi.fn((_req: AuthenticatedRequest, _res: Response, next: NextFunction) => next()),
}));

vi.mock('../../middleware/tenant.js', () => ({
  requireTenant: vi.fn((_req: AuthenticatedRequest, _res: Response, next: NextFunction) =>
    next(),
  ),
}));

vi.mock('../../middleware/permission.js', () => ({
  requireRole: vi.fn(() => (_req: AuthenticatedRequest, _res: Response, next: NextFunction) =>
    next(),
  ),
}));

// ─── Mock the admin user service ─────────────────────────────────────────────

const mockInviteUser = vi.fn();
const mockListTenantUsers = vi.fn();
const mockChangeUserRole = vi.fn();
const mockRemoveUserFromTenant = vi.fn();

vi.mock('../../services/adminUserService.js', () => ({
  inviteUser: mockInviteUser,
  listTenantUsers: mockListTenantUsers,
  changeUserRole: mockChangeUserRole,
  removeUserFromTenant: mockRemoveUserFromTenant,
}));

// ─── Mock logger ──────────────────────────────────────────────────────────────

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const {
  handleInviteUser,
  handleListUsers,
  handleChangeRole,
  handleRemoveUser,
} = await import('../adminUsers.js');

// ─── Global reset ─────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mockReq(
  body: unknown,
  params: Record<string, string> = {},
  query: Record<string, string> = {},
) {
  return {
    body,
    query,
    path: '/api/admin/users',
    user: {
      userId: 'admin-user-1',
      tenantId: 'acme-corp',
      roles: ['admin'],
      permissions: ['admin:access'],
    },
    params,
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

// ─── POST /api/admin/users/invite ─────────────────────────────────────────────

describe('POST /api/admin/users/invite', () => {
  beforeEach(() => {
    mockInviteUser.mockReset();
  });

  it('returns 201 with invite result on success', async () => {
    const result = {
      email: 'lewis@company.com',
      name: 'Lewis Walls',
      role: 'user',
      inviteSent: true,
      existingUser: false,
    };
    mockInviteUser.mockResolvedValue(result);

    const req = mockReq({ email: 'lewis@company.com', name: 'Lewis Walls', role: 'user' });
    const res = mockRes();

    await handleInviteUser(req, res);

    expect(mockInviteUser).toHaveBeenCalledWith({
      email: 'lewis@company.com',
      name: 'Lewis Walls',
      role: 'user',
      tenantId: 'acme-corp',
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(result);
  });

  it('returns 400 when the service throws VALIDATION_ERROR', async () => {
    mockInviteUser.mockRejectedValue(
      Object.assign(new Error('A valid email address is required'), { code: 'VALIDATION_ERROR' }),
    );

    const req = mockReq({ email: 'not-an-email', name: 'Test', role: 'user' });
    const res = mockRes();

    await handleInviteUser(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'A valid email address is required',
      code: 'VALIDATION_ERROR',
    });
  });

  it('returns 500 when the service throws INVITE_FAILED', async () => {
    mockInviteUser.mockRejectedValue(
      Object.assign(new Error('Failed to send user invitation'), { code: 'INVITE_FAILED' }),
    );

    const req = mockReq({ email: 'lewis@company.com', name: 'Lewis Walls', role: 'user' });
    const res = mockRes();

    await handleInviteUser(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Failed to send user invitation',
      code: 'INVITE_FAILED',
    });
  });

  it('returns 500 on unexpected error', async () => {
    mockInviteUser.mockRejectedValue(new Error('Something went wrong'));

    const req = mockReq({ email: 'lewis@company.com', name: 'Lewis Walls', role: 'user' });
    const res = mockRes();

    await handleInviteUser(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'An unexpected error occurred' });
  });

  it('coerces non-string body fields to empty strings', async () => {
    mockInviteUser.mockResolvedValue({
      email: '',
      name: '',
      role: '',
      inviteSent: false,
      existingUser: false,
    });

    const req = mockReq({ email: 123, name: null, role: undefined });
    const res = mockRes();

    await handleInviteUser(req, res);

    expect(mockInviteUser).toHaveBeenCalledWith({
      email: '',
      name: '',
      role: '',
      tenantId: 'acme-corp',
    });
  });
});

// ─── GET /api/admin/users ─────────────────────────────────────────────────────

describe('GET /api/admin/users', () => {
  beforeEach(() => {
    mockListTenantUsers.mockReset();
  });

  it('returns 200 with user list', async () => {
    const users = [
      {
        userId: 'user-1',
        loginId: 'alice@acme.com',
        email: 'alice@acme.com',
        name: 'Alice',
        roles: ['admin'],
        status: 'enabled',
        lastLogin: '1234567890',
      },
      {
        userId: 'user-2',
        loginId: 'bob@acme.com',
        email: 'bob@acme.com',
        name: 'Bob',
        roles: ['user'],
        status: 'invited',
        lastLogin: null,
      },
    ];
    mockListTenantUsers.mockResolvedValue(users);

    const req = mockReq({});
    const res = mockRes();

    await handleListUsers(req, res);

    expect(mockListTenantUsers).toHaveBeenCalledWith('acme-corp');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      data: users,
      pagination: { total: 2, limit: 50, offset: 0, hasMore: false },
    });
  });

  it('rejects limit greater than MAX_LIMIT with 400', async () => {
    const req = mockReq({}, {}, { limit: '500' });
    const res = mockRes();

    await handleListUsers(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockListTenantUsers).not.toHaveBeenCalled();
  });

  it('returns 500 on unexpected error', async () => {
    mockListTenantUsers.mockRejectedValue(new Error('Descope unavailable'));

    const req = mockReq({});
    const res = mockRes();

    await handleListUsers(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'An unexpected error occurred' });
  });
});

// ─── PUT /api/admin/users/:loginId/role ────────────────────────────────────────

describe('PUT /api/admin/users/:loginId/role', () => {
  beforeEach(() => {
    mockChangeUserRole.mockReset();
  });

  it('returns 200 on successful role change', async () => {
    mockChangeUserRole.mockResolvedValue(undefined);

    const req = mockReq({ role: 'manager' }, { loginId: 'alice@acme.com' });
    const res = mockRes();

    await handleChangeRole(req, res);

    expect(mockChangeUserRole).toHaveBeenCalledWith({
      loginId: 'alice@acme.com',
      tenantId: 'acme-corp',
      newRole: 'manager',
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      loginId: 'alice@acme.com',
      tenantId: 'acme-corp',
      role: 'manager',
    });
  });

  it('returns 400 when the service throws VALIDATION_ERROR', async () => {
    mockChangeUserRole.mockRejectedValue(
      Object.assign(new Error('Invalid role "bogus"'), { code: 'VALIDATION_ERROR' }),
    );

    const req = mockReq({ role: 'bogus' }, { loginId: 'alice@acme.com' });
    const res = mockRes();

    await handleChangeRole(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Invalid role "bogus"',
      code: 'VALIDATION_ERROR',
    });
  });

  it('returns 500 on unexpected error', async () => {
    mockChangeUserRole.mockRejectedValue(new Error('Descope failure'));

    const req = mockReq({ role: 'manager' }, { loginId: 'alice@acme.com' });
    const res = mockRes();

    await handleChangeRole(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'An unexpected error occurred' });
  });
});

// ─── DELETE /api/admin/users/:loginId ──────────────────────────────────────

describe('DELETE /api/admin/users/:loginId', () => {
  beforeEach(() => {
    mockRemoveUserFromTenant.mockReset();
  });

  it('returns 204 on successful removal', async () => {
    mockRemoveUserFromTenant.mockResolvedValue(undefined);

    const req = mockReq({}, { loginId: 'alice@acme.com' });
    const res = mockRes();

    await handleRemoveUser(req, res);

    expect(mockRemoveUserFromTenant).toHaveBeenCalledWith('alice@acme.com', 'acme-corp');
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.end).toHaveBeenCalled();
  });

  it('returns 500 on unexpected error', async () => {
    mockRemoveUserFromTenant.mockRejectedValue(new Error('Descope failure'));

    const req = mockReq({}, { loginId: 'alice@acme.com' });
    const res = mockRes();

    await handleRemoveUser(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'An unexpected error occurred' });
  });
});
