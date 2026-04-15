import { randomUUID } from 'crypto';
import type { Selectable } from 'kysely';
import { logger } from '../lib/logger.js';
import { db } from '../db/kysely.js';
import type {
  ObjectDefinitions,
  RelationshipDefinitions,
} from '../db/kysely.types.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RelationshipDefinition {
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

export interface RelationshipDefinitionWithObjects extends RelationshipDefinition {
  sourceObjectApiName: string;
  sourceObjectLabel: string;
  sourceObjectPluralLabel: string;
  targetObjectApiName: string;
  targetObjectLabel: string;
  targetObjectPluralLabel: string;
}

export interface CreateRelationshipDefinitionParams {
  sourceObjectId: string;
  targetObjectId: string;
  relationshipType: string;
  apiName: string;
  label: string;
  reverseLabel?: string;
  required?: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ALLOWED_RELATIONSHIP_TYPES = new Set(['lookup', 'parent_child']);

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

/**
 * Typing the row mapper against `Selectable<RelationshipDefinitions>`
 * (rather than `Record<string, unknown>`) means a column rename or
 * nullability change on the generated schema becomes a compile-time
 * error at this service, rather than an `unknown` cast leaking an
 * incorrect runtime shape into the domain model.
 */
type RelationshipDefinitionSelectable = Selectable<RelationshipDefinitions>;

function rowToRelationshipDefinition(
  row: RelationshipDefinitionSelectable,
): RelationshipDefinition {
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

/**
 * The list query projects relationship_definitions columns plus six
 * aliased object_definitions columns (three for the source, three for
 * the target). We type that composite row explicitly so the mapper
 * stays fully type-checked against the generated schema.
 */
type RelationshipDefinitionWithObjectsRow = RelationshipDefinitionSelectable & {
  source_object_api_name: Selectable<ObjectDefinitions>['api_name'];
  source_object_label: Selectable<ObjectDefinitions>['label'];
  source_object_plural_label: Selectable<ObjectDefinitions>['plural_label'];
  target_object_api_name: Selectable<ObjectDefinitions>['api_name'];
  target_object_label: Selectable<ObjectDefinitions>['label'];
  target_object_plural_label: Selectable<ObjectDefinitions>['plural_label'];
};

function rowToRelationshipDefinitionWithObjects(
  row: RelationshipDefinitionWithObjectsRow,
): RelationshipDefinitionWithObjects {
  return {
    ...rowToRelationshipDefinition(row),
    sourceObjectApiName: row.source_object_api_name,
    sourceObjectLabel: row.source_object_label,
    sourceObjectPluralLabel: row.source_object_plural_label,
    targetObjectApiName: row.target_object_api_name,
    targetObjectLabel: row.target_object_label,
    targetObjectPluralLabel: row.target_object_plural_label,
  };
}

// ─── Validation ──────────────────────────────────────────────────────────────

export function validateRelationshipApiName(apiName: unknown): string | null {
  if (typeof apiName !== 'string' || apiName.trim().length === 0) {
    return 'api_name is required';
  }
  const trimmed = apiName.trim();
  if (trimmed.length < 3 || trimmed.length > 100) {
    return 'api_name must be between 3 and 100 characters';
  }
  if (!SNAKE_CASE_RE.test(trimmed)) {
    return 'api_name must be lowercase snake_case (e.g. "opportunity_account")';
  }
  return null;
}

export function validateRelationshipLabel(label: unknown): string | null {
  if (typeof label !== 'string' || label.trim().length === 0) {
    return 'label is required';
  }
  if (label.trim().length > 255) {
    return 'label must be 255 characters or fewer';
  }
  return null;
}

export function validateRelationshipType(relationshipType: unknown): string | null {
  if (typeof relationshipType !== 'string' || relationshipType.trim().length === 0) {
    return 'relationship_type is required';
  }
  if (!ALLOWED_RELATIONSHIP_TYPES.has(relationshipType.trim())) {
    return `relationship_type must be one of: ${[...ALLOWED_RELATIONSHIP_TYPES].join(', ')}`;
  }
  return null;
}

// ─── Service functions ───────────────────────────────────────────────────────

/**
 * Creates a new relationship definition between two objects.
 *
 * @throws {Error} VALIDATION_ERROR — invalid input
 * @throws {Error} NOT_FOUND — source or target object does not exist
 * @throws {Error} CONFLICT — duplicate api_name on the same source object
 */
export async function createRelationshipDefinition(
  tenantId: string,
  params: CreateRelationshipDefinitionParams,
): Promise<RelationshipDefinition> {
  // Validate inputs
  if (!params.sourceObjectId) {
    throwValidationError('source_object_id is required');
  }
  if (!params.targetObjectId) {
    throwValidationError('target_object_id is required');
  }

  const apiNameError = validateRelationshipApiName(params.apiName);
  if (apiNameError) throwValidationError(apiNameError);

  const labelError = validateRelationshipLabel(params.label);
  if (labelError) throwValidationError(labelError);

  const typeError = validateRelationshipType(params.relationshipType);
  if (typeError) throwValidationError(typeError);

  if (params.reverseLabel !== undefined) {
    if (typeof params.reverseLabel !== 'string' || params.reverseLabel.trim().length === 0) {
      throwValidationError('reverse_label must be a non-empty string when provided');
    }
    if (params.reverseLabel.trim().length > 255) {
      throwValidationError('reverse_label must be 255 characters or fewer');
    }
  }

  // Validate both objects exist within tenant
  const sourceRow = await db
    .selectFrom('object_definitions')
    .select('id')
    .where('id', '=', params.sourceObjectId)
    .where('tenant_id', '=', tenantId)
    .executeTakeFirst();
  if (!sourceRow) {
    throwNotFoundError('Source object definition not found');
  }

  const targetRow = await db
    .selectFrom('object_definitions')
    .select('id')
    .where('id', '=', params.targetObjectId)
    .where('tenant_id', '=', tenantId)
    .executeTakeFirst();
  if (!targetRow) {
    throwNotFoundError('Target object definition not found');
  }

  // Check uniqueness of api_name on the source object within tenant
  const existing = await db
    .selectFrom('relationship_definitions')
    .select('id')
    .where('source_object_id', '=', params.sourceObjectId)
    .where('api_name', '=', params.apiName.trim())
    .where('tenant_id', '=', tenantId)
    .executeTakeFirst();
  if (existing) {
    throwConflictError(
      `A relationship with api_name "${params.apiName.trim()}" already exists on this source object`,
    );
  }

  const relationshipId = randomUUID();
  const now = new Date();

  const inserted = await db
    .insertInto('relationship_definitions')
    .values({
      id: relationshipId,
      tenant_id: tenantId,
      source_object_id: params.sourceObjectId,
      target_object_id: params.targetObjectId,
      relationship_type: params.relationshipType.trim(),
      api_name: params.apiName.trim(),
      label: params.label.trim(),
      reverse_label: params.reverseLabel?.trim() ?? null,
      required: params.required ?? false,
      created_at: now,
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  logger.info(
    {
      relationshipId,
      sourceObjectId: params.sourceObjectId,
      targetObjectId: params.targetObjectId,
      apiName: params.apiName,
    },
    'Relationship definition created',
  );

  return rowToRelationshipDefinition(inserted);
}

/**
 * Lists all relationship definitions for an object (as source or target).
 * Includes related object metadata (label, plural_label) for UI display.
 *
 * @throws {Error} NOT_FOUND — object does not exist
 */
export async function listRelationshipDefinitions(
  tenantId: string,
  objectId: string,
): Promise<RelationshipDefinitionWithObjects[]> {
  // Validate object exists within tenant
  const objectRow = await db
    .selectFrom('object_definitions')
    .select('id')
    .where('id', '=', objectId)
    .where('tenant_id', '=', tenantId)
    .executeTakeFirst();
  if (!objectRow) {
    throwNotFoundError('Object definition not found');
  }

  // Join to both src and tgt object_definitions rows to surface label
  // metadata alongside each relationship. Every joined table is also
  // scoped by tenant_id as defence-in-depth against an RLS
  // misconfiguration (ADR-006).
  const rows = await db
    .selectFrom('relationship_definitions as rd')
    .innerJoin('object_definitions as src', (join) =>
      join
        .onRef('src.id', '=', 'rd.source_object_id')
        .on('src.tenant_id', '=', tenantId),
    )
    .innerJoin('object_definitions as tgt', (join) =>
      join
        .onRef('tgt.id', '=', 'rd.target_object_id')
        .on('tgt.tenant_id', '=', tenantId),
    )
    .selectAll('rd')
    .select([
      'src.api_name as source_object_api_name',
      'src.label as source_object_label',
      'src.plural_label as source_object_plural_label',
      'tgt.api_name as target_object_api_name',
      'tgt.label as target_object_label',
      'tgt.plural_label as target_object_plural_label',
    ])
    .where((eb) =>
      eb.or([
        eb('rd.source_object_id', '=', objectId),
        eb('rd.target_object_id', '=', objectId),
      ]),
    )
    .where('rd.tenant_id', '=', tenantId)
    .orderBy('rd.created_at', 'asc')
    .execute();

  return rows.map(rowToRelationshipDefinitionWithObjects);
}

/**
 * Deletes a relationship definition.
 * System relationships (between two system objects) cannot be deleted.
 * Cascades to record_relationships via the ON DELETE CASCADE foreign key.
 *
 * @throws {Error} NOT_FOUND — relationship does not exist
 * @throws {Error} DELETE_BLOCKED — system relationship
 */
export async function deleteRelationshipDefinition(
  tenantId: string,
  id: string,
): Promise<void> {
  const existingRow = await db
    .selectFrom('relationship_definitions as rd')
    .innerJoin('object_definitions as src', (join) =>
      join
        .onRef('src.id', '=', 'rd.source_object_id')
        .on('src.tenant_id', '=', tenantId),
    )
    .innerJoin('object_definitions as tgt', (join) =>
      join
        .onRef('tgt.id', '=', 'rd.target_object_id')
        .on('tgt.tenant_id', '=', tenantId),
    )
    .select([
      'rd.id',
      'src.is_system as source_is_system',
      'tgt.is_system as target_is_system',
    ])
    .where('rd.id', '=', id)
    .where('rd.tenant_id', '=', tenantId)
    .executeTakeFirst();

  if (!existingRow) {
    throwNotFoundError('Relationship definition not found');
  }

  // System relationships (both source and target are system objects) cannot be deleted
  if (
    existingRow.source_is_system === true &&
    existingRow.target_is_system === true
  ) {
    throwDeleteBlockedError('Cannot delete system relationships');
  }

  await db
    .deleteFrom('relationship_definitions')
    .where('id', '=', id)
    .where('tenant_id', '=', tenantId)
    .execute();

  logger.info({ relationshipId: id }, 'Relationship definition deleted');
}
