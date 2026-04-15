import { randomUUID } from 'crypto';
import type { Selectable } from 'kysely';
import { logger } from '../lib/logger.js';
import { db } from '../db/kysely.js';
import type { UserProfiles } from '../db/kysely.types.js';

export interface UserProfile {
  id: string;
  /** Descope user ID — the `sub` claim from the validated JWT */
  userId: string;
  displayName?: string;
  jobTitle?: string;
  createdAt: Date;
  updatedAt: Date;
  /** Descope userId of the user who last updated this profile */
  updatedBy: string;
}

export interface UpdateProfileParams {
  displayName?: string | null;
  jobTitle?: string | null;
}

/**
 * Validates a display name or job title field.
 * Returns an error message string, or null if valid.
 */
function validateTextField(value: unknown, fieldLabel: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return `${fieldLabel} must be a string`;
  if (value.trim().length === 0) return `${fieldLabel} must not be blank`;
  if (value.trim().length > 100) return `${fieldLabel} must be 100 characters or fewer`;
  return null;
}

/**
 * Typing the row mapper against `Selectable<UserProfiles>` (rather than
 * `Record<string, unknown>`) means a column rename or nullability change
 * on the generated schema becomes a compile-time error at this service,
 * rather than an `unknown` cast leaking an incorrect runtime shape into
 * the domain model.
 */
function rowToProfile(row: Selectable<UserProfiles>): UserProfile {
  return {
    id: row.id,
    userId: row.user_id,
    displayName: row.display_name ?? undefined,
    jobTitle: row.job_title ?? undefined,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Returns the user profile for the given Descope user ID.
 * Creates a new profile if one does not already exist.
 *
 * The profile is automatically seeded with no optional fields on first creation.
 * This implements the "profile on first access" requirement.
 *
 * Note: `user_profiles` is a global table (no `tenant_id` column) because
 * a single Descope user may belong to multiple tenants and shares one
 * profile across all of them.
 */
export async function getOrCreateProfile(userId: string): Promise<UserProfile> {
  const existing = await db
    .selectFrom('user_profiles')
    .selectAll()
    .where('user_id', '=', userId)
    .executeTakeFirst();

  if (existing) {
    return rowToProfile(existing);
  }

  const now = new Date();
  const id = randomUUID();

  logger.info({ userId }, 'Creating user profile for first-time user');

  const inserted = await db
    .insertInto('user_profiles')
    .values({
      id,
      user_id: userId,
      display_name: null,
      job_title: null,
      updated_by: userId,
      created_at: now,
      updated_at: now,
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  return rowToProfile(inserted);
}

/**
 * Returns the user profile for the given Descope user ID, or null if not found.
 */
export async function getProfile(userId: string): Promise<UserProfile | null> {
  const row = await db
    .selectFrom('user_profiles')
    .selectAll()
    .where('user_id', '=', userId)
    .executeTakeFirst();

  if (!row) return null;
  return rowToProfile(row);
}

/**
 * Updates the user profile for the given Descope user ID.
 * Only the fields provided in params are updated.
 *
 * @throws {Error} with a `code` property of "VALIDATION_ERROR" when input is invalid.
 * @throws {Error} with a `code` property of "NOT_FOUND" when the profile does not exist.
 */
export async function updateProfile(
  userId: string,
  params: UpdateProfileParams,
  updatedBy: string,
): Promise<UserProfile> {
  if ('displayName' in params) {
    const err = validateTextField(params.displayName, 'Display name');
    if (err) {
      const e = new Error(err) as Error & { code: string };
      e.code = 'VALIDATION_ERROR';
      throw e;
    }
  }

  if ('jobTitle' in params) {
    const err = validateTextField(params.jobTitle, 'Job title');
    if (err) {
      const e = new Error(err) as Error & { code: string };
      e.code = 'VALIDATION_ERROR';
      throw e;
    }
  }

  const existing = await db
    .selectFrom('user_profiles')
    .select('id')
    .where('user_id', '=', userId)
    .executeTakeFirst();

  if (!existing) {
    const e = new Error('Profile not found') as Error & { code: string };
    e.code = 'NOT_FOUND';
    throw e;
  }

  // Build the partial update — only include fields the caller provided,
  // preserving the original "UPDATE only-what-you-set" semantics.
  const patch: {
    display_name?: string | null;
    job_title?: string | null;
    updated_by: string;
    updated_at: Date;
  } = {
    updated_by: updatedBy,
    updated_at: new Date(),
  };

  if ('displayName' in params) {
    patch.display_name = params.displayName?.trim() ?? null;
  }

  if ('jobTitle' in params) {
    patch.job_title = params.jobTitle?.trim() ?? null;
  }

  const updated = await db
    .updateTable('user_profiles')
    .set(patch)
    .where('user_id', '=', userId)
    .returningAll()
    .executeTakeFirstOrThrow();

  logger.info({ userId, updatedBy }, 'User profile updated');

  return rowToProfile(updated);
}

export { validateTextField };
