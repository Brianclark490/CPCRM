import { randomUUID } from 'crypto';
import { logger } from '../lib/logger.js';
import { pool } from '../db/client.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ObjectDefinition {
  id: string;
  apiName: string;
  label: string;
  pluralLabel: string;
  description?: string;
  icon?: string;
  isSystem: boolean;
  nameFieldId?: string;
  nameTemplate?: string;
  sortOrder: number;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ObjectDefinitionListItem extends ObjectDefinition {
  fieldCount: number;
  recordCount: number;
}

export interface FieldDefinitionRow {
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

export interface RelationshipDefinitionRow {
  id: string;
  sourceObjectId: string;
  targetObjectId: string;
  relationshipType: string;
  apiName: string;
  label: string;
  reverseLabel?: string;
  required: boolean;
  createdAt: Date;
}

export interface LayoutDefinitionRow {
  id: string;
  objectId: string;
  name: string;
  layoutType: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ObjectDefinitionDetail extends ObjectDefinition {
  fields: FieldDefinitionRow[];
  relationships: RelationshipDefinitionRow[];
  layouts: LayoutDefinitionRow[];
}

export interface CreateObjectDefinitionParams {
  apiName: string;
  label: string;
  pluralLabel: string;
  description?: string;
  icon?: string;
  ownerId: string;
}

export interface UpdateObjectDefinitionParams {
  label?: string;
  pluralLabel?: string;
  description?: string | null;
  icon?: string | null;
}

// ─── Reserved words ───────────────────────────────────────────────────────────

const RESERVED_WORDS = new Set([
  'id', 'name', 'type', 'object', 'record', 'field', 'layout',
  'relationship', 'system', 'admin', 'api', 'user', 'tenant',
  'schema', 'table', 'column', 'index', 'select', 'insert',
  'update', 'delete', 'from', 'where', 'null', 'true', 'false',
]);

// ─── Validation ───────────────────────────────────────────────────────────────

const SNAKE_CASE_RE = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;

export function validateApiName(apiName: unknown): string | null {
  if (typeof apiName !== 'string' || apiName.trim().length === 0) {
    return 'api_name is required';
  }
  const trimmed = apiName.trim();
  if (trimmed.length < 3 || trimmed.length > 50) {
    return 'api_name must be between 3 and 50 characters';
  }
  if (!SNAKE_CASE_RE.test(trimmed)) {
    return 'api_name must be lowercase snake_case (e.g. "custom_project")';
  }
  if (RESERVED_WORDS.has(trimmed)) {
    return `api_name "${trimmed}" is a reserved word`;
  }
  return null;
}

export function validateLabel(label: unknown): string | null {
  if (typeof label !== 'string' || label.trim().length === 0) {
    return 'label is required';
  }
  if (label.trim().length > 255) {
    return 'label must be 255 characters or fewer';
  }
  return null;
}

export function validatePluralLabel(pluralLabel: unknown): string | null {
  if (typeof pluralLabel !== 'string' || pluralLabel.trim().length === 0) {
    return 'plural_label is required';
  }
  if (pluralLabel.trim().length > 255) {
    return 'plural_label must be 255 characters or fewer';
  }
  return null;
}

// ─── Row → domain model ──────────────────────────────────────────────────────

function rowToObjectDefinition(row: Record<string, unknown>): ObjectDefinition {
  return {
    id: row.id as string,
    apiName: row.api_name as string,
    label: row.label as string,
    pluralLabel: row.plural_label as string,
    description: (row.description as string | null) ?? undefined,
    icon: (row.icon as string | null) ?? undefined,
    isSystem: row.is_system as boolean,
    nameFieldId: (row.name_field_id as string | null) ?? undefined,
    nameTemplate: (row.name_template as string | null) ?? undefined,
    sortOrder: (row.sort_order as number) ?? 0,
    ownerId: row.owner_id as string,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

function rowToFieldDefinition(row: Record<string, unknown>): FieldDefinitionRow {
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

function rowToRelationshipDefinition(row: Record<string, unknown>): RelationshipDefinitionRow {
  return {
    id: row.id as string,
    sourceObjectId: row.source_object_id as string,
    targetObjectId: row.target_object_id as string,
    relationshipType: row.relationship_type as string,
    apiName: row.api_name as string,
    label: row.label as string,
    reverseLabel: (row.reverse_label as string | null) ?? undefined,
    required: row.required as boolean,
    createdAt: new Date(row.created_at as string),
  };
}

function rowToLayoutDefinition(row: Record<string, unknown>): LayoutDefinitionRow {
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

// ─── Service functions ────────────────────────────────────────────────────────

/**
 * Default permission matrix applied to every new object definition.
 * One row per role, inserted atomically with the object itself.
 */
const DEFAULT_PERMISSIONS: ReadonlyArray<{
  role: string;
  canCreate: boolean;
  canRead: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}> = [
  { role: 'admin',     canCreate: true,  canRead: true,  canUpdate: true,  canDelete: true },
  { role: 'manager',   canCreate: true,  canRead: true,  canUpdate: true,  canDelete: false },
  { role: 'user',      canCreate: true,  canRead: true,  canUpdate: true,  canDelete: false },
  { role: 'read_only', canCreate: false, canRead: true,  canUpdate: false, canDelete: false },
];

/**
 * Creates a new object definition with default layouts and default permissions.
 *
 * The entire operation (object, layouts, permissions) is wrapped in a
 * database transaction so it either fully succeeds or fully rolls back.
 *
 * @throws {Error} VALIDATION_ERROR — invalid input
 * @throws {Error} CONFLICT — api_name already exists
 */
export async function createObjectDefinition(
  params: CreateObjectDefinitionParams,
): Promise<ObjectDefinition> {
  const { apiName, label, pluralLabel, description, icon, ownerId } = params;

  // Validate
  const apiNameError = validateApiName(apiName);
  if (apiNameError) throwValidationError(apiNameError);

  const labelError = validateLabel(label);
  if (labelError) throwValidationError(labelError);

  const pluralLabelError = validatePluralLabel(pluralLabel);
  if (pluralLabelError) throwValidationError(pluralLabelError);

  // Check uniqueness
  const existing = await pool.query(
    'SELECT id FROM object_definitions WHERE api_name = $1',
    [apiName.trim()],
  );
  if (existing.rows.length > 0) {
    throwConflictError(`An object with api_name "${apiName.trim()}" already exists`);
  }

  const objectId = randomUUID();
  const now = new Date();

  // Determine the next sort_order value
  const maxResult = await pool.query(
    'SELECT COALESCE(MAX(sort_order), 0) AS max_sort_order FROM object_definitions',
  );
  const nextSortOrder = (parseInt(maxResult.rows[0].max_sort_order as string, 10) || 0) + 1;

  logger.info({ objectId, apiName, ownerId }, 'Creating new object definition');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query(
      `INSERT INTO object_definitions
         (id, api_name, label, plural_label, description, icon, is_system, sort_order, owner_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        objectId,
        apiName.trim(),
        label.trim(),
        pluralLabel.trim(),
        description?.trim() ?? null,
        icon?.trim() ?? null,
        false,
        nextSortOrder,
        ownerId,
        now,
        now,
      ],
    );

    // Auto-create default layouts (form + list)
    const formLayoutId = randomUUID();
    const listLayoutId = randomUUID();

    await client.query(
      `INSERT INTO layout_definitions (id, object_id, name, layout_type, is_default, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7), ($8, $9, $10, $11, $12, $13, $14)`,
      [
        formLayoutId, objectId, 'Default Form', 'form', true, now, now,
        listLayoutId, objectId, 'List View', 'list', true, now, now,
      ],
    );

    // Auto-create default permissions for all four roles
    const permValues: unknown[] = [];
    const permPlaceholders: string[] = [];
    for (let i = 0; i < DEFAULT_PERMISSIONS.length; i++) {
      const p = DEFAULT_PERMISSIONS[i];
      const offset = i * 7;
      permPlaceholders.push(
        `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7})`,
      );
      permValues.push(randomUUID(), objectId, p.role, p.canCreate, p.canRead, p.canUpdate, p.canDelete);
    }

    await client.query(
      `INSERT INTO object_permissions (id, object_id, role, can_create, can_read, can_update, can_delete)
       VALUES ${permPlaceholders.join(', ')}`,
      permValues,
    );

    await client.query('COMMIT');

    logger.info({ objectId, apiName }, 'Object definition created with default layouts and permissions');

    return rowToObjectDefinition(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Returns all object definitions with field count and record count.
 */
export async function listObjectDefinitions(): Promise<ObjectDefinitionListItem[]> {
  const result = await pool.query(
    `SELECT od.*,
            (SELECT COUNT(*) FROM field_definitions fd WHERE fd.object_id = od.id) AS field_count,
            (SELECT COUNT(*) FROM records r WHERE r.object_id = od.id) AS record_count
     FROM object_definitions od
     ORDER BY od.sort_order ASC, od.created_at ASC`,
  );

  return result.rows.map((row: Record<string, unknown>) => ({
    ...rowToObjectDefinition(row),
    fieldCount: parseInt(row.field_count as string, 10) || 0,
    recordCount: parseInt(row.record_count as string, 10) || 0,
  }));
}

/**
 * Returns a single object definition by ID with nested fields, relationships, and layouts.
 * Returns null if not found.
 */
export async function getObjectDefinitionById(
  id: string,
): Promise<ObjectDefinitionDetail | null> {
  const objectResult = await pool.query(
    'SELECT * FROM object_definitions WHERE id = $1',
    [id],
  );

  if (objectResult.rows.length === 0) return null;

  const objectDef = rowToObjectDefinition(objectResult.rows[0]);

  // Fetch fields, relationships (source or target), and layouts in parallel
  const [fieldsResult, relationshipsResult, layoutsResult] = await Promise.all([
    pool.query(
      'SELECT * FROM field_definitions WHERE object_id = $1 ORDER BY sort_order ASC',
      [id],
    ),
    pool.query(
      'SELECT * FROM relationship_definitions WHERE source_object_id = $1 OR target_object_id = $1',
      [id],
    ),
    pool.query(
      'SELECT * FROM layout_definitions WHERE object_id = $1 ORDER BY layout_type ASC, name ASC',
      [id],
    ),
  ]);

  return {
    ...objectDef,
    fields: fieldsResult.rows.map(rowToFieldDefinition),
    relationships: relationshipsResult.rows.map(rowToRelationshipDefinition),
    layouts: layoutsResult.rows.map(rowToLayoutDefinition),
  };
}

/**
 * Updates an existing object definition.
 * System objects cannot have their api_name changed (but label/description/icon can be updated).
 *
 * @throws {Error} NOT_FOUND — object does not exist
 * @throws {Error} VALIDATION_ERROR — invalid input
 */
export async function updateObjectDefinition(
  id: string,
  params: UpdateObjectDefinitionParams,
): Promise<ObjectDefinition> {
  const existing = await pool.query(
    'SELECT * FROM object_definitions WHERE id = $1',
    [id],
  );

  if (existing.rows.length === 0) {
    throwNotFoundError('Object definition not found');
  }

  // Validate fields being changed
  if (params.label !== undefined) {
    const labelError = validateLabel(params.label);
    if (labelError) throwValidationError(labelError);
  }

  if (params.pluralLabel !== undefined) {
    const pluralLabelError = validatePluralLabel(params.pluralLabel);
    if (pluralLabelError) throwValidationError(pluralLabelError);
  }

  // Build dynamic update
  const updates: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if ('label' in params) {
    updates.push(`label = $${paramIndex++}`);
    values.push(params.label!.trim());
  }
  if ('pluralLabel' in params) {
    updates.push(`plural_label = $${paramIndex++}`);
    values.push(params.pluralLabel!.trim());
  }
  if ('description' in params) {
    updates.push(`description = $${paramIndex++}`);
    values.push(params.description?.trim() ?? null);
  }
  if ('icon' in params) {
    updates.push(`icon = $${paramIndex++}`);
    values.push(params.icon?.trim() ?? null);
  }

  if (updates.length === 0) {
    // Nothing to update — return the existing object
    return rowToObjectDefinition(existing.rows[0]);
  }

  const now = new Date();
  updates.push(`updated_at = $${paramIndex++}`);
  values.push(now);

  values.push(id);

  const result = await pool.query(
    `UPDATE object_definitions SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    values,
  );

  logger.info({ objectId: id }, 'Object definition updated');

  return rowToObjectDefinition(result.rows[0]);
}

/**
 * Deletes an object definition.
 * Rejects if the object is a system object or if records exist for it.
 * Cascades to field_definitions, relationship_definitions, and layout_definitions
 * via the ON DELETE CASCADE foreign keys.
 *
 * @throws {Error} NOT_FOUND — object does not exist
 * @throws {Error} DELETE_BLOCKED — object is a system object or has records
 */
export async function deleteObjectDefinition(id: string): Promise<void> {
  const existing = await pool.query(
    'SELECT * FROM object_definitions WHERE id = $1',
    [id],
  );

  if (existing.rows.length === 0) {
    throwNotFoundError('Object definition not found');
  }

  const row = existing.rows[0] as Record<string, unknown>;

  if (row.is_system === true) {
    throwDeleteBlockedError('Cannot delete system objects');
  }

  // Check if records exist for this object
  const recordCount = await pool.query(
    'SELECT COUNT(*) AS count FROM records WHERE object_id = $1',
    [id],
  );
  const count = parseInt(recordCount.rows[0].count as string, 10);
  if (count > 0) {
    throwDeleteBlockedError('Delete all records first');
  }

  await pool.query('DELETE FROM object_definitions WHERE id = $1', [id]);

  logger.info({ objectId: id }, 'Object definition deleted');
}

/**
 * Reorders object definitions by setting sort_order for each ID in the provided list.
 * The position in the array determines the new sort_order (1-based).
 *
 * @throws {Error} VALIDATION_ERROR — empty or invalid list
 */
export async function reorderObjectDefinitions(orderedIds: string[]): Promise<void> {
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    throwValidationError('orderedIds must be a non-empty array of object definition IDs');
  }

  // Validate all entries are non-empty strings
  for (const id of orderedIds) {
    if (typeof id !== 'string' || id.trim().length === 0) {
      throwValidationError('Each entry in orderedIds must be a non-empty string');
    }
  }

  // Build a single UPDATE using a VALUES list for efficiency
  const values: unknown[] = [];
  const placeholders: string[] = [];
  for (let i = 0; i < orderedIds.length; i++) {
    const paramId = i * 2 + 1;
    const paramOrder = i * 2 + 2;
    placeholders.push(`($${paramId}::uuid, $${paramOrder}::integer)`);
    values.push(orderedIds[i], i + 1);
  }

  await pool.query(
    `UPDATE object_definitions AS od
     SET sort_order = v.new_order, updated_at = NOW()
     FROM (VALUES ${placeholders.join(', ')}) AS v(id, new_order)
     WHERE od.id = v.id`,
    values,
  );

  logger.info({ count: orderedIds.length }, 'Object definitions reordered');
}
