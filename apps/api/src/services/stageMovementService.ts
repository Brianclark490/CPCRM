import { randomUUID } from 'crypto';
import type { Kysely } from 'kysely';
import { logger } from '../lib/logger.js';
import { db } from '../db/kysely.js';
import type { DB, Json } from '../db/kysely.types.js';
import { AppError } from '../lib/appError.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GateFailure {
  field: string;
  label: string;
  gate: string;
  message: string;
  fieldType: string;
  currentValue: unknown;
  options: Record<string, unknown>;
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
  fieldOptions: Record<string, unknown>;
}

/**
 * Executor type used by helpers that need to run inside either a top-level
 * Kysely instance or a checked-out transaction. `Transaction<DB>` extends
 * `Kysely<DB>`, so callers can pass either without a cast.
 */
type DbExecutor = Kysely<DB>;

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
  fieldOptions: Record<string, unknown>,
): GateFailure | null {
  const value = fieldValues[gate.fieldApiName];

  const baseFailure = {
    field: gate.fieldApiName,
    label: gate.fieldLabel,
    fieldType: gate.fieldType,
    currentValue: value ?? null,
    options: fieldOptions,
  };

  switch (gate.gateType) {
    case 'required': {
      if (value === undefined || value === null || value === '') {
        return {
          ...baseFailure,
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
          ...baseFailure,
          gate: 'min_value',
          message:
            gate.errorMessage ??
            `${gate.fieldLabel} is required`,
        };
      }

      if (isNaN(numValue) || numValue < minValue) {
        return {
          ...baseFailure,
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
          ...baseFailure,
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
    fieldOptions: (row.field_options as Record<string, unknown>) ?? {},
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
 * - All changes are performed in a single Kysely transaction
 *
 * The RLS proxy on `pool.connect()` (see db/client.ts) sets
 * `app.current_tenant_id` on the checked-out connection before Kysely
 * begins the transaction, so RLS policies are active inside `trx`. Every
 * query also carries an explicit `tenant_id` filter as defence-in-depth
 * (ADR-006).
 *
 * @param apiName - object type api_name (e.g. "opportunity")
 * @param recordId - UUID of the record to move
 * @param targetStageId - UUID of the target stage
 * @param ownerId - Descope user ID from auth
 */
export async function moveRecordStage(
  tenantId: string,
  apiName: string,
  recordId: string,
  targetStageId: string,
  ownerId: string,
): Promise<MoveStageResult> {
  return db.transaction().execute(async (trx) => {
    // 1. Resolve object definition
    const objectRow = await trx
      .selectFrom('object_definitions')
      .select('id')
      .where('api_name', '=', apiName)
      .where('tenant_id', '=', tenantId)
      .executeTakeFirst();
    if (!objectRow) {
      throwNotFoundError(`Object type '${apiName}' not found`);
    }
    const objectId = objectRow.id as string;

    // 2. Fetch the record and verify it belongs to this tenant
    const recordRow = await trx
      .selectFrom('records')
      .selectAll()
      .where('id', '=', recordId)
      .where('object_id', '=', objectId)
      .where('tenant_id', '=', tenantId)
      .executeTakeFirst();
    if (!recordRow) {
      throwNotFoundError('Record not found');
    }

    const currentStageId = (recordRow.current_stage_id as string | null) ?? null;
    const pipelineId = (recordRow.pipeline_id as string | null) ?? null;
    const stageEnteredAtRaw = recordRow.stage_entered_at;
    const stageEnteredAt = stageEnteredAtRaw
      ? new Date(stageEnteredAtRaw as unknown as string)
      : null;

    // 3. Fetch the target stage first so we can use its pipeline_id to
    //    resolve ambiguity when the record has no pipeline assigned yet.
    //    Picking the stage implicitly picks the pipeline; this honours user
    //    intent and side-steps "default pipeline" lookups that can diverge
    //    from the frontend when multiple pipelines are marked is_default.
    //
    //    We also project the parent pipeline's object_id so we can reject
    //    cross-object moves before adopting the target stage's pipeline.
    const targetStageRow = await trx
      .selectFrom('stage_definitions as sd')
      .innerJoin('pipeline_definitions as pd', 'pd.id', 'sd.pipeline_id')
      .selectAll('sd')
      .select('pd.object_id as pipeline_object_id')
      .where('sd.id', '=', targetStageId)
      .where('sd.tenant_id', '=', tenantId)
      .executeTakeFirst();
    if (!targetStageRow) {
      throwNotFoundError('Target stage not found');
    }
    const targetStagePipelineObjectId = targetStageRow.pipeline_object_id as string;
    if (targetStagePipelineObjectId !== objectId) {
      throw AppError.validation(
        'Target stage belongs to a different object type',
        {
          recordId,
          recordObjectId: objectId,
          targetStageId,
          targetStagePipelineObjectId,
        },
      );
    }
    const targetStage = rowToStage(
      targetStageRow as unknown as Record<string, unknown>,
    );

    // 4. Resolve the record's pipeline. If the record is not yet assigned,
    //    adopt the target stage's pipeline and seed a current stage so gate
    //    validation below runs in the correct pipeline context.
    let resolvedPipelineId = pipelineId;
    let resolvedCurrentStageId = currentStageId;
    let resolvedStageEnteredAt = stageEnteredAt;

    if (!resolvedPipelineId) {
      resolvedPipelineId = targetStage.pipelineId;

      if (!resolvedCurrentStageId) {
        // Seed current stage = first open stage in the adopted pipeline
        // (fall back to first stage by sort_order when no open stage).
        const initialStageRow = await trx
          .selectFrom('stage_definitions')
          .select(['id', 'stage_type'])
          .where('pipeline_id', '=', resolvedPipelineId)
          .where('tenant_id', '=', tenantId)
          .orderBy('sort_order', 'asc')
          .execute();
        const seedStage =
          initialStageRow.find((s) => s.stage_type === 'open') ??
          initialStageRow[0];
        if (!seedStage) {
          throwValidationError('Pipeline has no stages');
        }
        resolvedCurrentStageId = seedStage.id as string;
        resolvedStageEnteredAt = new Date();
      }

      // Persist the pipeline assignment now so stage_history and the
      // record row reflect the adopted pipeline once the transaction
      // commits.
      await trx
        .updateTable('records')
        .set({
          pipeline_id: resolvedPipelineId,
          current_stage_id: resolvedCurrentStageId,
          stage_entered_at: resolvedStageEnteredAt,
        })
        .where('id', '=', recordId)
        .where('tenant_id', '=', tenantId)
        .execute();
    } else if (!resolvedCurrentStageId) {
      // Pipeline present but no current stage — seed from first open stage
      // in the existing pipeline.
      const initialStageRow = await trx
        .selectFrom('stage_definitions')
        .select(['id', 'stage_type'])
        .where('pipeline_id', '=', resolvedPipelineId)
        .where('tenant_id', '=', tenantId)
        .orderBy('sort_order', 'asc')
        .execute();
      const seedStage =
        initialStageRow.find((s) => s.stage_type === 'open') ??
        initialStageRow[0];
      if (!seedStage) {
        throwValidationError('Pipeline has no stages');
      }
      resolvedCurrentStageId = seedStage.id as string;
      resolvedStageEnteredAt = new Date();
      await trx
        .updateTable('records')
        .set({
          current_stage_id: resolvedCurrentStageId,
          stage_entered_at: resolvedStageEnteredAt,
        })
        .where('id', '=', recordId)
        .where('tenant_id', '=', tenantId)
        .execute();
    }

    // 5. Fetch the current stage
    const currentStageRow = await trx
      .selectFrom('stage_definitions')
      .selectAll()
      .where('id', '=', resolvedCurrentStageId)
      .where('pipeline_id', '=', resolvedPipelineId)
      .where('tenant_id', '=', tenantId)
      .executeTakeFirst();
    if (!currentStageRow) {
      throwValidationError('Current stage not found in pipeline');
    }
    const currentStage = rowToStage(
      currentStageRow as unknown as Record<string, unknown>,
    );

    // 6. Target stage must belong to the record's resolved pipeline.
    if (targetStage.pipelineId !== resolvedPipelineId) {
      throw AppError.validation(
        'Target stage does not belong to the same pipeline',
        {
          recordId,
          recordPipelineId: resolvedPipelineId,
          targetStageId,
          targetStagePipelineId: targetStage.pipelineId,
        },
      );
    }

    if (targetStageId === resolvedCurrentStageId) {
      throwValidationError('Record is already in this stage');
    }

    // 7. Determine if gate validation is required
    const isForwardMove = targetStage.sortOrder > currentStage.sortOrder;
    const isWonOrLost = targetStage.stageType === 'won' || targetStage.stageType === 'lost';
    const requireGateValidation = isForwardMove || isWonOrLost;

    if (requireGateValidation) {
      // Fetch gates for the target stage with field metadata.
      //
      // We project aliased column names (field_api_name, field_label,
      // field_type, field_options) so the downstream `rowToGate` mapper
      // can stay unchanged. Kysely's `.select()` accepts raw column refs
      // with `as` aliases via tuple syntax.
      const gateRows = await trx
        .selectFrom('stage_gates as sg')
        .innerJoin('field_definitions as fd', 'fd.id', 'sg.field_id')
        .select([
          'sg.field_id',
          'sg.gate_type',
          'sg.gate_value',
          'sg.error_message',
          'fd.api_name as field_api_name',
          'fd.label as field_label',
          'fd.field_type',
          'fd.options as field_options',
        ])
        .where('sg.stage_id', '=', targetStageId)
        .where('sg.tenant_id', '=', tenantId)
        .execute();

      const gates = gateRows.map((row) =>
        rowToGate(row as unknown as Record<string, unknown>),
      );
      const fieldValues = (recordRow.field_values as Record<string, unknown>) ?? {};

      const failures: GateFailure[] = [];
      for (const gate of gates) {
        const failure = evaluateGate(gate, fieldValues, gate.fieldOptions);
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

    // 7. Calculate days_in_previous_stage
    let daysInPreviousStage: number | null = null;
    if (resolvedStageEnteredAt) {
      const now = new Date();
      const diffMs = now.getTime() - resolvedStageEnteredAt.getTime();
      daysInPreviousStage = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    }

    // 8. Insert stage_history record
    const historyId = randomUUID();
    const historyNow = new Date();
    await trx
      .insertInto('stage_history')
      .values({
        id: historyId,
        tenant_id: tenantId,
        record_id: recordId,
        pipeline_id: resolvedPipelineId,
        from_stage_id: resolvedCurrentStageId,
        to_stage_id: targetStageId,
        changed_by: ownerId,
        changed_at: historyNow,
        days_in_previous_stage: daysInPreviousStage,
      })
      .execute();

    // 9. Update record: current_stage_id, stage_entered_at, field_values
    const fieldValues = (recordRow.field_values as Record<string, unknown>) ?? {};
    const updatedFieldValues: Record<string, unknown> = { ...fieldValues };

    // Sync the stage dropdown field with the pipeline stage name
    if ('stage' in updatedFieldValues) {
      updatedFieldValues.stage = targetStage.name;
    }

    if (targetStage.defaultProbability !== null) {
      updatedFieldValues.probability = targetStage.defaultProbability;
    }

    const updatedRow = await trx
      .updateTable('records')
      .set({
        current_stage_id: targetStageId,
        stage_entered_at: historyNow,
        field_values: JSON.stringify(updatedFieldValues) as unknown as Json,
        updated_at: historyNow,
      })
      .where('id', '=', recordId)
      .where('object_id', '=', objectId)
      .where('tenant_id', '=', tenantId)
      .returningAll()
      .executeTakeFirstOrThrow();

    logger.info(
      {
        recordId,
        pipelineId: resolvedPipelineId,
        fromStageId: resolvedCurrentStageId,
        toStageId: targetStageId,
        ownerId,
      },
      'Record moved to new stage',
    );

    // Kysely types Timestamp columns as Date on select. Normalise to Date
    // here so downstream callers get a consistent shape regardless of
    // whether the driver returned Date or an ISO string.
    const toDate = (v: unknown): Date => (v instanceof Date ? v : new Date(v as string));

    return {
      id: updatedRow.id,
      objectId: updatedRow.object_id,
      name: updatedRow.name,
      fieldValues: (updatedRow.field_values as Record<string, unknown>) ?? {},
      ownerId: updatedRow.owner_id,
      pipelineId: updatedRow.pipeline_id as string,
      currentStageId: updatedRow.current_stage_id as string,
      stageEnteredAt: toDate(updatedRow.stage_entered_at),
      createdAt: toDate(updatedRow.created_at),
      updatedAt: toDate(updatedRow.updated_at),
    };
  });
}

// ─── Pipeline auto-assignment for record creation ────────────────────────────

/**
 * Assigns a default pipeline and initial stage to a newly created record.
 * Should be called within a transaction after the record is inserted.
 *
 * The initial stage is determined by matching the record's `stage` field
 * value (from `field_values`) against the pipeline's stage names or
 * api_names (case-insensitive). If no match is found, the first open
 * stage is used as a fallback.
 *
 * Accepts a Kysely executor — typically a `Transaction<DB>` checked out
 * by the caller (`db.transaction()`), but a plain `Kysely<DB>` works too.
 * Either way, the RLS proxy ensures `app.current_tenant_id` is set on
 * the underlying connection before any query runs.
 *
 * @returns true if a pipeline was assigned, false otherwise
 */
export async function assignDefaultPipeline(
  executor: DbExecutor,
  recordId: string,
  objectId: string,
  ownerId: string,
  tenantId?: string,
): Promise<boolean> {
  // Find the default pipeline for this object
  let pipelineQuery = executor
    .selectFrom('pipeline_definitions')
    .select('id')
    .where('object_id', '=', objectId)
    .where('is_default', '=', true);
  if (tenantId) {
    pipelineQuery = pipelineQuery.where('tenant_id', '=', tenantId);
  }
  const pipelineRow = await pipelineQuery.executeTakeFirst();

  if (!pipelineRow) {
    return false;
  }

  const pipelineId = pipelineRow.id as string;

  // Fetch ALL stages for this pipeline so we can match by name
  let allStagesQuery = executor
    .selectFrom('stage_definitions')
    .select([
      'id',
      'name',
      'api_name',
      'sort_order',
      'stage_type',
      'default_probability',
    ])
    .where('pipeline_id', '=', pipelineId)
    .orderBy('sort_order', 'asc');
  if (tenantId) {
    allStagesQuery = allStagesQuery.where('tenant_id', '=', tenantId);
  }
  const allStages = await allStagesQuery.execute();

  if (allStages.length === 0) {
    return false;
  }

  // Read the record's field_values to check for a stage field
  let recordQuery = executor
    .selectFrom('records')
    .select('field_values')
    .where('id', '=', recordId);
  if (tenantId) {
    recordQuery = recordQuery.where('tenant_id', '=', tenantId);
  }
  const recordRow = await recordQuery.executeTakeFirst();

  if (!recordRow) {
    return false;
  }

  const fieldValues = (recordRow.field_values as Record<string, unknown>) ?? {};
  const stageFieldValue =
    typeof fieldValues.stage === 'string' ? fieldValues.stage.trim() : '';

  // Try to match the stage field value to a pipeline stage (case-insensitive)
  let matchedStage: (typeof allStages)[number] | undefined;
  if (stageFieldValue) {
    const lowerStageValue = stageFieldValue.toLowerCase();
    matchedStage = allStages.find((s) => {
      const name = (s.name as string).toLowerCase();
      const apiName = (s.api_name as string).toLowerCase();
      return name === lowerStageValue || apiName === lowerStageValue;
    });
  }

  // Fall back to first open stage if no match found
  if (!matchedStage) {
    matchedStage = allStages.find((s) => s.stage_type === 'open');
  }

  if (!matchedStage) {
    return false;
  }

  const targetStageId = matchedStage.id as string;
  const defaultProbability =
    (matchedStage.default_probability as number | null) ?? null;

  // Update the record with pipeline assignment
  const now = new Date();

  if (defaultProbability !== null) {
    const updatedFieldValues = { ...fieldValues, probability: defaultProbability };
    let updateQuery = executor
      .updateTable('records')
      .set({
        pipeline_id: pipelineId,
        current_stage_id: targetStageId,
        stage_entered_at: now,
        field_values: JSON.stringify(updatedFieldValues) as unknown as Json,
      })
      .where('id', '=', recordId);
    if (tenantId) {
      updateQuery = updateQuery.where('tenant_id', '=', tenantId);
    }
    await updateQuery.execute();
  } else {
    let updateQuery = executor
      .updateTable('records')
      .set({
        pipeline_id: pipelineId,
        current_stage_id: targetStageId,
        stage_entered_at: now,
      })
      .where('id', '=', recordId);
    if (tenantId) {
      updateQuery = updateQuery.where('tenant_id', '=', tenantId);
    }
    await updateQuery.execute();
  }

  // Insert initial stage_history record (from_stage_id: NULL)
  const historyId = randomUUID();
  if (tenantId) {
    await executor
      .insertInto('stage_history')
      .values({
        id: historyId,
        tenant_id: tenantId,
        record_id: recordId,
        pipeline_id: pipelineId,
        from_stage_id: null,
        to_stage_id: targetStageId,
        changed_by: ownerId,
        changed_at: now,
        days_in_previous_stage: null,
      })
      .execute();
  } else {
    // Legacy path used by tests / callers that have not plumbed tenantId
    // through yet. The stage_history row still needs a tenant_id column
    // value because the column is NOT NULL; callers without a tenantId
    // should not land here in production, but we keep the branch to match
    // the previous behaviour. When tenantId is undefined, we intentionally
    // skip writing stage_history — the original raw-pg implementation
    // issued an INSERT without tenant_id which is impossible to express in
    // Kysely against a typed schema, and no production code path exercises
    // this branch.
    logger.warn(
      { recordId, pipelineId },
      'assignDefaultPipeline called without tenantId — skipping stage_history insert',
    );
  }

  return true;
}
