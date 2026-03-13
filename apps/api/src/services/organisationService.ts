import { randomUUID } from 'crypto';
import { logger } from '../lib/logger.js';

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
 *
 * TODO: Replace the in-memory stub below with real database writes once a
 * database client is configured (see apps/api/src/db/).
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

  // Step 2 — create organisation record
  // TODO: persist to the `organisations` table:
  //   INSERT INTO organisations (id, tenant_id, name, description, created_at, updated_at)
  //   VALUES ($1, $2, $3, $4, $5, $6)
  const organisation: Organisation = {
    id: organisationId,
    tenantId,
    name: name.trim(),
    description: description?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
  };

  // Step 3 — create membership for the requesting user as owner
  // TODO: persist to the `tenant_memberships` table:
  //   INSERT INTO tenant_memberships (id, tenant_id, user_id, organisation_id, role, created_at, updated_at)
  //   VALUES ($1, $2, $3, $4, 'owner', $5, $6)
  const membership: TenantMembership = {
    id: randomUUID(),
    tenantId,
    userId: requestingUserId,
    organisationId,
    role: 'owner',
    createdAt: now,
    updatedAt: now,
  };

  logger.info(
    { tenantId, organisationId, membershipId: membership.id },
    'Organisation provisioned successfully',
  );

  return { organisation, membership };
}

export { validateName };
