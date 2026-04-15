import { randomUUID } from 'crypto';
import { sql, type Selectable, type Updateable } from 'kysely';
import { logger } from '../lib/logger.js';
import { db } from '../db/kysely.js';
import type { FieldDefinitions } from '../db/kysely.types.js';

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
  'formula',
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

/**
 * Row shape returned by `selectAll()` / `returningAll()` against
 * `field_definitions`. Typing the mapper against `Selectable<FieldDefinitions>`
 * means schema drift (a renamed column, a changed nullability) is a
 * compile-time error at the call sites, rather than an `unknown` cast
 * leaking an incorrect runtime shape into the domain model.
 */
type FieldDefinitionRow = Selectable<FieldDefinitions>;

function rowToFieldDefinition(row: FieldDefinitionRow): FieldDefinition {
  return {
    id: row.id,
    objectId: row.object_id,
    apiName: row.api_name,
    label: row.label,
    fieldType: row.field_type,
    description: row.description ?? undefined,
    required: row.required,
    defaultValue: row.default_value ?? undefined,
    options: (row.options as Record<string, unknown> | null) ?? {},
    sortOrder: row.sort_order,
    isSystem: row.is_system,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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

const ALLOWED_FORMULA_OUTPUT_TYPES = new Set(['number', 'currency', 'text']);

/**
 * Validates that a formula expression only contains safe tokens:
 * field references ({field_name}), numbers, arithmetic operators, parentheses, and whitespace.
 */
export function validateFormulaExpression(expression: string): string | null {
  if (typeof expression !== 'string' || expression.trim().length === 0) {
    return 'options.expression is required for formula fields';
  }
  if (expression.length > 500) {
    return 'options.expression must be 500 characters or fewer';
  }
  // Remove field references and validate remaining tokens
  const withoutFields = expression.replace(/\{[a-z][a-z0-9]*(_[a-z0-9]+)*\}/g, '0');
  // Only allow: digits, decimal points, arithmetic operators, parentheses, whitespace
  if (!/^[\d\s.+\-*/()]+$/.test(withoutFields)) {
    return 'options.expression contains invalid characters. Use field references like {field_name}, numbers, and operators (+, -, *, /)';
  }
  // Check for balanced parentheses
  let depth = 0;
  for (const ch of withoutFields) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (depth < 0) return 'options.expression has unbalanced parentheses';
  }
  if (depth !== 0) return 'options.expression has unbalanced parentheses';
  return null;
}

export function validateFieldOptions(
  fieldType: string,
  options: Record<string, unknown> | undefined,
): string | null {
  if (!options) {
    if (fieldType === 'dropdown' || fieldType === 'multi_select') {
      return `options.choices is required for ${fieldType} fields`;
    }
    if (fieldType === 'formula') {
      return 'options.expression is required for formula fields';
    }
    return null;
  }

  if (Object.keys(options).length === 0) {
    if (fieldType === 'dropdown' || fieldType === 'multi_select') {
      return `options.choices must be a non-empty array of strings for ${fieldType} fields`;
    }
    if (fieldType === 'formula') {
      return 'options.expression is required for formula fields';
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
    case 'formula': {
      const { expression, output_type, precision } = options as {
        expression?: unknown;
        output_type?: unknown;
        precision?: unknown;
      };
      const exprError = validateFormulaExpression(expression as string);
      if (exprError) return exprError;
      if (output_type !== undefined && (typeof output_type !== 'string' || !ALLOWED_FORMULA_OUTPUT_TYPES.has(output_type))) {
        return `options.output_type must be one of: ${[...ALLOWED_FORMULA_OUTPUT_TYPES].join(', ')}`;
      }
      if (precision !== undefined && typeof precision !== 'number') {
        return 'options.precision must be a number';
      }
      break;
    }
    default:
      break;
  }

  return null;
}

// ─── Internal helpers ────────────────────────────────────────────────────────

async function assertObjectExists(tenantId: string, objectId: string): Promise<void> {
  const row = await db
    .selectFrom('object_definitions')
    .select('id')
    .where('id', '=', objectId)
    .where('tenant_id', '=', tenantId)
    .executeTakeFirst();
  if (!row) {
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
  tenantId: string,
  objectId: string,
  params: CreateFieldDefinitionParams,
): Promise<FieldDefinition> {
  await assertObjectExists(tenantId, objectId);

  // Validate
  const apiNameError = validateFieldApiName(params.apiName);
  if (apiNameError) throwValidationError(apiNameError);

  const labelError = validateFieldLabel(params.label);
  if (labelError) throwValidationError(labelError);

  const fieldTypeError = validateFieldType(params.fieldType);
  if (fieldTypeError) throwValidationError(fieldTypeError);

  const optionsError = validateFieldOptions(params.fieldType, params.options);
  if (optionsError) throwValidationError(optionsError);

  // Check uniqueness of api_name within this object and tenant
  const existing = await db
    .selectFrom('field_definitions')
    .select('id')
    .where('object_id', '=', objectId)
    .where('api_name', '=', params.apiName.trim())
    .where('tenant_id', '=', tenantId)
    .executeTakeFirst();
  if (existing) {
    throwConflictError(`A field with api_name "${params.apiName.trim()}" already exists on this object`);
  }

  // Determine next sort_order
  const maxSortRow = await db
    .selectFrom('field_definitions')
    .select(sql<string>`COALESCE(MAX(sort_order), 0)`.as('max_sort'))
    .where('object_id', '=', objectId)
    .where('tenant_id', '=', tenantId)
    .executeTakeFirstOrThrow();
  const nextSortOrder = (parseInt(maxSortRow.max_sort, 10) || 0) + 1;

  const fieldId = randomUUID();
  const now = new Date();

  const inserted = await db
    .insertInto('field_definitions')
    .values({
      id: fieldId,
      tenant_id: tenantId,
      object_id: objectId,
      api_name: params.apiName.trim(),
      label: params.label.trim(),
      field_type: params.fieldType.trim(),
      description: params.description?.trim() ?? null,
      required: params.required ?? false,
      default_value: params.defaultValue ?? null,
      options: JSON.stringify(params.options ?? {}),
      sort_order: nextSortOrder,
      is_system: false,
      created_at: now,
      updated_at: now,
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  // Auto-add to default form layout
  const defaultFormLayout = await db
    .selectFrom('layout_definitions')
    .select('id')
    .where('object_id', '=', objectId)
    .where('layout_type', '=', 'form')
    .where('is_default', '=', true)
    .where('tenant_id', '=', tenantId)
    .limit(1)
    .executeTakeFirst();

  if (defaultFormLayout) {
    const layoutId = defaultFormLayout.id;

    // Determine next sort_order within the layout
    const maxLayoutSortRow = await db
      .selectFrom('layout_fields')
      .select(sql<string>`COALESCE(MAX(sort_order), 0)`.as('max_sort'))
      .where('layout_id', '=', layoutId)
      .where('tenant_id', '=', tenantId)
      .executeTakeFirstOrThrow();
    const nextLayoutSortOrder =
      (parseInt(maxLayoutSortRow.max_sort, 10) || 0) + 1;

    await db
      .insertInto('layout_fields')
      .values({
        id: randomUUID(),
        tenant_id: tenantId,
        layout_id: layoutId,
        field_id: fieldId,
        section: 0,
        sort_order: nextLayoutSortOrder,
        width: 'full',
      })
      .execute();
  }

  logger.info({ fieldId, objectId, apiName: params.apiName }, 'Field definition created');

  return rowToFieldDefinition(inserted);
}

/**
 * Returns all field definitions for an object, ordered by sort_order.
 *
 * @throws {Error} NOT_FOUND — parent object does not exist
 */
export async function listFieldDefinitions(
  tenantId: string,
  objectId: string,
): Promise<FieldDefinition[]> {
  await assertObjectExists(tenantId, objectId);

  const rows = await db
    .selectFrom('field_definitions')
    .selectAll()
    .where('object_id', '=', objectId)
    .where('tenant_id', '=', tenantId)
    .orderBy('sort_order', 'asc')
    .execute();

  return rows.map((row) => rowToFieldDefinition(row));
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
  tenantId: string,
  objectId: string,
  fieldId: string,
  params: UpdateFieldDefinitionParams,
): Promise<FieldDefinition & { warning?: string }> {
  await assertObjectExists(tenantId, objectId);

  const existingRow = await db
    .selectFrom('field_definitions')
    .selectAll()
    .where('id', '=', fieldId)
    .where('object_id', '=', objectId)
    .where('tenant_id', '=', tenantId)
    .executeTakeFirst();

  if (!existingRow) {
    throwNotFoundError('Field definition not found');
  }

  // System fields: cannot change field_type
  if (existingRow.is_system && params.fieldType !== undefined) {
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
  const effectiveFieldType = params.fieldType?.trim() ?? existingRow.field_type;

  if (params.options !== undefined) {
    const optionsError = validateFieldOptions(effectiveFieldType, params.options);
    if (optionsError) throwValidationError(optionsError);
  }

  // Build a typed update object so Kysely enforces the column/value
  // contract from the generated schema. Only keys the caller explicitly
  // provided are emitted — `undefined` means "leave unchanged".
  const updates: Updateable<FieldDefinitions> = {};
  if (params.label !== undefined) updates.label = params.label.trim();
  if (params.fieldType !== undefined) updates.field_type = params.fieldType.trim();
  if (params.description !== undefined) updates.description = params.description?.trim() ?? null;
  if (params.required !== undefined) updates.required = params.required;
  if (params.defaultValue !== undefined) updates.default_value = params.defaultValue ?? null;
  if (params.options !== undefined) updates.options = JSON.stringify(params.options);

  if (Object.keys(updates).length === 0) {
    return rowToFieldDefinition(existingRow);
  }

  updates.updated_at = new Date();

  const updatedRow = await db
    .updateTable('field_definitions')
    .set(updates)
    .where('id', '=', fieldId)
    .where('object_id', '=', objectId)
    .where('tenant_id', '=', tenantId)
    .returningAll()
    .executeTakeFirstOrThrow();

  logger.info({ fieldId, objectId }, 'Field definition updated');

  const updated = rowToFieldDefinition(updatedRow);

  // Warn if field_type changed and records exist
  let warning: string | undefined;
  if (params.fieldType !== undefined && params.fieldType.trim() !== existingRow.field_type) {
    const recordCountRow = await db
      .selectFrom('records')
      .select(sql<string>`COUNT(*)`.as('count'))
      .where('object_id', '=', objectId)
      .where('tenant_id', '=', tenantId)
      .executeTakeFirstOrThrow();
    const count = parseInt(recordCountRow.count, 10);
    if (count > 0) {
      warning = `field_type changed from "${existingRow.field_type}" to "${params.fieldType.trim()}"; ${count} existing record(s) may contain data that does not match the new type`;
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
  tenantId: string,
  objectId: string,
  fieldId: string,
): Promise<void> {
  await assertObjectExists(tenantId, objectId);

  const existingRow = await db
    .selectFrom('field_definitions')
    .selectAll()
    .where('id', '=', fieldId)
    .where('object_id', '=', objectId)
    .where('tenant_id', '=', tenantId)
    .executeTakeFirst();

  if (!existingRow) {
    throwNotFoundError('Field definition not found');
  }

  if (existingRow.is_system === true) {
    throwDeleteBlockedError('Cannot delete system fields');
  }

  // layout_fields has ON DELETE CASCADE from field_definitions, so deleting
  // the field definition will automatically remove it from all layouts.
  await db
    .deleteFrom('field_definitions')
    .where('id', '=', fieldId)
    .where('object_id', '=', objectId)
    .where('tenant_id', '=', tenantId)
    .execute();

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
  tenantId: string,
  objectId: string,
  fieldIds: string[],
): Promise<FieldDefinition[]> {
  await assertObjectExists(tenantId, objectId);

  if (!Array.isArray(fieldIds) || fieldIds.length === 0) {
    throwValidationError('field_ids must be a non-empty array');
  }

  const MAX_REORDER_FIELDS = 1000;
  if (fieldIds.length > MAX_REORDER_FIELDS) {
    throwValidationError(`field_ids cannot contain more than ${MAX_REORDER_FIELDS} items`);
  }

  const sanitizedFieldIds = fieldIds.slice(0, MAX_REORDER_FIELDS);
  const fieldCount = sanitizedFieldIds.length;

  // Verify all field IDs belong to this object
  const existingFields = await db
    .selectFrom('field_definitions')
    .select('id')
    .where('object_id', '=', objectId)
    .where('tenant_id', '=', tenantId)
    .execute();
  const existingIds = new Set(existingFields.map((r) => r.id));

  for (let i = 0; i < fieldCount; i++) {
    if (!existingIds.has(sanitizedFieldIds[i]!)) {
      throwValidationError(`Field ID "${sanitizedFieldIds[i]}" does not belong to this object`);
    }
  }

  // Update sort_order for each field
  const now = new Date();
  for (let i = 0; i < fieldCount; i++) {
    await db
      .updateTable('field_definitions')
      .set({ sort_order: i + 1, updated_at: now })
      .where('id', '=', sanitizedFieldIds[i]!)
      .where('object_id', '=', objectId)
      .where('tenant_id', '=', tenantId)
      .execute();
  }

  logger.info({ objectId, fieldCount }, 'Field definitions reordered');

  // Return the updated list
  const rows = await db
    .selectFrom('field_definitions')
    .selectAll()
    .where('object_id', '=', objectId)
    .where('tenant_id', '=', tenantId)
    .orderBy('sort_order', 'asc')
    .execute();

  return rows.map((row) => rowToFieldDefinition(row));
}
