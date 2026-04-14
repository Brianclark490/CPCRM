/**
 * Record Service (Kysely Prototype)
 *
 * Simplified implementation focusing on list/search functionality.
 * Demonstrates type safety for complex JSONB queries and dynamic filtering.
 */

import { db } from './client.js';
import { sql } from 'kysely';

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

function rowToRecord(row: {
  id: string;
  object_id: string;
  tenant_id: string;
  name: string;
  field_values: Record<string, unknown>;
  owner_id: string;
  owner_record_id: string | null;
  updated_by: string | null;
  updated_by_record_id: string | null;
  pipeline_id: string | null;
  current_stage_id: string | null;
  stage_entered_at: Date | null;
  created_at: Date;
  updated_at: Date;
}): RecordRow {
  return {
    id: row.id,
    objectId: row.object_id,
    tenantId: row.tenant_id,
    name: row.name,
    fieldValues: row.field_values ?? {},
    ownerId: row.owner_id,
    ownerRecordId: row.owner_record_id,
    updatedBy: row.updated_by,
    updatedByRecordId: row.updated_by_record_id,
    pipelineId: row.pipeline_id,
    currentStageId: row.current_stage_id,
    stageEnteredAt: row.stage_entered_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToFieldDef(row: {
  id: string;
  object_id: string;
  api_name: string;
  label: string;
  field_type: string;
  required: boolean;
  options: Record<string, unknown>;
  sort_order: number;
}): FieldDefinitionRow {
  return {
    id: row.id,
    objectId: row.object_id,
    apiName: row.api_name,
    label: row.label,
    fieldType: row.field_type,
    required: row.required,
    options: row.options ?? {},
    sortOrder: row.sort_order,
  };
}

function rowToObjectDef(row: {
  id: string;
  api_name: string;
  label: string;
  plural_label: string;
  is_system: boolean;
  name_field_id: string | null;
  name_template: string | null;
}): ObjectDefinitionRow {
  return {
    id: row.id,
    apiName: row.api_name,
    label: row.label,
    pluralLabel: row.plural_label,
    isSystem: row.is_system,
    nameFieldId: row.name_field_id ?? undefined,
    nameTemplate: row.name_template ?? undefined,
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
  const row = await db
    .selectFrom('object_definitions')
    .selectAll()
    .where('tenant_id', '=', tenantId)
    .where('api_name', '=', apiName)
    .executeTakeFirst();

  if (!row) {
    throwNotFoundError(`Object '${apiName}' not found`);
  }

  return rowToObjectDef(row);
}

async function getFieldDefinitions(
  tenantId: string,
  objectId: string,
): Promise<FieldDefinitionRow[]> {
  const rows = await db
    .selectFrom('field_definitions')
    .selectAll()
    .where('tenant_id', '=', tenantId)
    .where('object_id', '=', objectId)
    .orderBy('sort_order', 'asc')
    .execute();

  return rows.map(rowToFieldDef);
}

// ─── List Records with Search ─────────────────────────────────────────────────

/**
 * Lists records for the given object type with search, pagination, and sorting.
 *
 * Key improvements with Kysely:
 * - Type-safe query building
 * - Compile-time column name validation
 * - No manual SQL string concatenation for WHERE/ORDER BY clauses
 * - JSONB operations are type-safe via sql template
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

  // Find text-like fields to search
  const textFields = fieldDefs.filter(
    (fd) =>
      fd.fieldType === 'text' ||
      fd.fieldType === 'email' ||
      fd.fieldType === 'textarea',
  );

  const searchTerm =
    search && search.trim().length > 0
      ? `%${escapeLikePattern(search.trim())}%`
      : null;

  // Build base query with type safety
  let query = db
    .selectFrom('records as r')
    .selectAll()
    .where('r.object_id', '=', objectDef.id)
    .where('r.tenant_id', '=', tenantId);

  // Add search filter if present
  if (searchTerm !== null) {
    query = query.where((eb) =>
      eb.or([
        eb('r.name', 'ilike', searchTerm),
        ...textFields
          .filter((tf) => isSafeIdentifier(tf.apiName))
          .map((tf) =>
            eb(
              sql<string>`r.field_values->>${tf.apiName}`,
              'ilike',
              searchTerm,
            ),
          ),
      ]),
    );
  }

  // Get total count — build an independent COUNT query so we don't append
  // COUNT(*) onto the selectAll() of the main query (which would produce
  // invalid SQL).
  let countQuery = db
    .selectFrom('records as r')
    .select(sql<string>`COUNT(*)`.as('total'))
    .where('r.object_id', '=', objectDef.id)
    .where('r.tenant_id', '=', tenantId);

  if (searchTerm !== null) {
    countQuery = countQuery.where((eb) =>
      eb.or([
        eb('r.name', 'ilike', searchTerm),
        ...textFields
          .filter((tf) => isSafeIdentifier(tf.apiName))
          .map((tf) =>
            eb(
              sql<string>`r.field_values->>${tf.apiName}`,
              'ilike',
              searchTerm,
            ),
          ),
      ]),
    );
  }

  const countResult = await countQuery.executeTakeFirst();
  const total = Number(countResult?.total ?? 0);

  // Apply sorting
  const direction = sortDir === 'ASC' ? 'asc' : 'desc';

  if (sortBy === 'name') {
    query = query.orderBy('r.name', direction);
  } else if (sortBy === 'created_at') {
    query = query.orderBy('r.created_at', direction);
  } else if (sortBy === 'updated_at') {
    query = query.orderBy('r.updated_at', direction);
  } else if (sortBy) {
    // Sort by JSONB field
    const fieldDef = fieldDefs.find((fd) => fd.apiName === sortBy);
    if (fieldDef && isSafeIdentifier(fieldDef.apiName)) {
      query = query.orderBy(
        sql`r.field_values->>${fieldDef.apiName}`,
        direction,
      );
    }
  } else {
    // Default sort
    query = query.orderBy('r.created_at', 'desc');
  }

  // Apply pagination
  const rows = await query.limit(limit).offset(offset).execute();

  // Map to domain models
  const data = rows.map((row) => {
    const record = rowToRecord(row);
    return resolveFieldLabels(record, fieldDefs);
  });

  // Batch-fetch linked parent accounts
  if (data.length > 0) {
    const recordIds = data.map((r) => r.id);

    const linkedRows = await db
      .selectFrom('record_relationships as rr')
      .innerJoin('relationship_definitions as rd', 'rd.id', 'rr.relationship_id')
      .innerJoin('object_definitions as tgt_obj', 'tgt_obj.id', 'rd.target_object_id')
      .innerJoin('records as acct', 'acct.id', 'rr.target_record_id')
      .select([
        'rr.source_record_id',
        'acct.id as account_id',
        'acct.name as account_name',
      ])
      .where('rr.source_record_id', 'in', recordIds)
      .where('rd.source_object_id', '=', objectDef.id)
      .where('tgt_obj.api_name', '=', 'account')
      .where('rd.tenant_id', '=', tenantId)
      .execute();

    const linkedMap = new Map<
      string,
      { objectApiName: string; recordId: string; recordName: string }
    >();
    for (const lr of linkedRows) {
      if (!linkedMap.has(lr.source_record_id)) {
        linkedMap.set(lr.source_record_id, {
          objectApiName: 'account',
          recordId: lr.account_id,
          recordName: lr.account_name,
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
  const row = await db
    .selectFrom('records')
    .selectAll()
    .where('id', '=', recordId)
    .where('tenant_id', '=', tenantId)
    .executeTakeFirst();

  if (!row) return null;

  const record = rowToRecord(row);
  const fieldDefs = await getFieldDefinitions(tenantId, record.objectId);

  return resolveFieldLabels(record, fieldDefs);
}

/**
 * Count records by stage for analytics.
 *
 * Demonstrates type-safe aggregation with JSONB field extraction.
 */
export async function countRecordsByStage(
  tenantId: string,
  pipelineId: string,
): Promise<Array<{ stageId: string; stageName: string; count: number; totalValue: number }>> {
  const rows = await db
    .selectFrom('stage_definitions as sd')
    .leftJoin('records as r', (join) =>
      join
        .onRef('r.current_stage_id', '=', 'sd.id')
        .on('r.tenant_id', '=', tenantId),
    )
    .select([
      'sd.id as stage_id',
      'sd.name as stage_name',
      sql<number>`COUNT(r.id)::int`.as('count'),
      sql<number>`COALESCE(SUM((r.field_values->>'value')::numeric), 0)`.as(
        'total_value',
      ),
    ])
    .where('sd.pipeline_id', '=', pipelineId)
    .where('sd.tenant_id', '=', tenantId)
    .groupBy(['sd.id', 'sd.name', 'sd.sort_order'])
    .orderBy('sd.sort_order', 'asc')
    .execute();

  return rows.map((row) => ({
    stageId: row.stage_id,
    stageName: row.stage_name,
    count: row.count,
    totalValue: Number(row.total_value),
  }));
}
