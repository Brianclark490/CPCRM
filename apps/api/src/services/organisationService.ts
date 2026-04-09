import { randomUUID } from 'crypto';
import { logger } from '../lib/logger.js';
import { pool } from '../db/client.js';

// ─── Local type aliases (mirror packages/types) ───────────────────────────────

/**
 * An Organisation is a logical grouping of users within a Tenant.
 * Initially every tenant has exactly one organisation, but the model
 * supports multiple organisations per tenant for enterprise use cases.
 */
export interface Organisation {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Associates a Descope user with a Tenant, optionally scoped to an Organisation.
 */
export interface TenantMembership {
  id: string;
  tenantId: string;
  userId: string;
  organisationId?: string;
  /** owner: full control; admin: manage members and CRM data; member: read/write CRM data */
  role: 'owner' | 'admin' | 'member';
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Result returned by the organisation provisioning workflow.
 */
export interface ProvisionOrganisationResult {
  organisation: Organisation;
  /** Membership record for the requesting user (role: "owner") */
  membership: TenantMembership;
}

/**
 * Input parameters for the organisation provisioning workflow.
 */
export interface ProvisionOrganisationParams {
  /** Human-readable name for the new organisation */
  name: string;
  /** Optional description */
  description?: string;
  /** Tenant the organisation belongs to — resolved from the authenticated JWT */
  tenantId: string;
  /** Descope userId of the user who is creating the organisation (becomes owner) */
  requestingUserId: string;
}

/**
 * Validates the organisation name.
 * Returns an error message string, or null if valid.
 */
function validateName(name: unknown): string | null {
  if (typeof name !== 'string' || name.trim().length === 0) {
    return 'Organisation name is required';
  }
  if (name.trim().length > 100) {
    return 'Organisation name must be 100 characters or fewer';
  }
  return null;
}

/**
 * Provisions a new organisation within a tenant.
 *
 * Provisioning steps:
 *   1. Validate input — name is required and must be ≤ 100 characters.
 *   2. Create the Organisation record scoped to the tenant.
 *   3. Create a TenantMembership for the requesting user as "owner", scoped
 *      to the new organisation.
 *
 * Tenant isolation: the tenantId is always taken from the authenticated
 * session and never from caller-supplied input, ensuring a user cannot
 * provision an organisation into a tenant they do not belong to.
 *
 * @throws {Error} with a `code` property of "VALIDATION_ERROR" when input is invalid.
 */
export async function provisionOrganisation(
  params: ProvisionOrganisationParams,
): Promise<ProvisionOrganisationResult> {
  const { name, description, tenantId, requestingUserId } = params;

  // Step 1 — validate
  const nameError = validateName(name);
  if (nameError) {
    const err = new Error(nameError) as Error & { code: string };
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  const now = new Date();
  const organisationId = randomUUID();

  logger.info({ tenantId, organisationId, requestingUserId }, 'Provisioning new organisation');

  // Step 2 — persist organisation record
  const orgResult = await pool.query(
    `INSERT INTO organisations (id, tenant_id, name, description, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      organisationId,
      tenantId,
      name.trim(),
      description?.trim() ?? null,
      now,
      now,
    ],
  );

  const orgRow = orgResult.rows[0];
  const organisation: Organisation = {
    id: orgRow.id as string,
    tenantId: orgRow.tenant_id as string,
    name: orgRow.name as string,
    description: (orgRow.description as string | null) ?? undefined,
    createdAt: new Date(orgRow.created_at as string),
    updatedAt: new Date(orgRow.updated_at as string),
  };

  // Step 3 — persist membership for the requesting user as owner
  const membershipId = randomUUID();
  const memberResult = await pool.query(
    `INSERT INTO tenant_memberships
       (id, tenant_id, user_id, organisation_id, role, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'owner', $5, $6)
     RETURNING *`,
    [
      membershipId,
      tenantId,
      requestingUserId,
      organisationId,
      now,
      now,
    ],
  );

  const memberRow = memberResult.rows[0];
  const membership: TenantMembership = {
    id: memberRow.id as string,
    tenantId: memberRow.tenant_id as string,
    userId: memberRow.user_id as string,
    organisationId: (memberRow.organisation_id as string | null) ?? undefined,
    role: memberRow.role as 'owner' | 'admin' | 'member',
    createdAt: new Date(memberRow.created_at as string),
    updatedAt: new Date(memberRow.updated_at as string),
  };

  logger.info(
    { tenantId, organisationId, membershipId: membership.id },
    'Organisation provisioned successfully',
  );

  return { organisation, membership };
}

export { validateName };
