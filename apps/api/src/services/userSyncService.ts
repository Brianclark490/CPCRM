import { randomUUID } from 'crypto';
import { sql } from 'kysely';
import { db } from '../db/kysely.js';
import { logger } from '../lib/logger.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SyncUserInput {
  tenantId: string;
  descopeUserId: string;
  email?: string;
  displayName?: string;
  role?: string;
}

export interface SyncUserResult {
  userRecordId: string;
  created: boolean;
}

// ─── Service ──────────────────────────────────────────────────────────────────

/**
 * Synchronises a Descope user with a User record in the CRM.
 *
 * On every login (called from the tenant middleware after JWT validation):
 * 1. Check if a User record exists for this descope_user_id
 * 2. If no: create one with email, display_name, role from JWT
 * 3. If yes: update display_name and role if changed
 *
 * Also backfills owner_record_id on records owned by this user.
 */
export async function syncUserRecord(input: SyncUserInput): Promise<SyncUserResult> {
  const { tenantId, descopeUserId, email, displayName, role } = input;

  // Find the User object definition for this tenant
  const objDef = await db
    .selectFrom('object_definitions')
    .select('id')
    .where('api_name', '=', 'user')
    .where('tenant_id', '=', tenantId)
    .executeTakeFirst();

  if (!objDef) {
    logger.debug({ tenantId }, 'User object definition not found; skipping user sync');
    return { userRecordId: '', created: false };
  }

  const objectId = objDef.id;

  // Check if a User record exists for this descope_user_id.
  //
  // The JSONB key access `field_values->>'descope_user_id'` is written via
  // `sql` so the column reference is SQL-level while `descopeUserId` is
  // bound as a parameter (see ADR-006 Appendix A on JSONB path expressions).
  const existing = await db
    .selectFrom('records')
    .select(['id', 'field_values'])
    .where('object_id', '=', objectId)
    .where('tenant_id', '=', tenantId)
    .where(sql<string>`field_values->>'descope_user_id'`, '=', descopeUserId)
    .executeTakeFirst();

  if (existing) {
    const existingFieldValues = (existing.field_values ?? {}) as Record<string, unknown>;

    const needsUpdate =
      (displayName !== undefined && existingFieldValues['display_name'] !== displayName) ||
      (role !== undefined && existingFieldValues['role'] !== role);

    if (needsUpdate) {
      const updatedFieldValues: Record<string, unknown> = { ...existingFieldValues };
      if (displayName !== undefined) updatedFieldValues['display_name'] = displayName;
      if (role !== undefined) updatedFieldValues['role'] = role;

      const name =
        displayName ??
        (existingFieldValues['display_name'] as string) ??
        email ??
        descopeUserId;

      await db
        .updateTable('records')
        .set({
          field_values: JSON.stringify(updatedFieldValues),
          name,
          updated_at: new Date(),
        })
        .where('id', '=', existing.id)
        .where('tenant_id', '=', tenantId)
        .execute();

      logger.debug({ tenantId, descopeUserId }, 'Updated User record from Descope');
    }

    // Backfill owner_record_id on records owned by this user
    await backfillOwnerRecordId(tenantId, descopeUserId, existing.id);

    return { userRecordId: existing.id, created: false };
  }

  // Create a new User record
  const id = randomUUID();
  const name = displayName ?? email ?? descopeUserId;
  const fieldValues: Record<string, unknown> = {
    email: email ?? '',
    display_name: displayName ?? '',
    role: role ?? '',
    descope_user_id: descopeUserId,
    is_active: true,
  };

  const now = new Date();

  await db
    .insertInto('records')
    .values({
      id,
      object_id: objectId,
      name,
      field_values: JSON.stringify(fieldValues),
      owner_id: descopeUserId,
      tenant_id: tenantId,
      created_at: now,
      updated_at: now,
    })
    .execute();

  logger.info({ tenantId, descopeUserId, userRecordId: id }, 'Created User record from Descope');

  // Backfill owner_record_id on records owned by this user
  await backfillOwnerRecordId(tenantId, descopeUserId, id);

  return { userRecordId: id, created: true };
}

/**
 * Sets owner_record_id on records where owner_id matches the Descope user ID
 * but owner_record_id is not yet set. Also updates updated_by_record_id where
 * updated_by matches.
 */
async function backfillOwnerRecordId(
  tenantId: string,
  descopeUserId: string,
  userRecordId: string,
): Promise<void> {
  try {
    await db
      .updateTable('records')
      .set({ owner_record_id: userRecordId })
      .where('tenant_id', '=', tenantId)
      .where('owner_id', '=', descopeUserId)
      .where((eb) =>
        eb.or([
          eb('owner_record_id', 'is', null),
          eb('owner_record_id', '!=', userRecordId),
        ]),
      )
      .execute();

    await db
      .updateTable('records')
      .set({ updated_by_record_id: userRecordId })
      .where('tenant_id', '=', tenantId)
      .where('updated_by', '=', descopeUserId)
      .where((eb) =>
        eb.or([
          eb('updated_by_record_id', 'is', null),
          eb('updated_by_record_id', '!=', userRecordId),
        ]),
      )
      .execute();
  } catch (err) {
    // Backfill is best-effort — don't fail the login
    logger.warn({ err, tenantId, descopeUserId }, 'Failed to backfill owner_record_id');
  }
}
