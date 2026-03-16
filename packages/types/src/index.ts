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
  /** Company/customer name */
  name: string;
  /** e.g. "Technology", "Healthcare" */
  industry?: string;
  website?: string;
  phone?: string;
  email?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  /** State/county/region */
  region?: string;
  postalCode?: string;
  country?: string;
  notes?: string;
  /** Descope user ID of the account owner */
  ownerId: string;
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
  accountId?: string;
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
// Account API types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Request body for creating a new account within a tenant.
 * The tenantId and ownerId are resolved from the authenticated user's JWT —
 * they must not be supplied by the caller.
 */
export interface CreateAccountRequest {
  /** Company/customer name (required, 1–200 chars) */
  name: string;
  /** e.g. "Technology", "Healthcare" */
  industry?: string;
  /** Website URL */
  website?: string;
  /** Phone number */
  phone?: string;
  /** Email address */
  email?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  /** State/county/region */
  region?: string;
  postalCode?: string;
  country?: string;
  notes?: string;
}

/**
 * Request body for updating an existing account.
 * All fields are optional — only the supplied fields will be updated.
 */
export interface UpdateAccountRequest {
  name?: string;
  industry?: string | null;
  website?: string | null;
  phone?: string | null;
  email?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
  country?: string | null;
  notes?: string | null;
}

/**
 * Paginated list response for accounts.
 */
export interface ListAccountsResponse {
  data: Account[];
  total: number;
  page: number;
  limit: number;
}

/**
 * Standard error response shape used by the API.
 */
export interface ApiErrorResponse {
  error: string;
  code: string;
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
  /** The account this opportunity is linked to (optional) */
  accountId?: string;
  /** Monetary value of the opportunity */
  value?: number;
  /** ISO 4217 currency code (e.g. "GBP", "USD") */
  currency?: string;
  /** Expected close date in ISO 8601 format (e.g. "2025-12-31") */
  expectedCloseDate?: string;
  /** Optional description or notes for the opportunity */
  description?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Metadata engine — object & field definitions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Supported field types for metadata-driven field definitions.
 */
export type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'currency'
  | 'date'
  | 'datetime'
  | 'email'
  | 'phone'
  | 'url'
  | 'boolean'
  | 'dropdown'
  | 'multi_select';

/**
 * An ObjectDefinition describes a CRM object type (e.g. "account", "opportunity").
 * System objects are seeded by migrations and cannot be deleted by end-users.
 */
export interface ObjectDefinition {
  /** UUID primary key */
  id: string;
  /** Machine name, snake_case (e.g. "account", "custom_project") */
  apiName: string;
  /** Display name (e.g. "Account") */
  label: string;
  /** Plural display name (e.g. "Accounts") */
  pluralLabel: string;
  description?: string;
  /** Icon identifier for the UI */
  icon?: string;
  /** True for built-in objects (account, opportunity) */
  isSystem: boolean;
  /** Descope user ID of the creator */
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Type-specific configuration stored in FieldDefinition.options.
 *
 * - dropdown / multi_select: `{ choices: string[] }`
 * - number / currency: `{ min?: number; max?: number; precision?: number }`
 * - text: `{ max_length?: number }`
 */
export interface FieldOptions {
  choices?: string[];
  min?: number;
  max?: number;
  precision?: number;
  max_length?: number;
}

/**
 * A FieldDefinition describes a single field on a CRM object.
 * The field_type determines how the value is stored, validated, and rendered.
 */
export interface FieldDefinition {
  /** UUID primary key */
  id: string;
  /** The object this field belongs to */
  objectId: string;
  /** Machine name, snake_case (e.g. "company_name") */
  apiName: string;
  /** Display name (e.g. "Company Name") */
  label: string;
  fieldType: FieldType;
  description?: string;
  required: boolean;
  /** Default value as string (parsed by field_type) */
  defaultValue?: string;
  /** Type-specific configuration */
  options: FieldOptions;
  /** Controls display ordering within the object */
  sortOrder: number;
  /** True for built-in fields */
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// Metadata engine — relationship definitions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Supported relationship types between CRM objects.
 * - lookup: a simple foreign-key reference (e.g. opportunity → account)
 * - parent_child: a hierarchical ownership relationship
 */
export type RelationshipType = 'lookup' | 'parent_child';

/**
 * A RelationshipDefinition describes how two CRM object types relate to each other.
 * For example, an Opportunity has a "lookup" relationship to an Account.
 */
export interface RelationshipDefinition {
  /** UUID primary key */
  id: string;
  /** The object that holds the reference (e.g. opportunity) */
  sourceObjectId: string;
  /** The object being referenced (e.g. account) */
  targetObjectId: string;
  relationshipType: RelationshipType;
  /** Machine name (e.g. "opportunity_account") */
  apiName: string;
  /** Display label shown on the source object form (e.g. "Account") */
  label: string;
  /** Display label shown on the target object detail (e.g. "Opportunities") */
  reverseLabel?: string;
  /** Whether the relationship is required on the source object */
  required: boolean;
  createdAt: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// Metadata engine — records & record relationships
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A CrmRecord is a single instance of a CRM object (e.g. one account, one
 * opportunity, one custom object row). All object data lives in the `records`
 * table, with type-specific field data stored in the JSONB `fieldValues` column.
 *
 * Named `CrmRecord` to avoid collision with the built-in TypeScript `Record`
 * utility type.
 */
export interface CrmRecord {
  /** UUID primary key */
  id: string;
  /** The object definition this record belongs to */
  objectId: string;
  /** Primary display name of the record */
  name: string;
  /** Type-specific field data stored as JSONB key/value pairs */
  fieldValues: Record<string, unknown>;
  /** Descope user ID of the record owner */
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * A RecordRelationship links two CrmRecords together via a
 * RelationshipDefinition. For example, an opportunity record linked to an
 * account record through the "opportunity_account" relationship.
 */
export interface RecordRelationship {
  /** UUID primary key */
  id: string;
  /** The relationship definition that governs this link */
  relationshipId: string;
  /** The record that holds the reference (source side) */
  sourceRecordId: string;
  /** The record being referenced (target side) */
  targetRecordId: string;
  createdAt: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// Metadata engine — layout definitions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Supported layout types.
 * - form: field layout for create/edit forms
 * - list: column layout for list/table views
 * - detail: field layout for read-only detail views
 */
export type LayoutType = 'form' | 'list' | 'detail';

/**
 * Supported layout field widths for form rendering.
 * - full: spans the entire row
 * - half: spans half the row (two-column layout)
 */
export type LayoutFieldWidth = 'full' | 'half';

/**
 * A LayoutDefinition describes a named layout for a CRM object.
 * Each object can have multiple layouts (e.g. a default form and a list view).
 * Exactly one layout per (object, layout_type) should be marked as default.
 */
export interface LayoutDefinition {
  /** UUID primary key */
  id: string;
  /** The object this layout belongs to */
  objectId: string;
  /** Human-readable name (e.g. "Default Form", "List View") */
  name: string;
  /** The context in which this layout is used */
  layoutType: LayoutType;
  /** Whether this is the default layout for its type */
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * A LayoutField places a field definition into a layout, controlling
 * section grouping, display order, and width.
 */
export interface LayoutField {
  /** UUID primary key */
  id: string;
  /** The layout this field placement belongs to */
  layoutId: string;
  /** The field definition being placed */
  fieldId: string;
  /** Section index for grouping fields (0-based) */
  section: number;
  /** Optional label for the section (e.g. "Address Details") */
  sectionLabel?: string;
  /** Display order within the layout */
  sortOrder: number;
  /** Width hint for form rendering */
  width: LayoutFieldWidth;
}
