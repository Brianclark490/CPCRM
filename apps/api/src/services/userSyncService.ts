import { randomUUID } from 'crypto';
import { pool } from '../db/client.js';
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
  const objResult = await pool.query(
    `SELECT id FROM object_definitions WHERE api_name = 'user' AND tenant_id = $1`,
    [tenantId],
  );

  if (objResult.rows.length === 0) {
    logger.debug({ tenantId }, 'User object definition not found; skipping user sync');
    return { userRecordId: '', created: false };
  }

  const objectId = objResult.rows[0].id as string;

  // Check if a User record exists for this descope_user_id
  const existingResult = await pool.query(
    `SELECT id, field_values FROM records
     WHERE object_id = $1 AND tenant_id = $2
       AND field_values->>'descope_user_id' = $3`,
    [objectId, tenantId, descopeUserId],
  );

  if (existingResult.rows.length > 0) {
    // User record exists — check if we need to update
    const existing = existingResult.rows[0] as { id: string; field_values: Record<string, unknown> };
    const existingFieldValues = existing.field_values;

    const needsUpdate =
      (displayName !== undefined && existingFieldValues['display_name'] !== displayName) ||
      (role !== undefined && existingFieldValues['role'] !== role);

    if (needsUpdate) {
      const updatedFieldValues: Record<string, unknown> = { ...existingFieldValues };
      if (displayName !== undefined) updatedFieldValues['display_name'] = displayName;
      if (role !== undefined) updatedFieldValues['role'] = role;

      const name = displayName ?? (existingFieldValues['display_name'] as string) ?? email ?? descopeUserId;

      await pool.query(
        `UPDATE records
         SET field_values = $1, name = $2, updated_at = NOW()
         WHERE id = $3 AND tenant_id = $4`,
        [JSON.stringify(updatedFieldValues), name, existing.id, tenantId],
      );

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

  await pool.query(
    `INSERT INTO records (id, object_id, name, field_values, owner_id, tenant_id, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
    [id, objectId, name, JSON.stringify(fieldValues), descopeUserId, tenantId],
  );

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
    await pool.query(
      `UPDATE records
       SET owner_record_id = $1
       WHERE tenant_id = $2
         AND owner_id = $3
         AND (owner_record_id IS NULL OR owner_record_id != $1)`,
      [userRecordId, tenantId, descopeUserId],
    );

    await pool.query(
      `UPDATE records
       SET updated_by_record_id = $1
       WHERE tenant_id = $2
         AND updated_by = $3
         AND (updated_by_record_id IS NULL OR updated_by_record_id != $1)`,
      [userRecordId, tenantId, descopeUserId],
    );
  } catch (err) {
    // Backfill is best-effort — don't fail the login
    logger.warn({ err, tenantId, descopeUserId }, 'Failed to backfill owner_record_id');
  }
}
