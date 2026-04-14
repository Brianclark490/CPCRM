/**
 * Pipeline Service (Drizzle Prototype)
 *
 * Reimplementation of key pipelineService methods using Drizzle for comparison.
 * Focus: schema-first approach, relational queries, type safety.
 */

import { randomUUID } from 'crypto';
import { db } from './client.js';
import { pipelineDefinitions, stageDefinitions, stageGates, records } from './schema.js';
import { eq, and, desc, asc, sql, count } from 'drizzle-orm';

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

function rowToPipeline(row: typeof pipelineDefinitions.$inferSelect): PipelineDefinition {
  return {
    id: row.id,
    tenantId: row.tenantId,
    objectId: row.objectId,
    name: row.name,
    apiName: row.apiName,
    description: row.description ?? undefined,
    isDefault: row.isDefault,
    isSystem: row.isSystem,
    ownerId: row.ownerId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function rowToStage(row: typeof stageDefinitions.$inferSelect): StageDefinition {
  return {
    id: row.id,
    tenantId: row.tenantId,
    pipelineId: row.pipelineId,
    name: row.name,
    apiName: row.apiName,
    sortOrder: row.sortOrder,
    stageType: row.stageType,
    colour: row.colour,
    defaultProbability: row.defaultProbability ?? undefined,
    expectedDays: row.expectedDays ?? undefined,
    description: row.description ?? undefined,
    createdAt: row.createdAt,
  };
}

function rowToGate(row: typeof stageGates.$inferSelect): StageGate {
  return {
    id: row.id,
    stageId: row.stageId,
    fieldId: row.fieldId,
    gateType: row.gateType,
    gateValue: row.gateValue ?? undefined,
    errorMessage: row.errorMessage ?? undefined,
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
    .select()
    .from(pipelineDefinitions)
    .where(
      and(
        eq(pipelineDefinitions.tenantId, tenantId),
        eq(pipelineDefinitions.objectId, objectId),
      ),
    )
    .orderBy(desc(pipelineDefinitions.isDefault), asc(pipelineDefinitions.name));

  return rows.map(rowToPipeline);
}

/**
 * Get a single pipeline by ID.
 */
export async function getPipeline(
  tenantId: string,
  pipelineId: string,
): Promise<PipelineDefinition | null> {
  const rows = await db
    .select()
    .from(pipelineDefinitions)
    .where(
      and(
        eq(pipelineDefinitions.id, pipelineId),
        eq(pipelineDefinitions.tenantId, tenantId),
      ),
    )
    .limit(1);

  return rows[0] ? rowToPipeline(rows[0]) : null;
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
    .select()
    .from(stageDefinitions)
    .where(
      and(
        eq(stageDefinitions.pipelineId, pipelineId),
        eq(stageDefinitions.tenantId, tenantId),
      ),
    )
    .orderBy(asc(stageDefinitions.sortOrder));

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
    .select()
    .from(stageDefinitions)
    .where(
      and(
        eq(stageDefinitions.pipelineId, pipelineId),
        eq(stageDefinitions.tenantId, tenantId),
      ),
    )
    .orderBy(asc(stageDefinitions.sortOrder));

  const stages = stageRows.map(rowToStage);

  // Fetch gates for all stages in one query
  const stageIds = stages.map((s) => s.id);
  const gateRows =
    stageIds.length > 0
      ? await db
          .select()
          .from(stageGates)
          .where(
            and(
              sql`${stageGates.stageId} = ANY(${stageIds})`,
              eq(stageGates.tenantId, tenantId),
            ),
          )
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
    .select({ id: pipelineDefinitions.id })
    .from(pipelineDefinitions)
    .where(
      and(
        eq(pipelineDefinitions.tenantId, tenantId),
        eq(pipelineDefinitions.objectId, params.objectId),
        eq(pipelineDefinitions.apiName, params.apiName),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    throwConflictError(
      `Pipeline with api_name "${params.apiName}" already exists on this object`,
    );
  }

  const rows = await db
    .insert(pipelineDefinitions)
    .values({
      id: randomUUID(),
      tenantId,
      objectId: params.objectId,
      name: params.name,
      apiName: params.apiName,
      description: params.description ?? null,
      isDefault: false,
      isSystem: false,
      ownerId: params.ownerId,
    })
    .returning();

  return rowToPipeline(rows[0]);
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
      .update(pipelineDefinitions)
      .set({ isDefault: false })
      .where(
        and(
          eq(pipelineDefinitions.tenantId, tenantId),
          eq(pipelineDefinitions.objectId, pipeline.objectId),
          sql`${pipelineDefinitions.id} != ${pipelineId}`,
        ),
      );
  }

  const updateValues: Partial<typeof pipelineDefinitions.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (params.name !== undefined) updateValues.name = params.name;
  if (params.description !== undefined)
    updateValues.description = params.description;
  if (params.isDefault !== undefined)
    updateValues.isDefault = params.isDefault;

  const rows = await db
    .update(pipelineDefinitions)
    .set(updateValues)
    .where(
      and(
        eq(pipelineDefinitions.id, pipelineId),
        eq(pipelineDefinitions.tenantId, tenantId),
      ),
    )
    .returning();

  return rowToPipeline(rows[0]);
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
    .select({ count: count() })
    .from(records)
    .where(
      and(eq(records.pipelineId, pipelineId), eq(records.tenantId, tenantId)),
    );

  if (recordCount[0]?.count > 0) {
    throwDeleteBlockedError(
      `Cannot delete pipeline with ${recordCount[0].count} records`,
    );
  }

  await db
    .delete(pipelineDefinitions)
    .where(
      and(
        eq(pipelineDefinitions.id, pipelineId),
        eq(pipelineDefinitions.tenantId, tenantId),
      ),
    );
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
    .select()
    .from(stageDefinitions)
    .where(
      and(
        eq(stageDefinitions.pipelineId, pipelineId),
        eq(stageDefinitions.tenantId, tenantId),
      ),
    )
    .orderBy(asc(stageDefinitions.sortOrder));

  return rows.map(rowToStage);
}

/**
 * Get a single stage by ID.
 */
export async function getStage(
  tenantId: string,
  stageId: string,
): Promise<StageDefinition | null> {
  const rows = await db
    .select()
    .from(stageDefinitions)
    .where(
      and(
        eq(stageDefinitions.id, stageId),
        eq(stageDefinitions.tenantId, tenantId),
      ),
    )
    .limit(1);

  return rows[0] ? rowToStage(rows[0]) : null;
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
    .select({ id: stageDefinitions.id })
    .from(stageDefinitions)
    .where(
      and(
        eq(stageDefinitions.pipelineId, pipelineId),
        eq(stageDefinitions.tenantId, tenantId),
        eq(stageDefinitions.apiName, params.apiName),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    throwConflictError(
      `Stage with api_name "${params.apiName}" already exists in this pipeline`,
    );
  }

  // Get max sort_order
  const maxOrderResult = await db
    .select({ maxOrder: sql<number>`COALESCE(MAX(${stageDefinitions.sortOrder}), -1)` })
    .from(stageDefinitions)
    .where(
      and(
        eq(stageDefinitions.pipelineId, pipelineId),
        eq(stageDefinitions.tenantId, tenantId),
      ),
    );

  const sortOrder = (maxOrderResult[0]?.maxOrder ?? -1) + 1;

  const rows = await db
    .insert(stageDefinitions)
    .values({
      id: randomUUID(),
      tenantId,
      pipelineId,
      name: params.name,
      apiName: params.apiName,
      sortOrder,
      stageType: params.stageType,
      colour: params.colour,
      defaultProbability: params.defaultProbability ?? null,
      expectedDays: params.expectedDays ?? null,
      description: params.description ?? null,
    })
    .returning();

  return rowToStage(rows[0]);
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

  const updateValues: Partial<typeof stageDefinitions.$inferInsert> = {};
  if (params.name !== undefined) updateValues.name = params.name;
  if (params.stageType !== undefined)
    updateValues.stageType = params.stageType;
  if (params.colour !== undefined) updateValues.colour = params.colour;
  if (params.defaultProbability !== undefined)
    updateValues.defaultProbability = params.defaultProbability;
  if (params.expectedDays !== undefined)
    updateValues.expectedDays = params.expectedDays;
  if (params.description !== undefined)
    updateValues.description = params.description;

  const rows = await db
    .update(stageDefinitions)
    .set(updateValues)
    .where(
      and(
        eq(stageDefinitions.id, stageId),
        eq(stageDefinitions.tenantId, tenantId),
      ),
    )
    .returning();

  return rowToStage(rows[0]);
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
    .select({ count: count() })
    .from(records)
    .where(
      and(eq(records.currentStageId, stageId), eq(records.tenantId, tenantId)),
    );

  if (recordCount[0]?.count > 0) {
    throwDeleteBlockedError(
      `Cannot delete stage with ${recordCount[0].count} records`,
    );
  }

  await db
    .delete(stageDefinitions)
    .where(
      and(
        eq(stageDefinitions.id, stageId),
        eq(stageDefinitions.tenantId, tenantId),
      ),
    );
}
