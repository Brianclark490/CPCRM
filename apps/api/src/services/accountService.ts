import { randomUUID } from 'crypto';
import type { Selectable, Updateable } from 'kysely';
import { logger } from '../lib/logger.js';
import { db } from '../db/kysely.js';
import type { Accounts, Opportunities } from '../db/kysely.types.js';

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

/**
 * Typing the row mapper against `Selectable<Accounts>` (rather than
 * `Record<string, unknown>`) means a column rename or nullability change
 * on the generated schema becomes a compile-time error at this service,
 * rather than an `unknown` cast leaking an incorrect runtime shape into
 * the domain model.
 */
function rowToAccount(row: Selectable<Accounts>): Account {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    industry: row.industry ?? undefined,
    website: row.website ?? undefined,
    phone: row.phone ?? undefined,
    email: row.email ?? undefined,
    addressLine1: row.address_line1 ?? undefined,
    addressLine2: row.address_line2 ?? undefined,
    city: row.city ?? undefined,
    region: row.region ?? undefined,
    postalCode: row.postal_code ?? undefined,
    country: row.country ?? undefined,
    notes: row.notes ?? undefined,
    ownerId: row.owner_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
  };
}

/**
 * The list query adds a scalar subquery `opportunity_count` onto the
 * base Accounts row. We type against the intersection so a rename on
 * Accounts still surfaces here at compile time.
 */
type AccountListRow = Selectable<Accounts> & { opportunity_count: string | number };

function rowToAccountListItem(row: AccountListRow): AccountListItem {
  return {
    ...rowToAccount(row),
    opportunityCount:
      typeof row.opportunity_count === 'number'
        ? row.opportunity_count
        : parseInt(row.opportunity_count, 10) || 0,
  };
}

type OpportunityRow = Pick<
  Selectable<Opportunities>,
  | 'id'
  | 'title'
  | 'stage'
  | 'value'
  | 'currency'
  | 'expected_close_date'
  | 'created_at'
  | 'updated_at'
>;

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

  const row = await db
    .insertInto('accounts')
    .values({
      id: accountId,
      tenant_id: tenantId,
      name: name.trim(),
      industry: industry?.trim() ?? null,
      website: website?.trim() ?? null,
      phone: phone?.trim() ?? null,
      email: email?.trim() ?? null,
      address_line1: addressLine1?.trim() ?? null,
      address_line2: addressLine2?.trim() ?? null,
      city: city?.trim() ?? null,
      region: region?.trim() ?? null,
      postal_code: postalCode?.trim() ?? null,
      country: country?.trim() ?? null,
      notes: notes?.trim() ?? null,
      owner_id: requestingUserId,
      created_by: requestingUserId,
      created_at: now,
      updated_at: now,
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  logger.info({ tenantId, accountId }, 'Account created successfully');

  return rowToAccount(row);
}

/**
 * Returns a paginated list of accounts belonging to the authenticated user.
 * Supports searching by name and email.
 *
 * The opportunity_count for each row is emitted as a correlated scalar
 * subquery. The count path projects the full accounts row plus the
 * subquery; the total-count path uses a separate lightweight COUNT(*)
 * so we don't dedupe wide rows just to learn a number.
 */
export async function listAccounts(
  params: ListAccountsParams,
): Promise<ListAccountsResult> {
  const { tenantId, ownerId, search, limit, offset } = params;

  const searchTerm =
    search && search.trim().length > 0
      ? `%${escapeLikePattern(search.trim())}%`
      : null;

  // Count query — small, id-less projection for cheap COUNT(*).
  let countQuery = db
    .selectFrom('accounts as a')
    .select((eb) => eb.fn.countAll<string>().as('total'))
    .where('a.tenant_id', '=', tenantId)
    .where('a.owner_id', '=', ownerId);

  if (searchTerm) {
    countQuery = countQuery.where((eb) =>
      eb.or([
        eb('a.name', 'ilike', searchTerm),
        eb('a.email', 'ilike', searchTerm),
      ]),
    );
  }

  const countRow = await countQuery.executeTakeFirstOrThrow();
  const total = parseInt(countRow.total, 10);

  // Data query with correlated opportunity_count subquery.
  //
  // The subquery is explicitly scoped by tenant_id on both halves
  // (the outer a.tenant_id and the inner o.tenant_id) as
  // defence-in-depth (ADR-006).
  let dataQuery = db
    .selectFrom('accounts as a')
    .selectAll('a')
    .select((eb) =>
      eb
        .selectFrom('opportunities as o')
        .select(eb.fn.countAll<string>().as('count'))
        .whereRef('o.account_id', '=', 'a.id')
        .whereRef('o.tenant_id', '=', 'a.tenant_id')
        .as('opportunity_count'),
    )
    .where('a.tenant_id', '=', tenantId)
    .where('a.owner_id', '=', ownerId);

  if (searchTerm) {
    dataQuery = dataQuery.where((eb) =>
      eb.or([
        eb('a.name', 'ilike', searchTerm),
        eb('a.email', 'ilike', searchTerm),
      ]),
    );
  }

  const rows = await dataQuery
    .orderBy('a.created_at', 'desc')
    .limit(limit)
    .offset(offset)
    .execute();

  return {
    data: rows.map((r) =>
      rowToAccountListItem({
        ...r,
        opportunity_count: r.opportunity_count ?? '0',
      }),
    ),
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
  const accountRow = await db
    .selectFrom('accounts')
    .selectAll()
    .where('id', '=', id)
    .where('tenant_id', '=', tenantId)
    .where('owner_id', '=', ownerId)
    .executeTakeFirst();

  if (!accountRow) return null;

  const account = rowToAccount(accountRow);

  const oppRows: OpportunityRow[] = await db
    .selectFrom('opportunities')
    .select([
      'id',
      'title',
      'stage',
      'value',
      'currency',
      'expected_close_date',
      'created_at',
      'updated_at',
    ])
    .where('account_id', '=', id)
    .where('tenant_id', '=', tenantId)
    .orderBy('created_at', 'desc')
    .execute();

  const opportunities = oppRows.map((row) => ({
    id: row.id,
    title: row.title,
    stage: row.stage as string,
    value: row.value != null ? Number(row.value) : undefined,
    currency: row.currency ?? undefined,
    // Postgres DATE columns are returned as strings by `pg` without a
    // custom type parser (OID 1082 has no default in node-postgres), so
    // we normalise to `Date` here to preserve the documented
    // `expectedCloseDate: Date` contract on AccountWithOpportunities.
    // TIMESTAMP columns (created_at/updated_at) are handled by pg's
    // default parser and arrive as Date objects already.
    expectedCloseDate:
      row.expected_close_date != null
        ? new Date(row.expected_close_date as unknown as string)
        : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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
  const existing = await db
    .selectFrom('accounts')
    .select('id')
    .where('id', '=', id)
    .where('tenant_id', '=', tenantId)
    .where('owner_id', '=', ownerId)
    .executeTakeFirst();

  if (!existing) {
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

  // Build the partial update — only include fields the caller provided,
  // preserving the original "UPDATE only-what-you-set" semantics.
  //
  // Typed against `Updateable<Accounts>` so Kysely still enforces
  // column names and value shapes at compile time (a column rename
  // on the generated schema becomes an error here, not a silent
  // runtime SQL mismatch).
  //
  // `name` is non-nullable so we guard on `!== undefined` — the
  // `'key' in params` pattern is reserved for nullable columns where
  // `null` (explicit clear) vs missing (leave alone) is meaningful.
  const patch: Updateable<Accounts> = {
    updated_at: new Date(),
  };

  if (params.name !== undefined) patch.name = params.name.trim();
  if ('industry' in params) patch.industry = params.industry?.trim() ?? null;
  if ('website' in params) patch.website = params.website?.trim() ?? null;
  if ('phone' in params) patch.phone = params.phone?.trim() ?? null;
  if ('email' in params) patch.email = params.email?.trim() ?? null;
  if ('addressLine1' in params) patch.address_line1 = params.addressLine1?.trim() ?? null;
  if ('addressLine2' in params) patch.address_line2 = params.addressLine2?.trim() ?? null;
  if ('city' in params) patch.city = params.city?.trim() ?? null;
  if ('region' in params) patch.region = params.region?.trim() ?? null;
  if ('postalCode' in params) patch.postal_code = params.postalCode?.trim() ?? null;
  if ('country' in params) patch.country = params.country?.trim() ?? null;
  if ('notes' in params) patch.notes = params.notes?.trim() ?? null;

  const row = await db
    .updateTable('accounts')
    .set(patch)
    .where('id', '=', id)
    .where('tenant_id', '=', tenantId)
    .where('owner_id', '=', ownerId)
    .returningAll()
    .executeTakeFirstOrThrow();

  logger.info({ tenantId, accountId: id, ownerId }, 'Account updated');

  return rowToAccount(row);
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
  const result = await db
    .deleteFrom('accounts')
    .where('id', '=', id)
    .where('tenant_id', '=', tenantId)
    .where('owner_id', '=', ownerId)
    .executeTakeFirst();

  if (!result || result.numDeletedRows === 0n) {
    throwNotFoundError('Account not found');
  }

  logger.info({ tenantId, accountId: id, ownerId }, 'Account deleted');
}
