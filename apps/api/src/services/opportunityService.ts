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
  // TODO: persist to the `opportunities` table:
  //   INSERT INTO opportunities (id, tenant_id, account_id, owner_id, title, stage,
  //     value, currency, expected_close_date, description, created_by, created_at, updated_at)
  //   VALUES ($1, $2, $3, $4, $5, 'prospecting', $6, $7, $8, $9, $10, $11, $12)
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

  logger.info({ tenantId, opportunityId }, 'Opportunity created successfully');

  return opportunity;
}
