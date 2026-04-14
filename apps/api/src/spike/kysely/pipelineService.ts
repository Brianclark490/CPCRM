/**
 * Pipeline Service (Kysely Prototype)
 *
 * Reimplementation of key pipelineService methods using Kysely for comparison.
 * Focus: type safety, query readability, error catching at compile time.
 */

import { randomUUID } from 'crypto';
import { db } from './client.js';
import { sql } from 'kysely';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PipelineDefinition {
  id: string;
  tenantId: string;
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
  tenantId: string;
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

function rowToPipeline(row: {
  id: string;
  tenant_id: string;
  object_id: string;
  name: string;
  api_name: string;
  description: string | null;
  is_default: boolean;
  is_system: boolean;
  owner_id: string;
  created_at: Date;
  updated_at: Date;
}): PipelineDefinition {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    objectId: row.object_id,
    name: row.name,
    apiName: row.api_name,
    description: row.description ?? undefined,
    isDefault: row.is_default,
    isSystem: row.is_system,
    ownerId: row.owner_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToStage(row: {
  id: string;
  tenant_id: string;
  pipeline_id: string;
  name: string;
  api_name: string;
  sort_order: number;
  stage_type: string;
  colour: string;
  default_probability: number | null;
  expected_days: number | null;
  description: string | null;
  created_at: Date;
}): StageDefinition {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    pipelineId: row.pipeline_id,
    name: row.name,
    apiName: row.api_name,
    sortOrder: row.sort_order,
    stageType: row.stage_type,
    colour: row.colour,
    defaultProbability: row.default_probability ?? undefined,
    expectedDays: row.expected_days ?? undefined,
    description: row.description ?? undefined,
    createdAt: row.created_at,
  };
}

function rowToGate(row: {
  id: string;
  stage_id: string;
  field_id: string;
  gate_type: string;
  gate_value: string | null;
  error_message: string | null;
}): StageGate {
  return {
    id: row.id,
    stageId: row.stage_id,
    fieldId: row.field_id,
    gateType: row.gate_type,
    gateValue: row.gate_value ?? undefined,
    errorMessage: row.error_message ?? undefined,
  };
}

// ─── Pipeline CRUD ────────────────────────────────────────────────────────────

/**
 * List all pipelines for an object.
 */
export async function listPipelines(
  tenantId: string,
  objectId: string,
): Promise<PipelineDefinition[]> {
  const rows = await db
    .selectFrom('pipeline_definitions')
    .selectAll()
    .where('tenant_id', '=', tenantId)
    .where('object_id', '=', objectId)
    .orderBy('is_default', 'desc')
    .orderBy('name', 'asc')
    .execute();

  return rows.map(rowToPipeline);
}

/**
 * Get a single pipeline by ID.
 */
export async function getPipeline(
  tenantId: string,
  pipelineId: string,
): Promise<PipelineDefinition | null> {
  const row = await db
    .selectFrom('pipeline_definitions')
    .selectAll()
    .where('id', '=', pipelineId)
    .where('tenant_id', '=', tenantId)
    .executeTakeFirst();

  return row ? rowToPipeline(row) : null;
}

/**
 * Get a pipeline with its stages (no gates).
 */
export async function getPipelineWithStages(
  tenantId: string,
  pipelineId: string,
): Promise<PipelineWithStages | null> {
  const pipeline = await getPipeline(tenantId, pipelineId);
  if (!pipeline) return null;

  const stageRows = await db
    .selectFrom('stage_definitions')
    .selectAll()
    .where('pipeline_id', '=', pipelineId)
    .where('tenant_id', '=', tenantId)
    .orderBy('sort_order', 'asc')
    .execute();

  return {
    ...pipeline,
    stages: stageRows.map(rowToStage),
  };
}

/**
 * Get a pipeline with stages and gates (full detail).
 */
export async function getPipelineDetail(
  tenantId: string,
  pipelineId: string,
): Promise<PipelineDetail | null> {
  const pipeline = await getPipeline(tenantId, pipelineId);
  if (!pipeline) return null;

  // Fetch stages
  const stageRows = await db
    .selectFrom('stage_definitions')
    .selectAll()
    .where('pipeline_id', '=', pipelineId)
    .where('tenant_id', '=', tenantId)
    .orderBy('sort_order', 'asc')
    .execute();

  const stages = stageRows.map(rowToStage);

  // Fetch gates for all stages in one query
  const stageIds = stages.map((s) => s.id);
  const gateRows = stageIds.length
    ? await db
        .selectFrom('stage_gates')
        .selectAll()
        .where('stage_id', 'in', stageIds)
        .where('tenant_id', '=', tenantId)
        .execute()
    : [];

  const gatesByStageId = new Map<string, StageGate[]>();
  for (const gateRow of gateRows) {
    const gate = rowToGate(gateRow);
    if (!gatesByStageId.has(gate.stageId)) {
      gatesByStageId.set(gate.stageId, []);
    }
    gatesByStageId.get(gate.stageId)!.push(gate);
  }

  return {
    ...pipeline,
    stages: stages.map((stage) => ({
      ...stage,
      gates: gatesByStageId.get(stage.id) ?? [],
    })),
  };
}

/**
 * Create a new pipeline.
 */
export async function createPipeline(
  tenantId: string,
  params: CreatePipelineParams,
): Promise<PipelineDefinition> {
  if (!SNAKE_CASE_RE.test(params.apiName)) {
    throwValidationError('api_name must be snake_case');
  }

  // Check for duplicate api_name
  const existing = await db
    .selectFrom('pipeline_definitions')
    .select('id')
    .where('tenant_id', '=', tenantId)
    .where('object_id', '=', params.objectId)
    .where('api_name', '=', params.apiName)
    .executeTakeFirst();

  if (existing) {
    throwConflictError(
      `Pipeline with api_name "${params.apiName}" already exists on this object`,
    );
  }

  const row = await db
    .insertInto('pipeline_definitions')
    .values({
      id: randomUUID(),
      tenant_id: tenantId,
      object_id: params.objectId,
      name: params.name,
      api_name: params.apiName,
      description: params.description ?? null,
      is_default: false,
      is_system: false,
      owner_id: params.ownerId,
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  return rowToPipeline(row);
}

/**
 * Update a pipeline.
 */
export async function updatePipeline(
  tenantId: string,
  pipelineId: string,
  params: UpdatePipelineParams,
): Promise<PipelineDefinition> {
  const pipeline = await getPipeline(tenantId, pipelineId);
  if (!pipeline) {
    throwNotFoundError('Pipeline not found');
  }

  if (pipeline.isSystem) {
    throwValidationError('Cannot modify system pipelines');
  }

  // If setting as default, unset other defaults first
  if (params.isDefault === true) {
    await db
      .updateTable('pipeline_definitions')
      .set({ is_default: false })
      .where('tenant_id', '=', tenantId)
      .where('object_id', '=', pipeline.objectId)
      .where('id', '!=', pipelineId)
      .execute();
  }

  const updateValues: Record<string, unknown> = {
    updated_at: sql`NOW()`,
  };
  if (params.name !== undefined) updateValues.name = params.name;
  if (params.description !== undefined)
    updateValues.description = params.description;
  if (params.isDefault !== undefined)
    updateValues.is_default = params.isDefault;

  const row = await db
    .updateTable('pipeline_definitions')
    .set(updateValues)
    .where('id', '=', pipelineId)
    .where('tenant_id', '=', tenantId)
    .returningAll()
    .executeTakeFirstOrThrow();

  return rowToPipeline(row);
}

/**
 * Delete a pipeline (if no records reference it).
 */
export async function deletePipeline(
  tenantId: string,
  pipelineId: string,
): Promise<void> {
  const pipeline = await getPipeline(tenantId, pipelineId);
  if (!pipeline) {
    throwNotFoundError('Pipeline not found');
  }

  if (pipeline.isSystem) {
    throwValidationError('Cannot delete system pipelines');
  }

  // Check for records using this pipeline
  const recordCount = await db
    .selectFrom('records')
    .select(sql`COUNT(*)`.as('count'))
    .where('pipeline_id', '=', pipelineId)
    .where('tenant_id', '=', tenantId)
    .executeTakeFirst();

  if (recordCount && Number(recordCount.count) > 0) {
    throwDeleteBlockedError(
      `Cannot delete pipeline with ${recordCount.count} records`,
    );
  }

  await db
    .deleteFrom('pipeline_definitions')
    .where('id', '=', pipelineId)
    .where('tenant_id', '=', tenantId)
    .execute();
}

// ─── Stage CRUD ───────────────────────────────────────────────────────────────

/**
 * List stages for a pipeline.
 */
export async function listStages(
  tenantId: string,
  pipelineId: string,
): Promise<StageDefinition[]> {
  const rows = await db
    .selectFrom('stage_definitions')
    .selectAll()
    .where('pipeline_id', '=', pipelineId)
    .where('tenant_id', '=', tenantId)
    .orderBy('sort_order', 'asc')
    .execute();

  return rows.map(rowToStage);
}

/**
 * Get a single stage by ID.
 */
export async function getStage(
  tenantId: string,
  stageId: string,
): Promise<StageDefinition | null> {
  const row = await db
    .selectFrom('stage_definitions')
    .selectAll()
    .where('id', '=', stageId)
    .where('tenant_id', '=', tenantId)
    .executeTakeFirst();

  return row ? rowToStage(row) : null;
}

/**
 * Create a new stage.
 */
export async function createStage(
  tenantId: string,
  pipelineId: string,
  params: CreateStageParams,
): Promise<StageDefinition> {
  if (!SNAKE_CASE_RE.test(params.apiName)) {
    throwValidationError('api_name must be snake_case');
  }

  if (!ALLOWED_STAGE_TYPES.has(params.stageType)) {
    throwValidationError(
      `stage_type must be one of: ${Array.from(ALLOWED_STAGE_TYPES).join(', ')}`,
    );
  }

  // Check for duplicate api_name
  const existing = await db
    .selectFrom('stage_definitions')
    .select('id')
    .where('pipeline_id', '=', pipelineId)
    .where('tenant_id', '=', tenantId)
    .where('api_name', '=', params.apiName)
    .executeTakeFirst();

  if (existing) {
    throwConflictError(
      `Stage with api_name "${params.apiName}" already exists in this pipeline`,
    );
  }

  // Get max sort_order
  const maxOrderResult = await db
    .selectFrom('stage_definitions')
    .select(sql`COALESCE(MAX(sort_order), -1)`.as('max_order'))
    .where('pipeline_id', '=', pipelineId)
    .where('tenant_id', '=', tenantId)
    .executeTakeFirst();

  const sortOrder = (Number(maxOrderResult?.max_order ?? -1) + 1);

  const row = await db
    .insertInto('stage_definitions')
    .values({
      id: randomUUID(),
      tenant_id: tenantId,
      pipeline_id: pipelineId,
      name: params.name,
      api_name: params.apiName,
      sort_order: sortOrder,
      stage_type: params.stageType,
      colour: params.colour,
      default_probability: params.defaultProbability ?? null,
      expected_days: params.expectedDays ?? null,
      description: params.description ?? null,
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  return rowToStage(row);
}

/**
 * Update a stage.
 */
export async function updateStage(
  tenantId: string,
  stageId: string,
  params: UpdateStageParams,
): Promise<StageDefinition> {
  const stage = await getStage(tenantId, stageId);
  if (!stage) {
    throwNotFoundError('Stage not found');
  }

  if (params.stageType && !ALLOWED_STAGE_TYPES.has(params.stageType)) {
    throwValidationError(
      `stage_type must be one of: ${Array.from(ALLOWED_STAGE_TYPES).join(', ')}`,
    );
  }

  const updateValues: Record<string, unknown> = {};
  if (params.name !== undefined) updateValues.name = params.name;
  if (params.stageType !== undefined)
    updateValues.stage_type = params.stageType;
  if (params.colour !== undefined) updateValues.colour = params.colour;
  if (params.defaultProbability !== undefined)
    updateValues.default_probability = params.defaultProbability;
  if (params.expectedDays !== undefined)
    updateValues.expected_days = params.expectedDays;
  if (params.description !== undefined)
    updateValues.description = params.description;

  const row = await db
    .updateTable('stage_definitions')
    .set(updateValues)
    .where('id', '=', stageId)
    .where('tenant_id', '=', tenantId)
    .returningAll()
    .executeTakeFirstOrThrow();

  return rowToStage(row);
}

/**
 * Delete a stage (if no records reference it).
 */
export async function deleteStage(
  tenantId: string,
  stageId: string,
): Promise<void> {
  const stage = await getStage(tenantId, stageId);
  if (!stage) {
    throwNotFoundError('Stage not found');
  }

  // Check for records using this stage
  const recordCount = await db
    .selectFrom('records')
    .select(sql`COUNT(*)`.as('count'))
    .where('current_stage_id', '=', stageId)
    .where('tenant_id', '=', tenantId)
    .executeTakeFirst();

  if (recordCount && Number(recordCount.count) > 0) {
    throwDeleteBlockedError(
      `Cannot delete stage with ${recordCount.count} records`,
    );
  }

  await db
    .deleteFrom('stage_definitions')
    .where('id', '=', stageId)
    .where('tenant_id', '=', tenantId)
    .execute();
}
