import { randomUUID } from 'crypto';
import { logger } from '../lib/logger.js';
import { pool } from '../db/client.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LayoutDefinition {
  id: string;
  objectId: string;
  name: string;
  layoutType: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface LayoutFieldRow {
  id: string;
  layoutId: string;
  fieldId: string;
  section: number;
  sectionLabel?: string;
  sortOrder: number;
  width: string;
}

export interface LayoutFieldWithMetadata extends LayoutFieldRow {
  fieldApiName: string;
  fieldLabel: string;
  fieldType: string;
  fieldRequired: boolean;
  fieldOptions: Record<string, unknown>;
}

export interface LayoutDefinitionDetail extends LayoutDefinition {
  fields: LayoutFieldWithMetadata[];
}

export interface CreateLayoutDefinitionParams {
  name: string;
  layoutType: string;
  isDefault?: boolean;
}

export interface UpdateLayoutDefinitionParams {
  name?: string;
  layoutType?: string;
}

export interface LayoutFieldInput {
  field_id?: string;
  fieldId?: string;
  width?: string;
}

export interface LayoutSectionInput {
  label?: string;
  fields: LayoutFieldInput[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ALLOWED_LAYOUT_TYPES = new Set(['form', 'list', 'detail']);

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

function throwConflictError(message: string): never {
  const err = new Error(message) as Error & { code: string };
  err.code = 'CONFLICT';
  throw err;
}

function throwDeleteBlockedError(message: string): never {
  const err = new Error(message) as Error & { code: string };
  err.code = 'DELETE_BLOCKED';
  throw err;
}

// ─── Row → domain model ─────────────────────────────────────────────────────

function rowToLayoutDefinition(row: Record<string, unknown>): LayoutDefinition {
  return {
    id: row.id as string,
    objectId: row.object_id as string,
    name: row.name as string,
    layoutType: row.layout_type as string,
    isDefault: row.is_default as boolean,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

function rowToLayoutFieldWithMetadata(row: Record<string, unknown>): LayoutFieldWithMetadata {
  return {
    id: row.id as string,
    layoutId: row.layout_id as string,
    fieldId: row.field_id as string,
    section: row.section as number,
    sectionLabel: (row.section_label as string | null) ?? undefined,
    sortOrder: row.sort_order as number,
    width: row.width as string,
    fieldApiName: row.field_api_name as string,
    fieldLabel: row.field_label as string,
    fieldType: row.field_type as string,
    fieldRequired: row.field_required as boolean,
    fieldOptions: (row.field_options as Record<string, unknown>) ?? {},
  };
}

// ─── Validation ──────────────────────────────────────────────────────────────

export function validateLayoutName(name: unknown): string | null {
  if (typeof name !== 'string' || name.trim().length === 0) {
    return 'name is required';
  }
  if (name.trim().length > 255) {
    return 'name must be 255 characters or fewer';
  }
  return null;
}

export function validateLayoutType(layoutType: unknown): string | null {
  if (typeof layoutType !== 'string' || layoutType.trim().length === 0) {
    return 'layout_type is required';
  }
  if (!ALLOWED_LAYOUT_TYPES.has(layoutType.trim())) {
    return `layout_type must be one of: ${[...ALLOWED_LAYOUT_TYPES].join(', ')}`;
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

async function fetchLayoutFields(layoutId: string): Promise<LayoutFieldWithMetadata[]> {
  const result = await pool.query(
    `SELECT lf.*,
            fd.api_name  AS field_api_name,
            fd.label     AS field_label,
            fd.field_type AS field_type,
            fd.required  AS field_required,
            fd.options   AS field_options
     FROM layout_fields lf
     JOIN field_definitions fd ON fd.id = lf.field_id
     WHERE lf.layout_id = $1
     ORDER BY lf.section ASC, lf.sort_order ASC`,
    [layoutId],
  );

  return result.rows.map((row: Record<string, unknown>) => rowToLayoutFieldWithMetadata(row));
}

// ─── Service functions ───────────────────────────────────────────────────────

/**
 * Creates a new layout definition on the specified object.
 *
 * @throws {Error} NOT_FOUND — parent object does not exist
 * @throws {Error} VALIDATION_ERROR — invalid input
 * @throws {Error} CONFLICT — layout name already exists on this object
 */
export async function createLayoutDefinition(
  objectId: string,
  params: CreateLayoutDefinitionParams,
): Promise<LayoutDefinition> {
  await assertObjectExists(objectId);

  // Validate
  const nameError = validateLayoutName(params.name);
  if (nameError) throwValidationError(nameError);

  const typeError = validateLayoutType(params.layoutType);
  if (typeError) throwValidationError(typeError);

  // Check uniqueness of name within this object
  const existing = await pool.query(
    'SELECT id FROM layout_definitions WHERE object_id = $1 AND name = $2',
    [objectId, params.name.trim()],
  );
  if (existing.rows.length > 0) {
    throwConflictError(`A layout with name "${params.name.trim()}" already exists on this object`);
  }

  const layoutId = randomUUID();
  const now = new Date();

  const result = await pool.query(
    `INSERT INTO layout_definitions
       (id, object_id, name, layout_type, is_default, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      layoutId,
      objectId,
      params.name.trim(),
      params.layoutType.trim(),
      params.isDefault ?? false,
      now,
      now,
    ],
  );

  logger.info({ layoutId, objectId, name: params.name }, 'Layout definition created');

  return rowToLayoutDefinition(result.rows[0]);
}

/**
 * Returns all layout definitions for an object, ordered by layout_type and name.
 *
 * @throws {Error} NOT_FOUND — parent object does not exist
 */
export async function listLayoutDefinitions(
  objectId: string,
): Promise<LayoutDefinition[]> {
  await assertObjectExists(objectId);

  const result = await pool.query(
    'SELECT * FROM layout_definitions WHERE object_id = $1 ORDER BY layout_type ASC, name ASC',
    [objectId],
  );

  return result.rows.map((row: Record<string, unknown>) => rowToLayoutDefinition(row));
}

/**
 * Returns a single layout definition by ID with nested field metadata.
 *
 * @throws {Error} NOT_FOUND — layout or parent object does not exist
 */
export async function getLayoutDefinitionById(
  objectId: string,
  layoutId: string,
): Promise<LayoutDefinitionDetail> {
  await assertObjectExists(objectId);

  const layoutResult = await pool.query(
    'SELECT * FROM layout_definitions WHERE id = $1 AND object_id = $2',
    [layoutId, objectId],
  );

  if (layoutResult.rows.length === 0) {
    throwNotFoundError('Layout definition not found');
  }

  const layout = rowToLayoutDefinition(layoutResult.rows[0]);
  const fields = await fetchLayoutFields(layoutId);

  return { ...layout, fields };
}

/**
 * Updates a layout definition's metadata (name, layout_type).
 *
 * @throws {Error} NOT_FOUND — layout or parent object does not exist
 * @throws {Error} VALIDATION_ERROR — invalid input
 * @throws {Error} CONFLICT — layout name already exists on this object
 */
export async function updateLayoutDefinition(
  objectId: string,
  layoutId: string,
  params: UpdateLayoutDefinitionParams,
): Promise<LayoutDefinition> {
  await assertObjectExists(objectId);

  const existing = await pool.query(
    'SELECT * FROM layout_definitions WHERE id = $1 AND object_id = $2',
    [layoutId, objectId],
  );

  if (existing.rows.length === 0) {
    throwNotFoundError('Layout definition not found');
  }

  // Validate changed fields
  if (params.name !== undefined) {
    const nameError = validateLayoutName(params.name);
    if (nameError) throwValidationError(nameError);

    // Check uniqueness of new name (excluding this layout)
    const dup = await pool.query(
      'SELECT id FROM layout_definitions WHERE object_id = $1 AND name = $2 AND id != $3',
      [objectId, params.name.trim(), layoutId],
    );
    if (dup.rows.length > 0) {
      throwConflictError(`A layout with name "${params.name.trim()}" already exists on this object`);
    }
  }

  if (params.layoutType !== undefined) {
    const typeError = validateLayoutType(params.layoutType);
    if (typeError) throwValidationError(typeError);
  }

  // Build dynamic update
  const updates: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if ('name' in params) {
    updates.push(`name = $${paramIndex++}`);
    values.push(params.name!.trim());
  }
  if ('layoutType' in params) {
    updates.push(`layout_type = $${paramIndex++}`);
    values.push(params.layoutType!.trim());
  }

  if (updates.length === 0) {
    return rowToLayoutDefinition(existing.rows[0]);
  }

  const now = new Date();
  updates.push(`updated_at = $${paramIndex++}`);
  values.push(now);

  values.push(layoutId);
  values.push(objectId);

  const result = await pool.query(
    `UPDATE layout_definitions SET ${updates.join(', ')} WHERE id = $${paramIndex++} AND object_id = $${paramIndex} RETURNING *`,
    values,
  );

  logger.info({ layoutId, objectId }, 'Layout definition updated');

  return rowToLayoutDefinition(result.rows[0]);
}

/**
 * Sets the layout field arrangement (full replacement).
 * Deletes all existing layout_fields for this layout, then inserts new ones
 * based on the provided sections.
 *
 * @throws {Error} NOT_FOUND — layout or parent object does not exist
 * @throws {Error} VALIDATION_ERROR — invalid section/field input
 */
export async function setLayoutFields(
  objectId: string,
  layoutId: string,
  sections: LayoutSectionInput[],
): Promise<LayoutDefinitionDetail> {
  await assertObjectExists(objectId);

  const layoutResult = await pool.query(
    'SELECT * FROM layout_definitions WHERE id = $1 AND object_id = $2',
    [layoutId, objectId],
  );

  if (layoutResult.rows.length === 0) {
    throwNotFoundError('Layout definition not found');
  }

  // Validate sections input
  if (!Array.isArray(sections)) {
    throwValidationError('sections must be an array');
  }

  // Collect all field IDs and validate they belong to this object
  const allFieldIds: string[] = [];
  for (const section of sections) {
    if (!Array.isArray(section.fields)) {
      throwValidationError('Each section must have a fields array');
    }
    for (const field of section.fields) {
      const fieldId = field.field_id ?? field.fieldId;
      if (!fieldId) {
        throwValidationError('Each field must have a field_id');
      }
      allFieldIds.push(fieldId);
    }
  }

  if (allFieldIds.length > 0) {
    // Verify all field IDs belong to this object
    const existingFields = await pool.query(
      'SELECT id FROM field_definitions WHERE object_id = $1',
      [objectId],
    );
    const existingIds = new Set(existingFields.rows.map((r: Record<string, unknown>) => r.id as string));

    for (const fieldId of allFieldIds) {
      if (!existingIds.has(fieldId)) {
        throwValidationError(`Field ID "${fieldId}" does not belong to this object`);
      }
    }

    // Check for duplicate field IDs
    const uniqueFieldIds = new Set(allFieldIds);
    if (uniqueFieldIds.size !== allFieldIds.length) {
      throwValidationError('Duplicate field IDs are not allowed in a layout');
    }
  }

  // Delete existing layout fields
  await pool.query(
    'DELETE FROM layout_fields WHERE layout_id = $1',
    [layoutId],
  );

  // Insert new layout fields
  for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex++) {
    const section = sections[sectionIndex];
    const sectionLabel = section.label?.trim() ?? null;

    for (let fieldIndex = 0; fieldIndex < section.fields.length; fieldIndex++) {
      const field = section.fields[fieldIndex];
      const fieldId = field.field_id ?? field.fieldId;

      await pool.query(
        `INSERT INTO layout_fields (id, layout_id, field_id, section, section_label, sort_order, width)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          randomUUID(),
          layoutId,
          fieldId,
          sectionIndex,
          sectionLabel,
          fieldIndex + 1,
          field.width ?? 'full',
        ],
      );
    }
  }

  // Update the layout's updated_at timestamp
  const now = new Date();
  await pool.query(
    'UPDATE layout_definitions SET updated_at = $1 WHERE id = $2',
    [now, layoutId],
  );

  logger.info({ layoutId, objectId, sectionCount: sections.length }, 'Layout fields updated');

  // Return the full layout with field metadata
  const layout = rowToLayoutDefinition({ ...layoutResult.rows[0], updated_at: now.toISOString() });
  const fields = await fetchLayoutFields(layoutId);

  return { ...layout, fields };
}

/**
 * Deletes a layout definition. Default layouts cannot be deleted.
 *
 * @throws {Error} NOT_FOUND — layout or parent object does not exist
 * @throws {Error} DELETE_BLOCKED — default layout
 */
export async function deleteLayoutDefinition(
  objectId: string,
  layoutId: string,
): Promise<void> {
  await assertObjectExists(objectId);

  const existing = await pool.query(
    'SELECT * FROM layout_definitions WHERE id = $1 AND object_id = $2',
    [layoutId, objectId],
  );

  if (existing.rows.length === 0) {
    throwNotFoundError('Layout definition not found');
  }

  const row = existing.rows[0] as Record<string, unknown>;

  if (row.is_default === true) {
    throwDeleteBlockedError('Cannot delete default layouts');
  }

  await pool.query('DELETE FROM layout_definitions WHERE id = $1', [layoutId]);

  logger.info({ layoutId, objectId }, 'Layout definition deleted');
}
