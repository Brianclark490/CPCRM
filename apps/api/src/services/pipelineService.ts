import { randomUUID } from 'crypto';
import { sql } from 'kysely';
import { logger } from '../lib/logger.js';
import { db } from '../db/kysely.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PipelineDefinition {
  id: string;
  objectId: string;
  name: string;
  apiName: string;
  description?: string;
  isDefault: boolean;
  isSystem: boolean;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface StageDefinition {
  id: string;
  pipelineId: string;
  name: string;
  apiName: string;
  sortOrder: number;
  stageType: string;
  colour: string;
  defaultProbability?: number;
  expectedDays?: number;
  description?: string;
  createdAt: Date;
}

export interface StageGate {
  id: string;
  stageId: string;
  fieldId: string;
  gateType: string;
  gateValue?: string;
  errorMessage?: string;
}

export interface PipelineWithStages extends PipelineDefinition {
  stages: StageDefinition[];
}

export interface PipelineDetail extends PipelineDefinition {
  stages: (StageDefinition & { gates: StageGate[] })[];
}

export interface CreatePipelineParams {
  name: string;
  apiName: string;
  objectId: string;
  description?: string;
  ownerId: string;
}

export interface UpdatePipelineParams {
  name?: string;
  description?: string | null;
  isDefault?: boolean;
}

export interface CreateStageParams {
  name: string;
  apiName: string;
  stageType: string;
  colour: string;
  defaultProbability?: number;
  expectedDays?: number;
  description?: string;
}

export interface UpdateStageParams {
  name?: string;
  stageType?: string;
  colour?: string;
  defaultProbability?: number | null;
  expectedDays?: number | null;
  description?: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ALLOWED_STAGE_TYPES = new Set(['open', 'won', 'lost']);

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

// ─── Row → domain model ──────────────────────────────────────────────────────

function rowToPipeline(row: Record<string, unknown>): PipelineDefinition {
  return {
    id: row.id as string,
    objectId: row.object_id as string,
    name: row.name as string,
    apiName: row.api_name as string,
    description: (row.description as string | null) ?? undefined,
    isDefault: row.is_default as boolean,
    isSystem: row.is_system as boolean,
    ownerId: row.owner_id as string,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

function rowToStage(row: Record<string, unknown>): StageDefinition {
  return {
    id: row.id as string,
    pipelineId: row.pipeline_id as string,
    name: row.name as string,
    apiName: row.api_name as string,
    sortOrder: row.sort_order as number,
    stageType: row.stage_type as string,
    colour: row.colour as string,
    defaultProbability: (row.default_probability as number | null) ?? undefined,
    expectedDays: (row.expected_days as number | null) ?? undefined,
    description: (row.description as string | null) ?? undefined,
    createdAt: new Date(row.created_at as string),
  };
}

function rowToGate(row: Record<string, unknown>): StageGate {
  return {
    id: row.id as string,
    stageId: row.stage_id as string,
    fieldId: row.field_id as string,
    gateType: row.gate_type as string,
    gateValue: (row.gate_value as string | null) ?? undefined,
    errorMessage: (row.error_message as string | null) ?? undefined,
  };
}

// ─── Validation ──────────────────────────────────────────────────────────────

export function validatePipelineApiName(apiName: unknown): string | null {
  if (typeof apiName !== 'string' || apiName.trim().length === 0) {
    return 'api_name is required';
  }
  const trimmed = apiName.trim();
  if (trimmed.length < 3 || trimmed.length > 100) {
    return 'api_name must be between 3 and 100 characters';
  }
  if (!SNAKE_CASE_RE.test(trimmed)) {
    return 'api_name must be lowercase snake_case (e.g. "sales_pipeline")';
  }
  return null;
}

export function validatePipelineName(name: unknown): string | null {
  if (typeof name !== 'string' || name.trim().length === 0) {
    return 'name is required';
  }
  if (name.trim().length > 255) {
    return 'name must be 255 characters or fewer';
  }
  return null;
}

export function validateStageApiName(apiName: unknown): string | null {
  if (typeof apiName !== 'string' || apiName.trim().length === 0) {
    return 'api_name is required';
  }
  const trimmed = apiName.trim();
  if (trimmed.length < 2 || trimmed.length > 100) {
    return 'api_name must be between 2 and 100 characters';
  }
  if (!SNAKE_CASE_RE.test(trimmed)) {
    return 'api_name must be lowercase snake_case (e.g. "prospecting")';
  }
  return null;
}

export function validateStageName(name: unknown): string | null {
  if (typeof name !== 'string' || name.trim().length === 0) {
    return 'name is required';
  }
  if (name.trim().length > 255) {
    return 'name must be 255 characters or fewer';
  }
  return null;
}

export function validateStageType(stageType: unknown): string | null {
  if (typeof stageType !== 'string' || stageType.trim().length === 0) {
    return 'stage_type is required';
  }
  if (!ALLOWED_STAGE_TYPES.has(stageType.trim())) {
    return `stage_type must be one of: ${[...ALLOWED_STAGE_TYPES].join(', ')}`;
  }
  return null;
}

// ─── Service functions: Pipelines ─────────────────────────────────────────────

/**
 * Creates a new pipeline definition with auto-created terminal stages.
 *
 * @throws {Error} VALIDATION_ERROR — invalid input
 * @throws {Error} NOT_FOUND — object_id does not exist
 * @throws {Error} CONFLICT — api_name already exists
 */
export async function createPipeline(
  tenantId: string,
  params: CreatePipelineParams,
): Promise<PipelineWithStages> {
  const { name, apiName, objectId, description, ownerId } = params;

  // Validate
  const nameError = validatePipelineName(name);
  if (nameError) throwValidationError(nameError);

  const apiNameError = validatePipelineApiName(apiName);
  if (apiNameError) throwValidationError(apiNameError);

  // Validate object_id exists within tenant
  const objectRow = await db
    .selectFrom('object_definitions')
    .select('id')
    .where('id', '=', objectId)
    .where('tenant_id', '=', tenantId)
    .executeTakeFirst();
  if (!objectRow) {
    throwNotFoundError('Object definition not found');
  }

  // Check uniqueness within tenant
  const existing = await db
    .selectFrom('pipeline_definitions')
    .select('id')
    .where('api_name', '=', apiName.trim())
    .where('tenant_id', '=', tenantId)
    .executeTakeFirst();
  if (existing) {
    throwConflictError(`A pipeline with api_name "${apiName.trim()}" already exists`);
  }

  // Determine is_default: true if this is the first pipeline for the object in this tenant
  const existingPipelines = await db
    .selectFrom('pipeline_definitions')
    .select('id')
    .where('object_id', '=', objectId)
    .where('tenant_id', '=', tenantId)
    .execute();
  const isDefault = existingPipelines.length === 0;

  const pipelineId = randomUUID();
  const now = new Date();

  const insertedPipeline = await db
    .insertInto('pipeline_definitions')
    .values({
      id: pipelineId,
      tenant_id: tenantId,
      object_id: objectId,
      name: name.trim(),
      api_name: apiName.trim(),
      description: description?.trim() ?? null,
      is_default: isDefault,
      is_system: false,
      owner_id: ownerId,
      created_at: now,
      updated_at: now,
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  // Auto-create terminal stages: "Closed Won" (type: won) and "Closed Lost" (type: lost)
  const wonStageId = randomUUID();
  const lostStageId = randomUUID();

  await db
    .insertInto('stage_definitions')
    .values([
      {
        id: wonStageId,
        tenant_id: tenantId,
        pipeline_id: pipelineId,
        name: 'Closed Won',
        api_name: 'closed_won',
        sort_order: 0,
        stage_type: 'won',
        colour: 'green',
        default_probability: 100,
        created_at: now,
      },
      {
        id: lostStageId,
        tenant_id: tenantId,
        pipeline_id: pipelineId,
        name: 'Closed Lost',
        api_name: 'closed_lost',
        sort_order: 1,
        stage_type: 'lost',
        colour: 'red',
        default_probability: 0,
        created_at: now,
      },
    ])
    .execute();

  logger.info({ pipelineId, apiName, objectId }, 'Pipeline created with terminal stages');

  const stagesResult = await db
    .selectFrom('stage_definitions')
    .selectAll()
    .where('pipeline_id', '=', pipelineId)
    .where('tenant_id', '=', tenantId)
    .orderBy('sort_order', 'asc')
    .execute();

  return {
    ...rowToPipeline(insertedPipeline as unknown as Record<string, unknown>),
    stages: stagesResult.map((r) => rowToStage(r as unknown as Record<string, unknown>)),
  };
}

/**
 * Returns all pipeline definitions.
 */
export async function listPipelines(tenantId: string): Promise<PipelineDefinition[]> {
  const rows = await db
    .selectFrom('pipeline_definitions')
    .selectAll()
    .where('tenant_id', '=', tenantId)
    .orderBy('is_system', 'desc')
    .orderBy('created_at', 'asc')
    .execute();

  return rows.map((row) => rowToPipeline(row as unknown as Record<string, unknown>));
}

/**
 * Returns a single pipeline by ID with stages and gates.
 * Returns null if not found.
 */
export async function getPipelineById(
  tenantId: string,
  id: string,
): Promise<PipelineDetail | null> {
  const pipelineRow = await db
    .selectFrom('pipeline_definitions')
    .selectAll()
    .where('id', '=', id)
    .where('tenant_id', '=', tenantId)
    .executeTakeFirst();

  if (!pipelineRow) return null;

  const pipeline = rowToPipeline(pipelineRow as unknown as Record<string, unknown>);

  const stageRows = await db
    .selectFrom('stage_definitions')
    .selectAll()
    .where('pipeline_id', '=', id)
    .where('tenant_id', '=', tenantId)
    .orderBy('sort_order', 'asc')
    .execute();

  const stages = stageRows.map((r) => rowToStage(r as unknown as Record<string, unknown>));

  // Fetch gates for all stages in one query
  const stageIds = stages.map((s) => s.id);

  const gatesByStageId: Record<string, StageGate[]> = {};

  if (stageIds.length > 0) {
    // Uses PostgreSQL's ANY() operator via sql tag — Kysely's `in` operator
    // would emit `IN (...)` which is functionally equivalent but loses the
    // single-param-array optimisation the original raw query relied on.
    const gateRows = await db
      .selectFrom('stage_gates')
      .selectAll()
      .where(sql<boolean>`stage_id = any(${stageIds})`)
      .where('tenant_id', '=', tenantId)
      .orderBy('stage_id')
      .execute();

    for (const row of gateRows as unknown as Record<string, unknown>[]) {
      const gate = rowToGate(row);
      if (!gatesByStageId[gate.stageId]) {
        gatesByStageId[gate.stageId] = [];
      }
      gatesByStageId[gate.stageId].push(gate);
    }
  }

  return {
    ...pipeline,
    stages: stages.map((stage) => ({
      ...stage,
      gates: gatesByStageId[stage.id] ?? [],
    })),
  };
}

/**
 * Updates a pipeline definition.
 *
 * @throws {Error} NOT_FOUND — pipeline does not exist
 * @throws {Error} VALIDATION_ERROR — invalid input
 */
export async function updatePipeline(
  tenantId: string,
  id: string,
  params: UpdatePipelineParams,
): Promise<PipelineDefinition> {
  return db.transaction().execute(async (trx) => {
    const existing = await trx
      .selectFrom('pipeline_definitions')
      .selectAll()
      .where('id', '=', id)
      .where('tenant_id', '=', tenantId)
      .executeTakeFirst();

    if (!existing) {
      throwNotFoundError('Pipeline not found');
    }

    if (params.name !== undefined) {
      const nameError = validatePipelineName(params.name);
      if (nameError) throwValidationError(nameError);
    }

    // Build dynamic update set
    const set: Record<string, unknown> = {};

    if ('name' in params) {
      set.name = params.name!.trim();
    }
    if ('description' in params) {
      set.description = params.description?.trim() ?? null;
    }
    if ('isDefault' in params) {
      set.is_default = params.isDefault;
    }

    if (Object.keys(set).length === 0) {
      return rowToPipeline(existing as unknown as Record<string, unknown>);
    }

    set.updated_at = new Date();

    // Enforce single-default-per-object invariant atomically. When we are
    // promoting this pipeline to default, demote every other pipeline for
    // the same object first. This prevents the dual-default corruption
    // that produced stranded records in the stage-move flow.
    if (params.isDefault === true) {
      await trx
        .updateTable('pipeline_definitions')
        .set({ is_default: false, updated_at: new Date() })
        .where('tenant_id', '=', tenantId)
        .where('object_id', '=', existing.object_id)
        .where('id', '!=', id)
        .where('is_default', '=', true)
        .execute();
    }

    const updated = await trx
      .updateTable('pipeline_definitions')
      .set(set)
      .where('id', '=', id)
      .where('tenant_id', '=', tenantId)
      .returningAll()
      .executeTakeFirstOrThrow();

    logger.info({ pipelineId: id }, 'Pipeline updated');

    return rowToPipeline(updated as unknown as Record<string, unknown>);
  });
}

/**
 * Deletes a pipeline definition.
 * System pipelines and pipelines with records cannot be deleted.
 *
 * @throws {Error} NOT_FOUND — pipeline does not exist
 * @throws {Error} DELETE_BLOCKED — system pipeline or records exist
 */
export async function deletePipeline(tenantId: string, id: string): Promise<void> {
  const existing = await db
    .selectFrom('pipeline_definitions')
    .selectAll()
    .where('id', '=', id)
    .where('tenant_id', '=', tenantId)
    .executeTakeFirst();

  if (!existing) {
    throwNotFoundError('Pipeline not found');
  }

  if (existing.is_system === true) {
    throwDeleteBlockedError('Cannot delete system pipelines');
  }

  // Check if records are using this pipeline
  const recordCountRow = await db
    .selectFrom('records')
    .select(db.fn.count<string>('id').as('count'))
    .where('pipeline_id', '=', id)
    .where('tenant_id', '=', tenantId)
    .executeTakeFirstOrThrow();
  const count = parseInt(recordCountRow.count, 10);
  if (count > 0) {
    throwDeleteBlockedError('Cannot delete pipeline with existing records');
  }

  await db
    .deleteFrom('pipeline_definitions')
    .where('id', '=', id)
    .where('tenant_id', '=', tenantId)
    .execute();

  logger.info({ pipelineId: id }, 'Pipeline deleted');
}

// ─── Service functions: Stages ───────────────────────────────────────────────

/**
 * Adds a stage to a pipeline.
 * Open stages are inserted before terminal (won/lost) stages.
 *
 * @throws {Error} NOT_FOUND — pipeline does not exist
 * @throws {Error} VALIDATION_ERROR — invalid input
 * @throws {Error} CONFLICT — api_name already exists on this pipeline
 */
export async function createStage(
  tenantId: string,
  pipelineId: string,
  params: CreateStageParams,
): Promise<StageDefinition> {
  // Validate pipeline exists within tenant
  const pipelineRow = await db
    .selectFrom('pipeline_definitions')
    .selectAll()
    .where('id', '=', pipelineId)
    .where('tenant_id', '=', tenantId)
    .executeTakeFirst();
  if (!pipelineRow) {
    throwNotFoundError('Pipeline not found');
  }

  // Validate
  const nameError = validateStageName(params.name);
  if (nameError) throwValidationError(nameError);

  const apiNameError = validateStageApiName(params.apiName);
  if (apiNameError) throwValidationError(apiNameError);

  const stageTypeError = validateStageType(params.stageType);
  if (stageTypeError) throwValidationError(stageTypeError);

  if (typeof params.colour !== 'string' || params.colour.trim().length === 0) {
    throwValidationError('colour is required');
  }

  // Check uniqueness of api_name within this pipeline
  const conflict = await db
    .selectFrom('stage_definitions')
    .select('id')
    .where('pipeline_id', '=', pipelineId)
    .where('api_name', '=', params.apiName.trim())
    .where('tenant_id', '=', tenantId)
    .executeTakeFirst();
  if (conflict) {
    throwConflictError(
      `A stage with api_name "${params.apiName.trim()}" already exists on this pipeline`,
    );
  }

  // Use a transaction so sort_order shifting and INSERT are atomic.
  // The RLS proxy on `pool.connect()` (see db/client.ts) sets
  // `app.current_tenant_id` on the checked-out connection before Kysely
  // begins the transaction, so RLS policies are active inside `trx`.
  return db.transaction().execute(async (trx) => {
    const allStages = await trx
      .selectFrom('stage_definitions')
      .selectAll()
      .where('pipeline_id', '=', pipelineId)
      .where('tenant_id', '=', tenantId)
      .orderBy('sort_order', 'asc')
      .execute();

    const stageType = params.stageType.trim();
    let newSortOrder: number;

    if (stageType === 'open') {
      // Find the first terminal (won/lost) stage and insert before it
      const firstTerminalIndex = allStages.findIndex(
        (r) => r.stage_type === 'won' || r.stage_type === 'lost',
      );

      if (firstTerminalIndex >= 0) {
        newSortOrder = allStages[firstTerminalIndex]!.sort_order as number;
        // Shift terminal stages down. Using a raw sql expression so Kysely
        // emits `set sort_order = sort_order + 1` as a single column-reference
        // update (no parameter for the literal 1).
        await trx
          .updateTable('stage_definitions')
          .set({ sort_order: sql<number>`sort_order + 1` })
          .where('pipeline_id', '=', pipelineId)
          .where('sort_order', '>=', newSortOrder)
          .where('tenant_id', '=', tenantId)
          .execute();
      } else {
        // No terminal stages — append at the end
        const maxSort = allStages.length > 0
          ? (allStages[allStages.length - 1]!.sort_order as number) + 1
          : 0;
        newSortOrder = maxSort;
      }
    } else {
      // Terminal stages go at the end
      const maxSort = allStages.length > 0
        ? (allStages[allStages.length - 1]!.sort_order as number) + 1
        : 0;
      newSortOrder = maxSort;
    }

    const stageId = randomUUID();
    const now = new Date();

    const inserted = await trx
      .insertInto('stage_definitions')
      .values({
        id: stageId,
        tenant_id: tenantId,
        pipeline_id: pipelineId,
        name: params.name.trim(),
        api_name: params.apiName.trim(),
        sort_order: newSortOrder,
        stage_type: stageType,
        colour: params.colour.trim(),
        default_probability: params.defaultProbability ?? null,
        expected_days: params.expectedDays ?? null,
        description: params.description?.trim() ?? null,
        created_at: now,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    logger.info({ stageId, pipelineId, apiName: params.apiName }, 'Stage created');

    return rowToStage(inserted as unknown as Record<string, unknown>);
  });
}

/**
 * Updates a stage definition.
 *
 * @throws {Error} NOT_FOUND — stage or pipeline does not exist
 * @throws {Error} VALIDATION_ERROR — invalid input
 */
export async function updateStage(
  tenantId: string,
  pipelineId: string,
  stageId: string,
  params: UpdateStageParams,
): Promise<StageDefinition> {
  // Validate pipeline exists within tenant
  const pipelineRow = await db
    .selectFrom('pipeline_definitions')
    .select('id')
    .where('id', '=', pipelineId)
    .where('tenant_id', '=', tenantId)
    .executeTakeFirst();
  if (!pipelineRow) {
    throwNotFoundError('Pipeline not found');
  }

  const existing = await db
    .selectFrom('stage_definitions')
    .selectAll()
    .where('id', '=', stageId)
    .where('pipeline_id', '=', pipelineId)
    .where('tenant_id', '=', tenantId)
    .executeTakeFirst();
  if (!existing) {
    throwNotFoundError('Stage not found');
  }

  // Validate changed fields
  if (params.name !== undefined) {
    const nameError = validateStageName(params.name);
    if (nameError) throwValidationError(nameError);
  }

  if (params.stageType !== undefined) {
    const stageTypeError = validateStageType(params.stageType);
    if (stageTypeError) throwValidationError(stageTypeError);
  }

  // Build dynamic update set
  const set: Record<string, unknown> = {};

  if ('name' in params) {
    set.name = params.name!.trim();
  }
  if ('stageType' in params) {
    set.stage_type = params.stageType!.trim();
  }
  if ('colour' in params) {
    set.colour = params.colour!.trim();
  }
  if ('defaultProbability' in params) {
    set.default_probability = params.defaultProbability ?? null;
  }
  if ('expectedDays' in params) {
    set.expected_days = params.expectedDays ?? null;
  }
  if ('description' in params) {
    set.description = params.description?.trim() ?? null;
  }

  if (Object.keys(set).length === 0) {
    return rowToStage(existing as unknown as Record<string, unknown>);
  }

  const updated = await db
    .updateTable('stage_definitions')
    .set(set)
    .where('id', '=', stageId)
    .where('pipeline_id', '=', pipelineId)
    .where('tenant_id', '=', tenantId)
    .returningAll()
    .executeTakeFirstOrThrow();

  logger.info({ stageId, pipelineId }, 'Stage updated');

  return rowToStage(updated as unknown as Record<string, unknown>);
}

/**
 * Deletes a stage definition.
 * Cannot delete if records are in this stage, if it's the last won/lost stage,
 * or if the pipeline is a system pipeline.
 *
 * @throws {Error} NOT_FOUND — stage or pipeline does not exist
 * @throws {Error} DELETE_BLOCKED — deletion not allowed
 */
export async function deleteStage(
  tenantId: string,
  pipelineId: string,
  stageId: string,
): Promise<void> {
  // Validate pipeline exists within tenant
  const pipelineRow = await db
    .selectFrom('pipeline_definitions')
    .selectAll()
    .where('id', '=', pipelineId)
    .where('tenant_id', '=', tenantId)
    .executeTakeFirst();
  if (!pipelineRow) {
    throwNotFoundError('Pipeline not found');
  }

  if (pipelineRow.is_system === true) {
    throwDeleteBlockedError('Cannot delete stages from system pipelines');
  }

  const existing = await db
    .selectFrom('stage_definitions')
    .selectAll()
    .where('id', '=', stageId)
    .where('pipeline_id', '=', pipelineId)
    .where('tenant_id', '=', tenantId)
    .executeTakeFirst();
  if (!existing) {
    throwNotFoundError('Stage not found');
  }

  const stageType = existing.stage_type as string;

  // Cannot delete if records are currently in this stage
  const recordCountRow = await db
    .selectFrom('records')
    .select(db.fn.count<string>('id').as('count'))
    .where('current_stage_id', '=', stageId)
    .where('tenant_id', '=', tenantId)
    .executeTakeFirstOrThrow();
  const count = parseInt(recordCountRow.count, 10);
  if (count > 0) {
    throwDeleteBlockedError('Cannot delete stage with existing records');
  }

  // Cannot delete the last won or lost stage
  if (stageType === 'won' || stageType === 'lost') {
    const sameTypeCountRow = await db
      .selectFrom('stage_definitions')
      .select(db.fn.count<string>('id').as('count'))
      .where('pipeline_id', '=', pipelineId)
      .where('stage_type', '=', stageType)
      .where('tenant_id', '=', tenantId)
      .executeTakeFirstOrThrow();
    const typeCount = parseInt(sameTypeCountRow.count, 10);
    if (typeCount <= 1) {
      throwDeleteBlockedError(`Cannot delete the last ${stageType} stage`);
    }
  }

  await db
    .deleteFrom('stage_definitions')
    .where('id', '=', stageId)
    .where('pipeline_id', '=', pipelineId)
    .where('tenant_id', '=', tenantId)
    .execute();

  logger.info({ stageId, pipelineId }, 'Stage deleted');
}

/**
 * Reorders stages within a pipeline.
 * Won/lost stages must remain at the end.
 *
 * @throws {Error} NOT_FOUND — pipeline does not exist
 * @throws {Error} VALIDATION_ERROR — invalid stage_ids or ordering constraint violated
 */
export async function reorderStages(
  tenantId: string,
  pipelineId: string,
  stageIds: string[],
): Promise<StageDefinition[]> {
  // Validate pipeline exists within tenant
  const pipelineRow = await db
    .selectFrom('pipeline_definitions')
    .select('id')
    .where('id', '=', pipelineId)
    .where('tenant_id', '=', tenantId)
    .executeTakeFirst();
  if (!pipelineRow) {
    throwNotFoundError('Pipeline not found');
  }

  if (!Array.isArray(stageIds) || stageIds.length === 0) {
    throwValidationError('stage_ids must be a non-empty array');
  }

  // Verify all stage IDs belong to this pipeline
  const existingStages = await db
    .selectFrom('stage_definitions')
    .select(['id', 'stage_type'])
    .where('pipeline_id', '=', pipelineId)
    .where('tenant_id', '=', tenantId)
    .execute();
  const existingIds = new Set(existingStages.map((r) => r.id as string));
  const stageTypeMap = new Map(
    existingStages.map((r) => [r.id as string, r.stage_type as string]),
  );

  for (const id of stageIds) {
    if (!existingIds.has(id)) {
      throwValidationError(`Stage ID "${id}" does not belong to this pipeline`);
    }
  }

  if (stageIds.length !== existingIds.size) {
    throwValidationError('stage_ids must include all stages in the pipeline');
  }

  // Validate won/lost stages remain at the end
  let foundTerminal = false;
  for (const id of stageIds) {
    const type = stageTypeMap.get(id);
    if (type === 'won' || type === 'lost') {
      foundTerminal = true;
    } else if (foundTerminal) {
      throwValidationError('Won/lost stages must remain at the end of the pipeline');
    }
  }

  // Update sort_order for each stage
  for (let i = 0; i < stageIds.length; i++) {
    await db
      .updateTable('stage_definitions')
      .set({ sort_order: i })
      .where('id', '=', stageIds[i]!)
      .where('pipeline_id', '=', pipelineId)
      .where('tenant_id', '=', tenantId)
      .execute();
  }

  logger.info({ pipelineId, stageCount: stageIds.length }, 'Stages reordered');

  // Return the updated list
  const rows = await db
    .selectFrom('stage_definitions')
    .selectAll()
    .where('pipeline_id', '=', pipelineId)
    .where('tenant_id', '=', tenantId)
    .orderBy('sort_order', 'asc')
    .execute();

  return rows.map((row) => rowToStage(row as unknown as Record<string, unknown>));
}
