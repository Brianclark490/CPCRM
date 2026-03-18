import { randomUUID } from 'crypto';
import type pg from 'pg';
import { logger } from '../lib/logger.js';
import { pool } from '../db/client.js';

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
 * The entire operation is performed within a single database transaction.
 * If any step fails, all changes are rolled back.
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
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Resolve lead object definition
    const leadObjResult = await client.query(
      'SELECT id FROM object_definitions WHERE api_name = $1 AND tenant_id = $2',
      ['lead', tenantId],
    );
    if (leadObjResult.rows.length === 0) {
      throwNotFoundError("Object type 'lead' not found");
    }
    const leadObjectId = (leadObjResult.rows[0] as Record<string, unknown>).id as string;

    // 2. Fetch the lead record
    const leadResult = await client.query(
      'SELECT * FROM records WHERE id = $1 AND object_id = $2 AND owner_id = $3 AND tenant_id = $4',
      [leadRecordId, leadObjectId, ownerId, tenantId],
    );
    if (leadResult.rows.length === 0) {
      throwNotFoundError('Lead not found');
    }
    const leadRow = leadResult.rows[0] as Record<string, unknown>;
    const leadFieldValues = (leadRow.field_values as Record<string, unknown>) ?? {};

    // 3. Validate lead is not already converted
    if (leadFieldValues['status'] === 'Converted') {
      throwAlreadyConvertedError();
    }

    // 4. Read conversion mappings
    const mappingsResult = await client.query(
      'SELECT lead_field_api_name, target_object, target_field_api_name FROM lead_conversion_mappings ORDER BY target_object',
    );
    const mappings: ConversionMapping[] = mappingsResult.rows.map(
      (row: Record<string, unknown>) => ({
        targetObject: row.target_object as string,
        leadFieldApiName: row.lead_field_api_name as string,
        targetFieldApiName: row.target_field_api_name as string,
      }),
    );

    // 5. Resolve target object definitions
    const accountObjResult = await client.query(
      'SELECT id FROM object_definitions WHERE api_name = $1 AND tenant_id = $2',
      ['account', tenantId],
    );
    const accountObjectId = (accountObjResult.rows[0] as Record<string, unknown>).id as string;

    const contactObjResult = await client.query(
      'SELECT id FROM object_definitions WHERE api_name = $1 AND tenant_id = $2',
      ['contact', tenantId],
    );
    const contactObjectId = (contactObjResult.rows[0] as Record<string, unknown>).id as string;

    // 6. Create or link Account
    let accountId: string;
    let accountName: string;

    if (options.accountId) {
      // Use existing account
      const existingAccount = await client.query(
        'SELECT id, name FROM records WHERE id = $1 AND object_id = $2 AND owner_id = $3 AND tenant_id = $4',
        [options.accountId, accountObjectId, ownerId, tenantId],
      );
      if (existingAccount.rows.length === 0) {
        throwNotFoundError('Account not found');
      }
      accountId = (existingAccount.rows[0] as Record<string, unknown>).id as string;
      accountName = (existingAccount.rows[0] as Record<string, unknown>).name as string;
    } else {
      // Create new account from mapped fields
      const accountFieldValues = applyMappings(leadFieldValues, mappings, 'account');
      accountName = (accountFieldValues['name'] as string) ||
        (leadFieldValues['company'] as string) ||
        'Untitled Account';
      accountId = randomUUID();
      const now = new Date();

      await client.query(
        `INSERT INTO records (id, tenant_id, object_id, name, field_values, owner_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [accountId, tenantId, accountObjectId, accountName, JSON.stringify(accountFieldValues), ownerId, now, now],
      );
    }

    // 7. Create Contact
    const contactFieldValues = applyMappings(leadFieldValues, mappings, 'contact');
    const firstName = (contactFieldValues['first_name'] as string) || '';
    const lastName = (contactFieldValues['last_name'] as string) || '';
    const contactName = [firstName, lastName].filter((s) => s.trim().length > 0).join(' ') || 'Untitled Contact';

    const contactId = randomUUID();
    const contactNow = new Date();

    await client.query(
      `INSERT INTO records (id, tenant_id, object_id, name, field_values, owner_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [contactId, tenantId, contactObjectId, contactName, JSON.stringify(contactFieldValues), ownerId, contactNow, contactNow],
    );

    // Link contact to account via contact_account relationship
    await linkRecordInTransaction(client, 'contact_account', contactId, accountId);

    // 8. Create Opportunity (optional, default true)
    const createOpportunity = options.createOpportunity !== false;
    let opportunityId: string | null = null;
    let opportunityName: string | null = null;

    if (createOpportunity) {
      const opportunityObjResult = await client.query(
        'SELECT id FROM object_definitions WHERE api_name = $1 AND tenant_id = $2',
        ['opportunity', tenantId],
      );
      const opportunityObjectId = (opportunityObjResult.rows[0] as Record<string, unknown>).id as string;

      const opportunityFieldValues = applyMappings(leadFieldValues, mappings, 'opportunity');

      // Compute opportunity name: "{company} - Opportunity"
      const company = (leadFieldValues['company'] as string) || accountName;
      opportunityName = `${company} - Opportunity`;
      opportunityFieldValues['name'] = opportunityName;

      opportunityId = randomUUID();
      const oppNow = new Date();

      await client.query(
        `INSERT INTO records (id, tenant_id, object_id, name, field_values, owner_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [opportunityId, tenantId, opportunityObjectId, opportunityName, JSON.stringify(opportunityFieldValues), ownerId, oppNow, oppNow],
      );

      // Link opportunity to account
      await linkRecordInTransaction(client, 'opportunity_account', opportunityId, accountId);

      // Link opportunity to contact
      await linkRecordInTransaction(client, 'opportunity_contact', opportunityId, contactId);
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

    await client.query(
      `UPDATE records
       SET field_values = $1, updated_at = $2
       WHERE id = $3 AND object_id = $4 AND owner_id = $5 AND tenant_id = $6`,
      [JSON.stringify(updatedFieldValues), new Date(), leadRecordId, leadObjectId, ownerId, tenantId],
    );

    await client.query('COMMIT');

    logger.info(
      { leadRecordId, accountId, contactId, opportunityId, ownerId },
      'Lead converted successfully',
    );

    return {
      account: { id: accountId, name: accountName },
      contact: { id: contactId, name: contactName },
      opportunity: opportunityId && opportunityName
        ? { id: opportunityId, name: opportunityName }
        : null,
      lead: { id: leadRecordId, status: 'Converted' },
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Creates a record_relationship within an existing transaction.
 */
async function linkRecordInTransaction(
  client: pg.PoolClient,
  relationshipApiName: string,
  sourceRecordId: string,
  targetRecordId: string,
): Promise<void> {
  const relDefResult = await client.query(
    'SELECT id FROM relationship_definitions WHERE api_name = $1',
    [relationshipApiName],
  );

  if (relDefResult.rows.length === 0) {
    // Relationship not defined — skip silently (the system may not have it seeded yet)
    logger.warn(
      { relationshipApiName, sourceRecordId, targetRecordId },
      'Relationship definition not found during lead conversion; skipping link',
    );
    return;
  }

  const relationshipId = (relDefResult.rows[0] as Record<string, unknown>).id as string;
  const linkId = randomUUID();
  const now = new Date();

  await client.query(
    `INSERT INTO record_relationships (id, relationship_id, source_record_id, target_record_id, created_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [linkId, relationshipId, sourceRecordId, targetRecordId, now],
  );
}
