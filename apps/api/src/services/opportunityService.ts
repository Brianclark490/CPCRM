import { randomUUID } from 'crypto';
import { logger } from '../lib/logger.js';

// ─── Local type aliases ───────────────────────────────────────────────────────

export type OpportunityStage =
  | 'prospecting'
  | 'qualification'
  | 'proposal'
  | 'negotiation'
  | 'closed_won'
  | 'closed_lost';

const VALID_STAGES: readonly OpportunityStage[] = [
  'prospecting',
  'qualification',
  'proposal',
  'negotiation',
  'closed_won',
  'closed_lost',
];

/**
 * An Opportunity represents a potential deal or sale being tracked in the CRM.
 */
export interface Opportunity {
  id: string;
  tenantId: string;
  accountId: string;
  /** Descope userId of the team member responsible for this opportunity */
  ownerId: string;
  title: string;
  stage: OpportunityStage;
  value?: number;
  /** ISO 4217 currency code (e.g. "GBP", "USD") */
  currency?: string;
  expectedCloseDate?: Date;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
  /** Descope userId of the user who created this record */
  createdBy: string;
}

/**
 * Input parameters for updating an existing opportunity.
 */
export interface UpdateOpportunityParams {
  title?: string;
  accountId?: string;
  ownerId?: string;
  stage?: OpportunityStage;
  value?: number | null;
  currency?: string | null;
  expectedCloseDate?: string | null;
  description?: string | null;
}

/**
 * Input parameters for creating a new opportunity.
 */
export interface CreateOpportunityParams {
  /** Human-readable title for the opportunity */
  title: string;
  /** The account this opportunity is linked to */
  accountId: string;
  /** Monetary value of the opportunity */
  value?: number;
  /** ISO 4217 currency code (e.g. "GBP", "USD") */
  currency?: string;
  /** Expected close date as an ISO 8601 string (e.g. "2025-12-31") */
  expectedCloseDate?: string;
  /** Optional description or notes */
  description?: string;
  /** Tenant the opportunity belongs to — resolved from the authenticated JWT */
  tenantId: string;
  /** Descope userId of the requesting user — becomes the owner */
  requestingUserId: string;
}

/**
 * Validates the opportunity title.
 * Returns an error message string, or null if valid.
 */
export function validateTitle(title: unknown): string | null {
  if (typeof title !== 'string' || title.trim().length === 0) {
    return 'Opportunity title is required';
  }
  if (title.trim().length > 200) {
    return 'Opportunity title must be 200 characters or fewer';
  }
  return null;
}

/**
 * Validates the accountId field.
 * Returns an error message string, or null if valid.
 */
export function validateAccountId(accountId: unknown): string | null {
  if (typeof accountId !== 'string' || accountId.trim().length === 0) {
    return 'Account is required';
  }
  return null;
}

/**
 * Validates the estimated value field.
 * Returns an error message string, or null if valid.
 */
export function validateValue(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const num = Number(value);
  if (isNaN(num) || !isFinite(num)) {
    return 'Estimated value must be a valid number';
  }
  return null;
}

/**
 * Validates the expected close date field.
 * Returns an error message string, or null if valid.
 */
export function validateExpectedCloseDate(date: unknown): string | null {
  if (date === undefined || date === null || date === '') return null;
  const d = new Date(date as string);
  if (isNaN(d.getTime())) {
    return 'Close date must be a valid date';
  }
  return null;
}

/**
 * Validates the opportunity stage field.
 * Returns an error message string, or null if valid.
 */
export function validateStage(stage: unknown): string | null {
  if (stage === undefined || stage === null) return null;
  if (!VALID_STAGES.includes(stage as OpportunityStage)) {
    return `Stage must be one of: ${VALID_STAGES.join(', ')}`;
  }
  return null;
}

// ─── In-memory store ─────────────────────────────────────────────────────────
// TODO: replace with real database queries once a database client is configured

const opportunityStore = new Map<string, Opportunity>();

/**
 * Creates a new opportunity within a tenant.
 *
 * Creation steps:
 *   1. Validate input — title and accountId are required.
 *   2. Create the Opportunity record with initial stage "prospecting".
 *
 * Tenant isolation: the tenantId is always taken from the authenticated
 * session and never from caller-supplied input.
 *
 * @throws {Error} with a `code` property of "VALIDATION_ERROR" when input is invalid.
 *
 * TODO: Replace the in-memory stub below with real database writes once a
 * database client is configured (see apps/api/src/db/).
 */
export async function createOpportunity(
  params: CreateOpportunityParams,
): Promise<Opportunity> {
  const {
    title,
    accountId,
    value,
    currency,
    expectedCloseDate,
    description,
    tenantId,
    requestingUserId,
  } = params;

  // Step 1 — validate
  const titleError = validateTitle(title);
  if (titleError) {
    const err = new Error(titleError) as Error & { code: string };
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  const accountError = validateAccountId(accountId);
  if (accountError) {
    const err = new Error(accountError) as Error & { code: string };
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  const opportunityId = randomUUID();
  const now = new Date();

  logger.info({ tenantId, opportunityId, requestingUserId }, 'Creating new opportunity');

  // Step 2 — create opportunity record
  const opportunity: Opportunity = {
    id: opportunityId,
    tenantId,
    accountId: accountId.trim(),
    ownerId: requestingUserId,
    title: title.trim(),
    stage: 'prospecting',
    value,
    currency: currency?.trim() || undefined,
    expectedCloseDate: expectedCloseDate ? new Date(expectedCloseDate) : undefined,
    description: description?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
    createdBy: requestingUserId,
  };

  opportunityStore.set(opportunityId, opportunity);

  logger.info({ tenantId, opportunityId }, 'Opportunity created successfully');

  return opportunity;
}

/**
 * Returns all opportunities belonging to a given tenant.
 *
 * Tenant isolation: only opportunities with a matching tenantId are returned.
 *
 * TODO: Replace with a real database query:
 *   SELECT * FROM opportunities WHERE tenant_id = $1 ORDER BY created_at DESC
 */
export async function listOpportunities(tenantId: string): Promise<Opportunity[]> {
  return Array.from(opportunityStore.values())
    .filter((o) => o.tenantId === tenantId)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/**
 * Returns a single opportunity by ID, scoped to the given tenant.
 * Returns null if the opportunity does not exist or belongs to a different tenant.
 *
 * TODO: Replace with a real database query:
 *   SELECT * FROM opportunities WHERE id = $1 AND tenant_id = $2
 */
export async function getOpportunity(
  id: string,
  tenantId: string,
): Promise<Opportunity | null> {
  const opportunity = opportunityStore.get(id);
  if (!opportunity || opportunity.tenantId !== tenantId) return null;
  return opportunity;
}

/**
 * Updates an existing opportunity within a tenant.
 *
 * Update steps:
 *   1. Validate that the opportunity exists and belongs to the tenant.
 *   2. Validate updated fields.
 *   3. Apply changes and record which fields changed for the activity log.
 *
 * Tenant isolation: the tenantId is always taken from the authenticated session.
 *
 * @throws {Error} with a `code` property of "VALIDATION_ERROR" when input is invalid.
 * @throws {Error} with a `code` property of "NOT_FOUND" when the opportunity does not exist.
 *
 * TODO: Replace the in-memory stub below with real database writes and a proper
 * activity log table once a database client is configured (see apps/api/src/db/).
 */
export async function updateOpportunity(
  id: string,
  tenantId: string,
  params: UpdateOpportunityParams,
  requestingUserId: string,
): Promise<Opportunity> {
  const existing = opportunityStore.get(id);
  if (!existing || existing.tenantId !== tenantId) {
    const err = new Error('Opportunity not found') as Error & { code: string };
    err.code = 'NOT_FOUND';
    throw err;
  }

  // Validate only the fields being changed
  if (params.title !== undefined) {
    const titleError = validateTitle(params.title);
    if (titleError) {
      const err = new Error(titleError) as Error & { code: string };
      err.code = 'VALIDATION_ERROR';
      throw err;
    }
  }

  if (params.accountId !== undefined) {
    const accountError = validateAccountId(params.accountId);
    if (accountError) {
      const err = new Error(accountError) as Error & { code: string };
      err.code = 'VALIDATION_ERROR';
      throw err;
    }
  }

  if (params.value !== undefined) {
    const valueError = validateValue(params.value);
    if (valueError) {
      const err = new Error(valueError) as Error & { code: string };
      err.code = 'VALIDATION_ERROR';
      throw err;
    }
  }

  if (params.expectedCloseDate !== undefined) {
    const dateError = validateExpectedCloseDate(params.expectedCloseDate);
    if (dateError) {
      const err = new Error(dateError) as Error & { code: string };
      err.code = 'VALIDATION_ERROR';
      throw err;
    }
  }

  if (params.stage !== undefined) {
    const stageError = validateStage(params.stage);
    if (stageError) {
      const err = new Error(stageError) as Error & { code: string };
      err.code = 'VALIDATION_ERROR';
      throw err;
    }
  }

  // Determine which fields are actually changing for the activity log
  const changedFields: string[] = [];
  if (params.title !== undefined && params.title.trim() !== existing.title) changedFields.push('title');
  if (params.accountId !== undefined && params.accountId.trim() !== existing.accountId) changedFields.push('accountId');
  if (params.ownerId !== undefined && params.ownerId !== existing.ownerId) changedFields.push('ownerId');
  if (params.stage !== undefined && params.stage !== existing.stage) changedFields.push('stage');
  if (params.value !== undefined && params.value !== existing.value) changedFields.push('value');
  if (params.currency !== undefined && (params.currency?.trim() || undefined) !== existing.currency) changedFields.push('currency');
  if (params.expectedCloseDate !== undefined) {
    const newDate = params.expectedCloseDate ? new Date(params.expectedCloseDate).toISOString() : undefined;
    const oldDate = existing.expectedCloseDate?.toISOString();
    if (newDate !== oldDate) changedFields.push('expectedCloseDate');
  }
  if (params.description !== undefined && (params.description?.trim() || undefined) !== existing.description) changedFields.push('description');

  const now = new Date();

  const updated: Opportunity = {
    ...existing,
    title: params.title !== undefined ? params.title.trim() : existing.title,
    accountId: params.accountId !== undefined ? params.accountId.trim() : existing.accountId,
    ownerId: params.ownerId !== undefined ? params.ownerId : existing.ownerId,
    stage: params.stage !== undefined ? params.stage : existing.stage,
    value: params.value !== undefined ? (params.value ?? undefined) : existing.value,
    currency:
      params.currency !== undefined
        ? (params.currency?.trim() || undefined)
        : existing.currency,
    expectedCloseDate:
      params.expectedCloseDate !== undefined
        ? (params.expectedCloseDate ? new Date(params.expectedCloseDate) : undefined)
        : existing.expectedCloseDate,
    description:
      params.description !== undefined
        ? (params.description?.trim() || undefined)
        : existing.description,
    updatedAt: now,
  };

  // TODO: persist update to the `opportunities` table and insert into an
  // activity_log table with changedFields, requestingUserId, and timestamp.
  opportunityStore.set(id, updated);

  logger.info(
    { tenantId, opportunityId: id, requestingUserId, changedFields },
    'Opportunity updated',
  );

  return updated;
}
