import { randomUUID } from 'crypto';
import type { Selectable } from 'kysely';
import { logger } from '../lib/logger.js';
import { db } from '../db/kysely.js';
import type {
  Organisations,
  TenantMemberships,
} from '../db/kysely.types.js';

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

// ─── Row → domain model ─────────────────────────────────────────────────────

/**
 * Typing the row mappers against `Selectable<Organisations>` /
 * `Selectable<TenantMemberships>` (rather than `Record<string, unknown>`)
 * means a column rename or nullability change on the generated schema
 * becomes a compile-time error at this service, rather than an `unknown`
 * cast leaking an incorrect runtime shape into the domain model.
 */
function rowToOrganisation(
  row: Selectable<Organisations>,
): Organisation {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    description: row.description ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToMembership(
  row: Selectable<TenantMemberships>,
): TenantMembership {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    organisationId: row.organisation_id ?? undefined,
    role: row.role as 'owner' | 'admin' | 'member',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
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
  const orgRow = await db
    .insertInto('organisations')
    .values({
      id: organisationId,
      tenant_id: tenantId,
      name: name.trim(),
      description: description?.trim() ?? null,
      created_at: now,
      updated_at: now,
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  const organisation = rowToOrganisation(orgRow);

  // Step 3 — persist membership for the requesting user as owner
  const membershipId = randomUUID();
  const memberRow = await db
    .insertInto('tenant_memberships')
    .values({
      id: membershipId,
      tenant_id: tenantId,
      user_id: requestingUserId,
      organisation_id: organisationId,
      role: 'owner',
      created_at: now,
      updated_at: now,
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  const membership = rowToMembership(memberRow);

  logger.info(
    { tenantId, organisationId, membershipId: membership.id },
    'Organisation provisioned successfully',
  );

  return { organisation, membership };
}

export { validateName };
