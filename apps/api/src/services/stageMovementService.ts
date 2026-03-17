import { randomUUID } from 'crypto';
import type pg from 'pg';
import { logger } from '../lib/logger.js';
import { pool } from '../db/client.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GateFailure {
  field: string;
  label: string;
  gate: string;
  message: string;
}

export interface MoveStageResult {
  id: string;
  objectId: string;
  name: string;
  fieldValues: Record<string, unknown>;
  ownerId: string;
  pipelineId: string;
  currentStageId: string;
  stageEnteredAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

interface StageRow {
  id: string;
  pipelineId: string;
  name: string;
  sortOrder: number;
  stageType: string;
  defaultProbability: number | null;
}

interface GateRow {
  fieldId: string;
  fieldApiName: string;
  fieldLabel: string;
  fieldType: string;
  gateType: string;
  gateValue: string | null;
  errorMessage: string | null;
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

export interface GateValidationError extends Error {
  code: string;
  failures: GateFailure[];
}

function throwGateValidationError(
  message: string,
  failures: GateFailure[],
): never {
  const err = new Error(message) as GateValidationError;
  err.code = 'GATE_VALIDATION_FAILED';
  err.failures = failures;
  throw err;
}

// ─── Gate Evaluation ─────────────────────────────────────────────────────────

function evaluateGate(
  gate: GateRow,
  fieldValues: Record<string, unknown>,
): GateFailure | null {
  const value = fieldValues[gate.fieldApiName];

  switch (gate.gateType) {
    case 'required': {
      if (value === undefined || value === null || value === '') {
        return {
          field: gate.fieldApiName,
          label: gate.fieldLabel,
          gate: 'required',
          message:
            gate.errorMessage ??
            `${gate.fieldLabel} is required`,
        };
      }
      return null;
    }

    case 'min_value': {
      const numValue = Number(value);
      const minValue = Number(gate.gateValue);

      if (value === undefined || value === null || value === '') {
        return {
          field: gate.fieldApiName,
          label: gate.fieldLabel,
          gate: 'min_value',
          message:
            gate.errorMessage ??
            `${gate.fieldLabel} is required`,
        };
      }

      if (isNaN(numValue) || numValue < minValue) {
        return {
          field: gate.fieldApiName,
          label: gate.fieldLabel,
          gate: 'min_value',
          message:
            gate.errorMessage ??
            `${gate.fieldLabel} must be at least ${gate.gateValue}`,
        };
      }
      return null;
    }

    case 'specific_value': {
      if (String(value) !== gate.gateValue) {
        return {
          field: gate.fieldApiName,
          label: gate.fieldLabel,
          gate: 'specific_value',
          message:
            gate.errorMessage ??
            `${gate.fieldLabel} must be "${gate.gateValue}"`,
        };
      }
      return null;
    }

    default:
      return null;
  }
}

// ─── Internal helpers ────────────────────────────────────────────────────────

function rowToStage(row: Record<string, unknown>): StageRow {
  return {
    id: row.id as string,
    pipelineId: row.pipeline_id as string,
    name: row.name as string,
    sortOrder: row.sort_order as number,
    stageType: row.stage_type as string,
    defaultProbability: (row.default_probability as number | null) ?? null,
  };
}

function rowToGate(row: Record<string, unknown>): GateRow {
  return {
    fieldId: row.field_id as string,
    fieldApiName: row.field_api_name as string,
    fieldLabel: row.field_label as string,
    fieldType: row.field_type as string,
    gateType: row.gate_type as string,
    gateValue: (row.gate_value as string | null) ?? null,
    errorMessage: (row.error_message as string | null) ?? null,
  };
}

// ─── Service Function ────────────────────────────────────────────────────────

/**
 * Moves a record to a new pipeline stage with gate validation and history tracking.
 *
 * Rules:
 * - Forward moves (higher sort_order) and moves to won/lost: validate gates on target stage
 * - Backward moves (lower sort_order): always allowed (no gate checks)
 * - Gate failures return a detailed error with field-level failures
 * - All changes are performed in a single transaction
 *
 * @param apiName - object type api_name (e.g. "opportunity")
 * @param recordId - UUID of the record to move
 * @param targetStageId - UUID of the target stage
 * @param ownerId - Descope user ID from auth
 */
export async function moveRecordStage(
  apiName: string,
  recordId: string,
  targetStageId: string,
  ownerId: string,
): Promise<MoveStageResult> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Resolve object definition
    const objectResult = await client.query(
      'SELECT id FROM object_definitions WHERE api_name = $1',
      [apiName],
    );
    if (objectResult.rows.length === 0) {
      throwNotFoundError(`Object type '${apiName}' not found`);
    }
    const objectId = (objectResult.rows[0] as Record<string, unknown>).id as string;

    // 2. Fetch the record and verify ownership
    const recordResult = await client.query(
      'SELECT * FROM records WHERE id = $1 AND object_id = $2 AND owner_id = $3',
      [recordId, objectId, ownerId],
    );
    if (recordResult.rows.length === 0) {
      throwNotFoundError('Record not found');
    }
    const recordRow = recordResult.rows[0] as Record<string, unknown>;
    const currentStageId = recordRow.current_stage_id as string | null;
    const pipelineId = recordRow.pipeline_id as string | null;
    const stageEnteredAt = recordRow.stage_entered_at
      ? new Date(recordRow.stage_entered_at as string)
      : null;

    if (!pipelineId || !currentStageId) {
      throwValidationError('Record is not assigned to a pipeline');
    }

    // 3. Fetch the current stage
    const currentStageResult = await client.query(
      'SELECT * FROM stage_definitions WHERE id = $1 AND pipeline_id = $2',
      [currentStageId, pipelineId],
    );
    if (currentStageResult.rows.length === 0) {
      throwValidationError('Current stage not found in pipeline');
    }
    const currentStage = rowToStage(currentStageResult.rows[0] as Record<string, unknown>);

    // 4. Fetch the target stage and validate it belongs to the same pipeline
    const targetStageResult = await client.query(
      'SELECT * FROM stage_definitions WHERE id = $1',
      [targetStageId],
    );
    if (targetStageResult.rows.length === 0) {
      throwNotFoundError('Target stage not found');
    }
    const targetStage = rowToStage(targetStageResult.rows[0] as Record<string, unknown>);

    if (targetStage.pipelineId !== pipelineId) {
      throwValidationError('Target stage does not belong to the same pipeline');
    }

    if (targetStageId === currentStageId) {
      throwValidationError('Record is already in this stage');
    }

    // 5. Determine if gate validation is required
    const isForwardMove = targetStage.sortOrder > currentStage.sortOrder;
    const isWonOrLost = targetStage.stageType === 'won' || targetStage.stageType === 'lost';
    const requireGateValidation = isForwardMove || isWonOrLost;

    if (requireGateValidation) {
      // Fetch gates for the target stage with field metadata
      const gatesResult = await client.query(
        `SELECT sg.field_id, sg.gate_type, sg.gate_value, sg.error_message,
                fd.api_name AS field_api_name, fd.label AS field_label, fd.field_type
         FROM stage_gates sg
         JOIN field_definitions fd ON fd.id = sg.field_id
         WHERE sg.stage_id = $1`,
        [targetStageId],
      );

      const gates = gatesResult.rows.map((row: Record<string, unknown>) => rowToGate(row));
      const fieldValues = (recordRow.field_values as Record<string, unknown>) ?? {};

      const failures: GateFailure[] = [];
      for (const gate of gates) {
        const failure = evaluateGate(gate, fieldValues);
        if (failure) {
          failures.push(failure);
        }
      }

      if (failures.length > 0) {
        throwGateValidationError(
          `Cannot move to ${targetStage.name} — missing required fields`,
          failures,
        );
      }
    }

    // 6. Calculate days_in_previous_stage
    let daysInPreviousStage: number | null = null;
    if (stageEnteredAt) {
      const now = new Date();
      const diffMs = now.getTime() - stageEnteredAt.getTime();
      daysInPreviousStage = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    }

    // 7. Insert stage_history record
    const historyId = randomUUID();
    await client.query(
      `INSERT INTO stage_history (id, record_id, pipeline_id, from_stage_id, to_stage_id, changed_by, changed_at, days_in_previous_stage)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7)`,
      [historyId, recordId, pipelineId, currentStageId, targetStageId, ownerId, daysInPreviousStage],
    );

    // 8. Update record: current_stage_id, stage_entered_at, and optionally probability
    const fieldValues = (recordRow.field_values as Record<string, unknown>) ?? {};
    let updatedFieldValues = fieldValues;

    if (targetStage.defaultProbability !== null) {
      updatedFieldValues = {
        ...fieldValues,
        probability: targetStage.defaultProbability,
      };
    }

    const updateResult = await client.query(
      `UPDATE records
       SET current_stage_id = $1,
           stage_entered_at = NOW(),
           field_values = $2,
           updated_at = NOW()
       WHERE id = $3 AND object_id = $4 AND owner_id = $5
       RETURNING *`,
      [targetStageId, JSON.stringify(updatedFieldValues), recordId, objectId, ownerId],
    );

    await client.query('COMMIT');

    const updatedRow = updateResult.rows[0] as Record<string, unknown>;

    logger.info(
      { recordId, pipelineId, fromStageId: currentStageId, toStageId: targetStageId, ownerId },
      'Record moved to new stage',
    );

    return {
      id: updatedRow.id as string,
      objectId: updatedRow.object_id as string,
      name: updatedRow.name as string,
      fieldValues: (updatedRow.field_values as Record<string, unknown>) ?? {},
      ownerId: updatedRow.owner_id as string,
      pipelineId: updatedRow.pipeline_id as string,
      currentStageId: updatedRow.current_stage_id as string,
      stageEnteredAt: new Date(updatedRow.stage_entered_at as string),
      createdAt: new Date(updatedRow.created_at as string),
      updatedAt: new Date(updatedRow.updated_at as string),
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ─── Pipeline auto-assignment for record creation ────────────────────────────

/**
 * Assigns a default pipeline and first stage to a newly created record.
 * Should be called within a transaction after the record is inserted.
 *
 * @returns true if a pipeline was assigned, false otherwise
 */
export async function assignDefaultPipeline(
  client: pg.PoolClient,
  recordId: string,
  objectId: string,
  ownerId: string,
): Promise<boolean> {
  // Find the default pipeline for this object
  const pipelineResult = await client.query(
    'SELECT id FROM pipeline_definitions WHERE object_id = $1 AND is_default = true',
    [objectId],
  );

  if (pipelineResult.rows.length === 0) {
    return false;
  }

  const pipelineId = (pipelineResult.rows[0] as Record<string, unknown>).id as string;

  // Find the first open stage (sort_order 0)
  const stageResult = await client.query(
    `SELECT id, default_probability FROM stage_definitions
     WHERE pipeline_id = $1 AND stage_type = 'open'
     ORDER BY sort_order ASC
     LIMIT 1`,
    [pipelineId],
  );

  if (stageResult.rows.length === 0) {
    return false;
  }

  const stageRow = stageResult.rows[0] as Record<string, unknown>;
  const firstStageId = stageRow.id as string;
  const defaultProbability = (stageRow.default_probability as number | null) ?? null;

  // Update the record with pipeline assignment
  if (defaultProbability !== null) {
    // Also set probability in field_values
    const recordResult = await client.query(
      'SELECT field_values FROM records WHERE id = $1',
      [recordId],
    );
    const fieldValues = (recordResult.rows[0] as Record<string, unknown>).field_values as Record<string, unknown>;
    const updatedFieldValues = { ...fieldValues, probability: defaultProbability };

    await client.query(
      `UPDATE records
       SET pipeline_id = $1, current_stage_id = $2, stage_entered_at = NOW(), field_values = $3
       WHERE id = $4`,
      [pipelineId, firstStageId, JSON.stringify(updatedFieldValues), recordId],
    );
  } else {
    await client.query(
      `UPDATE records
       SET pipeline_id = $1, current_stage_id = $2, stage_entered_at = NOW()
       WHERE id = $3`,
      [pipelineId, firstStageId, recordId],
    );
  }

  // Insert initial stage_history record (from_stage_id: NULL)
  const historyId = randomUUID();
  await client.query(
    `INSERT INTO stage_history (id, record_id, pipeline_id, from_stage_id, to_stage_id, changed_by, changed_at, days_in_previous_stage)
     VALUES ($1, $2, $3, NULL, $4, $5, NOW(), NULL)`,
    [historyId, recordId, pipelineId, firstStageId, ownerId],
  );

  return true;
}
