import { randomUUID } from 'crypto';
import { logger } from '../lib/logger.js';
import { pool } from '../db/client.js';

// ─── Local type aliases ───────────────────────────────────────────────────────

/**
 * Records a single stage change on an opportunity.
 */
export interface StageTransition {
  /** The stage before the change, or null when the opportunity was first created. */
  from: string | null;
  to: string;
  changedAt: Date;
  /** Descope userId of the user who made the change. */
  changedBy: string;
}

/**
 * An Opportunity represents a potential deal or sale being tracked in the CRM.
 */
export interface Opportunity {
  id: string;
  tenantId: string;
  accountId?: string;
  /** Descope userId of the team member responsible for this opportunity */
  ownerId: string;
  title: string;
  stage: string;
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

/**
 * Input parameters for updating an existing opportunity.
 *
 * Note: stage changes are NOT permitted here — they must go through
 * the move-stage endpoint (stageMovementService).
 */
export interface UpdateOpportunityParams {
  title?: string;
  accountId?: string | null;
  ownerId?: string;
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
  /** The account this opportunity is linked to (optional) */
  accountId?: string;
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
 * Validates the accountId field when provided.
 * Returns an error message string, or null if valid.
 */
export function validateAccountId(accountId: unknown): string | null {
  if (accountId === undefined || accountId === null) return null;
  if (typeof accountId !== 'string' || accountId.trim().length === 0) {
    return 'Account ID must be a non-empty string';
  }
  return null;
}

/**
 * Checks that the given account exists within the specified tenant and
 * is owned by the specified user.
 *
 * Returns an error message string, or null if the account is valid.
 */
export async function validateAccountExists(
  accountId: string,
  tenantId: string,
  ownerId: string,
): Promise<string | null> {
  const result = await pool.query(
    'SELECT 1 FROM accounts WHERE id = $1 AND tenant_id = $2 AND owner_id = $3',
    [accountId, tenantId, ownerId],
  );
  if (result.rows.length === 0) {
    return 'Account not found or does not belong to you';
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

// ─── Row → domain model ───────────────────────────────────────────────────────

function rowToOpportunity(row: Record<string, unknown>): Opportunity {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    accountId: row.account_id != null ? (row.account_id as string) : undefined,
    ownerId: row.owner_id as string,
    title: row.title as string,
    stage: row.stage as string,
    value: row.value != null ? Number(row.value) : undefined,
    currency: (row.currency as string | null) ?? undefined,
    expectedCloseDate: row.expected_close_date != null
      ? new Date(row.expected_close_date as string)
      : undefined,
    description: (row.description as string | null) ?? undefined,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
    createdBy: row.created_by as string,
    stageHistory: (row.stage_history as StageTransition[]).map((e) => ({
      from: e.from,
      to: e.to,
      changedAt: new Date(e.changedAt),
      changedBy: e.changedBy,
    })),
  };
}

// ─── Service functions ────────────────────────────────────────────────────────

/**
 * Creates a new opportunity within a tenant.
 *
 * Creation steps:
 *   1. Validate input — title is required, accountId is optional.
 *   2. If accountId is provided, verify the account exists and belongs to the user.
 *   3. Persist the Opportunity record with initial stage "prospecting".
 *
 * Tenant isolation: the tenantId is always taken from the authenticated
 * session and never from caller-supplied input.
 *
 * @throws {Error} with a `code` property of "VALIDATION_ERROR" when input is invalid.
 * @throws {Error} with a `code` property of "ACCOUNT_NOT_FOUND" when the account does not exist.
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

  // Step 2 — verify account exists when provided
  if (accountId) {
    const accountExistsError = await validateAccountExists(
      accountId.trim(),
      tenantId,
      requestingUserId,
    );
    if (accountExistsError) {
      const err = new Error(accountExistsError) as Error & { code: string };
      err.code = 'ACCOUNT_NOT_FOUND';
      throw err;
    }
  }

  const opportunityId = randomUUID();
  const now = new Date();

  logger.info({ tenantId, opportunityId, requestingUserId }, 'Creating new opportunity');

  const initialStageHistory: StageTransition[] = [
    { from: null, to: 'prospecting', changedAt: now, changedBy: requestingUserId },
  ];

  // Step 3 — persist to database
  const result = await pool.query(
    `INSERT INTO opportunities
       (id, tenant_id, account_id, owner_id, title, stage,
        value, currency, expected_close_date, description,
        created_by, created_at, updated_at, stage_history)
     VALUES ($1,$2,$3,$4,$5,'prospecting',$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING *`,
    [
      opportunityId,
      tenantId,
      accountId?.trim() ?? null,
      requestingUserId,
      title.trim(),
      value ?? null,
      currency?.trim() ?? null,
      expectedCloseDate ?? null,
      description?.trim() ?? null,
      requestingUserId,
      now,
      now,
      JSON.stringify(initialStageHistory),
    ],
  );

  logger.info({ tenantId, opportunityId }, 'Opportunity created successfully');

  return rowToOpportunity(result.rows[0]);
}

/**
 * Returns all opportunities belonging to a given tenant, newest first.
 *
 * Tenant isolation: only opportunities with a matching tenantId are returned.
 */
export async function listOpportunities(tenantId: string): Promise<Opportunity[]> {
  const result = await pool.query(
    `SELECT * FROM opportunities
     WHERE tenant_id = $1
     ORDER BY created_at DESC`,
    [tenantId],
  );
  return result.rows.map(rowToOpportunity);
}

/**
 * Returns a single opportunity by ID, scoped to the given tenant.
 * Returns null if the opportunity does not exist or belongs to a different tenant.
 */
export async function getOpportunity(
  id: string,
  tenantId: string,
): Promise<Opportunity | null> {
  const result = await pool.query(
    `SELECT * FROM opportunities WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId],
  );
  if (result.rows.length === 0) return null;
  return rowToOpportunity(result.rows[0]);
}

/**
 * Updates an existing opportunity within a tenant.
 *
 * Update steps:
 *   1. Validate that the opportunity exists and belongs to the tenant.
 *   2. Validate updated fields.
 *   3. If accountId is provided, verify the account exists and belongs to the user.
 *   4. Persist changes to the database.
 *
 * Note: stage changes must go through the move-stage endpoint
 * (stageMovementService), not through this function.
 *
 * Tenant isolation: the tenantId is always taken from the authenticated session.
 *
 * @throws {Error} with a `code` property of "VALIDATION_ERROR" when input is invalid.
 * @throws {Error} with a `code` property of "NOT_FOUND" when the opportunity does not exist.
 * @throws {Error} with a `code` property of "ACCOUNT_NOT_FOUND" when the account does not exist.
 */
export async function updateOpportunity(
  id: string,
  tenantId: string,
  params: UpdateOpportunityParams,
  requestingUserId: string,
): Promise<Opportunity> {
  // Step 1 — load existing record
  const existing = await getOpportunity(id, tenantId);
  if (!existing) {
    const err = new Error('Opportunity not found') as Error & { code: string };
    err.code = 'NOT_FOUND';
    throw err;
  }

  // Step 2 — validate only the fields being changed
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

    // Verify account exists when linking (non-null)
    if (params.accountId !== null) {
      const accountExistsError = await validateAccountExists(
        params.accountId!.trim(),
        tenantId,
        requestingUserId,
      );
      if (accountExistsError) {
        const err = new Error(accountExistsError) as Error & { code: string };
        err.code = 'ACCOUNT_NOT_FOUND';
        throw err;
      }
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

  // Step 3 — compute updated values
  const changedFields: string[] = [];
  if (params.title !== undefined && params.title.trim() !== existing.title) changedFields.push('title');
  if (params.accountId !== undefined && (params.accountId?.trim() ?? null) !== (existing.accountId ?? null)) changedFields.push('accountId');
  if (params.ownerId !== undefined && params.ownerId !== existing.ownerId) changedFields.push('ownerId');
  if (params.value !== undefined && params.value !== existing.value) changedFields.push('value');
  if (params.currency !== undefined && (params.currency?.trim() || undefined) !== existing.currency) changedFields.push('currency');
  if (params.expectedCloseDate !== undefined) {
    const newDate = params.expectedCloseDate ? new Date(params.expectedCloseDate).toISOString() : undefined;
    const oldDate = existing.expectedCloseDate?.toISOString();
    if (newDate !== oldDate) changedFields.push('expectedCloseDate');
  }
  if (params.description !== undefined && (params.description?.trim() || undefined) !== existing.description) changedFields.push('description');

  const now = new Date();

  const newTitle = params.title !== undefined ? params.title.trim() : existing.title;
  const newAccountId = params.accountId !== undefined ? (params.accountId?.trim() ?? null) : (existing.accountId ?? null);
  const newOwnerId = params.ownerId !== undefined ? params.ownerId : existing.ownerId;
  const newValue = params.value !== undefined ? (params.value ?? null) : (existing.value ?? null);
  const newCurrency = params.currency !== undefined
    ? (params.currency?.trim() || null)
    : (existing.currency ?? null);
  const newExpectedCloseDate = params.expectedCloseDate !== undefined
    ? (params.expectedCloseDate || null)
    : (existing.expectedCloseDate ?? null);
  const newDescription = params.description !== undefined
    ? (params.description?.trim() || null)
    : (existing.description ?? null);

  // Step 4 — persist update (stage is NOT updated here — use move-stage endpoint)
  const result = await pool.query(
    `UPDATE opportunities
     SET title               = $3,
         account_id          = $4,
         owner_id            = $5,
         value               = $6,
         currency            = $7,
         expected_close_date = $8,
         description         = $9,
         updated_at          = $10
     WHERE id = $1 AND tenant_id = $2
     RETURNING *`,
    [
      id,
      tenantId,
      newTitle,
      newAccountId,
      newOwnerId,
      newValue,
      newCurrency,
      newExpectedCloseDate,
      newDescription,
      now,
    ],
  );

  logger.info(
    { tenantId, opportunityId: id, requestingUserId, changedFields },
    'Opportunity updated',
  );

  return rowToOpportunity(result.rows[0]);
}
