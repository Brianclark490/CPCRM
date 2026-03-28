import { randomUUID } from 'crypto';
import { logger } from '../lib/logger.js';
import { pool } from '../db/client.js';
import { assignDefaultPipeline } from './stageMovementService.js';

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

export interface RecordWithLabels extends RecordRow {
  fields: Array<{
    apiName: string;
    label: string;
    fieldType: string;
    value: unknown;
  }>;
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
  page: number;
  limit: number;
  object: ObjectDefinitionRow;
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

/**
 * Field api_names in the database are validated against this regex on creation.
 * We recheck before interpolating into SQL as a defence-in-depth measure.
 */
const SAFE_IDENTIFIER_RE = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;

function isSafeIdentifier(value: string): boolean {
  return SAFE_IDENTIFIER_RE.test(value);
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
      };
    }
    return {
      apiName: fd.apiName,
      label: fd.label,
      fieldType: fd.fieldType,
      value: record.fieldValues[fd.apiName] ?? null,
    };
  });

  return { ...record, fields };
}

// ─── Object & Field Resolution ───────────────────────────────────────────────

export async function resolveObjectByApiName(
  tenantId: string,
  apiName: string,
): Promise<ObjectDefinitionRow> {
  const result = await pool.query(
    'SELECT * FROM object_definitions WHERE api_name = $1 AND tenant_id = $2',
    [apiName, tenantId],
  );

  if (result.rows.length === 0) {
    throwNotFoundError(`Object type '${apiName}' not found`);
  }

  return rowToObjectDefinition(result.rows[0]);
}

export async function getFieldDefinitions(
  tenantId: string,
  objectId: string,
): Promise<FieldDefinitionRow[]> {
  const result = await pool.query(
    'SELECT * FROM field_definitions WHERE object_id = $1 AND tenant_id = $2 ORDER BY sort_order ASC',
    [objectId, tenantId],
  );

  return result.rows.map((row: Record<string, unknown>) => rowToFieldDef(row));
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
        new URL(value);
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
 * Validates field_values against field_definitions.
 * - Required fields must be present
 * - Field types must match
 * - Unknown fields are silently ignored
 *
 * @param partial - When true, only validate fields that are present (for updates)
 */
export function validateFieldValues(
  fieldValues: Record<string, unknown>,
  fieldDefs: FieldDefinitionRow[],
  partial: boolean = false,
): void {
  const fieldMap = new Map(fieldDefs.map((fd) => [fd.apiName, fd]));

  // Check required fields (only on create, i.e. partial = false)
  // Skip formula fields — they are computed, not user-provided
  if (!partial) {
    for (const fd of fieldDefs) {
      if (fd.required && fd.fieldType !== 'formula') {
        const val = fieldValues[fd.apiName];
        if (val === undefined || val === null || val === '') {
          throwValidationError(`Field '${fd.label}' is required`);
        }
      }
    }
  }

  // Validate each provided field value against its definition
  for (const [key, value] of Object.entries(fieldValues)) {
    const fd = fieldMap.get(key);
    if (!fd) {
      // Unknown fields are silently ignored per spec
      continue;
    }
    const error = validateFieldValue(fd, value);
    if (error) {
      throwValidationError(error);
    }
  }
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

  // Filter field_values to only include known fields
  const knownFieldNames = new Set(fieldDefs.map((fd) => fd.apiName));
  const cleanedValues: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fieldValues)) {
    if (knownFieldNames.has(key)) {
      cleanedValues[key] = value;
    }
  }

  // Validate
  validateFieldValues(cleanedValues, fieldDefs, false);

  // Determine the record name from field_values
  const name = resolveRecordName(cleanedValues, fieldDefs, objectDef);

  const recordId = randomUUID();
  const now = new Date();

  // Use a transaction so pipeline assignment is atomic with record creation
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `INSERT INTO records (id, tenant_id, object_id, name, field_values, owner_id, owner_name, updated_by, updated_by_name, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [recordId, tenantId, objectDef.id, name, JSON.stringify(cleanedValues), ownerId, ownerName ?? null, ownerId, ownerName ?? null, now, now],
    );

    // Auto-assign default pipeline if one exists for this object
    await assignDefaultPipeline(client, recordId, objectDef.id, ownerId, tenantId);

    // Re-fetch the record to pick up pipeline columns
    const finalResult = await client.query(
      'SELECT * FROM records WHERE id = $1',
      [recordId],
    );

    await client.query('COMMIT');

    logger.info({ recordId, objectId: objectDef.id, apiName, ownerId }, 'Record created');

    const record = rowToRecord(finalResult.rows[0]);
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
  page: number;
  limit: number;
  sortBy?: string;
  sortDir?: string;
}): Promise<ListRecordsResult> {
  const { tenantId, apiName, ownerId, search, page, limit, sortBy, sortDir } = params;

  const objectDef = await resolveObjectByApiName(tenantId, apiName);
  const fieldDefs = await getFieldDefinitions(tenantId, objectDef.id);

  const queryParams: unknown[] = [objectDef.id, tenantId];
  let whereClause = 'WHERE r.object_id = $1 AND r.tenant_id = $2';

  if (search && search.trim().length > 0) {
    const searchTerm = `%${search.trim()}%`;
    queryParams.push(searchTerm);
    const paramIdx = queryParams.length;

    // Search against name field and text/email fields via JSONB
    const textFields = fieldDefs.filter(
      (fd) => fd.fieldType === 'text' || fd.fieldType === 'email' || fd.fieldType === 'textarea',
    );

    const searchConditions = [`r.name ILIKE $${paramIdx}`];
    for (const tf of textFields) {
      if (isSafeIdentifier(tf.apiName)) {
        searchConditions.push(`r.field_values->>'${tf.apiName}' ILIKE $${paramIdx}`);
      }
    }

    whereClause += ` AND (${searchConditions.join(' OR ')})`;
  }

  // Count
  const countResult = await pool.query(
    `SELECT COUNT(*) AS total FROM records r ${whereClause}`,
    queryParams,
  );
  const total = parseInt(countResult.rows[0].total as string, 10);

  // Sorting
  let orderClause = 'ORDER BY r.created_at DESC';
  if (sortBy) {
    const direction = sortDir?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    if (sortBy === 'name') {
      orderClause = `ORDER BY r.name ${direction}`;
    } else if (sortBy === 'created_at') {
      orderClause = `ORDER BY r.created_at ${direction}`;
    } else if (sortBy === 'updated_at') {
      orderClause = `ORDER BY r.updated_at ${direction}`;
    } else {
      // Sort by a JSONB field
      const fieldDef = fieldDefs.find((fd) => fd.apiName === sortBy);
      if (fieldDef && isSafeIdentifier(fieldDef.apiName)) {
        orderClause = `ORDER BY r.field_values->>'${fieldDef.apiName}' ${direction}`;
      }
    }
  }

  const offset = (page - 1) * limit;
  queryParams.push(limit, offset);

  const dataResult = await pool.query(
    `SELECT * FROM records r ${whereClause} ${orderClause} LIMIT $${queryParams.length - 1} OFFSET $${queryParams.length}`,
    queryParams,
  );

  const data = dataResult.rows.map((row: Record<string, unknown>) => {
    const record = rowToRecord(row);
    return resolveFieldLabels(record, fieldDefs);
  });

  return { data, total, page, limit, object: objectDef };
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

  const result = await pool.query(
    'SELECT * FROM records WHERE id = $1 AND object_id = $2 AND tenant_id = $3',
    [recordId, objectDef.id, tenantId],
  );

  if (result.rows.length === 0) {
    throwNotFoundError('Record not found');
  }

  const record = rowToRecord(result.rows[0]);
  const withLabels = resolveFieldLabels(record, fieldDefs);

  // Fetch relationships for this object
  const relResult = await pool.query(
    `SELECT rd.*, 
            src_obj.label AS source_object_label,
            src_obj.api_name AS source_object_api_name,
            tgt_obj.label AS target_object_label,
            tgt_obj.api_name AS target_object_api_name
     FROM relationship_definitions rd
     JOIN object_definitions src_obj ON src_obj.id = rd.source_object_id
     JOIN object_definitions tgt_obj ON tgt_obj.id = rd.target_object_id
     WHERE (rd.source_object_id = $1 OR rd.target_object_id = $1) AND rd.tenant_id = $2`,
    [objectDef.id, tenantId],
  );

  const relationships: RecordDetail['relationships'] = [];

  for (const relRow of relResult.rows) {
    const rel = relRow as Record<string, unknown>;
    const relId = rel.id as string;
    const sourceObjectId = rel.source_object_id as string;
    const relLabel = rel.label as string;
    const reverseLabel = (rel.reverse_label as string | null) ?? undefined;
    const relType = rel.relationship_type as string;
    const sourceObjectApiName = rel.source_object_api_name as string;
    const targetObjectApiName = rel.target_object_api_name as string;

    // Determine direction: is this record the source or target?
    const isSource = sourceObjectId === objectDef.id;

    let relatedRecords: Array<{ id: string; name: string; fieldValues: Record<string, unknown> }>;

    if (isSource) {
      // This record is the source — find target records
      const rrResult = await pool.query(
        `SELECT r.id, r.name, r.field_values
         FROM record_relationships rr
         JOIN records r ON r.id = rr.target_record_id
         WHERE rr.relationship_id = $1 AND rr.source_record_id = $2`,
        [relId, recordId],
      );
      relatedRecords = rrResult.rows.map((r: Record<string, unknown>) => ({
        id: r.id as string,
        name: r.name as string,
        fieldValues: (r.field_values as Record<string, unknown>) ?? {},
      }));
    } else {
      // This record is the target — find source records
      const rrResult = await pool.query(
        `SELECT r.id, r.name, r.field_values
         FROM record_relationships rr
         JOIN records r ON r.id = rr.source_record_id
         WHERE rr.relationship_id = $1 AND rr.target_record_id = $2`,
        [relId, recordId],
      );
      relatedRecords = rrResult.rows.map((r: Record<string, unknown>) => ({
        id: r.id as string,
        name: r.name as string,
        fieldValues: (r.field_values as Record<string, unknown>) ?? {},
      }));
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
  const existing = await pool.query(
    'SELECT * FROM records WHERE id = $1 AND object_id = $2 AND tenant_id = $3',
    [recordId, objectDef.id, tenantId],
  );

  if (existing.rows.length === 0) {
    throwNotFoundError('Record not found');
  }

  // Filter field_values to only include known fields
  const knownFieldNames = new Set(fieldDefs.map((fd) => fd.apiName));
  const cleanedValues: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fieldValues)) {
    if (knownFieldNames.has(key)) {
      cleanedValues[key] = value;
    }
  }

  // Validate changed fields only (partial update)
  validateFieldValues(cleanedValues, fieldDefs, true);

  // Merge with existing field_values
  const existingRecord = rowToRecord(existing.rows[0]);
  const mergedValues = { ...existingRecord.fieldValues, ...cleanedValues };

  // Determine the new record name
  const name = resolveRecordName(mergedValues, fieldDefs, objectDef);

  const now = new Date();

  // If the stage field changed and the record has a pipeline, sync current_stage_id
  const stageFieldChanged = 'stage' in cleanedValues && cleanedValues.stage !== existingRecord.fieldValues.stage;
  let stageUpdateClause = '';
  const updateParams: unknown[] = [name, JSON.stringify(mergedValues), now, ownerId, updatedByName ?? null];

  if (stageFieldChanged && existingRecord.pipelineId && typeof cleanedValues.stage === 'string') {
    const stageValue = cleanedValues.stage.trim().toLowerCase();
    const stageResult = await pool.query(
      `SELECT id FROM stage_definitions
       WHERE pipeline_id = $1 AND tenant_id = $2
         AND (LOWER(name) = $3 OR LOWER(api_name) = $3)
       LIMIT 1`,
      [existingRecord.pipelineId, tenantId, stageValue],
    );

    if (stageResult.rows.length > 0) {
      const matchedStageId = (stageResult.rows[0] as Record<string, unknown>).id as string;
      stageUpdateClause = `, current_stage_id = $${updateParams.length + 1}, stage_entered_at = $${updateParams.length + 2}`;
      updateParams.push(matchedStageId, now);
    }
  }

  updateParams.push(recordId, objectDef.id, tenantId);
  const idxRecord = updateParams.length - 2;
  const idxObject = updateParams.length - 1;
  const idxTenant = updateParams.length;

  const result = await pool.query(
    `UPDATE records
     SET name = $1, field_values = $2, updated_at = $3, updated_by = $4, updated_by_name = $5${stageUpdateClause}
     WHERE id = $${idxRecord} AND object_id = $${idxObject} AND tenant_id = $${idxTenant}
     RETURNING *`,
    updateParams,
  );

  logger.info({ recordId, objectId: objectDef.id, apiName, ownerId }, 'Record updated');

  const record = rowToRecord(result.rows[0]);
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
  const result = await pool.query(
    'DELETE FROM records WHERE id = $1 AND object_id = $2 AND tenant_id = $3',
    [recordId, objectDef.id, tenantId],
  );

  if (result.rowCount === 0) {
    throwNotFoundError('Record not found');
  }

  logger.info({ recordId, objectId: objectDef.id, apiName, ownerId }, 'Record deleted');
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
