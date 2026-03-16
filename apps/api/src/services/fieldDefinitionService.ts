import { randomUUID } from 'crypto';
import { logger } from '../lib/logger.js';
import { pool } from '../db/client.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FieldDefinition {
  id: string;
  objectId: string;
  apiName: string;
  label: string;
  fieldType: string;
  description?: string;
  required: boolean;
  defaultValue?: string;
  options: Record<string, unknown>;
  sortOrder: number;
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateFieldDefinitionParams {
  apiName: string;
  label: string;
  fieldType: string;
  description?: string;
  required?: boolean;
  defaultValue?: string;
  options?: Record<string, unknown>;
}

export interface UpdateFieldDefinitionParams {
  label?: string;
  fieldType?: string;
  description?: string | null;
  required?: boolean;
  defaultValue?: string | null;
  options?: Record<string, unknown>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ALLOWED_FIELD_TYPES = new Set([
  'text',
  'textarea',
  'number',
  'currency',
  'date',
  'datetime',
  'email',
  'phone',
  'url',
  'boolean',
  'dropdown',
  'multi_select',
]);

const SNAKE_CASE_RE = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function throwDeleteBlockedError(message: string): never {
  const err = new Error(message) as Error & { code: string };
  err.code = 'DELETE_BLOCKED';
  throw err;
}

function throwConflictError(message: string): never {
  const err = new Error(message) as Error & { code: string };
  err.code = 'CONFLICT';
  throw err;
}

// ─── Row → domain model ─────────────────────────────────────────────────────

function rowToFieldDefinition(row: Record<string, unknown>): FieldDefinition {
  return {
    id: row.id as string,
    objectId: row.object_id as string,
    apiName: row.api_name as string,
    label: row.label as string,
    fieldType: row.field_type as string,
    description: (row.description as string | null) ?? undefined,
    required: row.required as boolean,
    defaultValue: (row.default_value as string | null) ?? undefined,
    options: (row.options as Record<string, unknown>) ?? {},
    sortOrder: row.sort_order as number,
    isSystem: row.is_system as boolean,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

// ─── Validation ──────────────────────────────────────────────────────────────

export function validateFieldApiName(apiName: unknown): string | null {
  if (typeof apiName !== 'string' || apiName.trim().length === 0) {
    return 'api_name is required';
  }
  const trimmed = apiName.trim();
  if (trimmed.length < 2 || trimmed.length > 100) {
    return 'api_name must be between 2 and 100 characters';
  }
  if (!SNAKE_CASE_RE.test(trimmed)) {
    return 'api_name must be lowercase snake_case (e.g. "company_name")';
  }
  return null;
}

export function validateFieldLabel(label: unknown): string | null {
  if (typeof label !== 'string' || label.trim().length === 0) {
    return 'label is required';
  }
  if (label.trim().length > 255) {
    return 'label must be 255 characters or fewer';
  }
  return null;
}

export function validateFieldType(fieldType: unknown): string | null {
  if (typeof fieldType !== 'string' || fieldType.trim().length === 0) {
    return 'field_type is required';
  }
  if (!ALLOWED_FIELD_TYPES.has(fieldType.trim())) {
    return `field_type must be one of: ${[...ALLOWED_FIELD_TYPES].join(', ')}`;
  }
  return null;
}

export function validateFieldOptions(
  fieldType: string,
  options: Record<string, unknown> | undefined,
): string | null {
  if (!options || Object.keys(options).length === 0) {
    if (fieldType === 'dropdown' || fieldType === 'multi_select') {
      return `options.choices is required for ${fieldType} fields`;
    }
    return null;
  }

  switch (fieldType) {
    case 'dropdown':
    case 'multi_select': {
      const { choices } = options;
      if (!Array.isArray(choices) || choices.length === 0) {
        return `options.choices must be a non-empty array of strings for ${fieldType} fields`;
      }
      for (const choice of choices) {
        if (typeof choice !== 'string') {
          return `options.choices must be a non-empty array of strings for ${fieldType} fields`;
        }
      }
      break;
    }
    case 'number':
    case 'currency': {
      const { min, max, precision } = options as { min?: unknown; max?: unknown; precision?: unknown };
      if (min !== undefined && typeof min !== 'number') {
        return 'options.min must be a number';
      }
      if (max !== undefined && typeof max !== 'number') {
        return 'options.max must be a number';
      }
      if (precision !== undefined && typeof precision !== 'number') {
        return 'options.precision must be a number';
      }
      if (typeof min === 'number' && typeof max === 'number' && min > max) {
        return 'options.min must be less than or equal to options.max';
      }
      break;
    }
    case 'text': {
      const { max_length } = options as { max_length?: unknown };
      if (max_length !== undefined && typeof max_length !== 'number') {
        return 'options.max_length must be a number';
      }
      break;
    }
    default:
      break;
  }

  return null;
}

// ─── Internal helpers ────────────────────────────────────────────────────────

async function assertObjectExists(objectId: string): Promise<void> {
  const result = await pool.query(
    'SELECT id FROM object_definitions WHERE id = $1',
    [objectId],
  );
  if (result.rows.length === 0) {
    throwNotFoundError('Object definition not found');
  }
}

// ─── Service functions ───────────────────────────────────────────────────────

/**
 * Creates a new field definition on the specified object.
 * Auto-adds the field to the object's default form layout.
 *
 * @throws {Error} NOT_FOUND — parent object does not exist
 * @throws {Error} VALIDATION_ERROR — invalid input
 * @throws {Error} CONFLICT — api_name already exists on this object
 */
export async function createFieldDefinition(
  objectId: string,
  params: CreateFieldDefinitionParams,
): Promise<FieldDefinition> {
  await assertObjectExists(objectId);

  // Validate
  const apiNameError = validateFieldApiName(params.apiName);
  if (apiNameError) throwValidationError(apiNameError);

  const labelError = validateFieldLabel(params.label);
  if (labelError) throwValidationError(labelError);

  const fieldTypeError = validateFieldType(params.fieldType);
  if (fieldTypeError) throwValidationError(fieldTypeError);

  const optionsError = validateFieldOptions(params.fieldType, params.options);
  if (optionsError) throwValidationError(optionsError);

  // Check uniqueness of api_name within this object
  const existing = await pool.query(
    'SELECT id FROM field_definitions WHERE object_id = $1 AND api_name = $2',
    [objectId, params.apiName.trim()],
  );
  if (existing.rows.length > 0) {
    throwConflictError(`A field with api_name "${params.apiName.trim()}" already exists on this object`);
  }

  // Determine next sort_order
  const maxSortResult = await pool.query(
    'SELECT COALESCE(MAX(sort_order), 0) AS max_sort FROM field_definitions WHERE object_id = $1',
    [objectId],
  );
  const nextSortOrder = (parseInt(maxSortResult.rows[0].max_sort as string, 10) || 0) + 1;

  const fieldId = randomUUID();
  const now = new Date();

  const result = await pool.query(
    `INSERT INTO field_definitions
       (id, object_id, api_name, label, field_type, description, required, default_value, options, sort_order, is_system, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     RETURNING *`,
    [
      fieldId,
      objectId,
      params.apiName.trim(),
      params.label.trim(),
      params.fieldType.trim(),
      params.description?.trim() ?? null,
      params.required ?? false,
      params.defaultValue ?? null,
      JSON.stringify(params.options ?? {}),
      nextSortOrder,
      false,
      now,
      now,
    ],
  );

  // Auto-add to default form layout
  const defaultFormLayout = await pool.query(
    `SELECT id FROM layout_definitions
     WHERE object_id = $1 AND layout_type = 'form' AND is_default = true
     LIMIT 1`,
    [objectId],
  );

  if (defaultFormLayout.rows.length > 0) {
    const layoutId = defaultFormLayout.rows[0].id as string;

    // Determine next sort_order within the layout
    const maxLayoutSort = await pool.query(
      'SELECT COALESCE(MAX(sort_order), 0) AS max_sort FROM layout_fields WHERE layout_id = $1',
      [layoutId],
    );
    const nextLayoutSortOrder = (parseInt(maxLayoutSort.rows[0].max_sort as string, 10) || 0) + 1;

    await pool.query(
      `INSERT INTO layout_fields (id, layout_id, field_id, section, sort_order, width)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [randomUUID(), layoutId, fieldId, 0, nextLayoutSortOrder, 'full'],
    );
  }

  logger.info({ fieldId, objectId, apiName: params.apiName }, 'Field definition created');

  return rowToFieldDefinition(result.rows[0]);
}

/**
 * Returns all field definitions for an object, ordered by sort_order.
 *
 * @throws {Error} NOT_FOUND — parent object does not exist
 */
export async function listFieldDefinitions(
  objectId: string,
): Promise<FieldDefinition[]> {
  await assertObjectExists(objectId);

  const result = await pool.query(
    'SELECT * FROM field_definitions WHERE object_id = $1 ORDER BY sort_order ASC',
    [objectId],
  );

  return result.rows.map((row: Record<string, unknown>) => rowToFieldDefinition(row));
}

/**
 * Updates a field definition.
 *
 * System fields cannot have their api_name or field_type changed.
 * Custom fields can have field_type changed (warning returned if records exist).
 *
 * @throws {Error} NOT_FOUND — field or parent object does not exist
 * @throws {Error} VALIDATION_ERROR — invalid input or system field restriction
 */
export async function updateFieldDefinition(
  objectId: string,
  fieldId: string,
  params: UpdateFieldDefinitionParams,
): Promise<FieldDefinition & { warning?: string }> {
  await assertObjectExists(objectId);

  const existing = await pool.query(
    'SELECT * FROM field_definitions WHERE id = $1 AND object_id = $2',
    [fieldId, objectId],
  );

  if (existing.rows.length === 0) {
    throwNotFoundError('Field definition not found');
  }

  const row = existing.rows[0] as Record<string, unknown>;
  const isSystem = row.is_system as boolean;

  // System fields: cannot change field_type
  if (isSystem && params.fieldType !== undefined) {
    throwValidationError('Cannot change field_type on system fields');
  }

  // Validate changed fields
  if (params.label !== undefined) {
    const labelError = validateFieldLabel(params.label);
    if (labelError) throwValidationError(labelError);
  }

  if (params.fieldType !== undefined) {
    const fieldTypeError = validateFieldType(params.fieldType);
    if (fieldTypeError) throwValidationError(fieldTypeError);
  }

  // Determine the effective field type for options validation
  const effectiveFieldType = params.fieldType?.trim() ?? (row.field_type as string);

  if (params.options !== undefined) {
    const optionsError = validateFieldOptions(effectiveFieldType, params.options);
    if (optionsError) throwValidationError(optionsError);
  }

  // Build dynamic update
  const updates: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if ('label' in params) {
    updates.push(`label = $${paramIndex++}`);
    values.push(params.label!.trim());
  }
  if ('fieldType' in params) {
    updates.push(`field_type = $${paramIndex++}`);
    values.push(params.fieldType!.trim());
  }
  if ('description' in params) {
    updates.push(`description = $${paramIndex++}`);
    values.push(params.description?.trim() ?? null);
  }
  if ('required' in params) {
    updates.push(`required = $${paramIndex++}`);
    values.push(params.required);
  }
  if ('defaultValue' in params) {
    updates.push(`default_value = $${paramIndex++}`);
    values.push(params.defaultValue ?? null);
  }
  if ('options' in params) {
    updates.push(`options = $${paramIndex++}`);
    values.push(JSON.stringify(params.options));
  }

  if (updates.length === 0) {
    return rowToFieldDefinition(row);
  }

  const now = new Date();
  updates.push(`updated_at = $${paramIndex++}`);
  values.push(now);

  values.push(fieldId);
  values.push(objectId);

  const result = await pool.query(
    `UPDATE field_definitions SET ${updates.join(', ')} WHERE id = $${paramIndex++} AND object_id = $${paramIndex} RETURNING *`,
    values,
  );

  logger.info({ fieldId, objectId }, 'Field definition updated');

  const updated = rowToFieldDefinition(result.rows[0]);

  // Warn if field_type changed and records exist
  let warning: string | undefined;
  if (params.fieldType !== undefined && params.fieldType.trim() !== (row.field_type as string)) {
    const recordCount = await pool.query(
      'SELECT COUNT(*) AS count FROM records WHERE object_id = $1',
      [objectId],
    );
    const count = parseInt(recordCount.rows[0].count as string, 10);
    if (count > 0) {
      warning = `field_type changed from "${row.field_type}" to "${params.fieldType.trim()}"; ${count} existing record(s) may contain data that does not match the new type`;
    }
  }

  if (warning) {
    return { ...updated, warning };
  }

  return updated;
}

/**
 * Deletes a field definition. System fields cannot be deleted.
 * Also removes the field from all layouts.
 * Does NOT remove existing data from records.field_values.
 *
 * @throws {Error} NOT_FOUND — field or parent object does not exist
 * @throws {Error} DELETE_BLOCKED — system field
 */
export async function deleteFieldDefinition(
  objectId: string,
  fieldId: string,
): Promise<void> {
  await assertObjectExists(objectId);

  const existing = await pool.query(
    'SELECT * FROM field_definitions WHERE id = $1 AND object_id = $2',
    [fieldId, objectId],
  );

  if (existing.rows.length === 0) {
    throwNotFoundError('Field definition not found');
  }

  const row = existing.rows[0] as Record<string, unknown>;

  if (row.is_system === true) {
    throwDeleteBlockedError('Cannot delete system fields');
  }

  // layout_fields has ON DELETE CASCADE from field_definitions, so deleting
  // the field definition will automatically remove it from all layouts.
  await pool.query(
    'DELETE FROM field_definitions WHERE id = $1 AND object_id = $2',
    [fieldId, objectId],
  );

  logger.info({ fieldId, objectId }, 'Field definition deleted');
}

/**
 * Reorders field definitions by updating sort_order based on the
 * provided array of field IDs.
 *
 * @throws {Error} NOT_FOUND — parent object does not exist
 * @throws {Error} VALIDATION_ERROR — invalid field_ids
 */
export async function reorderFieldDefinitions(
  objectId: string,
  fieldIds: string[],
): Promise<FieldDefinition[]> {
  await assertObjectExists(objectId);

  if (!Array.isArray(fieldIds) || fieldIds.length === 0) {
    throwValidationError('field_ids must be a non-empty array');
  }

  // Verify all field IDs belong to this object
  const existingFields = await pool.query(
    'SELECT id FROM field_definitions WHERE object_id = $1',
    [objectId],
  );
  const existingIds = new Set(existingFields.rows.map((r: Record<string, unknown>) => r.id as string));

  for (const id of fieldIds) {
    if (!existingIds.has(id)) {
      throwValidationError(`Field ID "${id}" does not belong to this object`);
    }
  }

  // Update sort_order for each field
  const now = new Date();
  for (let i = 0; i < fieldIds.length; i++) {
    await pool.query(
      'UPDATE field_definitions SET sort_order = $1, updated_at = $2 WHERE id = $3 AND object_id = $4',
      [i + 1, now, fieldIds[i], objectId],
    );
  }

  logger.info({ objectId, fieldCount: fieldIds.length }, 'Field definitions reordered');

  // Return the updated list
  const result = await pool.query(
    'SELECT * FROM field_definitions WHERE object_id = $1 ORDER BY sort_order ASC',
    [objectId],
  );

  return result.rows.map((row: Record<string, unknown>) => rowToFieldDefinition(row));
}
