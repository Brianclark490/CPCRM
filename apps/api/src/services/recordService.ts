import { randomUUID } from 'crypto';
import { sql } from 'kysely';
import { logger } from '../lib/logger.js';
import { pool } from '../db/client.js';
import { db } from '../db/kysely.js';
import type { Json } from '../db/kysely.types.js';
import { assignDefaultPipeline } from './stageMovementService.js';
import { validateWithZod, type FieldValidationErrors } from './fieldValueSchema.js';

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
  name: string;
  fieldValues: Record<string, unknown>;
  ownerId: string;
  ownerName?: string;
  ownerRecordId?: string;
  updatedBy?: string;
  updatedByName?: string;
  updatedByRecordId?: string;
  pipelineId?: string;
  currentStageId?: string;
  stageEnteredAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface LinkedParentRecord {
  objectApiName: string;
  recordId: string;
  recordName: string;
}

export interface RecordWithLabels extends RecordRow {
  fields: Array<{
    apiName: string;
    label: string;
    fieldType: string;
    value: unknown;
    options: Record<string, unknown>;
  }>;
  linkedParent?: LinkedParentRecord;
}

export interface RecordDetail extends RecordWithLabels {
  relationships: Array<{
    relationshipId: string;
    label: string;
    reverseLabel?: string;
    relationshipType: string;
    direction: 'source' | 'target';
    relatedObjectApiName: string;
    records: Array<{
      id: string;
      name: string;
      fieldValues: Record<string, unknown>;
    }>;
  }>;
}

export interface ListRecordsResult {
  data: RecordWithLabels[];
  total: number;
  limit: number;
  offset: number;
  object: ObjectDefinitionRow;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function throwValidationError(message: string, fieldErrors?: FieldValidationErrors): never {
  const err = new Error(message) as Error & { code: string; fieldErrors?: FieldValidationErrors };
  err.code = 'VALIDATION_ERROR';
  if (fieldErrors) err.fieldErrors = fieldErrors;
  throw err;
}

function throwNotFoundError(message: string): never {
  const err = new Error(message) as Error & { code: string };
  err.code = 'NOT_FOUND';
  throw err;
}

/**
 * Field api_names in the database are validated against this regex on creation.
 * We recheck before interpolating into SQL as a defence-in-depth measure.
 */
const SAFE_IDENTIFIER_RE = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;

function isSafeIdentifier(value: string): boolean {
  return SAFE_IDENTIFIER_RE.test(value);
}

/**
 * Escapes special characters in a string before embedding it in a SQL LIKE
 * pattern.  Without this, user-supplied `%` and `_` characters would act as
 * wildcards and `\` could escape the surrounding pattern delimiters.
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/[%_\\]/g, '\\$&');
}

/**
 * Keys that must never appear in user-supplied field value objects.
 * Prevents prototype pollution when merging field_values.
 */
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Removes unsafe keys from an object to prevent prototype pollution.
 */
function stripUnsafeKeys(obj: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (!UNSAFE_KEYS.has(key)) {
      clean[key] = value;
    }
  }
  return clean;
}

// ─── Row → domain model ──────────────────────────────────────────────────────

function rowToRecord(row: Record<string, unknown>): RecordRow {
  return {
    id: row.id as string,
    objectId: row.object_id as string,
    name: row.name as string,
    fieldValues: (row.field_values as Record<string, unknown>) ?? {},
    ownerId: row.owner_id as string,
    ownerName: (row.owner_name as string) ?? undefined,
    ownerRecordId: (row.owner_record_id as string) ?? undefined,
    updatedBy: (row.updated_by as string) ?? undefined,
    updatedByName: (row.updated_by_name as string) ?? undefined,
    updatedByRecordId: (row.updated_by_record_id as string) ?? undefined,
    pipelineId: (row.pipeline_id as string) ?? undefined,
    currentStageId: (row.current_stage_id as string) ?? undefined,
    stageEnteredAt: row.stage_entered_at
      ? new Date(row.stage_entered_at as string)
      : undefined,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

function rowToObjectDefinition(row: Record<string, unknown>): ObjectDefinitionRow {
  return {
    id: row.id as string,
    apiName: row.api_name as string,
    label: row.label as string,
    pluralLabel: row.plural_label as string,
    isSystem: row.is_system as boolean,
    nameFieldId: (row.name_field_id as string | null) ?? undefined,
    nameTemplate: (row.name_template as string | null) ?? undefined,
  };
}

function rowToFieldDef(row: Record<string, unknown>): FieldDefinitionRow {
  return {
    id: row.id as string,
    objectId: row.object_id as string,
    apiName: row.api_name as string,
    label: row.label as string,
    fieldType: row.field_type as string,
    required: row.required as boolean,
    options: (row.options as Record<string, unknown>) ?? {},
    sortOrder: row.sort_order as number,
  };
}

// ─── Formula Evaluation ──────────────────────────────────────────────────────

/**
 * Safely evaluates a formula expression by parsing it into tokens and
 * computing the result. Only supports field references ({field_name}),
 * numeric literals, and basic arithmetic (+, -, *, /, parentheses).
 * No eval() is used — this is a simple recursive-descent parser.
 */
export function evaluateFormula(
  expression: string,
  fieldValues: Record<string, unknown>,
): number | null {
  // Replace field references with their numeric values
  const resolved = expression.replace(
    /\{([a-z][a-z0-9]*(?:_[a-z0-9]+)*)\}/g,
    (_match, fieldName: string) => {
      const val = fieldValues[fieldName];
      if (val === null || val === undefined || val === '') return 'NaN';
      const num = Number(val);
      return isNaN(num) ? 'NaN' : String(num);
    },
  );

  try {
    const result = parseExpression(resolved);
    if (result === null || !isFinite(result)) return null;
    return result;
  } catch {
    return null;
  }
}

// ── Recursive-descent arithmetic parser ──────────────────────────────────────

interface ParserState {
  input: string;
  pos: number;
}

function parseExpression(input: string): number | null {
  const state: ParserState = { input: input.trim(), pos: 0 };
  const result = parseAddSub(state);
  skipWhitespace(state);
  if (state.pos < state.input.length) return null; // unexpected trailing chars
  return result;
}

function skipWhitespace(state: ParserState): void {
  while (state.pos < state.input.length && state.input[state.pos] === ' ') {
    state.pos++;
  }
}

function parseAddSub(state: ParserState): number | null {
  let left = parseMulDiv(state);
  if (left === null) return null;

  while (true) {
    skipWhitespace(state);
    const ch = state.input[state.pos];
    if (ch === '+' || ch === '-') {
      state.pos++;
      const right = parseMulDiv(state);
      if (right === null) return null;
      left = ch === '+' ? left + right : left - right;
    } else {
      break;
    }
  }
  return left;
}

function parseMulDiv(state: ParserState): number | null {
  let left = parseUnary(state);
  if (left === null) return null;

  while (true) {
    skipWhitespace(state);
    const ch = state.input[state.pos];
    if (ch === '*' || ch === '/') {
      state.pos++;
      const right = parseUnary(state);
      if (right === null) return null;
      if (ch === '/' && right === 0) return null; // division by zero
      left = ch === '*' ? left * right : left / right;
    } else {
      break;
    }
  }
  return left;
}

function parseUnary(state: ParserState): number | null {
  skipWhitespace(state);
  if (state.input[state.pos] === '-') {
    state.pos++;
    const val = parsePrimary(state);
    if (val === null) return null;
    return -val;
  }
  if (state.input[state.pos] === '+') {
    state.pos++;
  }
  return parsePrimary(state);
}

function parsePrimary(state: ParserState): number | null {
  skipWhitespace(state);

  // Parenthesised sub-expression
  if (state.input[state.pos] === '(') {
    state.pos++;
    const val = parseAddSub(state);
    skipWhitespace(state);
    if (state.input[state.pos] !== ')') return null;
    state.pos++;
    return val;
  }

  // Number literal (including decimals)
  const start = state.pos;
  while (
    state.pos < state.input.length &&
    (state.input[state.pos] >= '0' && state.input[state.pos] <= '9' || state.input[state.pos] === '.')
  ) {
    state.pos++;
  }

  if (state.pos === start) return null; // no number found

  const numStr = state.input.slice(start, state.pos);
  const num = Number(numStr);
  return isNaN(num) ? null : num;
}

// ─── Resolve field labels with formula computation ───────────────────────────

function resolveFieldLabels(
  record: RecordRow,
  fieldDefs: FieldDefinitionRow[],
): RecordWithLabels {
  const fields = fieldDefs.map((fd) => {
    if (fd.fieldType === 'formula') {
      const expression = (fd.options.expression as string) ?? '';
      const outputType = (fd.options.output_type as string) ?? 'number';
      const precision = (fd.options.precision as number) ?? undefined;
      const computed = evaluateFormula(expression, record.fieldValues);
      let value: unknown = computed;
      if (computed !== null && precision !== undefined) {
        value = Number(computed.toFixed(precision));
      }
      if (computed !== null && outputType === 'text') {
        value = precision !== undefined ? computed.toFixed(precision) : String(computed);
      }
      return {
        apiName: fd.apiName,
        label: fd.label,
        fieldType: fd.fieldType,
        value,
        options: fd.options,
      };
    }
    return {
      apiName: fd.apiName,
      label: fd.label,
      fieldType: fd.fieldType,
      value: record.fieldValues[fd.apiName] ?? null,
      options: fd.options,
    };
  });

  return { ...record, fields };
}

// ─── Object & Field Resolution ───────────────────────────────────────────────

export async function resolveObjectByApiName(
  tenantId: string,
  apiName: string,
): Promise<ObjectDefinitionRow> {
  const row = await db
    .selectFrom('object_definitions')
    .selectAll()
    .where('api_name', '=', apiName)
    .where('tenant_id', '=', tenantId)
    .executeTakeFirst();

  if (!row) {
    throwNotFoundError(`Object type '${apiName}' not found`);
  }

  return rowToObjectDefinition(row as unknown as Record<string, unknown>);
}

export async function getFieldDefinitions(
  tenantId: string,
  objectId: string,
): Promise<FieldDefinitionRow[]> {
  const rows = await db
    .selectFrom('field_definitions')
    .selectAll()
    .where('object_id', '=', objectId)
    .where('tenant_id', '=', tenantId)
    .orderBy('sort_order', 'asc')
    .execute();

  return rows.map((row) => rowToFieldDef(row as unknown as Record<string, unknown>));
}

// ─── Field Value Validation ──────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function validateFieldValue(
  fieldDef: FieldDefinitionRow,
  value: unknown,
): string | null {
  // If value is null/undefined, skip type validation (required check is separate)
  if (value === null || value === undefined) return null;

  const { fieldType, label, options } = fieldDef;

  switch (fieldType) {
    case 'text': {
      if (typeof value !== 'string') {
        return `Field '${label}' must be a string`;
      }
      const maxLength = options.max_length as number | undefined;
      if (maxLength !== undefined && value.length > maxLength) {
        return `Field '${label}' must be ${maxLength} characters or fewer`;
      }
      return null;
    }

    case 'textarea': {
      if (typeof value !== 'string') {
        return `Field '${label}' must be a string`;
      }
      return null;
    }

    case 'number': {
      const num = Number(value);
      if (typeof value !== 'number' && typeof value !== 'string') {
        return `Field '${label}' must be a number`;
      }
      if (isNaN(num) || !isFinite(num)) {
        return `Field '${label}' must be a valid number`;
      }
      const min = options.min as number | undefined;
      const max = options.max as number | undefined;
      if (min !== undefined && num < min) {
        return `Field '${label}' must be at least ${min}`;
      }
      if (max !== undefined && num > max) {
        return `Field '${label}' must be at most ${max}`;
      }
      return null;
    }

    case 'currency': {
      const curr = Number(value);
      if (typeof value !== 'number' && typeof value !== 'string') {
        return `Field '${label}' must be a number`;
      }
      if (isNaN(curr) || !isFinite(curr)) {
        return `Field '${label}' must be a valid number`;
      }
      const cMin = options.min as number | undefined;
      const cMax = options.max as number | undefined;
      if (cMin !== undefined && curr < cMin) {
        return `Field '${label}' must be at least ${cMin}`;
      }
      if (cMax !== undefined && curr > cMax) {
        return `Field '${label}' must be at most ${cMax}`;
      }
      return null;
    }

    case 'date': {
      if (typeof value !== 'string') {
        return `Field '${label}' must be an ISO 8601 date string`;
      }
      if (!ISO_DATE_RE.test(value)) {
        return `Field '${label}' must be a valid date (YYYY-MM-DD)`;
      }
      const d = new Date(value);
      if (isNaN(d.getTime())) {
        return `Field '${label}' must be a valid date (YYYY-MM-DD)`;
      }
      return null;
    }

    case 'datetime': {
      if (typeof value !== 'string') {
        return `Field '${label}' must be an ISO 8601 datetime string`;
      }
      const dt = new Date(value);
      if (isNaN(dt.getTime())) {
        return `Field '${label}' must be a valid datetime`;
      }
      return null;
    }

    case 'email': {
      if (typeof value !== 'string') {
        return `Field '${label}' must be a valid email`;
      }
      if (!EMAIL_RE.test(value)) {
        return `Field '${label}' must be a valid email`;
      }
      return null;
    }

    case 'phone': {
      if (typeof value !== 'string') {
        return `Field '${label}' must be a string`;
      }
      return null;
    }

    case 'url': {
      if (typeof value !== 'string') {
        return `Field '${label}' must be a valid URL`;
      }
      try {
        const parsed = new URL(value);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          return `Field '${label}' must use http or https protocol`;
        }
      } catch {
        return `Field '${label}' must be a valid URL`;
      }
      return null;
    }

    case 'boolean': {
      if (typeof value !== 'boolean') {
        return `Field '${label}' must be true or false`;
      }
      return null;
    }

    case 'dropdown': {
      if (typeof value !== 'string') {
        return `Field '${label}' must be a string`;
      }
      // Pipeline-managed dropdowns get their choices from stage_definitions,
      // not from field_definitions.options.choices — skip choice validation
      if (options.pipeline_managed === true) {
        return null;
      }
      const choices = (options.choices as string[]) ?? [];
      if (!choices.includes(value)) {
        return `Field '${label}' must be one of: ${choices.join(', ')}`;
      }
      return null;
    }

    case 'multi_select': {
      if (!Array.isArray(value)) {
        return `Field '${label}' must be an array`;
      }
      const msChoices = (options.choices as string[]) ?? [];
      for (const item of value) {
        if (typeof item !== 'string' || !msChoices.includes(item)) {
          return `Field '${label}' contains invalid choice '${String(item)}'. Valid choices: ${msChoices.join(', ')}`;
        }
      }
      return null;
    }

    case 'formula':
      // Formula fields are computed, not user-provided — skip validation
      return null;

    default:
      return null;
  }
}

/**
 * Validates field_values against field_definitions using Zod schemas.
 * - Builds dynamic Zod schemas from field definitions
 * - Required fields must be present (on create)
 * - Type coercion: string "123" → number 123 for number/currency fields
 * - Unknown fields are stripped from the result
 * - Formula and pipeline_managed fields are skipped
 * - Returns coerced and stripped field values on success
 *
 * @param partial - When true, all fields are optional (for updates)
 * @returns Validated and coerced field values with unknown fields stripped
 */
export function validateFieldValues(
  fieldValues: Record<string, unknown>,
  fieldDefs: FieldDefinitionRow[],
  partial: boolean = false,
): Record<string, unknown> {
  const result = validateWithZod(fieldValues, fieldDefs, partial);

  if (!result.success) {
    // Build a human-readable summary from the first error
    const firstField = Object.keys(result.fieldErrors)[0];
    const firstMessage = result.fieldErrors[firstField];
    throwValidationError(firstMessage, result.fieldErrors);
  }

  return result.data;
}

// ─── Service Functions ───────────────────────────────────────────────────────

/**
 * Creates a new record of the given object type.
 *
 * 1. Look up object_definition by apiName
 * 2. Fetch field_definitions for validation
 * 3. Validate field_values against field definitions
 * 4. Set owner_id from auth
 * 5. Set name from a designated "name" field or first text field
 * 6. Insert into records table
 */
export async function createRecord(
  tenantId: string,
  apiName: string,
  fieldValues: Record<string, unknown>,
  ownerId: string,
  ownerName?: string,
): Promise<RecordWithLabels> {
  const objectDef = await resolveObjectByApiName(tenantId, apiName);
  const fieldDefs = await getFieldDefinitions(tenantId, objectDef.id);

  // Filter field_values to strip unsafe keys before validation
  const safeFieldValues = stripUnsafeKeys(fieldValues);

  // Validate with Zod — returns coerced values with unknown fields stripped
  const cleanedValues = validateFieldValues(safeFieldValues, fieldDefs, false);

  // Determine the record name from field_values
  const name = resolveRecordName(cleanedValues, fieldDefs, objectDef);

  const recordId = randomUUID();
  const now = new Date();

  // Use pool.connect() rather than db.transaction() so we can pass the
  // checked-out pg.PoolClient to assignDefaultPipeline (which is still on
  // raw pg).  The INSERT and refetch inside the transaction are compiled
  // by Kysely and executed via the same client, giving us the same
  // atomicity as a Kysely transaction.  Once stageMovementService is
  // migrated to Kysely (Phase 3b), this can become a `db.transaction()`.
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const insertCompiled = db
      .insertInto('records')
      .values({
        id: recordId,
        tenant_id: tenantId,
        object_id: objectDef.id,
        name,
        field_values: JSON.stringify(cleanedValues) as unknown as Json,
        owner_id: ownerId,
        owner_name: ownerName ?? null,
        updated_by: ownerId,
        updated_by_name: ownerName ?? null,
        created_at: now,
        updated_at: now,
      })
      .returningAll()
      .compile();

    await client.query(insertCompiled.sql, [...insertCompiled.parameters]);

    // Auto-assign default pipeline if one exists for this object
    await assignDefaultPipeline(client, recordId, objectDef.id, ownerId, tenantId);

    // Re-fetch the record to pick up pipeline columns. We scope the WHERE
    // clause by id + object_id + tenant_id as defence-in-depth — even
    // though this runs inside the same transaction as the INSERT, we
    // don't want the refetch to rely on RLS alone (ADR-006).
    const refetchCompiled = db
      .selectFrom('records')
      .selectAll()
      .where('id', '=', recordId)
      .where('object_id', '=', objectDef.id)
      .where('tenant_id', '=', tenantId)
      .compile();

    const finalResult = await client.query(
      refetchCompiled.sql,
      [...refetchCompiled.parameters],
    );

    await client.query('COMMIT');

    logger.info({ recordId, objectId: objectDef.id, apiName, ownerId }, 'Record created');

    const record = rowToRecord(finalResult.rows[0] as Record<string, unknown>);
    return resolveFieldLabels(record, fieldDefs);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Lists records for the given object type with search, pagination, and sorting.
 * Returns records belonging to the specified tenant.
 */
export async function listRecords(params: {
  tenantId: string;
  apiName: string;
  ownerId: string;
  search?: string;
  limit: number;
  offset: number;
  sortBy?: string;
  sortDir?: string;
}): Promise<ListRecordsResult> {
  const { tenantId, apiName, ownerId, search, limit, offset, sortBy, sortDir } = params;
  // ownerId is currently used via filters at the route/service level (reserved for future scoping)
  void ownerId;

  const objectDef = await resolveObjectByApiName(tenantId, apiName);
  const fieldDefs = await getFieldDefinitions(tenantId, objectDef.id);

  const trimmedSearch = search?.trim();
  const hasSearch = trimmedSearch !== undefined && trimmedSearch.length > 0;
  const searchTerm = hasSearch ? `%${escapeLikePattern(trimmedSearch)}%` : '';
  // Only text-like columns participate in ILIKE search
  const textFields = hasSearch
    ? fieldDefs.filter(
        (fd) =>
          fd.fieldType === 'text' ||
          fd.fieldType === 'email' ||
          fd.fieldType === 'textarea',
      )
    : [];
  const safeTextFields = textFields.filter((fd) => isSafeIdentifier(fd.apiName));

  // ─── COUNT query — separate from the data query so we never chain count
  // onto a `.selectAll()` (the Kysely spike hit exactly this bug).
  let countQuery = db
    .selectFrom('records as r')
    .select((eb) => eb.fn.countAll<string>().as('total'))
    .where('r.object_id', '=', objectDef.id)
    .where('r.tenant_id', '=', tenantId);

  if (hasSearch) {
    countQuery = countQuery.where((eb) => {
      const conds = [
        eb('r.name', 'ilike', searchTerm),
        ...safeTextFields.map((tf) =>
          // Parameterised JSONB key access — `tf.apiName` is bound as a
          // parameter, not interpolated into SQL. See ADR-006 Appendix A.
          eb(sql<string>`r.field_values->>${tf.apiName}`, 'ilike', searchTerm),
        ),
      ];
      return eb.or(conds);
    });
  }

  const countRow = await countQuery.executeTakeFirstOrThrow();
  const total = parseInt(countRow.total as unknown as string, 10);

  // ─── Data query
  let dataQuery = db
    .selectFrom('records as r')
    .selectAll('r')
    .where('r.object_id', '=', objectDef.id)
    .where('r.tenant_id', '=', tenantId);

  if (hasSearch) {
    dataQuery = dataQuery.where((eb) => {
      const conds = [
        eb('r.name', 'ilike', searchTerm),
        ...safeTextFields.map((tf) =>
          eb(sql<string>`r.field_values->>${tf.apiName}`, 'ilike', searchTerm),
        ),
      ];
      return eb.or(conds);
    });
  }

  // Sorting — defence-in-depth via isSafeIdentifier + parameter binding
  const direction: 'asc' | 'desc' =
    sortDir?.toUpperCase() === 'ASC' ? 'asc' : 'desc';
  if (sortBy === 'name') {
    dataQuery = dataQuery.orderBy('r.name', direction);
  } else if (sortBy === 'created_at') {
    dataQuery = dataQuery.orderBy('r.created_at', direction);
  } else if (sortBy === 'updated_at') {
    dataQuery = dataQuery.orderBy('r.updated_at', direction);
  } else if (sortBy) {
    const fieldDef = fieldDefs.find((fd) => fd.apiName === sortBy);
    if (fieldDef && isSafeIdentifier(fieldDef.apiName)) {
      dataQuery = dataQuery.orderBy(
        sql`r.field_values->>${fieldDef.apiName}` as never,
        direction,
      );
    } else {
      dataQuery = dataQuery.orderBy('r.created_at', 'desc');
    }
  } else {
    dataQuery = dataQuery.orderBy('r.created_at', 'desc');
  }

  dataQuery = dataQuery.limit(limit).offset(offset);

  const dataRows = await dataQuery.execute();

  const data = dataRows.map((row) => {
    const record = rowToRecord(row as unknown as Record<string, unknown>);
    return resolveFieldLabels(record, fieldDefs);
  });

  // Batch-fetch linked parent account names for all records in the page.
  // This resolves the first account linked via any lookup relationship
  // where this object type is the source and account is the target.
  if (data.length > 0) {
    const recordIds = data.map((r) => r.id);

    const linkedRows = await db
      .selectFrom('record_relationships as rr')
      .innerJoin(
        'relationship_definitions as rd',
        'rd.id',
        'rr.relationship_id',
      )
      .innerJoin(
        'object_definitions as tgt_obj',
        'tgt_obj.id',
        'rd.target_object_id',
      )
      .innerJoin('records as acct', 'acct.id', 'rr.target_record_id')
      .select((eb) => [
        'rr.source_record_id',
        eb.ref('acct.id').as('account_id'),
        eb.ref('acct.name').as('account_name'),
      ])
      .where(sql<boolean>`rr.source_record_id = any(${recordIds})`)
      .where('rd.source_object_id', '=', objectDef.id)
      .where('tgt_obj.api_name', '=', 'account')
      // Defence-in-depth: scope every tenant-aware table, not just rd.
      // Allows use of the (tenant_id, …) indexes on record_relationships
      // and records.
      .where('rd.tenant_id', '=', tenantId)
      .where('rr.tenant_id', '=', tenantId)
      .where('acct.tenant_id', '=', tenantId)
      .execute();

    const linkedMap = new Map<string, LinkedParentRecord>();
    for (const row of linkedRows) {
      const r = row as unknown as Record<string, unknown>;
      const sourceId = r.source_record_id as string;
      // Keep the first match per source record
      if (!linkedMap.has(sourceId)) {
        linkedMap.set(sourceId, {
          objectApiName: 'account',
          recordId: r.account_id as string,
          recordName: r.account_name as string,
        });
      }
    }

    for (const record of data) {
      const linked = linkedMap.get(record.id);
      if (linked) {
        record.linkedParent = linked;
      }
    }
  }

  return { data, total, limit, offset, object: objectDef };
}

/**
 * Returns a single record by ID with field labels and related records.
 */
export async function getRecord(
  tenantId: string,
  apiName: string,
  recordId: string,
  ownerId: string,
): Promise<RecordDetail> {
  const objectDef = await resolveObjectByApiName(tenantId, apiName);
  const fieldDefs = await getFieldDefinitions(tenantId, objectDef.id);

  const row = await db
    .selectFrom('records')
    .selectAll()
    .where('id', '=', recordId)
    .where('object_id', '=', objectDef.id)
    .where('tenant_id', '=', tenantId)
    .executeTakeFirst();

  if (!row) {
    throwNotFoundError('Record not found');
  }

  const record = rowToRecord(row as unknown as Record<string, unknown>);
  const withLabels = resolveFieldLabels(record, fieldDefs);

  // Fetch relationships that touch this object type
  const relRows = await db
    .selectFrom('relationship_definitions as rd')
    .innerJoin(
      'object_definitions as src_obj',
      'src_obj.id',
      'rd.source_object_id',
    )
    .innerJoin(
      'object_definitions as tgt_obj',
      'tgt_obj.id',
      'rd.target_object_id',
    )
    .select((eb) => [
      'rd.id',
      'rd.source_object_id',
      'rd.target_object_id',
      'rd.label',
      'rd.reverse_label',
      'rd.relationship_type',
      eb.ref('src_obj.label').as('source_object_label'),
      eb.ref('src_obj.api_name').as('source_object_api_name'),
      eb.ref('tgt_obj.label').as('target_object_label'),
      eb.ref('tgt_obj.api_name').as('target_object_api_name'),
    ])
    .where((eb) =>
      eb.or([
        eb('rd.source_object_id', '=', objectDef.id),
        eb('rd.target_object_id', '=', objectDef.id),
      ]),
    )
    .where('rd.tenant_id', '=', tenantId)
    .execute();

  const relationships: RecordDetail['relationships'] = [];

  for (const relRow of relRows) {
    const rel = relRow as unknown as Record<string, unknown>;
    const relId = rel.id as string;
    const sourceObjectId = rel.source_object_id as string;
    const relLabel = rel.label as string;
    const reverseLabel = (rel.reverse_label as string | null) ?? undefined;
    const relType = rel.relationship_type as string;
    const sourceObjectApiName = rel.source_object_api_name as string;
    const targetObjectApiName = rel.target_object_api_name as string;

    // Determine direction: is this record the source or target?
    const isSource = sourceObjectId === objectDef.id;

    let relatedRecords: Array<{
      id: string;
      name: string;
      fieldValues: Record<string, unknown>;
    }>;

    if (isSource) {
      // This record is the source — find target records
      const rrRows = await db
        .selectFrom('record_relationships as rr')
        .innerJoin('records as r', 'r.id', 'rr.target_record_id')
        .select(['r.id', 'r.name', 'r.field_values'])
        .where('rr.relationship_id', '=', relId)
        .where('rr.source_record_id', '=', recordId)
        // Defence-in-depth: scope both tenant-aware tables.
        .where('rr.tenant_id', '=', tenantId)
        .where('r.tenant_id', '=', tenantId)
        .execute();
      relatedRecords = rrRows.map((r) => {
        const rec = r as unknown as Record<string, unknown>;
        return {
          id: rec.id as string,
          name: rec.name as string,
          fieldValues: (rec.field_values as Record<string, unknown>) ?? {},
        };
      });
    } else {
      // This record is the target — find source records
      const rrRows = await db
        .selectFrom('record_relationships as rr')
        .innerJoin('records as r', 'r.id', 'rr.source_record_id')
        .select(['r.id', 'r.name', 'r.field_values'])
        .where('rr.relationship_id', '=', relId)
        .where('rr.target_record_id', '=', recordId)
        // Defence-in-depth: scope both tenant-aware tables.
        .where('rr.tenant_id', '=', tenantId)
        .where('r.tenant_id', '=', tenantId)
        .execute();
      relatedRecords = rrRows.map((r) => {
        const rec = r as unknown as Record<string, unknown>;
        return {
          id: rec.id as string,
          name: rec.name as string,
          fieldValues: (rec.field_values as Record<string, unknown>) ?? {},
        };
      });
    }

    relationships.push({
      relationshipId: relId,
      label: isSource ? relLabel : (reverseLabel ?? relLabel),
      reverseLabel,
      relationshipType: relType,
      direction: isSource ? 'source' : 'target',
      relatedObjectApiName: isSource ? targetObjectApiName : sourceObjectApiName,
      records: relatedRecords,
    });
  }

  return { ...withLabels, relationships };
}

/**
 * Updates an existing record. Only validates fields that are present (partial update).
 */
export async function updateRecord(
  tenantId: string,
  apiName: string,
  recordId: string,
  fieldValues: Record<string, unknown>,
  ownerId: string,
  updatedByName?: string,
): Promise<RecordWithLabels> {
  const objectDef = await resolveObjectByApiName(tenantId, apiName);
  const fieldDefs = await getFieldDefinitions(tenantId, objectDef.id);

  // Verify the record exists within this tenant
  const existingRow = await db
    .selectFrom('records')
    .selectAll()
    .where('id', '=', recordId)
    .where('object_id', '=', objectDef.id)
    .where('tenant_id', '=', tenantId)
    .executeTakeFirst();

  if (!existingRow) {
    throwNotFoundError('Record not found');
  }

  // Strip unsafe keys before validation
  const safeFieldValues = stripUnsafeKeys(fieldValues);

  // Validate with Zod — returns coerced values with unknown fields stripped
  const cleanedValues = validateFieldValues(safeFieldValues, fieldDefs, true);

  // Merge with existing field_values
  const existingRecord = rowToRecord(
    existingRow as unknown as Record<string, unknown>,
  );
  const mergedValues = { ...existingRecord.fieldValues, ...cleanedValues };

  // Determine the new record name
  const name = resolveRecordName(mergedValues, fieldDefs, objectDef);

  const now = new Date();

  // If the stage field changed and the record has a pipeline, look up the
  // matching stage_definitions.id so we can sync current_stage_id + stage_entered_at.
  let matchedStageId: string | null = null;
  const stageFieldChanged =
    'stage' in cleanedValues &&
    cleanedValues.stage !== existingRecord.fieldValues.stage;

  if (
    stageFieldChanged &&
    existingRecord.pipelineId &&
    typeof cleanedValues.stage === 'string'
  ) {
    const stageValue = cleanedValues.stage.trim().toLowerCase();
    const stageRow = await db
      .selectFrom('stage_definitions')
      .select('id')
      .where('pipeline_id', '=', existingRecord.pipelineId)
      .where('tenant_id', '=', tenantId)
      .where((eb) =>
        eb.or([
          eb(sql<string>`lower(name)`, '=', stageValue),
          eb(sql<string>`lower(api_name)`, '=', stageValue),
        ]),
      )
      .limit(1)
      .executeTakeFirst();

    if (stageRow) {
      matchedStageId = (stageRow as unknown as { id: string }).id;
    }
  }

  // Build the dynamic SET object.  Kysely emits the columns in insertion
  // order — we keep `name, field_values, updated_at, updated_by,
  // updated_by_name` first so the compiled parameter positions stay
  // stable and readable.
  const set: Record<string, unknown> = {
    name,
    field_values: JSON.stringify(mergedValues) as unknown as Json,
    updated_at: now,
    updated_by: ownerId,
    updated_by_name: updatedByName ?? null,
  };
  if (matchedStageId) {
    set.current_stage_id = matchedStageId;
    set.stage_entered_at = now;
  }

  const updated = await db
    .updateTable('records')
    .set(set)
    .where('id', '=', recordId)
    .where('object_id', '=', objectDef.id)
    .where('tenant_id', '=', tenantId)
    .returningAll()
    .executeTakeFirstOrThrow();

  logger.info(
    { recordId, objectId: objectDef.id, apiName, ownerId },
    'Record updated',
  );

  const record = rowToRecord(updated as unknown as Record<string, unknown>);
  return resolveFieldLabels(record, fieldDefs);
}

/**
 * Deletes a record and its associated record_relationships.
 */
export async function deleteRecord(
  tenantId: string,
  apiName: string,
  recordId: string,
  ownerId: string,
): Promise<void> {
  const objectDef = await resolveObjectByApiName(tenantId, apiName);

  // record_relationships have ON DELETE CASCADE from records, so deleting
  // the record will automatically clean up relationships
  const results = await db
    .deleteFrom('records')
    .where('id', '=', recordId)
    .where('object_id', '=', objectDef.id)
    .where('tenant_id', '=', tenantId)
    .execute();

  const numDeleted = Number(results[0]?.numDeletedRows ?? 0n);
  if (numDeleted === 0) {
    throwNotFoundError('Record not found');
  }

  logger.info(
    { recordId, objectId: objectDef.id, apiName, ownerId },
    'Record deleted',
  );
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

/**
 * Resolves the record name from field_values using the object definition's
 * name_field_id or name_template configuration.
 *
 * Resolution order:
 * 1. name_template — if set, interpolate field values into the template (e.g. "{first_name} {last_name}")
 * 2. name_field_id — if set, use the value of the designated name field
 * 3. Explicit "name" field in field_values
 * 4. Concatenation of "first_name" + "last_name" (e.g. Contact objects)
 * 5. First required text field with a value
 * 6. First text field with a value
 * 7. "Untitled"
 */
function resolveRecordName(
  fieldValues: Record<string, unknown>,
  fieldDefs: FieldDefinitionRow[],
  objectDef: ObjectDefinitionRow,
): string {
  // 1. Use name_template if configured (e.g. "{first_name} {last_name}")
  if (objectDef.nameTemplate) {
    const result = objectDef.nameTemplate.replace(/\{(\w+)\}/g, (_match: string, key: string) => {
      const val = fieldValues[key];
      return val !== undefined && val !== null ? String(val).trim() : '';
    });
    const trimmed = result.trim();
    if (trimmed.length > 0) return trimmed;
  }

  // 2. Use name_field_id if configured
  if (objectDef.nameFieldId) {
    const nameField = fieldDefs.find((fd) => fd.id === objectDef.nameFieldId);
    if (nameField) {
      const val = fieldValues[nameField.apiName];
      if (val !== undefined && val !== null && String(val).trim().length > 0) {
        return String(val).trim();
      }
    }
  }

  // 3. Try the "name" field directly
  if (fieldValues['name'] !== undefined && fieldValues['name'] !== null) {
    return String(fieldValues['name']);
  }

  // 4. Try first_name + last_name concatenation (e.g. Contact records)
  const fieldApiNames = new Set(fieldDefs.map((fd) => fd.apiName));
  if (fieldApiNames.has('first_name') && fieldApiNames.has('last_name')) {
    const first = fieldValues['first_name'];
    const last = fieldValues['last_name'];
    const parts = [first, last]
      .filter((v) => v !== undefined && v !== null && String(v).trim().length > 0)
      .map(String);
    if (parts.length > 0) {
      return parts.join(' ');
    }
  }

  // 5. Fall back to the first required text field
  const sortedDefs = [...fieldDefs].sort((a, b) => a.sortOrder - b.sortOrder);

  for (const fd of sortedDefs) {
    if (fd.fieldType === 'text' && fd.required) {
      const val = fieldValues[fd.apiName];
      if (val !== undefined && val !== null && String(val).trim().length > 0) {
        return String(val);
      }
    }
  }

  // 6. Fall back to the first text field with a value
  for (const fd of sortedDefs) {
    if (fd.fieldType === 'text') {
      const val = fieldValues[fd.apiName];
      if (val !== undefined && val !== null && String(val).trim().length > 0) {
        return String(val);
      }
    }
  }

  return 'Untitled';
}
