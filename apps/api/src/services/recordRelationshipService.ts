import { randomUUID } from 'crypto';
import { logger } from '../lib/logger.js';
import { pool } from '../db/client.js';

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
  page: number;
  limit: number;
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

function rowToRecordRelationship(row: Record<string, unknown>): RecordRelationship {
  return {
    id: row.id as string,
    relationshipId: row.relationship_id as string,
    sourceRecordId: row.source_record_id as string,
    targetRecordId: row.target_record_id as string,
    createdAt: new Date(row.created_at as string),
  };
}

function rowToRelatedRecord(row: Record<string, unknown>): RelatedRecordRow {
  return {
    id: row.id as string,
    name: row.name as string,
    fieldValues: (row.field_values as Record<string, unknown>) ?? {},
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

// ─── Service Functions ───────────────────────────────────────────────────────

/**
 * Links two records through a defined relationship.
 *
 * Validations:
 * - Both records must exist and belong to the authenticated user
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
  const sourceResult = await pool.query(
    'SELECT id, object_id FROM records WHERE id = $1 AND owner_id = $2 AND tenant_id = $3',
    [sourceRecordId, ownerId, tenantId],
  );
  if (sourceResult.rows.length === 0) {
    throwNotFoundError('Source record not found');
  }
  const sourceRecord = sourceResult.rows[0] as Record<string, unknown>;

  // Fetch the target record
  const targetResult = await pool.query(
    'SELECT id, object_id FROM records WHERE id = $1 AND owner_id = $2 AND tenant_id = $3',
    [targetRecordId, ownerId, tenantId],
  );
  if (targetResult.rows.length === 0) {
    throwNotFoundError('Target record not found');
  }
  const targetRecord = targetResult.rows[0] as Record<string, unknown>;

  // Fetch the relationship definition
  const relDefResult = await pool.query(
    'SELECT * FROM relationship_definitions WHERE id = $1 AND tenant_id = $2',
    [relationshipId, tenantId],
  );
  if (relDefResult.rows.length === 0) {
    throwNotFoundError('Relationship definition not found');
  }
  const relDef = relDefResult.rows[0] as Record<string, unknown>;

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

  // Check for duplicate link
  const duplicateCheck = await pool.query(
    `SELECT id FROM record_relationships
     WHERE relationship_id = $1 AND source_record_id = $2 AND target_record_id = $3`,
    [relationshipId, sourceRecordId, targetRecordId],
  );
  if (duplicateCheck.rows.length > 0) {
    throwConflictError('This relationship link already exists');
  }

  // For parent_child relationships, enforce single parent
  // A source record can only have one target via a parent_child relationship
  if (relDef.relationship_type === 'parent_child') {
    const existingParent = await pool.query(
      `SELECT id FROM record_relationships
       WHERE relationship_id = $1 AND source_record_id = $2`,
      [relationshipId, sourceRecordId],
    );
    if (existingParent.rows.length > 0) {
      throwConflictError(
        'This record already has a parent for this relationship. Parent-child relationships allow only one parent.',
      );
    }
  }

  const linkId = randomUUID();
  const now = new Date();

  const result = await pool.query(
    `INSERT INTO record_relationships (id, tenant_id, relationship_id, source_record_id, target_record_id, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [linkId, tenantId, relationshipId, sourceRecordId, targetRecordId, now],
  );

  logger.info(
    { linkId, relationshipId, sourceRecordId, targetRecordId, ownerId },
    'Records linked',
  );

  return rowToRecordRelationship(result.rows[0]);
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
  // Verify the source record exists and belongs to the owner
  const recordResult = await pool.query(
    'SELECT id FROM records WHERE id = $1 AND owner_id = $2 AND tenant_id = $3',
    [sourceRecordId, ownerId, tenantId],
  );
  if (recordResult.rows.length === 0) {
    throwNotFoundError('Record not found');
  }

  // Verify the record_relationship exists and involves this record
  const relResult = await pool.query(
    `SELECT id FROM record_relationships
     WHERE id = $1 AND (source_record_id = $2 OR target_record_id = $2)`,
    [recordRelationshipId, sourceRecordId],
  );
  if (relResult.rows.length === 0) {
    throwNotFoundError('Relationship link not found');
  }

  await pool.query('DELETE FROM record_relationships WHERE id = $1', [recordRelationshipId]);

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
  page: number,
  limit: number,
): Promise<RelatedRecordsResult> {
  // Verify the record exists and belongs to the owner
  const recordResult = await pool.query(
    'SELECT id, object_id FROM records WHERE id = $1 AND owner_id = $2 AND tenant_id = $3',
    [recordId, ownerId, tenantId],
  );
  if (recordResult.rows.length === 0) {
    throwNotFoundError('Record not found');
  }

  // Resolve the target object type
  const objectResult = await pool.query(
    'SELECT id FROM object_definitions WHERE api_name = $1 AND tenant_id = $2',
    [objectApiName, tenantId],
  );
  if (objectResult.rows.length === 0) {
    throwNotFoundError(`Object type '${objectApiName}' not found`);
  }
  const targetObjectId = (objectResult.rows[0] as Record<string, unknown>).id as string;

  // Find related records in both directions:
  // 1. Records where our record is the source and the target belongs to the specified object type
  // 2. Records where our record is the target and the source belongs to the specified object type
  const offset = (page - 1) * limit;

  const countResult = await pool.query(
    `SELECT COUNT(*) AS total FROM (
       SELECT r.id
       FROM record_relationships rr
       JOIN records r ON r.id = rr.target_record_id
       WHERE rr.source_record_id = $1 AND r.object_id = $2
       UNION
       SELECT r.id
       FROM record_relationships rr
       JOIN records r ON r.id = rr.source_record_id
       WHERE rr.target_record_id = $1 AND r.object_id = $2
     ) AS related`,
    [recordId, targetObjectId],
  );
  const total = parseInt(countResult.rows[0].total as string, 10);

  const dataResult = await pool.query(
    `SELECT * FROM (
       SELECT r.id, r.name, r.field_values, r.created_at, r.updated_at
       FROM record_relationships rr
       JOIN records r ON r.id = rr.target_record_id
       WHERE rr.source_record_id = $1 AND r.object_id = $2
       UNION
       SELECT r.id, r.name, r.field_values, r.created_at, r.updated_at
       FROM record_relationships rr
       JOIN records r ON r.id = rr.source_record_id
       WHERE rr.target_record_id = $1 AND r.object_id = $2
     ) AS related
     ORDER BY created_at DESC
     LIMIT $3 OFFSET $4`,
    [recordId, targetObjectId, limit, offset],
  );

  const data = dataResult.rows.map((row: Record<string, unknown>) =>
    rowToRelatedRecord(row),
  );

  return { data, total, page, limit };
}
