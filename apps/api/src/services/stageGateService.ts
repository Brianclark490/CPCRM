import { randomUUID } from 'crypto';
import { logger } from '../lib/logger.js';
import { pool } from '../db/client.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StageGateResponse {
  id: string;
  stageId: string;
  field: {
    id: string;
    label: string;
    fieldType: string;
  };
  gateType: string;
  gateValue: string | null;
  errorMessage: string | null;
}

export interface CreateStageGateParams {
  fieldId: string;
  gateType: string;
  gateValue?: string | null;
  errorMessage?: string | null;
}

export interface UpdateStageGateParams {
  gateType?: string;
  gateValue?: string | null;
  errorMessage?: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ALLOWED_GATE_TYPES = new Set(['required', 'min_value', 'specific_value']);
const NUMERIC_FIELD_TYPES = new Set(['number', 'currency']);
const DROPDOWN_FIELD_TYPES = new Set(['dropdown']);

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

// ─── Row → response model ───────────────────────────────────────────────────

function rowToStageGateResponse(row: Record<string, unknown>): StageGateResponse {
  return {
    id: row.id as string,
    stageId: row.stage_id as string,
    field: {
      id: row.field_id as string,
      label: row.field_label as string,
      fieldType: row.field_type as string,
    },
    gateType: row.gate_type as string,
    gateValue: (row.gate_value as string | null) ?? null,
    errorMessage: (row.error_message as string | null) ?? null,
  };
}

// ─── Internal helpers ────────────────────────────────────────────────────────

interface StageWithObject {
  stageId: string;
  pipelineId: string;
  objectId: string;
}

async function resolveStageAndObject(tenantId: string, stageId: string): Promise<StageWithObject> {
  const result = await pool.query(
    `SELECT sd.id AS stage_id, sd.pipeline_id, pd.object_id
     FROM stage_definitions sd
     JOIN pipeline_definitions pd ON pd.id = sd.pipeline_id
     WHERE sd.id = $1 AND sd.tenant_id = $2`,
    [stageId, tenantId],
  );

  if (result.rows.length === 0) {
    throwNotFoundError('Stage not found');
  }

  const row = result.rows[0] as Record<string, unknown>;
  return {
    stageId: row.stage_id as string,
    pipelineId: row.pipeline_id as string,
    objectId: row.object_id as string,
  };
}

interface FieldInfo {
  id: string;
  fieldType: string;
  label: string;
  options: Record<string, unknown>;
}

async function getFieldInfo(fieldId: string, tenantId?: string): Promise<FieldInfo | null> {
  const query = tenantId
    ? 'SELECT id, field_type, label, options FROM field_definitions WHERE id = $1 AND tenant_id = $2'
    : 'SELECT id, field_type, label, options FROM field_definitions WHERE id = $1';
  const params: unknown[] = tenantId ? [fieldId, tenantId] : [fieldId];
  const result = await pool.query(query, params);

  if (result.rows.length === 0) return null;

  const row = result.rows[0] as Record<string, unknown>;
  return {
    id: row.id as string,
    fieldType: row.field_type as string,
    label: row.label as string,
    options: (row.options as Record<string, unknown>) ?? {},
  };
}

function validateGateTypeAgainstField(
  gateType: string,
  gateValue: string | null | undefined,
  field: FieldInfo,
): void {
  switch (gateType) {
    case 'required':
      break;

    case 'min_value':
      if (gateValue === null || gateValue === undefined || gateValue === '') {
        throwValidationError('gate_value is required for min_value gate type');
      }
      if (isNaN(Number(gateValue))) {
        throwValidationError('gate_value must be a number for min_value gate type');
      }
      if (!NUMERIC_FIELD_TYPES.has(field.fieldType)) {
        throwValidationError(
          `min_value gate type requires a number or currency field, but field "${field.label}" is ${field.fieldType}`,
        );
      }
      break;

    case 'specific_value':
      if (gateValue === null || gateValue === undefined || gateValue === '') {
        throwValidationError('gate_value is required for specific_value gate type');
      }
      if (!DROPDOWN_FIELD_TYPES.has(field.fieldType)) {
        throwValidationError(
          `specific_value gate type requires a dropdown field, but field "${field.label}" is ${field.fieldType}`,
        );
      }
      {
        const choices = field.options.choices as string[] | undefined;
        if (!choices || !choices.includes(gateValue as string)) {
          throwValidationError(
            `gate_value "${gateValue}" is not a valid choice for field "${field.label}"`,
          );
        }
      }
      break;

    default:
      throwValidationError(`gate_type must be one of: ${[...ALLOWED_GATE_TYPES].join(', ')}`);
  }
}

// ─── Query fragment for gates with field metadata ───────────────────────────

const GATE_SELECT_SQL = `
  SELECT sg.id, sg.stage_id, sg.field_id, sg.gate_type, sg.gate_value, sg.error_message,
         fd.label AS field_label, fd.field_type
  FROM stage_gates sg
  JOIN field_definitions fd ON fd.id = sg.field_id`;

// ─── Service functions ───────────────────────────────────────────────────────

/**
 * Lists all gates for a stage, including field metadata.
 *
 * @throws {Error} NOT_FOUND — stage does not exist
 */
export async function listStageGates(tenantId: string, stageId: string): Promise<StageGateResponse[]> {
  await resolveStageAndObject(tenantId, stageId);

  const result = await pool.query(
    `${GATE_SELECT_SQL} WHERE sg.stage_id = $1 AND sg.tenant_id = $2 ORDER BY sg.id`,
    [stageId, tenantId],
  );

  return result.rows.map((row: Record<string, unknown>) => rowToStageGateResponse(row));
}

/**
 * Creates a new stage gate.
 *
 * @throws {Error} NOT_FOUND — stage or field does not exist
 * @throws {Error} VALIDATION_ERROR — invalid input or gate_type/field_type mismatch
 * @throws {Error} CONFLICT — duplicate gate for same field on same stage
 */
export async function createStageGate(
  tenantId: string,
  stageId: string,
  params: CreateStageGateParams,
): Promise<StageGateResponse> {
  const stageInfo = await resolveStageAndObject(tenantId, stageId);

  // Validate required params
  if (!params.fieldId) {
    throwValidationError('field_id is required');
  }

  if (!params.gateType) {
    throwValidationError('gate_type is required');
  }

  if (!ALLOWED_GATE_TYPES.has(params.gateType)) {
    throwValidationError(`gate_type must be one of: ${[...ALLOWED_GATE_TYPES].join(', ')}`);
  }

  // Validate field exists and belongs to the pipeline's object
  const field = await getFieldInfo(params.fieldId, tenantId);
  if (!field) {
    throwNotFoundError('Field not found');
  }

  const fieldBelongsToObject = await pool.query(
    'SELECT id FROM field_definitions WHERE id = $1 AND object_id = $2 AND tenant_id = $3',
    [params.fieldId, stageInfo.objectId, tenantId],
  );
  if (fieldBelongsToObject.rows.length === 0) {
    throwValidationError('Field does not belong to the same object as the pipeline');
  }

  // Validate gate_type against field_type
  validateGateTypeAgainstField(params.gateType, params.gateValue ?? null, field);

  // Check for duplicate gate on same field/stage
  const duplicate = await pool.query(
    'SELECT id FROM stage_gates WHERE stage_id = $1 AND field_id = $2 AND tenant_id = $3',
    [stageId, params.fieldId, tenantId],
  );
  if (duplicate.rows.length > 0) {
    throwConflictError('A gate already exists for this field on this stage');
  }

  const gateId = randomUUID();

  await pool.query(
    `INSERT INTO stage_gates (id, tenant_id, stage_id, field_id, gate_type, gate_value, error_message)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      gateId,
      tenantId,
      stageId,
      params.fieldId,
      params.gateType,
      params.gateValue ?? null,
      params.errorMessage ?? null,
    ],
  );

  // Fetch the created gate with field metadata
  const result = await pool.query(
    `${GATE_SELECT_SQL} WHERE sg.id = $1 AND sg.tenant_id = $2`,
    [gateId, tenantId],
  );

  logger.info({ gateId, stageId, fieldId: params.fieldId }, 'Stage gate created');

  return rowToStageGateResponse(result.rows[0] as Record<string, unknown>);
}

/**
 * Updates an existing stage gate.
 *
 * @throws {Error} NOT_FOUND — stage or gate does not exist
 * @throws {Error} VALIDATION_ERROR — invalid input or gate_type/field_type mismatch
 */
export async function updateStageGate(
  tenantId: string,
  stageId: string,
  gateId: string,
  params: UpdateStageGateParams,
): Promise<StageGateResponse> {
  await resolveStageAndObject(tenantId, stageId);

  // Fetch existing gate
  const existing = await pool.query(
    'SELECT * FROM stage_gates WHERE id = $1 AND stage_id = $2 AND tenant_id = $3',
    [gateId, stageId, tenantId],
  );

  if (existing.rows.length === 0) {
    throwNotFoundError('Stage gate not found');
  }

  const existingRow = existing.rows[0] as Record<string, unknown>;

  // Determine effective gate_type and gate_value
  const effectiveGateType = params.gateType ?? (existingRow.gate_type as string);
  const effectiveGateValue = 'gateValue' in params
    ? (params.gateValue ?? null)
    : (existingRow.gate_value as string | null);

  if (!ALLOWED_GATE_TYPES.has(effectiveGateType)) {
    throwValidationError(`gate_type must be one of: ${[...ALLOWED_GATE_TYPES].join(', ')}`);
  }

  // Validate gate_type against field_type
  const field = await getFieldInfo(existingRow.field_id as string, tenantId);
  if (!field) {
    throwNotFoundError('Field not found');
  }

  validateGateTypeAgainstField(effectiveGateType, effectiveGateValue, field);

  // Build dynamic update
  const updates: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if ('gateType' in params) {
    updates.push(`gate_type = $${paramIndex++}`);
    values.push(params.gateType);
  }
  if ('gateValue' in params) {
    updates.push(`gate_value = $${paramIndex++}`);
    values.push(params.gateValue ?? null);
  }
  if ('errorMessage' in params) {
    updates.push(`error_message = $${paramIndex++}`);
    values.push(params.errorMessage ?? null);
  }

  if (updates.length === 0) {
    // Nothing to update — return existing gate with field metadata
    const result = await pool.query(
      `${GATE_SELECT_SQL} WHERE sg.id = $1 AND sg.tenant_id = $2`,
      [gateId, tenantId],
    );
    return rowToStageGateResponse(result.rows[0] as Record<string, unknown>);
  }

  values.push(gateId);
  values.push(stageId);
  values.push(tenantId);

  await pool.query(
    `UPDATE stage_gates SET ${updates.join(', ')} WHERE id = $${paramIndex++} AND stage_id = $${paramIndex++} AND tenant_id = $${paramIndex}`,
    values,
  );

  // Fetch the updated gate with field metadata
  const result = await pool.query(
    `${GATE_SELECT_SQL} WHERE sg.id = $1 AND sg.tenant_id = $2`,
    [gateId, tenantId],
  );

  logger.info({ gateId, stageId }, 'Stage gate updated');

  return rowToStageGateResponse(result.rows[0] as Record<string, unknown>);
}

/**
 * Deletes a stage gate.
 *
 * @throws {Error} NOT_FOUND — stage or gate does not exist
 */
export async function deleteStageGate(
  tenantId: string,
  stageId: string,
  gateId: string,
): Promise<void> {
  await resolveStageAndObject(tenantId, stageId);

  const existing = await pool.query(
    'SELECT id FROM stage_gates WHERE id = $1 AND stage_id = $2 AND tenant_id = $3',
    [gateId, stageId, tenantId],
  );

  if (existing.rows.length === 0) {
    throwNotFoundError('Stage gate not found');
  }

  await pool.query(
    'DELETE FROM stage_gates WHERE id = $1 AND stage_id = $2 AND tenant_id = $3',
    [gateId, stageId, tenantId],
  );

  logger.info({ gateId, stageId }, 'Stage gate deleted');
}
