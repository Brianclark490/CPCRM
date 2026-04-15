import { randomUUID } from 'crypto';
import { sql, type Selectable, type Updateable } from 'kysely';
import { logger } from '../lib/logger.js';
import { db } from '../db/kysely.js';
import type {
  FieldDefinitions,
  LayoutDefinitions,
  ObjectDefinitions,
  RelationshipDefinitions,
} from '../db/kysely.types.js';

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

/**
 * Typing every row mapper against `Selectable<…>` means a renamed column
 * or changed nullability on the generated schema is a compile-time error
 * at the service, rather than an `unknown`/`any` cast leaking an
 * incorrect runtime shape into the domain model.
 */
type ObjectDefinitionSelectable = Selectable<ObjectDefinitions>;
type FieldDefinitionSelectable = Selectable<FieldDefinitions>;
type RelationshipDefinitionSelectable = Selectable<RelationshipDefinitions>;
type LayoutDefinitionSelectable = Selectable<LayoutDefinitions>;

function rowToObjectDefinition(row: ObjectDefinitionSelectable): ObjectDefinition {
  return {
    id: row.id,
    apiName: row.api_name,
    label: row.label,
    pluralLabel: row.plural_label,
    description: row.description ?? undefined,
    icon: row.icon ?? undefined,
    isSystem: row.is_system,
    nameFieldId: row.name_field_id ?? undefined,
    nameTemplate: row.name_template ?? undefined,
    sortOrder: row.sort_order ?? 0,
    ownerId: row.owner_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToFieldDefinition(row: FieldDefinitionSelectable): FieldDefinitionRow {
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

function rowToRelationshipDefinition(
  row: RelationshipDefinitionSelectable,
): RelationshipDefinitionRow {
  return {
    id: row.id,
    sourceObjectId: row.source_object_id,
    targetObjectId: row.target_object_id,
    relationshipType: row.relationship_type,
    apiName: row.api_name,
    label: row.label,
    reverseLabel: row.reverse_label ?? undefined,
    required: row.required,
    createdAt: row.created_at,
  };
}

function rowToLayoutDefinition(row: LayoutDefinitionSelectable): LayoutDefinitionRow {
  return {
    id: row.id,
    objectId: row.object_id,
    name: row.name,
    layoutType: row.layout_type,
    isDefault: row.is_default,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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
 * The entire operation (object, layouts, permissions) runs inside a
 * single Kysely transaction so it either fully succeeds or fully rolls
 * back — and crucially, all three inserts run on the same connection,
 * so the transaction BEGIN/COMMIT pair frames them correctly.
 *
 * @throws {Error} VALIDATION_ERROR — invalid input
 * @throws {Error} CONFLICT — api_name already exists
 */
export async function createObjectDefinition(
  tenantId: string,
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

  // Check uniqueness within tenant
  const existing = await db
    .selectFrom('object_definitions')
    .select('id')
    .where('tenant_id', '=', tenantId)
    .where('api_name', '=', apiName.trim())
    .executeTakeFirst();
  if (existing) {
    throwConflictError(`An object with api_name "${apiName.trim()}" already exists`);
  }

  // Determine the next sort_order value within tenant
  const maxRow = await db
    .selectFrom('object_definitions')
    .select(sql<string>`COALESCE(MAX(sort_order), 0)`.as('max_sort_order'))
    .where('tenant_id', '=', tenantId)
    .executeTakeFirstOrThrow();
  const nextSortOrder = (parseInt(maxRow.max_sort_order, 10) || 0) + 1;

  const objectId = randomUUID();
  const now = new Date();

  logger.info({ tenantId, objectId, apiName, ownerId }, 'Creating new object definition');

  const inserted = await db.transaction().execute(async (trx) => {
    const createdObject = await trx
      .insertInto('object_definitions')
      .values({
        id: objectId,
        tenant_id: tenantId,
        api_name: apiName.trim(),
        label: label.trim(),
        plural_label: pluralLabel.trim(),
        description: description?.trim() ?? null,
        icon: icon?.trim() ?? null,
        is_system: false,
        sort_order: nextSortOrder,
        owner_id: ownerId,
        created_at: now,
        updated_at: now,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    // Auto-create default layouts (form + list). The raw-pg
    // implementation omitted tenant_id here, which would have violated
    // the NOT NULL constraint on a real database — Kysely's generated
    // types catch that at compile time and force the tenant through.
    await trx
      .insertInto('layout_definitions')
      .values([
        {
          id: randomUUID(),
          tenant_id: tenantId,
          object_id: objectId,
          name: 'Default Form',
          layout_type: 'form',
          is_default: true,
          created_at: now,
          updated_at: now,
        },
        {
          id: randomUUID(),
          tenant_id: tenantId,
          object_id: objectId,
          name: 'List View',
          layout_type: 'list',
          is_default: true,
          created_at: now,
          updated_at: now,
        },
      ])
      .execute();

    // Auto-create default permissions for all four roles. Same latent
    // tenant_id fix as layout_definitions above — the original insert
    // omitted the column.
    await trx
      .insertInto('object_permissions')
      .values(
        DEFAULT_PERMISSIONS.map((p) => ({
          id: randomUUID(),
          tenant_id: tenantId,
          object_id: objectId,
          role: p.role,
          can_create: p.canCreate,
          can_read: p.canRead,
          can_update: p.canUpdate,
          can_delete: p.canDelete,
        })),
      )
      .execute();

    return createdObject;
  });

  logger.info({ objectId, apiName }, 'Object definition created with default layouts and permissions');

  return rowToObjectDefinition(inserted);
}

/**
 * Returns all object definitions with field count and record count.
 */
export async function listObjectDefinitions(
  tenantId: string,
): Promise<ObjectDefinitionListItem[]> {
  const rows = await db
    .selectFrom('object_definitions as od')
    .selectAll('od')
    .select([
      (eb) =>
        eb
          .selectFrom('field_definitions as fd')
          .select(sql<string>`COUNT(*)`.as('count'))
          .whereRef('fd.object_id', '=', 'od.id')
          .where('fd.tenant_id', '=', tenantId)
          .as('field_count'),
      (eb) =>
        eb
          .selectFrom('records as r')
          .select(sql<string>`COUNT(*)`.as('count'))
          .whereRef('r.object_id', '=', 'od.id')
          .where('r.tenant_id', '=', tenantId)
          .as('record_count'),
    ])
    .where('od.tenant_id', '=', tenantId)
    .orderBy('od.sort_order', 'asc')
    .orderBy('od.created_at', 'asc')
    .execute();

  return rows.map((row) => ({
    ...rowToObjectDefinition(row),
    fieldCount: parseInt(row.field_count ?? '0', 10) || 0,
    recordCount: parseInt(row.record_count ?? '0', 10) || 0,
  }));
}

/**
 * Returns a single object definition by ID with nested fields, relationships, and layouts.
 * Returns null if not found.
 */
export async function getObjectDefinitionById(
  tenantId: string,
  id: string,
): Promise<ObjectDefinitionDetail | null> {
  const objectRow = await db
    .selectFrom('object_definitions')
    .selectAll()
    .where('id', '=', id)
    .where('tenant_id', '=', tenantId)
    .executeTakeFirst();

  if (!objectRow) return null;

  const objectDef = rowToObjectDefinition(objectRow);

  // Fetch fields, relationships (source or target), and layouts in parallel
  const [fieldRows, relationshipRows, layoutRows] = await Promise.all([
    db
      .selectFrom('field_definitions')
      .selectAll()
      .where('object_id', '=', id)
      .where('tenant_id', '=', tenantId)
      .orderBy('sort_order', 'asc')
      .execute(),
    db
      .selectFrom('relationship_definitions')
      .selectAll()
      .where((eb) =>
        eb.or([
          eb('source_object_id', '=', id),
          eb('target_object_id', '=', id),
        ]),
      )
      .where('tenant_id', '=', tenantId)
      .execute(),
    db
      .selectFrom('layout_definitions')
      .selectAll()
      .where('object_id', '=', id)
      .where('tenant_id', '=', tenantId)
      .orderBy('layout_type', 'asc')
      .orderBy('name', 'asc')
      .execute(),
  ]);

  return {
    ...objectDef,
    fields: fieldRows.map(rowToFieldDefinition),
    relationships: relationshipRows.map(rowToRelationshipDefinition),
    layouts: layoutRows.map(rowToLayoutDefinition),
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
  tenantId: string,
  id: string,
  params: UpdateObjectDefinitionParams,
): Promise<ObjectDefinition> {
  const existingRow = await db
    .selectFrom('object_definitions')
    .selectAll()
    .where('id', '=', id)
    .where('tenant_id', '=', tenantId)
    .executeTakeFirst();

  if (!existingRow) {
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

  // Build a typed update object so Kysely enforces the column/value
  // contract from the generated schema. Only defined values are
  // included — `undefined` on the params object is treated as
  // "leave unchanged".
  const updates: Updateable<ObjectDefinitions> = {};
  if (params.label !== undefined) updates.label = params.label.trim();
  if (params.pluralLabel !== undefined) updates.plural_label = params.pluralLabel.trim();
  if (params.description !== undefined)
    updates.description = params.description?.trim() ?? null;
  if (params.icon !== undefined) updates.icon = params.icon?.trim() ?? null;

  if (Object.keys(updates).length === 0) {
    // Nothing to update — return the existing object
    return rowToObjectDefinition(existingRow);
  }

  updates.updated_at = new Date();

  const updated = await db
    .updateTable('object_definitions')
    .set(updates)
    .where('id', '=', id)
    .where('tenant_id', '=', tenantId)
    .returningAll()
    .executeTakeFirstOrThrow();

  logger.info({ objectId: id }, 'Object definition updated');

  return rowToObjectDefinition(updated);
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
export async function deleteObjectDefinition(tenantId: string, id: string): Promise<void> {
  const existingRow = await db
    .selectFrom('object_definitions')
    .selectAll()
    .where('id', '=', id)
    .where('tenant_id', '=', tenantId)
    .executeTakeFirst();

  if (!existingRow) {
    throwNotFoundError('Object definition not found');
  }

  if (existingRow.is_system === true) {
    throwDeleteBlockedError('Cannot delete system objects');
  }

  // Check if records exist for this object
  const recordCountRow = await db
    .selectFrom('records')
    .select(sql<string>`COUNT(*)`.as('count'))
    .where('object_id', '=', id)
    .where('tenant_id', '=', tenantId)
    .executeTakeFirstOrThrow();
  const count = parseInt(recordCountRow.count, 10);
  if (count > 0) {
    throwDeleteBlockedError('Delete all records first');
  }

  await db
    .deleteFrom('object_definitions')
    .where('id', '=', id)
    .where('tenant_id', '=', tenantId)
    .execute();

  logger.info({ objectId: id }, 'Object definition deleted');
}

/**
 * Reorders object definitions by setting sort_order for each ID in the provided list.
 * The position in the array determines the new sort_order (1-based).
 *
 * @throws {Error} VALIDATION_ERROR — empty or invalid list
 */
const MAX_REORDER_IDS = 500;

export async function reorderObjectDefinitions(
  tenantId: string,
  orderedIds: string[],
): Promise<void> {
  if (
    !Array.isArray(orderedIds) ||
    orderedIds.length === 0 ||
    orderedIds.length > MAX_REORDER_IDS
  ) {
    throwValidationError(
      `orderedIds must be a non-empty array of object definition IDs (max ${MAX_REORDER_IDS})`,
    );
  }

  const safeLength = Math.min(orderedIds.length, MAX_REORDER_IDS);

  // Validate all entries are non-empty strings
  for (const id of orderedIds) {
    if (typeof id !== 'string' || id.trim().length === 0) {
      throwValidationError('Each entry in orderedIds must be a non-empty string');
    }
  }

  // Reorder in a single atomic UPDATE using a CASE expression so we
  // avoid N sequential round-trips (safeLength can be up to 500).
  // A single statement is already atomic, so no explicit transaction
  // is needed.
  const idsToReorder = orderedIds.slice(0, safeLength);
  const now = new Date();

  const sortOrderCase = sql<number>`case ${sql.ref('id')} ${sql.join(
    idsToReorder.map((id, index) => sql`when ${id} then ${index + 1}`),
    sql` `,
  )} end`;

  await db
    .updateTable('object_definitions')
    .set({
      sort_order: sortOrderCase,
      updated_at: now,
    })
    .where('tenant_id', '=', tenantId)
    .where('id', 'in', idsToReorder)
    .execute();

  logger.info({ count: safeLength }, 'Object definitions reordered');
}
