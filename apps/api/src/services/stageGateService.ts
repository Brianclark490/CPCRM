import { randomUUID } from 'crypto';
import { logger } from '../lib/logger.js';
import { db } from '../db/kysely.js';

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

interface GateWithFieldRow {
  id: string;
  stage_id: string;
  field_id: string;
  gate_type: string;
  gate_value: string | null;
  error_message: string | null;
  field_label: string;
  field_type: string;
}

function rowToStageGateResponse(row: GateWithFieldRow): StageGateResponse {
  return {
    id: row.id,
    stageId: row.stage_id,
    field: {
      id: row.field_id,
      label: row.field_label,
      fieldType: row.field_type,
    },
    gateType: row.gate_type,
    gateValue: row.gate_value ?? null,
    errorMessage: row.error_message ?? null,
  };
}

// ─── Internal helpers ────────────────────────────────────────────────────────

interface StageWithObject {
  stageId: string;
  pipelineId: string;
  objectId: string;
}

async function resolveStageAndObject(
  tenantId: string,
  stageId: string,
): Promise<StageWithObject> {
  const row = await db
    .selectFrom('stage_definitions as sd')
    .innerJoin('pipeline_definitions as pd', 'pd.id', 'sd.pipeline_id')
    .select(['sd.id as stage_id', 'sd.pipeline_id', 'pd.object_id'])
    .where('sd.id', '=', stageId)
    .where('sd.tenant_id', '=', tenantId)
    .executeTakeFirst();

  if (!row) {
    throwNotFoundError('Stage not found');
  }

  return {
    stageId: row.stage_id,
    pipelineId: row.pipeline_id,
    objectId: row.object_id,
  };
}

interface FieldInfo {
  id: string;
  fieldType: string;
  label: string;
  options: Record<string, unknown>;
}

async function getFieldInfo(
  fieldId: string,
  tenantId: string,
): Promise<FieldInfo | null> {
  const row = await db
    .selectFrom('field_definitions')
    .select(['id', 'field_type', 'label', 'options'])
    .where('id', '=', fieldId)
    .where('tenant_id', '=', tenantId)
    .executeTakeFirst();

  if (!row) return null;

  return {
    id: row.id,
    fieldType: row.field_type,
    label: row.label,
    options: (row.options as Record<string, unknown> | null) ?? {},
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

/**
 * Select a stage_gate joined to its field_definition, returning the row shape
 * expected by rowToStageGateResponse.
 */
function selectGateWithField() {
  return db
    .selectFrom('stage_gates as sg')
    .innerJoin('field_definitions as fd', 'fd.id', 'sg.field_id')
    .select([
      'sg.id',
      'sg.stage_id',
      'sg.field_id',
      'sg.gate_type',
      'sg.gate_value',
      'sg.error_message',
      'fd.label as field_label',
      'fd.field_type',
    ]);
}

// ─── Service functions ───────────────────────────────────────────────────────

/**
 * Lists all gates for a stage, including field metadata.
 *
 * @throws {Error} NOT_FOUND — stage does not exist
 */
export async function listStageGates(
  tenantId: string,
  stageId: string,
): Promise<StageGateResponse[]> {
  await resolveStageAndObject(tenantId, stageId);

  const rows = await selectGateWithField()
    .where('sg.stage_id', '=', stageId)
    .where('sg.tenant_id', '=', tenantId)
    .orderBy('sg.id')
    .execute();

  return rows.map(rowToStageGateResponse);
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

  const fieldBelongsToObject = await db
    .selectFrom('field_definitions')
    .select('id')
    .where('id', '=', params.fieldId)
    .where('object_id', '=', stageInfo.objectId)
    .where('tenant_id', '=', tenantId)
    .executeTakeFirst();

  if (!fieldBelongsToObject) {
    throwValidationError('Field does not belong to the same object as the pipeline');
  }

  // Validate gate_type against field_type
  validateGateTypeAgainstField(params.gateType, params.gateValue ?? null, field);

  // Check for duplicate gate on same field/stage
  const duplicate = await db
    .selectFrom('stage_gates')
    .select('id')
    .where('stage_id', '=', stageId)
    .where('field_id', '=', params.fieldId)
    .where('tenant_id', '=', tenantId)
    .executeTakeFirst();

  if (duplicate) {
    throwConflictError('A gate already exists for this field on this stage');
  }

  const gateId = randomUUID();

  await db
    .insertInto('stage_gates')
    .values({
      id: gateId,
      tenant_id: tenantId,
      stage_id: stageId,
      field_id: params.fieldId,
      gate_type: params.gateType,
      gate_value: params.gateValue ?? null,
      error_message: params.errorMessage ?? null,
    })
    .execute();

  // Fetch the created gate with field metadata
  const created = await selectGateWithField()
    .where('sg.id', '=', gateId)
    .where('sg.tenant_id', '=', tenantId)
    .executeTakeFirstOrThrow();

  logger.info({ gateId, stageId, fieldId: params.fieldId }, 'Stage gate created');

  return rowToStageGateResponse(created);
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
  const existingRow = await db
    .selectFrom('stage_gates')
    .selectAll()
    .where('id', '=', gateId)
    .where('stage_id', '=', stageId)
    .where('tenant_id', '=', tenantId)
    .executeTakeFirst();

  if (!existingRow) {
    throwNotFoundError('Stage gate not found');
  }

  // Determine effective gate_type and gate_value
  const effectiveGateType = params.gateType ?? existingRow.gate_type;
  const effectiveGateValue =
    'gateValue' in params ? (params.gateValue ?? null) : existingRow.gate_value;

  if (!ALLOWED_GATE_TYPES.has(effectiveGateType)) {
    throwValidationError(`gate_type must be one of: ${[...ALLOWED_GATE_TYPES].join(', ')}`);
  }

  // Validate gate_type against field_type
  const field = await getFieldInfo(existingRow.field_id, tenantId);
  if (!field) {
    throwNotFoundError('Field not found');
  }

  validateGateTypeAgainstField(effectiveGateType, effectiveGateValue, field);

  // Build dynamic update
  const updates: Record<string, unknown> = {};
  if ('gateType' in params) updates.gate_type = params.gateType;
  if ('gateValue' in params) updates.gate_value = params.gateValue ?? null;
  if ('errorMessage' in params) updates.error_message = params.errorMessage ?? null;

  if (Object.keys(updates).length > 0) {
    await db
      .updateTable('stage_gates')
      .set(updates)
      .where('id', '=', gateId)
      .where('stage_id', '=', stageId)
      .where('tenant_id', '=', tenantId)
      .execute();
  }

  // Fetch the updated gate with field metadata
  const updated = await selectGateWithField()
    .where('sg.id', '=', gateId)
    .where('sg.tenant_id', '=', tenantId)
    .executeTakeFirstOrThrow();

  logger.info({ gateId, stageId }, 'Stage gate updated');

  return rowToStageGateResponse(updated);
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

  const existing = await db
    .selectFrom('stage_gates')
    .select('id')
    .where('id', '=', gateId)
    .where('stage_id', '=', stageId)
    .where('tenant_id', '=', tenantId)
    .executeTakeFirst();

  if (!existing) {
    throwNotFoundError('Stage gate not found');
  }

  await db
    .deleteFrom('stage_gates')
    .where('id', '=', gateId)
    .where('stage_id', '=', stageId)
    .where('tenant_id', '=', tenantId)
    .execute();

  logger.info({ gateId, stageId }, 'Stage gate deleted');
}
