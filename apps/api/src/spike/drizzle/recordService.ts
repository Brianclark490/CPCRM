/**
 * Record Service (Drizzle Prototype)
 *
 * Simplified implementation focusing on list/search functionality.
 * Demonstrates Drizzle's approach to JSONB queries and dynamic filtering.
 */

import { db } from './client.js';
import {
  records,
  objectDefinitions,
  fieldDefinitions,
  recordRelationships,
  relationshipDefinitions,
  stageDefinitions,
} from './schema.js';
import { eq, and, or, ilike, sql, count, desc, asc } from 'drizzle-orm';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FieldDefinitionRow {
  id: string;
  objectId: string;
  apiName: string;
  label: string;
  fieldType: string;
  required: boolean;
  options: Record<string, unknown>;
  sortOrder: number;
}

export interface ObjectDefinitionRow {
  id: string;
  apiName: string;
  label: string;
  pluralLabel: string;
  isSystem: boolean;
  nameFieldId?: string;
  nameTemplate?: string;
}

export interface RecordRow {
  id: string;
  objectId: string;
  tenantId: string;
  name: string;
  fieldValues: Record<string, unknown>;
  ownerId: string;
  ownerRecordId?: string | null;
  updatedBy?: string | null;
  updatedByRecordId?: string | null;
  pipelineId?: string | null;
  currentStageId?: string | null;
  stageEnteredAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RecordWithLabels extends RecordRow {
  fields: Array<{
    apiName: string;
    label: string;
    fieldType: string;
    value: unknown;
    options: Record<string, unknown>;
  }>;
  linkedParent?: {
    objectApiName: string;
    recordId: string;
    recordName: string;
  };
}

export interface ListRecordsResult {
  data: RecordWithLabels[];
  total: number;
  limit: number;
  offset: number;
  object: ObjectDefinitionRow;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function throwNotFoundError(message: string): never {
  const err = new Error(message) as Error & { code: string };
  err.code = 'NOT_FOUND';
  throw err;
}

const SAFE_IDENTIFIER_RE = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;

function isSafeIdentifier(value: string): boolean {
  return SAFE_IDENTIFIER_RE.test(value);
}

export function escapeLikePattern(value: string): string {
  return value.replace(/[%_\\]/g, '\\$&');
}

// ─── Row transformers ─────────────────────────────────────────────────────────

function rowToRecord(row: typeof records.$inferSelect): RecordRow {
  return {
    id: row.id,
    objectId: row.objectId,
    tenantId: row.tenantId,
    name: row.name,
    fieldValues: (row.fieldValues as Record<string, unknown>) ?? {},
    ownerId: row.ownerId,
    ownerRecordId: row.ownerRecordId,
    updatedBy: row.updatedBy,
    updatedByRecordId: row.updatedByRecordId,
    pipelineId: row.pipelineId,
    currentStageId: row.currentStageId,
    stageEnteredAt: row.stageEnteredAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function rowToFieldDef(row: typeof fieldDefinitions.$inferSelect): FieldDefinitionRow {
  return {
    id: row.id,
    objectId: row.objectId,
    apiName: row.apiName,
    label: row.label,
    fieldType: row.fieldType,
    required: row.required,
    options: (row.options as Record<string, unknown>) ?? {},
    sortOrder: row.sortOrder,
  };
}

function rowToObjectDef(row: typeof objectDefinitions.$inferSelect): ObjectDefinitionRow {
  return {
    id: row.id,
    apiName: row.apiName,
    label: row.label,
    pluralLabel: row.pluralLabel,
    isSystem: row.isSystem,
    nameFieldId: row.nameFieldId ?? undefined,
    nameTemplate: row.nameTemplate ?? undefined,
  };
}

function resolveFieldLabels(
  record: RecordRow,
  fieldDefs: FieldDefinitionRow[],
): RecordWithLabels {
  const fields = fieldDefs.map((fd) => ({
    apiName: fd.apiName,
    label: fd.label,
    fieldType: fd.fieldType,
    value: record.fieldValues[fd.apiName],
    options: fd.options,
  }));

  return { ...record, fields };
}

// ─── Object/Field lookups ─────────────────────────────────────────────────────

async function resolveObjectByApiName(
  tenantId: string,
  apiName: string,
): Promise<ObjectDefinitionRow> {
  const rows = await db
    .select()
    .from(objectDefinitions)
    .where(
      and(
        eq(objectDefinitions.tenantId, tenantId),
        eq(objectDefinitions.apiName, apiName),
      ),
    )
    .limit(1);

  if (rows.length === 0) {
    throwNotFoundError(`Object '${apiName}' not found`);
  }

  return rowToObjectDef(rows[0]);
}

async function getFieldDefinitions(
  tenantId: string,
  objectId: string,
): Promise<FieldDefinitionRow[]> {
  const rows = await db
    .select()
    .from(fieldDefinitions)
    .where(
      and(
        eq(fieldDefinitions.tenantId, tenantId),
        eq(fieldDefinitions.objectId, objectId),
      ),
    )
    .orderBy(asc(fieldDefinitions.sortOrder));

  return rows.map(rowToFieldDef);
}

// ─── List Records with Search ─────────────────────────────────────────────────

/**
 * Lists records for the given object type with search, pagination, and sorting.
 *
 * Key differences with Drizzle:
 * - Schema-first approach with strong typing
 * - Filter builders using Drizzle operators (eq, and, or, ilike)
 * - JSONB operations require sql template for complex queries
 * - No query string concatenation, all programmatic
 */
export async function listRecords(params: {
  tenantId: string;
  apiName: string;
  ownerId: string;
  search?: string;
  limit: number;
  offset: number;
  sortBy?: string;
  sortDir?: 'ASC' | 'DESC';
}): Promise<ListRecordsResult> {
  const { tenantId, apiName, ownerId, search, limit, offset, sortBy, sortDir } =
    params;

  // ownerId is accepted for API-contract parity with the production
  // recordService, but list-scoping is performed at the record level via
  // tenant isolation rather than per-owner filtering.
  void ownerId;

  // Resolve object and fields
  const objectDef = await resolveObjectByApiName(tenantId, apiName);
  const fieldDefs = await getFieldDefinitions(tenantId, objectDef.id);

  // Build base filters
  const baseFilters = [
    eq(records.objectId, objectDef.id),
    eq(records.tenantId, tenantId),
  ];

  // Add search filter if present
  if (search && search.trim().length > 0) {
    const searchTerm = `%${escapeLikePattern(search.trim())}%`;

    // Find text-like fields to search
    const textFields = fieldDefs.filter(
      (fd) =>
        fd.fieldType === 'text' ||
        fd.fieldType === 'email' ||
        fd.fieldType === 'textarea',
    );

    const searchConditions = [ilike(records.name, searchTerm)];

    // Search against JSONB field values
    for (const tf of textFields) {
      if (isSafeIdentifier(tf.apiName)) {
        // Drizzle JSONB field access requires sql template
        searchConditions.push(
          sql`${records.fieldValues}->>${tf.apiName} ILIKE ${searchTerm}`,
        );
      }
    }

    baseFilters.push(or(...searchConditions)!);
  }

  // Get total count
  const countResult = await db
    .select({ count: count() })
    .from(records)
    .where(and(...baseFilters));

  const total = countResult[0]?.count ?? 0;

  // Build query with sorting
  let query = db
    .select()
    .from(records)
    .where(and(...baseFilters));

  // Apply sorting
  const direction = sortDir === 'ASC' ? asc : desc;

  if (sortBy === 'name') {
    query = query.orderBy(direction(records.name)) as typeof query;
  } else if (sortBy === 'created_at') {
    query = query.orderBy(direction(records.createdAt)) as typeof query;
  } else if (sortBy === 'updated_at') {
    query = query.orderBy(direction(records.updatedAt)) as typeof query;
  } else if (sortBy) {
    // Sort by JSONB field
    const fieldDef = fieldDefs.find((fd) => fd.apiName === sortBy);
    if (fieldDef && isSafeIdentifier(fieldDef.apiName)) {
      query = query.orderBy(
        sortDir === 'ASC'
          ? sql`${records.fieldValues}->>${fieldDef.apiName} ASC`
          : sql`${records.fieldValues}->>${fieldDef.apiName} DESC`,
      ) as typeof query;
    }
  } else {
    // Default sort
    query = query.orderBy(desc(records.createdAt)) as typeof query;
  }

  // Apply pagination
  const rows = await query.limit(limit).offset(offset);

  // Map to domain models
  const data = rows.map((row) => {
    const record = rowToRecord(row);
    return resolveFieldLabels(record, fieldDefs);
  });

  // Batch-fetch linked parent accounts
  if (data.length > 0) {
    const recordIds = data.map((r) => r.id);

    const linkedRows = await db
      .select({
        sourceRecordId: recordRelationships.sourceRecordId,
        accountId: records.id,
        accountName: records.name,
      })
      .from(recordRelationships)
      .innerJoin(
        relationshipDefinitions,
        eq(relationshipDefinitions.id, recordRelationships.relationshipId),
      )
      .innerJoin(
        objectDefinitions,
        eq(objectDefinitions.id, relationshipDefinitions.targetObjectId),
      )
      .innerJoin(records, eq(records.id, recordRelationships.targetRecordId))
      .where(
        and(
          sql`${recordRelationships.sourceRecordId} = ANY(${recordIds})`,
          eq(relationshipDefinitions.sourceObjectId, objectDef.id),
          eq(objectDefinitions.apiName, 'account'),
          eq(relationshipDefinitions.tenantId, tenantId),
        ),
      );

    const linkedMap = new Map<
      string,
      { objectApiName: string; recordId: string; recordName: string }
    >();
    for (const lr of linkedRows) {
      if (!linkedMap.has(lr.sourceRecordId)) {
        linkedMap.set(lr.sourceRecordId, {
          objectApiName: 'account',
          recordId: lr.accountId,
          recordName: lr.accountName,
        });
      }
    }

    // Attach linked parent to each record
    for (const rec of data) {
      const linked = linkedMap.get(rec.id);
      if (linked) {
        rec.linkedParent = linked;
      }
    }
  }

  return {
    data,
    total,
    limit,
    offset,
    object: objectDef,
  };
}

/**
 * Get a single record by ID.
 */
export async function getRecord(
  tenantId: string,
  recordId: string,
): Promise<RecordWithLabels | null> {
  const rows = await db
    .select()
    .from(records)
    .where(and(eq(records.id, recordId), eq(records.tenantId, tenantId)))
    .limit(1);

  if (rows.length === 0) return null;

  const record = rowToRecord(rows[0]);
  const fieldDefs = await getFieldDefinitions(tenantId, record.objectId);

  return resolveFieldLabels(record, fieldDefs);
}

/**
 * Count records by stage for analytics.
 *
 * Demonstrates Drizzle's aggregation with JSONB field extraction.
 */
export async function countRecordsByStage(
  tenantId: string,
  pipelineId: string,
): Promise<
  Array<{ stageId: string; stageName: string; count: number; totalValue: number }>
> {
  const rows = await db
    .select({
      stageId: stageDefinitions.id,
      stageName: stageDefinitions.name,
      count: sql<number>`COUNT(${records.id})::int`.as('count'),
      totalValue: sql<number>`COALESCE(SUM((${records.fieldValues}->>'value')::numeric), 0)`.as(
        'total_value',
      ),
    })
    .from(stageDefinitions)
    .leftJoin(
      records,
      and(
        eq(records.currentStageId, stageDefinitions.id),
        eq(records.tenantId, tenantId),
      ),
    )
    .where(
      and(
        eq(stageDefinitions.pipelineId, pipelineId),
        eq(stageDefinitions.tenantId, tenantId),
      ),
    )
    .groupBy(stageDefinitions.id, stageDefinitions.name, stageDefinitions.sortOrder)
    .orderBy(asc(stageDefinitions.sortOrder));

  return rows.map((row) => ({
    stageId: row.stageId,
    stageName: row.stageName,
    count: row.count,
    totalValue: Number(row.totalValue),
  }));
}
