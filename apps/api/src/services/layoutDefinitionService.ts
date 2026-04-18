import { randomUUID } from 'crypto';
import type { Selectable, Updateable } from 'kysely';
import { logger } from '../lib/logger.js';
import { db } from '../db/kysely.js';
import type { LayoutDefinitions } from '../db/kysely.types.js';

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

function rowToLayoutDefinition(row: Selectable<LayoutDefinitions>): LayoutDefinition {
  return {
    id: row.id,
    objectId: row.object_id,
    name: row.name,
    layoutType: row.layout_type,
    isDefault: row.is_default,
    createdAt: row.created_at instanceof Date ? row.created_at : new Date(row.created_at as unknown as string),
    updatedAt: row.updated_at instanceof Date ? row.updated_at : new Date(row.updated_at as unknown as string),
  };
}

interface LayoutFieldJoinedRow {
  id: string;
  layout_id: string;
  field_id: string;
  section: number;
  section_label: string | null;
  sort_order: number;
  width: string | null;
  field_api_name: string;
  field_label: string;
  field_type: string;
  field_required: boolean;
  field_options: Record<string, unknown> | null;
}

function rowToLayoutFieldWithMetadata(row: LayoutFieldJoinedRow): LayoutFieldWithMetadata {
  return {
    id: row.id,
    layoutId: row.layout_id,
    fieldId: row.field_id,
    section: row.section,
    sectionLabel: row.section_label ?? undefined,
    sortOrder: row.sort_order,
    width: row.width ?? 'full',
    fieldApiName: row.field_api_name,
    fieldLabel: row.field_label,
    fieldType: row.field_type,
    fieldRequired: row.field_required,
    fieldOptions: row.field_options ?? {},
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

async function fetchLayoutFields(tenantId: string, layoutId: string): Promise<LayoutFieldWithMetadata[]> {
  const rows = await db
    .selectFrom('layout_fields as lf')
    .innerJoin('field_definitions as fd', (join) =>
      join.onRef('fd.id', '=', 'lf.field_id').on('fd.tenant_id', '=', tenantId),
    )
    .where('lf.layout_id', '=', layoutId)
    .where('lf.tenant_id', '=', tenantId)
    .select([
      'lf.id',
      'lf.layout_id',
      'lf.field_id',
      'lf.section',
      'lf.section_label',
      'lf.sort_order',
      'lf.width',
      'fd.api_name as field_api_name',
      'fd.label as field_label',
      'fd.field_type as field_type',
      'fd.required as field_required',
      'fd.options as field_options',
    ])
    .orderBy('lf.section', 'asc')
    .orderBy('lf.sort_order', 'asc')
    .execute();

  return rows.map((row) => rowToLayoutFieldWithMetadata(row as unknown as LayoutFieldJoinedRow));
}

// ─── Service functions ───────────────────────────────────────────────────────

export async function createLayoutDefinition(
  tenantId: string,
  objectId: string,
  params: CreateLayoutDefinitionParams,
): Promise<LayoutDefinition> {
  await assertObjectExists(tenantId, objectId);

  const nameError = validateLayoutName(params.name);
  if (nameError) throwValidationError(nameError);

  const typeError = validateLayoutType(params.layoutType);
  if (typeError) throwValidationError(typeError);

  const existing = await db
    .selectFrom('layout_definitions')
    .select('id')
    .where('object_id', '=', objectId)
    .where('name', '=', params.name.trim())
    .where('tenant_id', '=', tenantId)
    .executeTakeFirst();
  if (existing) {
    throwConflictError(`A layout with name "${params.name.trim()}" already exists on this object`);
  }

  const layoutId = randomUUID();
  const now = new Date();

  const row = await db
    .insertInto('layout_definitions')
    .values({
      id: layoutId,
      tenant_id: tenantId,
      object_id: objectId,
      name: params.name.trim(),
      layout_type: params.layoutType.trim(),
      is_default: params.isDefault ?? false,
      created_at: now,
      updated_at: now,
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  logger.info({ layoutId, objectId, name: params.name }, 'Layout definition created');

  return rowToLayoutDefinition(row);
}

export async function listLayoutDefinitions(
  tenantId: string,
  objectId: string,
): Promise<LayoutDefinition[]> {
  await assertObjectExists(tenantId, objectId);

  const rows = await db
    .selectFrom('layout_definitions')
    .selectAll()
    .where('object_id', '=', objectId)
    .where('tenant_id', '=', tenantId)
    .orderBy('layout_type', 'asc')
    .orderBy('name', 'asc')
    .execute();

  return rows.map(rowToLayoutDefinition);
}

export async function getLayoutDefinitionById(
  tenantId: string,
  objectId: string,
  layoutId: string,
): Promise<LayoutDefinitionDetail> {
  await assertObjectExists(tenantId, objectId);

  const row = await db
    .selectFrom('layout_definitions')
    .selectAll()
    .where('id', '=', layoutId)
    .where('object_id', '=', objectId)
    .where('tenant_id', '=', tenantId)
    .executeTakeFirst();

  if (!row) {
    throwNotFoundError('Layout definition not found');
  }

  const layout = rowToLayoutDefinition(row);
  const fields = await fetchLayoutFields(tenantId, layoutId);

  return { ...layout, fields };
}

export async function updateLayoutDefinition(
  tenantId: string,
  objectId: string,
  layoutId: string,
  params: UpdateLayoutDefinitionParams,
): Promise<LayoutDefinition> {
  await assertObjectExists(tenantId, objectId);

  const existing = await db
    .selectFrom('layout_definitions')
    .selectAll()
    .where('id', '=', layoutId)
    .where('object_id', '=', objectId)
    .where('tenant_id', '=', tenantId)
    .executeTakeFirst();

  if (!existing) {
    throwNotFoundError('Layout definition not found');
  }

  if (params.name !== undefined) {
    const nameError = validateLayoutName(params.name);
    if (nameError) throwValidationError(nameError);

    const dup = await db
      .selectFrom('layout_definitions')
      .select('id')
      .where('object_id', '=', objectId)
      .where('name', '=', params.name.trim())
      .where('id', '!=', layoutId)
      .where('tenant_id', '=', tenantId)
      .executeTakeFirst();
    if (dup) {
      throwConflictError(`A layout with name "${params.name.trim()}" already exists on this object`);
    }
  }

  if (params.layoutType !== undefined) {
    const typeError = validateLayoutType(params.layoutType);
    if (typeError) throwValidationError(typeError);
  }

  const patch: Updateable<LayoutDefinitions> = {};
  if ('name' in params) {
    patch.name = params.name!.trim();
  }
  if ('layoutType' in params) {
    patch.layout_type = params.layoutType!.trim();
  }

  if (Object.keys(patch).length === 0) {
    return rowToLayoutDefinition(existing);
  }

  patch.updated_at = new Date();

  const row = await db
    .updateTable('layout_definitions')
    .set(patch)
    .where('id', '=', layoutId)
    .where('object_id', '=', objectId)
    .where('tenant_id', '=', tenantId)
    .returningAll()
    .executeTakeFirstOrThrow();

  logger.info({ layoutId, objectId }, 'Layout definition updated');

  return rowToLayoutDefinition(row);
}

export async function setLayoutFields(
  tenantId: string,
  objectId: string,
  layoutId: string,
  sections: LayoutSectionInput[],
): Promise<LayoutDefinitionDetail> {
  await assertObjectExists(tenantId, objectId);

  const layoutRow = await db
    .selectFrom('layout_definitions')
    .selectAll()
    .where('id', '=', layoutId)
    .where('object_id', '=', objectId)
    .where('tenant_id', '=', tenantId)
    .executeTakeFirst();

  if (!layoutRow) {
    throwNotFoundError('Layout definition not found');
  }

  if (!Array.isArray(sections)) {
    throwValidationError('sections must be an array');
  }

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
    const existingFields = await db
      .selectFrom('field_definitions')
      .select('id')
      .where('object_id', '=', objectId)
      .where('tenant_id', '=', tenantId)
      .execute();
    const existingIds = new Set(existingFields.map((r) => r.id));

    for (const fieldId of allFieldIds) {
      if (!existingIds.has(fieldId)) {
        throwValidationError(`Field ID "${fieldId}" does not belong to this object`);
      }
    }

    const uniqueFieldIds = new Set(allFieldIds);
    if (uniqueFieldIds.size !== allFieldIds.length) {
      throwValidationError('Duplicate field IDs are not allowed in a layout');
    }
  }

  await db
    .deleteFrom('layout_fields')
    .where('layout_id', '=', layoutId)
    .where('tenant_id', '=', tenantId)
    .execute();

  for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex++) {
    const section = sections[sectionIndex];
    const sectionLabel = section.label?.trim() ?? null;

    for (let fieldIndex = 0; fieldIndex < section.fields.length; fieldIndex++) {
      const field = section.fields[fieldIndex];
      const fieldId = field.field_id ?? field.fieldId;

      await db
        .insertInto('layout_fields')
        .values({
          id: randomUUID(),
          tenant_id: tenantId,
          layout_id: layoutId,
          field_id: fieldId!,
          section: sectionIndex,
          section_label: sectionLabel,
          sort_order: fieldIndex + 1,
          width: field.width ?? 'full',
        })
        .execute();
    }
  }

  const now = new Date();
  await db
    .updateTable('layout_definitions')
    .set({ updated_at: now })
    .where('id', '=', layoutId)
    .where('tenant_id', '=', tenantId)
    .execute();

  logger.info({ layoutId, objectId, sectionCount: sections.length }, 'Layout fields updated');

  const layout = rowToLayoutDefinition({ ...layoutRow, updated_at: now });
  const fields = await fetchLayoutFields(tenantId, layoutId);

  return { ...layout, fields };
}

export async function deleteLayoutDefinition(
  tenantId: string,
  objectId: string,
  layoutId: string,
): Promise<void> {
  await assertObjectExists(tenantId, objectId);

  const existing = await db
    .selectFrom('layout_definitions')
    .selectAll()
    .where('id', '=', layoutId)
    .where('object_id', '=', objectId)
    .where('tenant_id', '=', tenantId)
    .executeTakeFirst();

  if (!existing) {
    throwNotFoundError('Layout definition not found');
  }

  if (existing.is_default === true) {
    throwDeleteBlockedError('Cannot delete default layouts');
  }

  await db
    .deleteFrom('layout_definitions')
    .where('id', '=', layoutId)
    .where('tenant_id', '=', tenantId)
    .execute();

  logger.info({ layoutId, objectId }, 'Layout definition deleted');
}
