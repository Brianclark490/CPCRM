import { randomUUID } from 'crypto';
import { logger } from '../lib/logger.js';
import { pool } from '../db/client.js';

// ─── Local type aliases ───────────────────────────────────────────────────────

/**
 * An Account represents a business or organisation being tracked in the CRM.
 * Every Account belongs to exactly one Tenant; cross-tenant access is not permitted.
 */
export interface Account {
  id: string;
  tenantId: string;
  name: string;
  industry?: string;
  website?: string;
  phone?: string;
  email?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  region?: string;
  postalCode?: string;
  country?: string;
  notes?: string;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

/**
 * An Account with its linked opportunities.
 */
export interface AccountWithOpportunities extends Account {
  opportunities: Array<{
    id: string;
    title: string;
    stage: string;
    value?: number;
    currency?: string;
    expectedCloseDate?: Date;
    createdAt: Date;
    updatedAt: Date;
  }>;
}

/**
 * Input parameters for creating a new account.
 */
export interface CreateAccountParams {
  name: string;
  industry?: string;
  website?: string;
  phone?: string;
  email?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  region?: string;
  postalCode?: string;
  country?: string;
  notes?: string;
  tenantId: string;
  requestingUserId: string;
}

/**
 * Input parameters for updating an existing account.
 */
export interface UpdateAccountParams {
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
 * Query parameters for listing accounts.
 */
export interface ListAccountsParams {
  tenantId: string;
  ownerId: string;
  search?: string;
  limit: number;
  offset: number;
}

/**
 * An Account list item includes an opportunity count for display in list views.
 */
export interface AccountListItem extends Account {
  opportunityCount: number;
}

/**
 * Paginated list response for accounts.
 */
export interface ListAccountsResult {
  data: AccountListItem[];
  total: number;
  limit: number;
  offset: number;
}

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * Validates the account name.
 * Returns an error message string, or null if valid.
 */
export function validateName(name: unknown): string | null {
  if (typeof name !== 'string' || name.trim().length === 0) {
    return 'Account name is required';
  }
  if (name.trim().length > 200) {
    return 'Account name must be 200 characters or fewer';
  }
  return null;
}

/**
 * Validates an email address.
 * Returns an error message string, or null if valid.
 */
export function validateEmail(email: unknown): string | null {
  if (email === undefined || email === null || email === '') return null;
  if (typeof email !== 'string') return 'Email must be a string';
  const emailRegex = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;
  if (!emailRegex.test(email.trim())) {
    return 'Email must be a valid email address';
  }
  return null;
}

/**
 * Validates a phone number.
 * Returns an error message string, or null if valid.
 */
export function validatePhone(phone: unknown): string | null {
  if (phone === undefined || phone === null || phone === '') return null;
  if (typeof phone !== 'string') return 'Phone must be a string';
  const phoneRegex = /^[+]?[\d\s\-().]{7,50}$/;
  if (!phoneRegex.test(phone.trim())) {
    return 'Phone must be a valid phone number';
  }
  return null;
}

/**
 * Validates a website URL.
 * Returns an error message string, or null if valid.
 */
export function validateWebsite(website: unknown): string | null {
  if (website === undefined || website === null || website === '') return null;
  if (typeof website !== 'string') return 'Website must be a string';
  try {
    const parsed = new URL(website.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return 'Website must use http or https protocol';
    }
  } catch {
    return 'Website must be a valid URL';
  }
  return null;
}

// ─── Row → domain model ───────────────────────────────────────────────────────

function rowToAccount(row: Record<string, unknown>): Account {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    name: row.name as string,
    industry: (row.industry as string | null) ?? undefined,
    website: (row.website as string | null) ?? undefined,
    phone: (row.phone as string | null) ?? undefined,
    email: (row.email as string | null) ?? undefined,
    addressLine1: (row.address_line1 as string | null) ?? undefined,
    addressLine2: (row.address_line2 as string | null) ?? undefined,
    city: (row.city as string | null) ?? undefined,
    region: (row.region as string | null) ?? undefined,
    postalCode: (row.postal_code as string | null) ?? undefined,
    country: (row.country as string | null) ?? undefined,
    notes: (row.notes as string | null) ?? undefined,
    ownerId: row.owner_id as string,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
    createdBy: row.created_by as string,
  };
}

function rowToAccountListItem(row: Record<string, unknown>): AccountListItem {
  return {
    ...rowToAccount(row),
    opportunityCount: parseInt(row.opportunity_count as string, 10) || 0,
  };
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function throwValidationError(message: string): never {
  const err = new Error(message) as Error & { code: string };
  err.code = 'VALIDATION_ERROR';
  throw err;
}

function throwNotFoundError(message: string): never {
  const err = new Error(message) as Error & { code: string };
  err.code = 'NOT_FOUND';
  throw err;
}

/**
 * Escapes special characters in a string before embedding it in a SQL LIKE
 * pattern.  Without this, user-supplied `%` and `_` characters would act as
 * wildcards and `\` could escape the surrounding pattern delimiters.
 */
function escapeLikePattern(value: string): string {
  return value.replace(/[%_\\]/g, '\\$&');
}

// ─── Service functions ────────────────────────────────────────────────────────

/**
 * Creates a new account within a tenant.
 *
 * The requesting user becomes the owner of the account.
 *
 * @throws {Error} with a `code` property of "VALIDATION_ERROR" when input is invalid.
 */
export async function createAccount(
  params: CreateAccountParams,
): Promise<Account> {
  const {
    name, industry, website, phone, email,
    addressLine1, addressLine2, city, region, postalCode, country, notes,
    tenantId, requestingUserId,
  } = params;

  // Validate
  const nameError = validateName(name);
  if (nameError) throwValidationError(nameError);

  const emailError = validateEmail(email);
  if (emailError) throwValidationError(emailError);

  const phoneError = validatePhone(phone);
  if (phoneError) throwValidationError(phoneError);

  const websiteError = validateWebsite(website);
  if (websiteError) throwValidationError(websiteError);

  const accountId = randomUUID();
  const now = new Date();

  logger.info({ tenantId, accountId, requestingUserId }, 'Creating new account');

  const result = await pool.query(
    `INSERT INTO accounts
       (id, tenant_id, name, industry, website, phone, email,
        address_line1, address_line2, city, region, postal_code, country, notes,
        owner_id, created_by, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
     RETURNING *`,
    [
      accountId,
      tenantId,
      name.trim(),
      industry?.trim() ?? null,
      website?.trim() ?? null,
      phone?.trim() ?? null,
      email?.trim() ?? null,
      addressLine1?.trim() ?? null,
      addressLine2?.trim() ?? null,
      city?.trim() ?? null,
      region?.trim() ?? null,
      postalCode?.trim() ?? null,
      country?.trim() ?? null,
      notes?.trim() ?? null,
      requestingUserId,
      requestingUserId,
      now,
      now,
    ],
  );

  logger.info({ tenantId, accountId }, 'Account created successfully');

  return rowToAccount(result.rows[0]);
}

/**
 * Returns a paginated list of accounts belonging to the authenticated user.
 * Supports searching by name and email.
 */
export async function listAccounts(
  params: ListAccountsParams,
): Promise<ListAccountsResult> {
  const { tenantId, ownerId, search, limit, offset } = params;

  const queryParams: unknown[] = [tenantId, ownerId];
  let whereClause = 'WHERE a.tenant_id = $1 AND a.owner_id = $2';

  if (search && search.trim().length > 0) {
    const searchTerm = `%${escapeLikePattern(search.trim())}%`;
    queryParams.push(searchTerm);
    whereClause += ` AND (a.name ILIKE $${queryParams.length} OR a.email ILIKE $${queryParams.length})`;
  }

  const countResult = await pool.query(
    `SELECT COUNT(*) AS total FROM accounts a ${whereClause}`,
    queryParams,
  );
  const total = parseInt(countResult.rows[0].total as string, 10);

  queryParams.push(limit, offset);
  const dataResult = await pool.query(
    `SELECT a.*, (SELECT COUNT(*) FROM opportunities o WHERE o.account_id = a.id AND o.tenant_id = a.tenant_id) AS opportunity_count
     FROM accounts a ${whereClause}
     ORDER BY a.created_at DESC
     LIMIT $${queryParams.length - 1} OFFSET $${queryParams.length}`,
    queryParams,
  );

  return {
    data: dataResult.rows.map(rowToAccountListItem),
    total,
    limit,
    offset,
  };
}

/**
 * Returns a single account by ID with linked opportunities.
 * Scoped to the given tenant and owner.
 * Returns null if the account does not exist, belongs to a different tenant, or is not owned by the user.
 */
export async function getAccountWithOpportunities(
  id: string,
  tenantId: string,
  ownerId: string,
): Promise<AccountWithOpportunities | null> {
  const accountResult = await pool.query(
    'SELECT * FROM accounts WHERE id = $1 AND tenant_id = $2 AND owner_id = $3',
    [id, tenantId, ownerId],
  );

  if (accountResult.rows.length === 0) return null;

  const account = rowToAccount(accountResult.rows[0]);

  const oppResult = await pool.query(
    `SELECT id, title, stage, value, currency, expected_close_date, created_at, updated_at
     FROM opportunities
     WHERE account_id = $1 AND tenant_id = $2
     ORDER BY created_at DESC`,
    [id, tenantId],
  );

  const opportunities = oppResult.rows.map((row: Record<string, unknown>) => ({
    id: row.id as string,
    title: row.title as string,
    stage: row.stage as string,
    value: row.value != null ? Number(row.value) : undefined,
    currency: (row.currency as string | null) ?? undefined,
    expectedCloseDate: row.expected_close_date != null
      ? new Date(row.expected_close_date as string)
      : undefined,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  }));

  return { ...account, opportunities };
}

/**
 * Updates an existing account within a tenant.
 * Only the fields present in params are updated.
 *
 * @throws {Error} with a `code` property of "VALIDATION_ERROR" when input is invalid.
 * @throws {Error} with a `code` property of "NOT_FOUND" when the account does not exist.
 */
export async function updateAccount(
  id: string,
  tenantId: string,
  ownerId: string,
  params: UpdateAccountParams,
): Promise<Account> {
  // Check existence and ownership
  const existing = await pool.query(
    'SELECT * FROM accounts WHERE id = $1 AND tenant_id = $2 AND owner_id = $3',
    [id, tenantId, ownerId],
  );

  if (existing.rows.length === 0) {
    throwNotFoundError('Account not found');
  }

  // Validate fields being changed
  if (params.name !== undefined) {
    const nameError = validateName(params.name);
    if (nameError) throwValidationError(nameError);
  }

  if (params.email !== undefined) {
    const emailError = validateEmail(params.email);
    if (emailError) throwValidationError(emailError);
  }

  if (params.phone !== undefined) {
    const phoneError = validatePhone(params.phone);
    if (phoneError) throwValidationError(phoneError);
  }

  if (params.website !== undefined) {
    const websiteError = validateWebsite(params.website);
    if (websiteError) throwValidationError(websiteError);
  }

  // Build dynamic update
  const updates: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if ('name' in params) {
    updates.push(`name = $${paramIndex++}`);
    values.push(params.name!.trim());
  }
  if ('industry' in params) {
    updates.push(`industry = $${paramIndex++}`);
    values.push(params.industry?.trim() ?? null);
  }
  if ('website' in params) {
    updates.push(`website = $${paramIndex++}`);
    values.push(params.website?.trim() ?? null);
  }
  if ('phone' in params) {
    updates.push(`phone = $${paramIndex++}`);
    values.push(params.phone?.trim() ?? null);
  }
  if ('email' in params) {
    updates.push(`email = $${paramIndex++}`);
    values.push(params.email?.trim() ?? null);
  }
  if ('addressLine1' in params) {
    updates.push(`address_line1 = $${paramIndex++}`);
    values.push(params.addressLine1?.trim() ?? null);
  }
  if ('addressLine2' in params) {
    updates.push(`address_line2 = $${paramIndex++}`);
    values.push(params.addressLine2?.trim() ?? null);
  }
  if ('city' in params) {
    updates.push(`city = $${paramIndex++}`);
    values.push(params.city?.trim() ?? null);
  }
  if ('region' in params) {
    updates.push(`region = $${paramIndex++}`);
    values.push(params.region?.trim() ?? null);
  }
  if ('postalCode' in params) {
    updates.push(`postal_code = $${paramIndex++}`);
    values.push(params.postalCode?.trim() ?? null);
  }
  if ('country' in params) {
    updates.push(`country = $${paramIndex++}`);
    values.push(params.country?.trim() ?? null);
  }
  if ('notes' in params) {
    updates.push(`notes = $${paramIndex++}`);
    values.push(params.notes?.trim() ?? null);
  }

  const now = new Date();
  updates.push(`updated_at = $${paramIndex++}`);
  values.push(now);

  values.push(id, tenantId, ownerId);

  const result = await pool.query(
    `UPDATE accounts SET ${updates.join(', ')} WHERE id = $${paramIndex++} AND tenant_id = $${paramIndex++} AND owner_id = $${paramIndex} RETURNING *`,
    values,
  );

  logger.info({ tenantId, accountId: id, ownerId }, 'Account updated');

  return rowToAccount(result.rows[0]);
}

/**
 * Deletes an account by ID, scoped to the given tenant and owner.
 *
 * @throws {Error} with a `code` property of "NOT_FOUND" when the account does not exist.
 */
export async function deleteAccount(
  id: string,
  tenantId: string,
  ownerId: string,
): Promise<void> {
  const result = await pool.query(
    'DELETE FROM accounts WHERE id = $1 AND tenant_id = $2 AND owner_id = $3',
    [id, tenantId, ownerId],
  );

  if (result.rowCount === 0) {
    throwNotFoundError('Account not found');
  }

  logger.info({ tenantId, accountId: id, ownerId }, 'Account deleted');
}
