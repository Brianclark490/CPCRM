import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock logger ──────────────────────────────────────────────────────────────

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ─── Mock Descope SDK ─────────────────────────────────────────────────────────

const mockSearchAll = vi.fn();
const mockInvite = vi.fn();
const mockAddTenantRoles = vi.fn();
const mockRemoveTenantRoles = vi.fn();
const mockRemoveTenant = vi.fn();

vi.mock('../../lib/descopeManagementClient.js', () => ({
  getDescopeManagementClient: vi.fn(() => ({
    management: {
      user: {
        searchAll: mockSearchAll,
        invite: mockInvite,
        addTenantRoles: mockAddTenantRoles,
        removeTenantRoles: mockRemoveTenantRoles,
        removeTenant: mockRemoveTenant,
      },
    },
  })),
}));

const {
  inviteUser,
  listTenantUsers,
  changeUserRole,
  removeUserFromTenant,
} = await import('../adminUserService.js');

// ─── Global reset ─────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── inviteUser ───────────────────────────────────────────────────────────────

describe('inviteUser', () => {
  it('throws VALIDATION_ERROR for invalid email', async () => {
    await expect(
      inviteUser({ email: 'not-valid', name: 'Test', role: 'user', tenantId: 'tenant-1' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', message: 'A valid email address is required' });
  });

  it('throws VALIDATION_ERROR for empty email', async () => {
    await expect(
      inviteUser({ email: '', name: 'Test', role: 'user', tenantId: 'tenant-1' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('throws VALIDATION_ERROR for empty name', async () => {
    await expect(
      inviteUser({ email: 'a@b.com', name: '', role: 'user', tenantId: 'tenant-1' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', message: 'Name is required' });
  });

  it('throws VALIDATION_ERROR for invalid role', async () => {
    await expect(
      inviteUser({ email: 'a@b.com', name: 'Test', role: 'superuser', tenantId: 'tenant-1' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('throws VALIDATION_ERROR for empty role', async () => {
    await expect(
      inviteUser({ email: 'a@b.com', name: 'Test', role: '', tenantId: 'tenant-1' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('invites a new user when they do not exist in Descope', async () => {
    mockSearchAll.mockResolvedValue({ data: [] });
    mockInvite.mockResolvedValue({});

    const result = await inviteUser({
      email: 'lewis@company.com',
      name: 'Lewis Walls',
      role: 'user',
      tenantId: 'acme-corp',
    });

    expect(mockSearchAll).toHaveBeenCalledWith({ limit: 1, emails: ['lewis@company.com'] });
    expect(mockInvite).toHaveBeenCalledWith('lewis@company.com', {
      email: 'lewis@company.com',
      displayName: 'Lewis Walls',
      userTenants: [{ tenantId: 'acme-corp', roleNames: ['user'] }],
      sendMail: true,
    });
    expect(result).toEqual({
      email: 'lewis@company.com',
      name: 'Lewis Walls',
      role: 'user',
      inviteSent: true,
      existingUser: false,
    });
  });

  it('adds existing user to tenant and sends invite', async () => {
    mockSearchAll.mockResolvedValue({
      data: [{ loginIds: ['lewis@company.com'], userId: 'existing-user-id' }],
    });
    mockAddTenantRoles.mockResolvedValue({});
    mockInvite.mockResolvedValue({});

    const result = await inviteUser({
      email: 'lewis@company.com',
      name: 'Lewis Walls',
      role: 'manager',
      tenantId: 'acme-corp',
    });

    expect(mockAddTenantRoles).toHaveBeenCalledWith('lewis@company.com', 'acme-corp', ['manager']);
    expect(mockInvite).toHaveBeenCalled();
    expect(result.existingUser).toBe(true);
    expect(result.inviteSent).toBe(true);
  });

  it('throws INVITE_FAILED when Descope invite fails for new user', async () => {
    mockSearchAll.mockResolvedValue({ data: [] });
    mockInvite.mockRejectedValue(new Error('Descope error'));

    await expect(
      inviteUser({
        email: 'lewis@company.com',
        name: 'Lewis Walls',
        role: 'user',
        tenantId: 'acme-corp',
      }),
    ).rejects.toMatchObject({ code: 'INVITE_FAILED' });
  });

  it('still succeeds when invite email fails for existing user', async () => {
    mockSearchAll.mockResolvedValue({
      data: [{ loginIds: ['lewis@company.com'], userId: 'existing-user-id' }],
    });
    mockAddTenantRoles.mockResolvedValue({});
    mockInvite.mockRejectedValue(new Error('Mail service down'));

    const result = await inviteUser({
      email: 'lewis@company.com',
      name: 'Lewis Walls',
      role: 'user',
      tenantId: 'acme-corp',
    });

    expect(result.existingUser).toBe(true);
    expect(result.inviteSent).toBe(false);
  });

  it('trims the name', async () => {
    mockSearchAll.mockResolvedValue({ data: [] });
    mockInvite.mockResolvedValue({});

    const result = await inviteUser({
      email: 'lewis@company.com',
      name: '  Lewis Walls  ',
      role: 'user',
      tenantId: 'acme-corp',
    });

    expect(result.name).toBe('Lewis Walls');
    expect(mockInvite).toHaveBeenCalledWith('lewis@company.com', expect.objectContaining({
      displayName: 'Lewis Walls',
    }));
  });
});

// ─── listTenantUsers ──────────────────────────────────────────────────────────

describe('listTenantUsers', () => {
  it('returns mapped user data from Descope', async () => {
    mockSearchAll.mockResolvedValue({
      data: [
        {
          userId: 'user-1',
          email: 'alice@acme.com',
          name: 'Alice',
          displayName: 'Alice Smith',
          userTenants: [{ tenantId: 'acme-corp', roleNames: ['admin'] }],
          status: 'enabled',
          lastLogin: 1700000000,
        },
        {
          userId: 'user-2',
          email: 'bob@acme.com',
          name: '',
          displayName: 'Bob Jones',
          userTenants: [{ tenantId: 'acme-corp', roleNames: ['user'] }],
          status: 'invited',
          lastLogin: null,
        },
      ],
    });

    const users = await listTenantUsers('acme-corp');

    expect(mockSearchAll).toHaveBeenCalledWith({ tenantIds: ['acme-corp'] });
    expect(users).toHaveLength(2);
    expect(users[0]).toEqual({
      userId: 'user-1',
      email: 'alice@acme.com',
      name: 'Alice',
      roles: ['admin'],
      status: 'enabled',
      lastLogin: '1700000000',
    });
    expect(users[1]).toEqual({
      userId: 'user-2',
      email: 'bob@acme.com',
      name: 'Bob Jones',
      roles: ['user'],
      status: 'invited',
      lastLogin: null,
    });
  });

  it('returns empty array when no users found', async () => {
    mockSearchAll.mockResolvedValue({ data: [] });

    const users = await listTenantUsers('empty-tenant');

    expect(users).toEqual([]);
  });

  it('handles missing data gracefully', async () => {
    mockSearchAll.mockResolvedValue({ data: undefined });

    const users = await listTenantUsers('missing-tenant');

    expect(users).toEqual([]);
  });
});

// ─── changeUserRole ───────────────────────────────────────────────────────────

describe('changeUserRole', () => {
  it('throws VALIDATION_ERROR for invalid role', async () => {
    await expect(
      changeUserRole({ userId: 'user-1', tenantId: 'acme-corp', newRole: 'superuser' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('throws VALIDATION_ERROR for empty role', async () => {
    await expect(
      changeUserRole({ userId: 'user-1', tenantId: 'acme-corp', newRole: '' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('removes old roles and adds new role', async () => {
    mockRemoveTenantRoles.mockResolvedValue({});
    mockAddTenantRoles.mockResolvedValue({});

    await changeUserRole({ userId: 'user-1', tenantId: 'acme-corp', newRole: 'manager' });

    expect(mockRemoveTenantRoles).toHaveBeenCalledWith(
      'user-1',
      'acme-corp',
      ['admin', 'manager', 'user', 'read_only'],
    );
    expect(mockAddTenantRoles).toHaveBeenCalledWith('user-1', 'acme-corp', ['manager']);
  });

  it('still adds new role when removal of old roles fails', async () => {
    mockRemoveTenantRoles.mockRejectedValue(new Error('Some roles not found'));
    mockAddTenantRoles.mockResolvedValue({});

    await changeUserRole({ userId: 'user-1', tenantId: 'acme-corp', newRole: 'user' });

    expect(mockAddTenantRoles).toHaveBeenCalledWith('user-1', 'acme-corp', ['user']);
  });
});

// ─── removeUserFromTenant ─────────────────────────────────────────────────────

describe('removeUserFromTenant', () => {
  it('calls Descope removeTenant with correct params', async () => {
    mockRemoveTenant.mockResolvedValue({});

    await removeUserFromTenant('user-1', 'acme-corp');

    expect(mockRemoveTenant).toHaveBeenCalledWith('user-1', 'acme-corp');
  });

  it('propagates Descope errors', async () => {
    mockRemoveTenant.mockRejectedValue(new Error('User not found'));

    await expect(
      removeUserFromTenant('user-1', 'acme-corp'),
    ).rejects.toThrow('User not found');
  });
});
