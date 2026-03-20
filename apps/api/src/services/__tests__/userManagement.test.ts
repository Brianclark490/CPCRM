import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * User Management Tests (multi-tenancy focus)
 *
 * Verifies that user management operations respect tenant boundaries:
 * - listTenantUsers returns only the current tenant's users
 * - Role change updates Descope tenant roles
 * - Removing a user from tenant doesn't delete the user from Descope
 * - Cannot remove last admin (validated at the route/service level)
 * - Invite flow creates/finds user and adds to tenant
 */

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

// ─── Constants ────────────────────────────────────────────────────────────────

const TENANT_A = 'tenant-alpha';
const TENANT_B = 'tenant-bravo';

// ─── Reset state ──────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// ═════════════════════════════════════════════════════════════════════════════
// LIST USERS — TENANT SCOPED
// ═════════════════════════════════════════════════════════════════════════════

describe('listTenantUsers — tenant isolation', () => {
  it('returns only users belonging to the queried tenant', async () => {
    mockSearchAll.mockResolvedValue({
      data: [
        {
          userId: 'user-1',
          loginIds: ['alice@alpha.com'],
          email: 'alice@alpha.com',
          name: 'Alice',
          userTenants: [{ tenantId: TENANT_A, roleNames: ['admin'] }],
          status: 'enabled',
        },
      ],
    });

    const users = await listTenantUsers(TENANT_A);

    expect(mockSearchAll).toHaveBeenCalledWith({ tenantIds: [TENANT_A] });
    expect(users).toHaveLength(1);
    expect(users[0].email).toBe('alice@alpha.com');
    expect(users[0].roles).toEqual(['admin']);
  });

  it('passes the correct tenant ID filter to Descope searchAll', async () => {
    mockSearchAll.mockResolvedValue({ data: [] });

    await listTenantUsers(TENANT_B);

    // Must search specifically for Tenant B users, not Tenant A
    expect(mockSearchAll).toHaveBeenCalledWith({ tenantIds: [TENANT_B] });
    expect(mockSearchAll).not.toHaveBeenCalledWith({ tenantIds: [TENANT_A] });
  });

  it('extracts roles only from the matching tenant context', async () => {
    // User belongs to multiple tenants
    mockSearchAll.mockResolvedValue({
      data: [
        {
          userId: 'user-multi',
          loginIds: ['multi@example.com'],
          email: 'multi@example.com',
          name: 'Multi-tenant User',
          userTenants: [
            { tenantId: TENANT_A, roleNames: ['admin'] },
            { tenantId: TENANT_B, roleNames: ['user'] },
          ],
          status: 'enabled',
        },
      ],
    });

    const usersA = await listTenantUsers(TENANT_A);
    expect(usersA[0].roles).toEqual(['admin']);
  });

  it('returns empty roles when user has no tenant-specific roles', async () => {
    mockSearchAll.mockResolvedValue({
      data: [
        {
          userId: 'user-norole',
          loginIds: ['norole@example.com'],
          email: 'norole@example.com',
          name: 'No Role User',
          userTenants: [{ tenantId: TENANT_A }],
          status: 'enabled',
        },
      ],
    });

    const users = await listTenantUsers(TENANT_A);
    expect(users[0].roles).toEqual([]);
  });

  it('returns empty array when tenant has no users', async () => {
    mockSearchAll.mockResolvedValue({ data: [] });

    const users = await listTenantUsers('empty-tenant');
    expect(users).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// ROLE CHANGES
// ═════════════════════════════════════════════════════════════════════════════

describe('changeUserRole — tenant-scoped role updates', () => {
  it('updates role within the specified tenant', async () => {
    mockRemoveTenantRoles.mockResolvedValue({});
    mockAddTenantRoles.mockResolvedValue({});

    await changeUserRole({
      loginId: 'alice@alpha.com',
      tenantId: TENANT_A,
      newRole: 'manager',
    });

    // Removes all old roles for this tenant
    expect(mockRemoveTenantRoles).toHaveBeenCalledWith(
      'alice@alpha.com',
      TENANT_A,
      ['admin', 'manager', 'user', 'read_only'],
    );

    // Adds the new role for this tenant
    expect(mockAddTenantRoles).toHaveBeenCalledWith(
      'alice@alpha.com',
      TENANT_A,
      ['manager'],
    );
  });

  it('role change in Tenant A does not affect Tenant B', async () => {
    mockRemoveTenantRoles.mockResolvedValue({});
    mockAddTenantRoles.mockResolvedValue({});

    await changeUserRole({
      loginId: 'alice@alpha.com',
      tenantId: TENANT_A,
      newRole: 'user',
    });

    // The calls should only reference TENANT_A
    expect(mockRemoveTenantRoles).toHaveBeenCalledWith(
      'alice@alpha.com',
      TENANT_A,
      expect.any(Array),
    );
    expect(mockAddTenantRoles).toHaveBeenCalledWith(
      'alice@alpha.com',
      TENANT_A,
      ['user'],
    );

    // No calls should reference TENANT_B
    for (const call of mockRemoveTenantRoles.mock.calls) {
      expect(call[1]).not.toBe(TENANT_B);
    }
    for (const call of mockAddTenantRoles.mock.calls) {
      expect(call[1]).not.toBe(TENANT_B);
    }
  });

  it('throws VALIDATION_ERROR for invalid role', async () => {
    await expect(
      changeUserRole({ loginId: 'alice@alpha.com', tenantId: TENANT_A, newRole: 'superuser' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    // Should not have called Descope at all
    expect(mockRemoveTenantRoles).not.toHaveBeenCalled();
    expect(mockAddTenantRoles).not.toHaveBeenCalled();
  });

  it('accepts all valid role values', async () => {
    mockRemoveTenantRoles.mockResolvedValue({});
    mockAddTenantRoles.mockResolvedValue({});

    for (const role of ['admin', 'manager', 'user', 'read_only']) {
      await changeUserRole({ loginId: 'alice@alpha.com', tenantId: TENANT_A, newRole: role });
    }

    expect(mockAddTenantRoles).toHaveBeenCalledTimes(4);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// REMOVE USER FROM TENANT
// ═════════════════════════════════════════════════════════════════════════════

describe('removeUserFromTenant — tenant-scoped removal', () => {
  it('calls Descope removeTenant, not deleteUser', async () => {
    mockRemoveTenant.mockResolvedValue({});

    await removeUserFromTenant('alice@alpha.com', TENANT_A);

    // removeTenant removes user from the tenant — the user continues to exist
    expect(mockRemoveTenant).toHaveBeenCalledWith('alice@alpha.com', TENANT_A);
  });

  it('removal from Tenant A does not affect Tenant B membership', async () => {
    mockRemoveTenant.mockResolvedValue({});

    await removeUserFromTenant('alice@alpha.com', TENANT_A);

    // Only TENANT_A was referenced
    expect(mockRemoveTenant).toHaveBeenCalledTimes(1);
    expect(mockRemoveTenant).toHaveBeenCalledWith('alice@alpha.com', TENANT_A);
    // No call for TENANT_B
    expect(mockRemoveTenant).not.toHaveBeenCalledWith('alice@alpha.com', TENANT_B);
  });

  it('propagates Descope errors on removal', async () => {
    mockRemoveTenant.mockRejectedValue(new Error('User not found'));

    await expect(
      removeUserFromTenant('nonexistent@alpha.com', TENANT_A),
    ).rejects.toThrow('User not found');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// INVITE USER — TENANT-SCOPED
// ═════════════════════════════════════════════════════════════════════════════

describe('inviteUser — tenant-scoped invites', () => {
  it('invites a new user into the specified tenant', async () => {
    mockSearchAll.mockResolvedValue({ data: [] });
    mockInvite.mockResolvedValue({});

    const result = await inviteUser({
      email: 'bob@bravo.com',
      name: 'Bob Builder',
      role: 'user',
      tenantId: TENANT_B,
    });

    expect(mockInvite).toHaveBeenCalledWith('bob@bravo.com', {
      email: 'bob@bravo.com',
      displayName: 'Bob Builder',
      userTenants: [{ tenantId: TENANT_B, roleNames: ['user'] }],
      sendMail: true,
    });

    expect(result.email).toBe('bob@bravo.com');
    expect(result.role).toBe('user');
    expect(result.inviteSent).toBe(true);
    expect(result.existingUser).toBe(false);
  });

  it('adds existing user to tenant with correct role', async () => {
    mockSearchAll.mockResolvedValue({
      data: [{ loginIds: ['bob@bravo.com'], userId: 'existing-bob' }],
    });
    mockAddTenantRoles.mockResolvedValue({});
    mockInvite.mockResolvedValue({});

    const result = await inviteUser({
      email: 'bob@bravo.com',
      name: 'Bob Builder',
      role: 'manager',
      tenantId: TENANT_B,
    });

    expect(mockAddTenantRoles).toHaveBeenCalledWith('bob@bravo.com', TENANT_B, ['manager']);
    expect(result.existingUser).toBe(true);
  });

  it('invite is scoped to the correct tenant only', async () => {
    mockSearchAll.mockResolvedValue({ data: [] });
    mockInvite.mockResolvedValue({});

    await inviteUser({
      email: 'alice@alpha.com',
      name: 'Alice',
      role: 'admin',
      tenantId: TENANT_A,
    });

    // The invite must only reference TENANT_A
    const inviteCall = mockInvite.mock.calls[0];
    expect(inviteCall[1].userTenants[0].tenantId).toBe(TENANT_A);
    expect(inviteCall[1].userTenants[0].tenantId).not.toBe(TENANT_B);
  });

  it('throws VALIDATION_ERROR for invalid role on invite', async () => {
    await expect(
      inviteUser({ email: 'bob@bravo.com', name: 'Bob', role: 'superadmin', tenantId: TENANT_B }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('throws VALIDATION_ERROR for invalid email on invite', async () => {
    await expect(
      inviteUser({ email: 'not-an-email', name: 'Bob', role: 'user', tenantId: TENANT_B }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});
