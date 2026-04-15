import { randomUUID } from 'crypto';
import type { Selectable } from 'kysely';
import { logger } from '../lib/logger.js';
import { db } from '../db/kysely.js';
import type {
  RecordRelationships,
  Records,
  RelationshipDefinitions,
} from '../db/kysely.types.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RecordRelationship {
  id: string;
  relationshipId: string;
  sourceRecordId: string;
  targetRecordId: string;
  createdAt: Date;
}

export interface RelatedRecordRow {
  id: string;
  name: string;
  fieldValues: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface RelatedRecordsResult {
  data: RelatedRecordRow[];
  total: number;
  limit: number;
  offset: number;
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

// ─── Row → domain model ─────────────────────────────────────────────────────

/**
 * Typing the row mapper against `Selectable<RecordRelationships>`
 * (rather than `Record<string, unknown>`) means a column rename or
 * nullability change on the generated schema becomes a compile-time
 * error at this service, rather than an `unknown` cast leaking an
 * incorrect runtime shape into the domain model.
 */
type RecordRelationshipSelectable = Selectable<RecordRelationships>;

function rowToRecordRelationship(
  row: RecordRelationshipSelectable,
): RecordRelationship {
  return {
    id: row.id,
    relationshipId: row.relationship_id,
    sourceRecordId: row.source_record_id,
    targetRecordId: row.target_record_id,
    createdAt: row.created_at,
  };
}

/**
 * The UNION subquery projects a handful of `records` columns. We type
 * the mapper against those columns so a rename on `records` surfaces
 * here at compile time.
 */
type RelatedRecordSelectable = Pick<
  Selectable<Records>,
  'id' | 'name' | 'field_values' | 'created_at' | 'updated_at'
>;

function rowToRelatedRecord(row: RelatedRecordSelectable): RelatedRecordRow {
  return {
    id: row.id,
    name: row.name,
    fieldValues: (row.field_values as Record<string, unknown> | null) ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ─── Service Functions ───────────────────────────────────────────────────────

/**
 * Links two records through a defined relationship.
 *
 * Validations:
 * - Both records must exist and belong to the tenant
 * - The relationship definition must exist
 * - Source record's object type must match relationship's source_object_id
 * - Target record's object type must match relationship's target_object_id
 * - For parent_child relationships, the source record can only have one parent
 *   (i.e. only one link via this relationship_id for the source_record_id)
 * - Duplicate links are rejected
 *
 * @throws {Error} VALIDATION_ERROR — invalid input or type mismatch
 * @throws {Error} NOT_FOUND — record or relationship not found
 * @throws {Error} CONFLICT — duplicate link or parent already exists
 */
export async function linkRecords(
  tenantId: string,
  sourceRecordId: string,
  relationshipId: string,
  targetRecordId: string,
  ownerId: string,
): Promise<RecordRelationship> {
  if (!sourceRecordId) {
    throwValidationError('source record id is required');
  }
  if (!relationshipId) {
    throwValidationError('relationship_id is required');
  }
  if (!targetRecordId) {
    throwValidationError('target_record_id is required');
  }

  // Fetch the source record
  const sourceRecord = await db
    .selectFrom('records')
    .select(['id', 'object_id'])
    .where('id', '=', sourceRecordId)
    .where('tenant_id', '=', tenantId)
    .executeTakeFirst();
  if (!sourceRecord) {
    throwNotFoundError('Source record not found');
  }

  // Fetch the target record
  const targetRecord = await db
    .selectFrom('records')
    .select(['id', 'object_id'])
    .where('id', '=', targetRecordId)
    .where('tenant_id', '=', tenantId)
    .executeTakeFirst();
  if (!targetRecord) {
    throwNotFoundError('Target record not found');
  }

  // Fetch the relationship definition
  const relDef: Selectable<RelationshipDefinitions> | undefined = await db
    .selectFrom('relationship_definitions')
    .selectAll()
    .where('id', '=', relationshipId)
    .where('tenant_id', '=', tenantId)
    .executeTakeFirst();
  if (!relDef) {
    throwNotFoundError('Relationship definition not found');
  }

  // Validate object types match the relationship definition
  if (sourceRecord.object_id !== relDef.source_object_id) {
    throwValidationError(
      'Source record object type does not match relationship source object',
    );
  }
  if (targetRecord.object_id !== relDef.target_object_id) {
    throwValidationError(
      'Target record object type does not match relationship target object',
    );
  }

  // Check for duplicate link. Scoped by tenant_id as defence-in-depth
  // against an RLS misconfiguration (ADR-006); the raw-pg implementation
  // historically omitted this.
  const duplicate = await db
    .selectFrom('record_relationships')
    .select('id')
    .where('relationship_id', '=', relationshipId)
    .where('source_record_id', '=', sourceRecordId)
    .where('target_record_id', '=', targetRecordId)
    .where('tenant_id', '=', tenantId)
    .executeTakeFirst();
  if (duplicate) {
    throwConflictError('This relationship link already exists');
  }

  // For parent_child relationships, enforce single parent.
  // Also scoped by tenant_id (same latent bug as the duplicate check).
  if (relDef.relationship_type === 'parent_child') {
    const existingParent = await db
      .selectFrom('record_relationships')
      .select('id')
      .where('relationship_id', '=', relationshipId)
      .where('source_record_id', '=', sourceRecordId)
      .where('tenant_id', '=', tenantId)
      .executeTakeFirst();
    if (existingParent) {
      throwConflictError(
        'This record already has a parent for this relationship. Parent-child relationships allow only one parent.',
      );
    }
  }

  const linkId = randomUUID();
  const now = new Date();

  const inserted = await db
    .insertInto('record_relationships')
    .values({
      id: linkId,
      tenant_id: tenantId,
      relationship_id: relationshipId,
      source_record_id: sourceRecordId,
      target_record_id: targetRecordId,
      created_at: now,
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  logger.info(
    { linkId, relationshipId, sourceRecordId, targetRecordId, ownerId },
    'Records linked',
  );

  return rowToRecordRelationship(inserted);
}

/**
 * Unlinks two records by deleting their record_relationship.
 *
 * The record_relationship must involve the source record (as either source or target).
 *
 * @throws {Error} NOT_FOUND — record or relationship link not found
 */
export async function unlinkRecords(
  tenantId: string,
  sourceRecordId: string,
  recordRelationshipId: string,
  ownerId: string,
): Promise<void> {
  // Verify the source record exists within the tenant
  const record = await db
    .selectFrom('records')
    .select('id')
    .where('id', '=', sourceRecordId)
    .where('tenant_id', '=', tenantId)
    .executeTakeFirst();
  if (!record) {
    throwNotFoundError('Record not found');
  }

  // Verify the record_relationship exists and involves this record
  const existingLink = await db
    .selectFrom('record_relationships')
    .select('id')
    .where('id', '=', recordRelationshipId)
    .where('tenant_id', '=', tenantId)
    .where((eb) =>
      eb.or([
        eb('source_record_id', '=', sourceRecordId),
        eb('target_record_id', '=', sourceRecordId),
      ]),
    )
    .executeTakeFirst();
  if (!existingLink) {
    throwNotFoundError('Relationship link not found');
  }

  await db
    .deleteFrom('record_relationships')
    .where('id', '=', recordRelationshipId)
    .where('tenant_id', '=', tenantId)
    .execute();

  logger.info(
    { recordRelationshipId, sourceRecordId, ownerId },
    'Records unlinked',
  );
}

/**
 * Returns records related to the given record that belong to the specified object type.
 * Searches both directions: where the record is the source and where it is the target.
 *
 * @throws {Error} NOT_FOUND — record or object type not found
 */
export async function getRelatedRecords(
  tenantId: string,
  recordId: string,
  objectApiName: string,
  ownerId: string,
  limit: number,
  offset: number,
): Promise<RelatedRecordsResult> {
  void ownerId;
  // Verify the record exists within the tenant
  const record = await db
    .selectFrom('records')
    .select(['id', 'object_id'])
    .where('id', '=', recordId)
    .where('tenant_id', '=', tenantId)
    .executeTakeFirst();
  if (!record) {
    throwNotFoundError('Record not found');
  }

  // Resolve the target object type
  const objectDef = await db
    .selectFrom('object_definitions')
    .select('id')
    .where('api_name', '=', objectApiName)
    .where('tenant_id', '=', tenantId)
    .executeTakeFirst();
  if (!objectDef) {
    throwNotFoundError(`Object type '${objectApiName}' not found`);
  }
  const targetObjectId = objectDef.id;

  // Find related records in both directions via a UNION:
  //   1. Records where our record is the source and the target belongs
  //      to the specified object type (outgoing).
  //   2. Records where our record is the target and the source belongs
  //      to the specified object type (incoming).
  //
  // Both halves explicitly scope by tenant_id on both the join table
  // and the records table as defence-in-depth (ADR-006). The raw-pg
  // implementation historically omitted these filters.
  const outgoing = db
    .selectFrom('record_relationships as rr')
    .innerJoin('records as r', (join) =>
      join
        .onRef('r.id', '=', 'rr.target_record_id')
        .on('r.tenant_id', '=', tenantId),
    )
    .select(['r.id', 'r.name', 'r.field_values', 'r.created_at', 'r.updated_at'])
    .where('rr.source_record_id', '=', recordId)
    .where('rr.tenant_id', '=', tenantId)
    .where('r.object_id', '=', targetObjectId);

  const incoming = db
    .selectFrom('record_relationships as rr')
    .innerJoin('records as r', (join) =>
      join
        .onRef('r.id', '=', 'rr.source_record_id')
        .on('r.tenant_id', '=', tenantId),
    )
    .select(['r.id', 'r.name', 'r.field_values', 'r.created_at', 'r.updated_at'])
    .where('rr.target_record_id', '=', recordId)
    .where('rr.tenant_id', '=', tenantId)
    .where('r.object_id', '=', targetObjectId);

  // Count the distinct related records across both directions.
  const countRow = await db
    .selectFrom(() => outgoing.union(incoming).as('related'))
    .select((eb) => eb.fn.countAll<string>().as('total'))
    .executeTakeFirstOrThrow();
  const total = parseInt(countRow.total, 10);

  // Page through the distinct related records.
  const dataRows = await db
    .selectFrom(() => outgoing.union(incoming).as('related'))
    .selectAll()
    .orderBy('created_at', 'desc')
    .limit(limit)
    .offset(offset)
    .execute();

  const data = dataRows.map(rowToRelatedRecord);

  return { data, total, limit, offset };
}
