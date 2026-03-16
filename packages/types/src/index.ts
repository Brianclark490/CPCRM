// ─────────────────────────────────────────────────────────────────────────────
// Tenant & Organisation domain types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lifecycle status of a tenant subscription.
 */
export type TenantStatus = 'active' | 'suspended' | 'inactive';

/**
 * A Tenant is the root isolation boundary in CPCRM.
 * Each company or team that subscribes to the platform is a distinct tenant.
 * All application data belongs to exactly one tenant.
 */
export interface Tenant {
  /** UUID primary key */
  id: string;
  /** Human-readable display name (e.g. "Acme Corp") */
  name: string;
  /** URL-safe unique slug used for subdomain routing (e.g. "acme-corp") */
  slug: string;
  status: TenantStatus;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * An Organisation is a logical grouping of users within a Tenant.
 * Initially every tenant has exactly one organisation, but the model
 * supports multiple organisations per tenant for enterprise use cases.
 */
export interface Organisation {
  /** UUID primary key */
  id: string;
  /** The owning tenant */
  tenantId: string;
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// User ↔ Tenant association
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Roles a user can hold within a tenant.
 * - owner: full control, can delete the tenant and manage billing
 * - admin: can manage members and all CRM records
 * - member: can read/write CRM records they have access to
 */
export type TenantRole = 'owner' | 'admin' | 'member';

/**
 * Associates a Descope user (identified by their JWT `sub` claim) with a Tenant.
 * A user may be a member of multiple tenants (each with their own membership record).
 * The optional `organisationId` allows scoping a user to a specific organisation
 * within the tenant.
 */
export interface TenantMembership {
  /** UUID primary key */
  id: string;
  tenantId: string;
  /** Descope user ID — the `sub` claim from the validated JWT */
  userId: string;
  /** Optional — scopes the user to a specific organisation within the tenant */
  organisationId?: string;
  role: TenantRole;
  createdAt: Date;
  updatedAt: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// Organisation provisioning API types
// ─────────────────────────────────────────────────────────────────────────────


/**
 * Request body for creating a new organisation within a tenant.
 * The tenantId is resolved from the authenticated user's JWT — it must not be
 * supplied by the caller.
 */
export interface CreateOrganisationRequest {
  /** Human-readable display name for the organisation (required, 1–100 chars) */
  name: string;
  /** Optional description of the organisation */
  description?: string;
}

/**
 * Result returned by the organisation provisioning workflow.
 * Includes the newly created organisation and the initial membership
 * record that associates the requesting user as an owner.
 */
export interface ProvisionOrganisationResult {
  organisation: Organisation;
  /** Membership record created for the requesting user (role: "owner") */
  membership: TenantMembership;
}

// ─────────────────────────────────────────────────────────────────────────────
// CRM entities — all are scoped to a tenant via tenantId
// ─────────────────────────────────────────────────────────────────────────────

/**
 * An Account represents a business or organisation being tracked in the CRM.
 * Every Account belongs to exactly one Tenant; cross-tenant access is not permitted.
 */
export interface Account {
  /** UUID primary key */
  id: string;
  /** Tenant that owns this record — used to enforce data isolation in all queries */
  tenantId: string;
  name: string;
  industry?: string;
  website?: string;
  createdAt: Date;
  updatedAt: Date;
  /** Descope userId of the user who created this record */
  createdBy: string;
}

/**
 * A Contact is an individual person associated with an Account.
 */
export interface Contact {
  /** UUID primary key */
  id: string;
  tenantId: string;
  /** The Account this contact belongs to (optional — contacts may be unassigned) */
  accountId?: string;
  firstName: string;
  lastName: string;
  email?: string;
  jobTitle?: string;
  createdAt: Date;
  updatedAt: Date;
  /** Descope userId of the user who created this record */
  createdBy: string;
}

/**
 * Sales pipeline stages for an Opportunity.
 */
export type OpportunityStage =
  | 'prospecting'
  | 'qualification'
  | 'proposal'
  | 'negotiation'
  | 'closed_won'
  | 'closed_lost';

/**
 * Records a single stage change on an Opportunity.
 */
export interface StageTransition {
  /** The stage before the change, or null when the opportunity was first created. */
  from: OpportunityStage | null;
  to: OpportunityStage;
  changedAt: Date;
  /** Descope userId of the user who made the change. */
  changedBy: string;
}

/**
 * An Opportunity represents a potential deal or sale being tracked in the CRM.
 * It is linked to an Account and assigned to an owner (a tenant member).
 */
export interface Opportunity {
  /** UUID primary key */
  id: string;
  tenantId: string;
  accountId: string;
  /** Descope userId of the team member responsible for this opportunity */
  ownerId: string;
  title: string;
  stage: OpportunityStage;
  /** Monetary value of the opportunity */
  value?: number;
  /** ISO 4217 currency code (e.g. "GBP", "USD") */
  currency?: string;
  expectedCloseDate?: Date;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
  /** Descope userId of the user who created this record */
  createdBy: string;
  /** Ordered history of stage transitions, oldest first. */
  stageHistory: StageTransition[];
}

// ─────────────────────────────────────────────────────────────────────────────
// User Profile
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A UserProfile stores application-level profile data for an authenticated user.
 * It is uniquely linked to a Descope identity via the `userId` field (JWT `sub` claim).
 * One profile per Descope user ID is enforced at the database level.
 */
export interface UserProfile {
  /** UUID primary key */
  id: string;
  /** Descope user ID — the `sub` claim from the validated JWT. Immutable after creation. */
  userId: string;
  /** Optional display name the user has set within CPCRM */
  displayName?: string;
  /** Optional job title */
  jobTitle?: string;
  createdAt: Date;
  updatedAt: Date;
  /** Descope userId of the user who last updated this profile (always the owner) */
  updatedBy: string;
}

/**
 * Request body for updating a user profile.
 * All fields are optional — only the supplied fields will be updated.
 */
export interface UpdateProfileRequest {
  /** Display name (1–100 characters) */
  displayName?: string;
  /** Job title (1–100 characters) */
  jobTitle?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Opportunity creation API types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Request body for creating a new opportunity within a tenant.
 * The tenantId and ownerId are resolved from the authenticated user's JWT —
 * they must not be supplied by the caller.
 * The initial stage defaults to "prospecting".
 */
export interface CreateOpportunityRequest {
  /** Human-readable title for the opportunity (required, 1–200 chars) */
  title: string;
  /** The account this opportunity is linked to (required) */
  accountId: string;
  /** Monetary value of the opportunity */
  value?: number;
  /** ISO 4217 currency code (e.g. "GBP", "USD") */
  currency?: string;
  /** Expected close date in ISO 8601 format (e.g. "2025-12-31") */
  expectedCloseDate?: string;
  /** Optional description or notes for the opportunity */
  description?: string;
}
