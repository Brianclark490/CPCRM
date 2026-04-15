import { randomUUID } from 'crypto';
import type { Kysely } from 'kysely';
import { logger } from '../lib/logger.js';
import { db } from '../db/kysely.js';
import type { DB } from '../db/kysely.types.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ConvertLeadOptions {
  createAccount?: boolean;
  accountId?: string | null;
  createOpportunity?: boolean;
}

export interface ConvertLeadResult {
  account: { id: string; name: string };
  contact: { id: string; name: string };
  opportunity: { id: string; name: string } | null;
  lead: { id: string; status: string };
}

interface ConversionMapping {
  targetObject: string;
  leadFieldApiName: string;
  targetFieldApiName: string;
}

/**
 * Executor type used by helpers that need to run inside either a top-level
 * Kysely instance or a checked-out transaction. `Transaction<DB>` extends
 * `Kysely<DB>`, so callers can pass either without a cast.
 */
type DbExecutor = Kysely<DB>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function throwNotFoundError(message: string): never {
  const err = new Error(message) as Error & { code: string };
  err.code = 'NOT_FOUND';
  throw err;
}

function throwAlreadyConvertedError(): never {
  const err = new Error('Lead has already been converted') as Error & { code: string };
  err.code = 'ALREADY_CONVERTED';
  throw err;
}

/**
 * Applies field mappings from lead field_values to a target object's field_values.
 */
function applyMappings(
  leadFieldValues: Record<string, unknown>,
  mappings: ConversionMapping[],
  targetObject: string,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const objectMappings = mappings.filter((m) => m.targetObject === targetObject);

  for (const mapping of objectMappings) {
    const value = leadFieldValues[mapping.leadFieldApiName];
    if (value !== undefined && value !== null && value !== '') {
      result[mapping.targetFieldApiName] = value;
    }
  }

  return result;
}

// ─── Service Function ────────────────────────────────────────────────────────

/**
 * Converts a Lead into an Account + Contact + Opportunity.
 *
 * The entire operation is performed within a single Kysely transaction. If
 * any step fails, Kysely rolls back automatically when the closure throws.
 *
 * Tenant defence-in-depth (ADR-006): every SELECT/INSERT/UPDATE in the
 * closure is scoped by an explicit `tenant_id` filter as the second line of
 * defence behind RLS.
 *
 * @param leadRecordId - UUID of the lead record to convert
 * @param ownerId - Descope user ID from auth
 * @param options - Conversion options (create_account, account_id, create_opportunity)
 */
export async function convertLead(
  tenantId: string,
  leadRecordId: string,
  ownerId: string,
  options: ConvertLeadOptions,
): Promise<ConvertLeadResult> {
  return db.transaction().execute(async (trx) => {
    // 1. Resolve lead object definition
    const leadObjRow = await trx
      .selectFrom('object_definitions')
      .select('id')
      .where('api_name', '=', 'lead')
      .where('tenant_id', '=', tenantId)
      .executeTakeFirst();
    if (!leadObjRow) {
      throwNotFoundError("Object type 'lead' not found");
    }
    const leadObjectId = leadObjRow.id;

    // 2. Fetch the lead record
    const leadRow = await trx
      .selectFrom('records')
      .selectAll()
      .where('id', '=', leadRecordId)
      .where('object_id', '=', leadObjectId)
      .where('tenant_id', '=', tenantId)
      .executeTakeFirst();
    if (!leadRow) {
      throwNotFoundError('Lead not found');
    }
    const leadFieldValues =
      (leadRow.field_values as Record<string, unknown> | null) ?? {};

    // 3. Validate lead is not already converted
    if (leadFieldValues['status'] === 'Converted') {
      throwAlreadyConvertedError();
    }

    // 4. Read conversion mappings
    const mappingRows = await trx
      .selectFrom('lead_conversion_mappings')
      .select(['lead_field_api_name', 'target_object', 'target_field_api_name'])
      .where('tenant_id', '=', tenantId)
      .orderBy('target_object')
      .execute();
    const mappings: ConversionMapping[] = mappingRows.map((row) => ({
      targetObject: row.target_object,
      leadFieldApiName: row.lead_field_api_name,
      targetFieldApiName: row.target_field_api_name,
    }));

    // 5. Resolve target object definitions
    const accountObjRow = await trx
      .selectFrom('object_definitions')
      .select('id')
      .where('api_name', '=', 'account')
      .where('tenant_id', '=', tenantId)
      .executeTakeFirstOrThrow();
    const accountObjectId = accountObjRow.id;

    const contactObjRow = await trx
      .selectFrom('object_definitions')
      .select('id')
      .where('api_name', '=', 'contact')
      .where('tenant_id', '=', tenantId)
      .executeTakeFirstOrThrow();
    const contactObjectId = contactObjRow.id;

    // 6. Create or link Account
    let accountId: string;
    let accountName: string;

    if (options.accountId) {
      // Use existing account
      const existingAccount = await trx
        .selectFrom('records')
        .select(['id', 'name'])
        .where('id', '=', options.accountId)
        .where('object_id', '=', accountObjectId)
        .where('tenant_id', '=', tenantId)
        .executeTakeFirst();
      if (!existingAccount) {
        throwNotFoundError('Account not found');
      }
      accountId = existingAccount.id;
      accountName = existingAccount.name;
    } else {
      // Create new account from mapped fields
      const accountFieldValues = applyMappings(leadFieldValues, mappings, 'account');
      accountName =
        (accountFieldValues['name'] as string) ||
        (leadFieldValues['company'] as string) ||
        'Untitled Account';
      accountId = randomUUID();
      const now = new Date();

      await trx
        .insertInto('records')
        .values({
          id: accountId,
          tenant_id: tenantId,
          object_id: accountObjectId,
          name: accountName,
          field_values: JSON.stringify(accountFieldValues),
          owner_id: ownerId,
          created_at: now,
          updated_at: now,
        })
        .execute();
    }

    // 7. Create Contact
    const contactFieldValues = applyMappings(leadFieldValues, mappings, 'contact');
    const firstName = (contactFieldValues['first_name'] as string) || '';
    const lastName = (contactFieldValues['last_name'] as string) || '';
    const contactName =
      [firstName, lastName].filter((s) => s.trim().length > 0).join(' ') ||
      'Untitled Contact';

    const contactId = randomUUID();
    const contactNow = new Date();

    await trx
      .insertInto('records')
      .values({
        id: contactId,
        tenant_id: tenantId,
        object_id: contactObjectId,
        name: contactName,
        field_values: JSON.stringify(contactFieldValues),
        owner_id: ownerId,
        created_at: contactNow,
        updated_at: contactNow,
      })
      .execute();

    // Link contact to account via contact_account relationship
    await linkRecordInTransaction(trx, 'contact_account', contactId, accountId, tenantId);

    // 8. Create Opportunity (optional, default true)
    const createOpportunity = options.createOpportunity !== false;
    let opportunityId: string | null = null;
    let opportunityName: string | null = null;

    if (createOpportunity) {
      const opportunityObjRow = await trx
        .selectFrom('object_definitions')
        .select('id')
        .where('api_name', '=', 'opportunity')
        .where('tenant_id', '=', tenantId)
        .executeTakeFirstOrThrow();
      const opportunityObjectId = opportunityObjRow.id;

      const opportunityFieldValues = applyMappings(leadFieldValues, mappings, 'opportunity');

      // Compute opportunity name: "{company} - Opportunity"
      const company = (leadFieldValues['company'] as string) || accountName;
      opportunityName = `${company} - Opportunity`;
      opportunityFieldValues['name'] = opportunityName;

      opportunityId = randomUUID();
      const oppNow = new Date();

      await trx
        .insertInto('records')
        .values({
          id: opportunityId,
          tenant_id: tenantId,
          object_id: opportunityObjectId,
          name: opportunityName,
          field_values: JSON.stringify(opportunityFieldValues),
          owner_id: ownerId,
          created_at: oppNow,
          updated_at: oppNow,
        })
        .execute();

      // Link opportunity to account
      await linkRecordInTransaction(trx, 'opportunity_account', opportunityId, accountId, tenantId);

      // Link opportunity to contact
      await linkRecordInTransaction(trx, 'opportunity_contact', opportunityId, contactId, tenantId);
    }

    // 9. Update lead status to "Converted" with metadata
    const convertedAt = new Date().toISOString();
    const updatedFieldValues = {
      ...leadFieldValues,
      status: 'Converted',
      converted_at: convertedAt,
      converted_account_id: accountId,
      converted_contact_id: contactId,
      ...(opportunityId ? { converted_opportunity_id: opportunityId } : {}),
    };

    await trx
      .updateTable('records')
      .set({
        field_values: JSON.stringify(updatedFieldValues),
        updated_at: new Date(),
      })
      .where('id', '=', leadRecordId)
      .where('object_id', '=', leadObjectId)
      .where('tenant_id', '=', tenantId)
      .execute();

    logger.info(
      { leadRecordId, accountId, contactId, opportunityId, ownerId },
      'Lead converted successfully',
    );

    return {
      account: { id: accountId, name: accountName },
      contact: { id: contactId, name: contactName },
      opportunity:
        opportunityId && opportunityName
          ? { id: opportunityId, name: opportunityName }
          : null,
      lead: { id: leadRecordId, status: 'Converted' },
    };
  });
}

/**
 * Creates a record_relationship within an existing Kysely transaction.
 *
 * If the relationship definition isn't seeded yet, logs a warning and
 * returns without inserting — matches the original raw-pg behaviour.
 */
async function linkRecordInTransaction(
  trx: DbExecutor,
  relationshipApiName: string,
  sourceRecordId: string,
  targetRecordId: string,
  tenantId: string,
): Promise<void> {
  const relDefRow = await trx
    .selectFrom('relationship_definitions')
    .select('id')
    .where('api_name', '=', relationshipApiName)
    .where('tenant_id', '=', tenantId)
    .executeTakeFirst();

  if (!relDefRow) {
    // Relationship not defined — skip silently (the system may not have it seeded yet)
    logger.warn(
      { relationshipApiName, sourceRecordId, targetRecordId },
      'Relationship definition not found during lead conversion; skipping link',
    );
    return;
  }

  const relationshipId = relDefRow.id;
  const linkId = randomUUID();
  const now = new Date();

  await trx
    .insertInto('record_relationships')
    .values({
      id: linkId,
      tenant_id: tenantId,
      relationship_id: relationshipId,
      source_record_id: sourceRecordId,
      target_record_id: targetRecordId,
      created_at: now,
    })
    .execute();
}
