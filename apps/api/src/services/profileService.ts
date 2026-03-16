import { randomUUID } from 'crypto';
import { logger } from '../lib/logger.js';
import { pool } from '../db/client.js';

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

function rowToProfile(row: Record<string, unknown>): UserProfile {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    displayName: (row.display_name as string | null) ?? undefined,
    jobTitle: (row.job_title as string | null) ?? undefined,
    updatedBy: row.updated_by as string,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

/**
 * Returns the user profile for the given Descope user ID.
 * Creates a new profile if one does not already exist.
 *
 * The profile is automatically seeded with no optional fields on first creation.
 * This implements the "profile on first access" requirement.
 */
export async function getOrCreateProfile(userId: string): Promise<UserProfile> {
  const existing = await pool.query(
    'SELECT * FROM user_profiles WHERE user_id = $1',
    [userId],
  );

  if (existing.rows.length > 0) {
    return rowToProfile(existing.rows[0] as Record<string, unknown>);
  }

  const now = new Date();
  const id = randomUUID();

  logger.info({ userId }, 'Creating user profile for first-time user');

  const result = await pool.query(
    `INSERT INTO user_profiles (id, user_id, display_name, job_title, updated_by, created_at, updated_at)
     VALUES ($1, $2, NULL, NULL, $3, $4, $5)
     RETURNING *`,
    [id, userId, userId, now, now],
  );

  return rowToProfile(result.rows[0] as Record<string, unknown>);
}

/**
 * Returns the user profile for the given Descope user ID, or null if not found.
 */
export async function getProfile(userId: string): Promise<UserProfile | null> {
  const result = await pool.query(
    'SELECT * FROM user_profiles WHERE user_id = $1',
    [userId],
  );

  if (result.rows.length === 0) return null;
  return rowToProfile(result.rows[0] as Record<string, unknown>);
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

  const existing = await pool.query(
    'SELECT * FROM user_profiles WHERE user_id = $1',
    [userId],
  );

  if (existing.rows.length === 0) {
    const e = new Error('Profile not found') as Error & { code: string };
    e.code = 'NOT_FOUND';
    throw e;
  }

  const updates: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if ('displayName' in params) {
    updates.push(`display_name = $${paramIndex++}`);
    values.push(params.displayName?.trim() ?? null);
  }

  if ('jobTitle' in params) {
    updates.push(`job_title = $${paramIndex++}`);
    values.push(params.jobTitle?.trim() ?? null);
  }

  updates.push(`updated_by = $${paramIndex++}`);
  values.push(updatedBy);

  updates.push(`updated_at = $${paramIndex++}`);
  values.push(new Date());

  values.push(userId);

  const result = await pool.query(
    `UPDATE user_profiles SET ${updates.join(', ')} WHERE user_id = $${paramIndex} RETURNING *`,
    values,
  );

  logger.info({ userId, updatedBy }, 'User profile updated');

  return rowToProfile(result.rows[0] as Record<string, unknown>);
}

export { validateTextField };
