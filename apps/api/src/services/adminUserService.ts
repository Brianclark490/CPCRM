import DescopeClient from '@descope/node-sdk';
import { logger } from '../lib/logger.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface InviteUserInput {
  email: string;
  name: string;
  role: string;
  tenantId: string;
}

export interface InviteUserResult {
  email: string;
  name: string;
  role: string;
  inviteSent: boolean;
  existingUser: boolean;
}

export interface TenantUser {
  userId: string;
  email: string;
  name: string;
  roles: string[];
  status: string;
  lastLogin: string | null;
}

export interface ChangeRoleInput {
  userId: string;
  tenantId: string;
  newRole: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const VALID_ROLES = ['admin', 'manager', 'user', 'read_only'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ─── Descope management client ────────────────────────────────────────────────

let descopeManagementClient: ReturnType<typeof DescopeClient> | undefined;

function getDescopeManagementClient(): ReturnType<typeof DescopeClient> {
  if (!descopeManagementClient) {
    const projectId = process.env.DESCOPE_PROJECT_ID;
    if (!projectId) {
      throw new Error('DESCOPE_PROJECT_ID environment variable is required');
    }
    const managementKey = process.env.DESCOPE_MANAGEMENT_KEY;
    if (!managementKey) {
      throw new Error('DESCOPE_MANAGEMENT_KEY environment variable is required');
    }
    descopeManagementClient = DescopeClient({ projectId, managementKey });
  }
  return descopeManagementClient;
}

// ─── Service ──────────────────────────────────────────────────────────────────

/**
 * Invites a user to a tenant.
 *
 * 1. Validates input (email, name, role).
 * 2. Checks if the user already exists in Descope (by email).
 *    - If yes: adds them to the tenant with the specified role.
 *    - If no: creates the user in Descope and adds them to the tenant with the role.
 * 3. Sends a magic link invite via Descope.
 *
 * @throws {Error} with `code: 'VALIDATION_ERROR'` for invalid input.
 */
export async function inviteUser(input: InviteUserInput): Promise<InviteUserResult> {
  const { email, name, role, tenantId } = input;

  // ── Validate input ──────────────────────────────────────────────────────
  if (!email || !EMAIL_RE.test(email)) {
    throw Object.assign(new Error('A valid email address is required'), {
      code: 'VALIDATION_ERROR',
    });
  }
  if (!name || name.trim().length === 0) {
    throw Object.assign(new Error('Name is required'), { code: 'VALIDATION_ERROR' });
  }
  if (!role || !VALID_ROLES.includes(role)) {
    throw Object.assign(
      new Error(`Invalid role "${role}". Must be one of: ${VALID_ROLES.join(', ')}`),
      { code: 'VALIDATION_ERROR' },
    );
  }

  const descopeClient = getDescopeManagementClient();

  // ── Check if user exists ────────────────────────────────────────────────
  let existingUser = false;
  try {
    const searchResult = await descopeClient.management.user.searchAll({
      limit: 1,
      emails: [email],
    });
    const users = searchResult.data ?? [];

    if (users.length > 0) {
      existingUser = true;
      const userId = users[0].loginIds?.[0] ?? email;
      logger.info({ tenantId, email }, 'User already exists in Descope; adding to tenant');
      await descopeClient.management.user.addTenantRoles(userId, tenantId, [role]);
    }
  } catch {
    // If searchAll fails, proceed with invite (which creates user if needed)
    logger.warn({ tenantId, email }, 'Failed to search for existing user; proceeding with invite');
  }

  // ── Create / invite user ────────────────────────────────────────────────
  let inviteSent = false;
  if (!existingUser) {
    try {
      await descopeClient.management.user.invite(email, {
        email,
        displayName: name.trim(),
        userTenants: [{ tenantId, roleNames: [role] }],
        sendMail: true,
      });
      inviteSent = true;
      logger.info({ tenantId, email }, 'New user invited via Descope');
    } catch (err) {
      logger.error({ err, tenantId, email }, 'Failed to invite user via Descope');
      throw Object.assign(new Error('Failed to send user invitation'), {
        code: 'INVITE_FAILED',
      });
    }
  } else {
    // Send magic link to existing user being added to a new tenant
    try {
      await descopeClient.management.user.invite(email, {
        email,
        displayName: name.trim(),
        userTenants: [{ tenantId, roleNames: [role] }],
        sendMail: true,
      });
      inviteSent = true;
    } catch {
      // Invite email may fail for existing users; the user is still added to tenant
      logger.warn(
        { tenantId, email },
        'User added to tenant but magic link invite failed',
      );
    }
  }

  return {
    email,
    name: name.trim(),
    role,
    inviteSent,
    existingUser,
  };
}

/**
 * Lists all users in a tenant using the Descope management SDK.
 *
 * Returns user details including name, email, roles, status, and last login.
 */
export async function listTenantUsers(tenantId: string): Promise<TenantUser[]> {
  const descopeClient = getDescopeManagementClient();

  const searchResult = await descopeClient.management.user.searchAll({
    tenantIds: [tenantId],
  });

  const users = searchResult.data ?? [];

  return users.map((u) => {
    // Extract tenant-specific roles
    const tenantData = u.userTenants?.find((t) => t.tenantId === tenantId);
    const roles = tenantData?.roleNames ?? [];

    return {
      userId: u.userId ?? '',
      email: u.email ?? '',
      name: u.name ?? u.displayName ?? '',
      roles,
      status: u.status ?? 'invited',
      lastLogin: u.lastLogin ? String(u.lastLogin) : null,
    };
  });
}

/**
 * Changes a user's role within a tenant.
 *
 * Removes all existing tenant roles and assigns the new role.
 *
 * @throws {Error} with `code: 'VALIDATION_ERROR'` for invalid role.
 */
export async function changeUserRole(input: ChangeRoleInput): Promise<void> {
  const { userId, tenantId, newRole } = input;

  if (!newRole || !VALID_ROLES.includes(newRole)) {
    throw Object.assign(
      new Error(`Invalid role "${newRole}". Must be one of: ${VALID_ROLES.join(', ')}`),
      { code: 'VALIDATION_ERROR' },
    );
  }

  const descopeClient = getDescopeManagementClient();

  // Remove all existing CRM roles from the tenant, then assign the new one
  const oldRoles = [...VALID_ROLES];
  try {
    await descopeClient.management.user.removeTenantRoles(userId, tenantId, oldRoles);
  } catch {
    // Removal may fail if user doesn't have some roles — safe to ignore
    logger.debug({ userId, tenantId }, 'Some old roles may not have existed during removal');
  }

  await descopeClient.management.user.addTenantRoles(userId, tenantId, [newRole]);
  logger.info({ userId, tenantId, newRole }, 'User role updated');
}

/**
 * Removes a user from a tenant (does not delete the user from Descope entirely).
 */
export async function removeUserFromTenant(
  userId: string,
  tenantId: string,
): Promise<void> {
  const descopeClient = getDescopeManagementClient();
  await descopeClient.management.user.removeTenant(userId, tenantId);
  logger.info({ userId, tenantId }, 'User removed from tenant');
}
