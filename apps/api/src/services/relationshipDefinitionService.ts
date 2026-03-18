import { randomUUID } from 'crypto';
import { logger } from '../lib/logger.js';
import { pool } from '../db/client.js';

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

function rowToRelationshipDefinition(row: Record<string, unknown>): RelationshipDefinition {
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

function rowToRelationshipDefinitionWithObjects(row: Record<string, unknown>): RelationshipDefinitionWithObjects {
  return {
    ...rowToRelationshipDefinition(row),
    sourceObjectApiName: row.source_object_api_name as string,
    sourceObjectLabel: row.source_object_label as string,
    sourceObjectPluralLabel: row.source_object_plural_label as string,
    targetObjectApiName: row.target_object_api_name as string,
    targetObjectLabel: row.target_object_label as string,
    targetObjectPluralLabel: row.target_object_plural_label as string,
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
  const sourceResult = await pool.query(
    'SELECT id FROM object_definitions WHERE id = $1 AND tenant_id = $2',
    [params.sourceObjectId, tenantId],
  );
  if (sourceResult.rows.length === 0) {
    throwNotFoundError('Source object definition not found');
  }

  const targetResult = await pool.query(
    'SELECT id FROM object_definitions WHERE id = $1 AND tenant_id = $2',
    [params.targetObjectId, tenantId],
  );
  if (targetResult.rows.length === 0) {
    throwNotFoundError('Target object definition not found');
  }

  // Check uniqueness of api_name on the source object within tenant
  const existing = await pool.query(
    'SELECT id FROM relationship_definitions WHERE source_object_id = $1 AND api_name = $2 AND tenant_id = $3',
    [params.sourceObjectId, params.apiName.trim(), tenantId],
  );
  if (existing.rows.length > 0) {
    throwConflictError(
      `A relationship with api_name "${params.apiName.trim()}" already exists on this source object`,
    );
  }

  const relationshipId = randomUUID();
  const now = new Date();

  const result = await pool.query(
    `INSERT INTO relationship_definitions
       (id, tenant_id, source_object_id, target_object_id, relationship_type, api_name, label, reverse_label, required, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      relationshipId,
      tenantId,
      params.sourceObjectId,
      params.targetObjectId,
      params.relationshipType.trim(),
      params.apiName.trim(),
      params.label.trim(),
      params.reverseLabel?.trim() ?? null,
      params.required ?? false,
      now,
    ],
  );

  logger.info(
    { relationshipId, sourceObjectId: params.sourceObjectId, targetObjectId: params.targetObjectId, apiName: params.apiName },
    'Relationship definition created',
  );

  return rowToRelationshipDefinition(result.rows[0]);
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
  const objectResult = await pool.query(
    'SELECT id FROM object_definitions WHERE id = $1 AND tenant_id = $2',
    [objectId, tenantId],
  );
  if (objectResult.rows.length === 0) {
    throwNotFoundError('Object definition not found');
  }

  const result = await pool.query(
    `SELECT rd.*,
            src.api_name AS source_object_api_name,
            src.label AS source_object_label,
            src.plural_label AS source_object_plural_label,
            tgt.api_name AS target_object_api_name,
            tgt.label AS target_object_label,
            tgt.plural_label AS target_object_plural_label
     FROM relationship_definitions rd
     JOIN object_definitions src ON src.id = rd.source_object_id
     JOIN object_definitions tgt ON tgt.id = rd.target_object_id
     WHERE (rd.source_object_id = $1 OR rd.target_object_id = $1) AND rd.tenant_id = $2
     ORDER BY rd.created_at ASC`,
    [objectId, tenantId],
  );

  return result.rows.map((row: Record<string, unknown>) =>
    rowToRelationshipDefinitionWithObjects(row),
  );
}

/**
 * Deletes a relationship definition.
 * System relationships (between two system objects) cannot be deleted.
 * Cascades to record_relationships via the ON DELETE CASCADE foreign key.
 *
 * @throws {Error} NOT_FOUND — relationship does not exist
 * @throws {Error} DELETE_BLOCKED — system relationship
 */
export async function deleteRelationshipDefinition(tenantId: string, id: string): Promise<void> {
  const existing = await pool.query(
    `SELECT rd.*,
            src.is_system AS source_is_system,
            tgt.is_system AS target_is_system
     FROM relationship_definitions rd
     JOIN object_definitions src ON src.id = rd.source_object_id
     JOIN object_definitions tgt ON tgt.id = rd.target_object_id
     WHERE rd.id = $1 AND rd.tenant_id = $2`,
    [id, tenantId],
  );

  if (existing.rows.length === 0) {
    throwNotFoundError('Relationship definition not found');
  }

  const row = existing.rows[0] as Record<string, unknown>;

  // System relationships (both source and target are system objects) cannot be deleted
  if (row.source_is_system === true && row.target_is_system === true) {
    throwDeleteBlockedError('Cannot delete system relationships');
  }

  await pool.query('DELETE FROM relationship_definitions WHERE id = $1 AND tenant_id = $2', [id, tenantId]);

  logger.info({ relationshipId: id }, 'Relationship definition deleted');
}
