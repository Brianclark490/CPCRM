import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../../middleware/auth.js';

// ─── Mock middleware ──────────────────────────────────────────────────────────

vi.mock('../../middleware/auth.js', () => ({
  requireAuth: vi.fn((_req: AuthenticatedRequest, _res: Response, next: NextFunction) => next()),
}));

vi.mock('../../middleware/superAdmin.js', () => ({
  requireSuperAdmin: vi.fn((_req: AuthenticatedRequest, _res: Response, next: NextFunction) =>
    next(),
  ),
}));

// ─── Mock the provisioning service ───────────────────────────────────────────

const mockProvisionTenant = vi.fn();
const mockListTenants = vi.fn();
const mockGetTenantById = vi.fn();
const mockUpdateTenant = vi.fn();
const mockDeleteTenant = vi.fn();

vi.mock('../../services/tenantProvisioning.js', () => ({
  provisionTenant: mockProvisionTenant,
  listTenants: mockListTenants,
  getTenantById: mockGetTenantById,
  updateTenant: mockUpdateTenant,
  deleteTenant: mockDeleteTenant,
}));

// ─── Mock the admin user service ─────────────────────────────────────────────

const mockListTenantUsers = vi.fn();
const mockInviteUser = vi.fn();

vi.mock('../../services/adminUserService.js', () => ({
  listTenantUsers: mockListTenantUsers,
  inviteUser: mockInviteUser,
}));

// ─── Mock logger ──────────────────────────────────────────────────────────────

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const {
  handleCreateTenant,
  handleListTenants,
  handleGetTenant,
  handleUpdateTenant,
  handleDeleteTenant,
  handleListTenantUsers,
  handleInviteTenantUser,
} = await import('../platformTenants.js');

// ─── Global reset — clears mock call history and any tracked rejections ───────
//
// vi.clearAllMocks() must be called globally (not just per-describe) so that
// Vitest 4's internal Promise rejection tracking is reset between every test.
// Without this, a rejected Promise from one test can be attributed as
// "unhandled" in a later test within the same file.

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
    path: '/api/platform/tenants',
    user: { userId: 'super-admin-1', tenantId: undefined, roles: [], permissions: [] },
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

const SAMPLE_TENANT = {
  id: 'acme-corp',
  name: 'Acme Corporation',
  slug: 'acme-corp',
  status: 'active',
  plan: 'pro',
  settings: {},
  created_at: new Date(),
  updated_at: new Date(),
};

const SAMPLE_PROVISION_RESULT = {
  tenant: { id: 'acme-corp', name: 'Acme Corporation', slug: 'acme-corp', status: 'active' },
  adminUser: { email: 'admin@acme.com', inviteSent: true },
  seeded: { objects: 9, fields: 87, relationships: 22, pipelines: 1 },
};

// ─── POST /api/platform/tenants ───────────────────────────────────────────────

describe('POST /api/platform/tenants', () => {
  beforeEach(() => {
    mockProvisionTenant.mockReset();
  });

  it('returns 201 with the provisioned tenant on success', async () => {
    mockProvisionTenant.mockResolvedValue(SAMPLE_PROVISION_RESULT);

    const req = mockReq({
      name: 'Acme Corporation',
      slug: 'acme-corp',
      adminEmail: 'admin@acme.com',
      adminName: 'John Smith',
      plan: 'pro',
    });
    const res = mockRes();

    await handleCreateTenant(req, res);

    expect(mockProvisionTenant).toHaveBeenCalledWith({
      name: 'Acme Corporation',
      slug: 'acme-corp',
      adminEmail: 'admin@acme.com',
      adminName: 'John Smith',
      plan: 'pro',
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(SAMPLE_PROVISION_RESULT);
  });

  it('uses undefined for plan when not provided', async () => {
    mockProvisionTenant.mockResolvedValue(SAMPLE_PROVISION_RESULT);

    const req = mockReq({
      name: 'Acme Corporation',
      slug: 'acme-corp',
      adminEmail: 'admin@acme.com',
      adminName: 'John Smith',
    });
    const res = mockRes();

    await handleCreateTenant(req, res);

    expect(mockProvisionTenant).toHaveBeenCalledWith(
      expect.objectContaining({ plan: undefined }),
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('returns 400 when the service throws VALIDATION_ERROR', async () => {
    mockProvisionTenant.mockRejectedValue(
      Object.assign(new Error('Slug is required'), { code: 'VALIDATION_ERROR' }),
    );

    const req = mockReq({ name: 'Acme', slug: '', adminEmail: 'a@b.com', adminName: 'Admin' });
    const res = mockRes();

    await handleCreateTenant(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Slug is required', code: 'VALIDATION_ERROR' });
  });

  it('returns 409 when the service throws DUPLICATE_SLUG', async () => {
    mockProvisionTenant.mockRejectedValue(
      Object.assign(new Error('Slug "acme-corp" is already in use'), { code: 'DUPLICATE_SLUG' }),
    );

    const req = mockReq({
      name: 'Acme',
      slug: 'acme-corp',
      adminEmail: 'a@b.com',
      adminName: 'Admin',
    });
    const res = mockRes();

    await handleCreateTenant(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Slug "acme-corp" is already in use',
      code: 'DUPLICATE_SLUG',
    });
  });

  it('returns 500 on unexpected error', async () => {
    mockProvisionTenant.mockRejectedValue(new Error('Database down'));

    const req = mockReq({ name: 'Acme', slug: 'acme', adminEmail: 'a@b.com', adminName: 'A' });
    const res = mockRes();

    await handleCreateTenant(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'An unexpected error occurred' });
  });
});

// ─── GET /api/platform/tenants ────────────────────────────────────────────────

describe('GET /api/platform/tenants', () => {
  beforeEach(() => {
    mockListTenants.mockReset();
  });

  it('returns 200 with tenant list', async () => {
    mockListTenants.mockResolvedValue({ tenants: [SAMPLE_TENANT], total: 1 });

    const req = mockReq({}, {}, { limit: '50', offset: '0' });
    const res = mockRes();

    await handleListTenants(req, res);

    expect(res.json).toHaveBeenCalledWith({
      tenants: [SAMPLE_TENANT],
      total: 1,
      limit: 50,
      offset: 0,
    });
  });

  it('clamps limit to 100', async () => {
    mockListTenants.mockResolvedValue({ tenants: [], total: 0 });

    const req = mockReq({}, {}, { limit: '500', offset: '0' });
    const res = mockRes();

    await handleListTenants(req, res);

    expect(mockListTenants).toHaveBeenCalledWith(100, 0);
  });

  it('returns 500 on unexpected error', async () => {
    mockListTenants.mockRejectedValue(new Error('DB failure'));

    const req = mockReq({});
    const res = mockRes();

    await handleListTenants(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ─── GET /api/platform/tenants/:id ───────────────────────────────────────────

describe('GET /api/platform/tenants/:id', () => {
  beforeEach(() => {
    mockGetTenantById.mockReset();
  });

  it('returns 200 with tenant details', async () => {
    const tenantWithCount = { ...SAMPLE_TENANT, userCount: 3 };
    mockGetTenantById.mockResolvedValue(tenantWithCount);

    const req = mockReq({}, { id: 'acme-corp' });
    const res = mockRes();

    await handleGetTenant(req, res);

    expect(mockGetTenantById).toHaveBeenCalledWith('acme-corp');
    expect(res.json).toHaveBeenCalledWith(tenantWithCount);
  });

  it('returns 404 when tenant is not found', async () => {
    mockGetTenantById.mockResolvedValue(null);

    const req = mockReq({}, { id: 'unknown-tenant' });
    const res = mockRes();

    await handleGetTenant(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Tenant not found', code: 'NOT_FOUND' });
  });

  it('returns 500 on unexpected error', async () => {
    mockGetTenantById.mockRejectedValue(new Error('Oops'));

    const req = mockReq({}, { id: 'acme-corp' });
    const res = mockRes();

    await handleGetTenant(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ─── PUT /api/platform/tenants/:id ───────────────────────────────────────────

describe('PUT /api/platform/tenants/:id', () => {
  beforeEach(() => {
    mockUpdateTenant.mockReset();
  });

  it('returns 200 with updated tenant', async () => {
    const updated = { ...SAMPLE_TENANT, name: 'Acme Corp 2' };
    mockUpdateTenant.mockResolvedValue(updated);

    const req = mockReq({ name: 'Acme Corp 2' }, { id: 'acme-corp' });
    const res = mockRes();

    await handleUpdateTenant(req, res);

    expect(mockUpdateTenant).toHaveBeenCalledWith('acme-corp', {
      name: 'Acme Corp 2',
      status: undefined,
      plan: undefined,
    });
    expect(res.json).toHaveBeenCalledWith(updated);
  });

  it('returns 400 when the service throws VALIDATION_ERROR', async () => {
    mockUpdateTenant.mockRejectedValue(
      Object.assign(new Error('Invalid status'), { code: 'VALIDATION_ERROR' }),
    );

    const req = mockReq({ status: 'bogus' }, { id: 'acme-corp' });
    const res = mockRes();

    await handleUpdateTenant(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 404 when tenant is not found', async () => {
    mockUpdateTenant.mockResolvedValue(null);

    const req = mockReq({ name: 'New Name' }, { id: 'nonexistent' });
    const res = mockRes();

    await handleUpdateTenant(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Tenant not found', code: 'NOT_FOUND' });
  });
});

// ─── DELETE /api/platform/tenants/:id ────────────────────────────────────────

describe('DELETE /api/platform/tenants/:id', () => {
  beforeEach(() => {
    mockDeleteTenant.mockReset();
  });

  it('returns 204 when tenant is successfully deleted', async () => {
    mockDeleteTenant.mockResolvedValue(true);

    const req = mockReq({}, { id: 'acme-corp' }, {});
    const res = mockRes();

    await handleDeleteTenant(req, res);

    expect(mockDeleteTenant).toHaveBeenCalledWith('acme-corp', false);
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.end).toHaveBeenCalled();
  });

  it('passes cascade=true when query param is set', async () => {
    mockDeleteTenant.mockResolvedValue(true);

    const req = mockReq({}, { id: 'acme-corp' }, { cascade: 'true' });
    const res = mockRes();

    await handleDeleteTenant(req, res);

    expect(mockDeleteTenant).toHaveBeenCalledWith('acme-corp', true);
  });

  it('returns 404 when tenant is not found', async () => {
    mockDeleteTenant.mockResolvedValue(false);

    const req = mockReq({}, { id: 'nonexistent' }, {});
    const res = mockRes();

    await handleDeleteTenant(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Tenant not found', code: 'NOT_FOUND' });
  });

  it('returns 500 on unexpected error', async () => {
    mockDeleteTenant.mockRejectedValue(new Error('DB error'));

    const req = mockReq({}, { id: 'acme-corp' }, {});
    const res = mockRes();

    await handleDeleteTenant(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ─── GET /api/platform/tenants/:id/users ──────────────────────────────────────

describe('GET /api/platform/tenants/:id/users', () => {
  beforeEach(() => {
    mockListTenantUsers.mockReset();
  });

  it('returns 200 with user list', async () => {
    const users = [
      { userId: 'U1', loginId: 'admin@acme.com', email: 'admin@acme.com', name: 'John', roles: ['admin'], status: 'enabled', lastLogin: null },
    ];
    mockListTenantUsers.mockResolvedValue(users);

    const req = mockReq({}, { id: 'acme-corp' });
    const res = mockRes();

    await handleListTenantUsers(req, res);

    expect(mockListTenantUsers).toHaveBeenCalledWith('acme-corp');
    expect(res.json).toHaveBeenCalledWith(users);
  });

  it('returns 500 on unexpected error', async () => {
    mockListTenantUsers.mockRejectedValue(new Error('Descope error'));

    const req = mockReq({}, { id: 'acme-corp' });
    const res = mockRes();

    await handleListTenantUsers(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ─── POST /api/platform/tenants/:id/users/invite ─────────────────────────────

describe('POST /api/platform/tenants/:id/users/invite', () => {
  beforeEach(() => {
    mockInviteUser.mockReset();
  });

  it('returns 201 on successful invite', async () => {
    const inviteResult = {
      email: 'user@acme.com',
      name: 'Jane',
      role: 'user',
      inviteSent: true,
      existingUser: false,
    };
    mockInviteUser.mockResolvedValue(inviteResult);

    const req = mockReq(
      { email: 'user@acme.com', name: 'Jane', role: 'user' },
      { id: 'acme-corp' },
    );
    const res = mockRes();

    await handleInviteTenantUser(req, res);

    expect(mockInviteUser).toHaveBeenCalledWith({
      email: 'user@acme.com',
      name: 'Jane',
      role: 'user',
      tenantId: 'acme-corp',
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(inviteResult);
  });

  it('returns 400 when service throws VALIDATION_ERROR', async () => {
    mockInviteUser.mockRejectedValue(
      Object.assign(new Error('A valid email address is required'), { code: 'VALIDATION_ERROR' }),
    );

    const req = mockReq({ email: '', name: 'Jane', role: 'user' }, { id: 'acme-corp' });
    const res = mockRes();

    await handleInviteTenantUser(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'A valid email address is required',
      code: 'VALIDATION_ERROR',
    });
  });

  it('returns 500 when service throws INVITE_FAILED', async () => {
    mockInviteUser.mockRejectedValue(
      Object.assign(new Error('Failed to send user invitation'), { code: 'INVITE_FAILED' }),
    );

    const req = mockReq(
      { email: 'user@acme.com', name: 'Jane', role: 'user' },
      { id: 'acme-corp' },
    );
    const res = mockRes();

    await handleInviteTenantUser(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Failed to send user invitation',
      code: 'INVITE_FAILED',
    });
  });

  it('returns 500 on unexpected error', async () => {
    mockInviteUser.mockRejectedValue(new Error('Unexpected'));

    const req = mockReq(
      { email: 'user@acme.com', name: 'Jane', role: 'user' },
      { id: 'acme-corp' },
    );
    const res = mockRes();

    await handleInviteTenantUser(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
