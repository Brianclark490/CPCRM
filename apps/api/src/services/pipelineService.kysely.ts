import { randomUUID } from 'crypto';
import { logger } from '../lib/logger.js';
import { db } from '../db/kysely.js';
import type { Selectable, Insertable, Updateable } from 'kysely';
import type { PipelineDefinitions, StageDefinitions, StageGates } from '../db/kysely.types.js';

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

function rowToPipeline(row: Selectable<PipelineDefinitions>): PipelineDefinition {
  return {
    id: row.id,
    objectId: row.object_id,
    name: row.name,
    apiName: row.api_name,
    description: row.description ?? undefined,
    isDefault: row.is_default,
    isSystem: row.is_system,
    ownerId: row.owner_id,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function rowToStage(row: Selectable<StageDefinitions>): StageDefinition {
  return {
    id: row.id,
    pipelineId: row.pipeline_id,
    name: row.name,
    apiName: row.api_name,
    sortOrder: row.sort_order,
    stageType: row.stage_type,
    colour: row.colour,
    defaultProbability: row.default_probability ?? undefined,
    expectedDays: row.expected_days ?? undefined,
    description: row.description ?? undefined,
    createdAt: new Date(row.created_at),
  };
}

function rowToGate(row: Selectable<StageGates>): StageGate {
  return {
    id: row.id,
    stageId: row.stage_id,
    fieldId: row.field_id,
    gateType: row.gate_type,
    gateValue: row.gate_value ?? undefined,
    errorMessage: row.error_message ?? undefined,
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
  const objectResult = await db
    .selectFrom('object_definitions')
    .select('id')
    .where('id', '=', objectId)
    .where('tenant_id', '=', tenantId)
    .executeTakeFirst();

  if (!objectResult) {
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

  const pipeline = await db
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

  const stages = await db
    .selectFrom('stage_definitions')
    .selectAll()
    .where('pipeline_id', '=', pipelineId)
    .where('tenant_id', '=', tenantId)
    .orderBy('sort_order', 'asc')
    .execute();

  return {
    ...rowToPipeline(pipeline),
    stages: stages.map(rowToStage),
  };
}

/**
 * Returns all pipeline definitions.
 */
export async function listPipelines(tenantId: string): Promise<PipelineDefinition[]> {
  const pipelines = await db
    .selectFrom('pipeline_definitions')
    .selectAll()
    .where('tenant_id', '=', tenantId)
    .orderBy('is_system', 'desc')
    .orderBy('created_at', 'asc')
    .execute();

  return pipelines.map(rowToPipeline);
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

  const pipeline = rowToPipeline(pipelineRow);

  const stageRows = await db
    .selectFrom('stage_definitions')
    .selectAll()
    .where('pipeline_id', '=', id)
    .where('tenant_id', '=', tenantId)
    .orderBy('sort_order', 'asc')
    .execute();

  const stages = stageRows.map(rowToStage);

  // Fetch gates for all stages in one query
  const stageIds = stages.map((s) => s.id);

  const gatesByStageId: Record<string, StageGate[]> = {};

  if (stageIds.length > 0) {
    const gateRows = await db
      .selectFrom('stage_gates')
      .selectAll()
      .where('stage_id', 'in', stageIds)
      .where('tenant_id', '=', tenantId)
      .orderBy('stage_id', 'asc')
      .execute();

    for (const row of gateRows) {
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
  const existing = await db
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

  // Build dynamic update
  const updates: Updateable<PipelineDefinitions> = {};

  if ('name' in params) {
    updates.name = params.name!.trim();
  }
  if ('description' in params) {
    updates.description = params.description?.trim() ?? null;
  }
  if ('isDefault' in params) {
    updates.is_default = params.isDefault;
  }

  if (Object.keys(updates).length === 0) {
    return rowToPipeline(existing);
  }

  const now = new Date();
  updates.updated_at = now;

  const updated = await db
    .updateTable('pipeline_definitions')
    .set(updates)
    .where('id', '=', id)
    .where('tenant_id', '=', tenantId)
    .returningAll()
    .executeTakeFirstOrThrow();

  logger.info({ pipelineId: id }, 'Pipeline updated');

  return rowToPipeline(updated);
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
  const recordCountResult = await db
    .selectFrom('records')
    .select(db.fn.countAll<string>().as('count'))
    .where('pipeline_id', '=', id)
    .where('tenant_id', '=', tenantId)
    .executeTakeFirstOrThrow();

  const count = parseInt(recordCountResult.count, 10);
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
  const pipelineResult = await db
    .selectFrom('pipeline_definitions')
    .selectAll()
    .where('id', '=', pipelineId)
    .where('tenant_id', '=', tenantId)
    .executeTakeFirst();

  if (!pipelineResult) {
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
  const existing = await db
    .selectFrom('stage_definitions')
    .select('id')
    .where('pipeline_id', '=', pipelineId)
    .where('api_name', '=', params.apiName.trim())
    .where('tenant_id', '=', tenantId)
    .executeTakeFirst();

  if (existing) {
    throwConflictError(`A stage with api_name "${params.apiName.trim()}" already exists on this pipeline`);
  }

  // Use a transaction so sort_order shifting and INSERT are atomic
  return await db.transaction().execute(async (trx) => {
    // Determine sort_order: insert before terminal stages for open stages
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
        newSortOrder = allStages[firstTerminalIndex].sort_order;
        // Shift terminal stages down
        await trx
          .updateTable('stage_definitions')
          .set((eb) => ({ sort_order: eb('sort_order', '+', 1) }))
          .where('pipeline_id', '=', pipelineId)
          .where('sort_order', '>=', newSortOrder)
          .where('tenant_id', '=', tenantId)
          .execute();
      } else {
        // No terminal stages — append at the end
        const maxSort = allStages.length > 0
          ? allStages[allStages.length - 1].sort_order + 1
          : 0;
        newSortOrder = maxSort;
      }
    } else {
      // Terminal stages go at the end
      const maxSort = allStages.length > 0
        ? allStages[allStages.length - 1].sort_order + 1
        : 0;
      newSortOrder = maxSort;
    }

    const stageId = randomUUID();
    const now = new Date();

    const result = await trx
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

    return rowToStage(result);
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
  const pipelineResult = await db
    .selectFrom('pipeline_definitions')
    .select('id')
    .where('id', '=', pipelineId)
    .where('tenant_id', '=', tenantId)
    .executeTakeFirst();

  if (!pipelineResult) {
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

  // Build dynamic update
  const updates: Updateable<StageDefinitions> = {};

  if ('name' in params) {
    updates.name = params.name!.trim();
  }
  if ('stageType' in params) {
    updates.stage_type = params.stageType!.trim();
  }
  if ('colour' in params) {
    updates.colour = params.colour!.trim();
  }
  if ('defaultProbability' in params) {
    updates.default_probability = params.defaultProbability ?? null;
  }
  if ('expectedDays' in params) {
    updates.expected_days = params.expectedDays ?? null;
  }
  if ('description' in params) {
    updates.description = params.description?.trim() ?? null;
  }

  if (Object.keys(updates).length === 0) {
    return rowToStage(existing);
  }

  const result = await db
    .updateTable('stage_definitions')
    .set(updates)
    .where('id', '=', stageId)
    .where('pipeline_id', '=', pipelineId)
    .where('tenant_id', '=', tenantId)
    .returningAll()
    .executeTakeFirstOrThrow();

  logger.info({ stageId, pipelineId }, 'Stage updated');

  return rowToStage(result);
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
  const pipelineResult = await db
    .selectFrom('pipeline_definitions')
    .selectAll()
    .where('id', '=', pipelineId)
    .where('tenant_id', '=', tenantId)
    .executeTakeFirst();

  if (!pipelineResult) {
    throwNotFoundError('Pipeline not found');
  }

  if (pipelineResult.is_system === true) {
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

  const stageType = existing.stage_type;

  // Cannot delete if records are currently in this stage
  const recordCountResult = await db
    .selectFrom('records')
    .select(db.fn.countAll<string>().as('count'))
    .where('current_stage_id', '=', stageId)
    .where('tenant_id', '=', tenantId)
    .executeTakeFirstOrThrow();

  const count = parseInt(recordCountResult.count, 10);
  if (count > 0) {
    throwDeleteBlockedError('Cannot delete stage with existing records');
  }

  // Cannot delete the last won or lost stage
  if (stageType === 'won' || stageType === 'lost') {
    const sameTypeCountResult = await db
      .selectFrom('stage_definitions')
      .select(db.fn.countAll<string>().as('count'))
      .where('pipeline_id', '=', pipelineId)
      .where('stage_type', '=', stageType)
      .where('tenant_id', '=', tenantId)
      .executeTakeFirstOrThrow();

    const typeCount = parseInt(sameTypeCountResult.count, 10);
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
  const pipelineResult = await db
    .selectFrom('pipeline_definitions')
    .select('id')
    .where('id', '=', pipelineId)
    .where('tenant_id', '=', tenantId)
    .executeTakeFirst();

  if (!pipelineResult) {
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

  const existingIds = new Set(existingStages.map((r) => r.id));
  const stageTypeMap = new Map(existingStages.map((r) => [r.id, r.stage_type]));

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
      .where('id', '=', stageIds[i])
      .where('pipeline_id', '=', pipelineId)
      .where('tenant_id', '=', tenantId)
      .execute();
  }

  logger.info({ pipelineId, stageCount: stageIds.length }, 'Stages reordered');

  // Return the updated list
  const result = await db
    .selectFrom('stage_definitions')
    .selectAll()
    .where('pipeline_id', '=', pipelineId)
    .where('tenant_id', '=', tenantId)
    .orderBy('sort_order', 'asc')
    .execute();

  return result.map(rowToStage);
}
