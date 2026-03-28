import { randomUUID } from 'crypto';
import { logger } from '../lib/logger.js';
import { pool } from '../db/client.js';

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
  const objectResult = await pool.query(
    'SELECT id FROM object_definitions WHERE id = $1 AND tenant_id = $2',
    [objectId, tenantId],
  );
  if (objectResult.rows.length === 0) {
    throwNotFoundError('Object definition not found');
  }

  // Check uniqueness within tenant
  const existing = await pool.query(
    'SELECT id FROM pipeline_definitions WHERE api_name = $1 AND tenant_id = $2',
    [apiName.trim(), tenantId],
  );
  if (existing.rows.length > 0) {
    throwConflictError(`A pipeline with api_name "${apiName.trim()}" already exists`);
  }

  // Determine is_default: true if this is the first pipeline for the object in this tenant
  const existingPipelines = await pool.query(
    'SELECT id FROM pipeline_definitions WHERE object_id = $1 AND tenant_id = $2',
    [objectId, tenantId],
  );
  const isDefault = existingPipelines.rows.length === 0;

  const pipelineId = randomUUID();
  const now = new Date();

  const pipelineResult = await pool.query(
    `INSERT INTO pipeline_definitions
       (id, tenant_id, object_id, name, api_name, description, is_default, is_system, owner_id, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [
      pipelineId,
      tenantId,
      objectId,
      name.trim(),
      apiName.trim(),
      description?.trim() ?? null,
      isDefault,
      false,
      ownerId,
      now,
      now,
    ],
  );

  // Auto-create terminal stages: "Closed Won" (type: won) and "Closed Lost" (type: lost)
  const wonStageId = randomUUID();
  const lostStageId = randomUUID();

  await pool.query(
    `INSERT INTO stage_definitions
       (id, tenant_id, pipeline_id, name, api_name, sort_order, stage_type, colour, default_probability, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10), ($11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
    [
      wonStageId, tenantId, pipelineId, 'Closed Won', 'closed_won', 0, 'won', 'green', 100, now,
      lostStageId, tenantId, pipelineId, 'Closed Lost', 'closed_lost', 1, 'lost', 'red', 0, now,
    ],
  );

  logger.info({ pipelineId, apiName, objectId }, 'Pipeline created with terminal stages');

  const stagesResult = await pool.query(
    'SELECT * FROM stage_definitions WHERE pipeline_id = $1 AND tenant_id = $2 ORDER BY sort_order ASC',
    [pipelineId, tenantId],
  );

  return {
    ...rowToPipeline(pipelineResult.rows[0]),
    stages: stagesResult.rows.map((r: Record<string, unknown>) => rowToStage(r)),
  };
}

/**
 * Returns all pipeline definitions.
 */
export async function listPipelines(tenantId: string): Promise<PipelineDefinition[]> {
  const result = await pool.query(
    `SELECT * FROM pipeline_definitions
     WHERE tenant_id = $1
     ORDER BY is_system DESC, created_at ASC`,
    [tenantId],
  );

  return result.rows.map((row: Record<string, unknown>) => rowToPipeline(row));
}

/**
 * Returns a single pipeline by ID with stages and gates.
 * Returns null if not found.
 */
export async function getPipelineById(
  tenantId: string,
  id: string,
): Promise<PipelineDetail | null> {
  const pipelineResult = await pool.query(
    'SELECT * FROM pipeline_definitions WHERE id = $1 AND tenant_id = $2',
    [id, tenantId],
  );

  if (pipelineResult.rows.length === 0) return null;

  const pipeline = rowToPipeline(pipelineResult.rows[0]);

  const stagesResult = await pool.query(
    'SELECT * FROM stage_definitions WHERE pipeline_id = $1 AND tenant_id = $2 ORDER BY sort_order ASC',
    [id, tenantId],
  );

  const stages = stagesResult.rows.map((r: Record<string, unknown>) => rowToStage(r));

  // Fetch gates for all stages in one query
  const stageIds = stages.map((s) => s.id);

  const gatesByStageId: Record<string, StageGate[]> = {};

  if (stageIds.length > 0) {
    const gatesResult = await pool.query(
      `SELECT * FROM stage_gates WHERE stage_id = ANY($1) AND tenant_id = $2 ORDER BY stage_id`,
      [stageIds, tenantId],
    );

    for (const row of gatesResult.rows as Record<string, unknown>[]) {
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
  const existing = await pool.query(
    'SELECT * FROM pipeline_definitions WHERE id = $1 AND tenant_id = $2',
    [id, tenantId],
  );

  if (existing.rows.length === 0) {
    throwNotFoundError('Pipeline not found');
  }

  if (params.name !== undefined) {
    const nameError = validatePipelineName(params.name);
    if (nameError) throwValidationError(nameError);
  }

  // Build dynamic update
  const updates: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if ('name' in params) {
    updates.push(`name = $${paramIndex++}`);
    values.push(params.name!.trim());
  }
  if ('description' in params) {
    updates.push(`description = $${paramIndex++}`);
    values.push(params.description?.trim() ?? null);
  }
  if ('isDefault' in params) {
    updates.push(`is_default = $${paramIndex++}`);
    values.push(params.isDefault);
  }

  if (updates.length === 0) {
    return rowToPipeline(existing.rows[0]);
  }

  const now = new Date();
  updates.push(`updated_at = $${paramIndex++}`);
  values.push(now);

  values.push(id);
  values.push(tenantId);

  const result = await pool.query(
    `UPDATE pipeline_definitions SET ${updates.join(', ')} WHERE id = $${paramIndex++} AND tenant_id = $${paramIndex} RETURNING *`,
    values,
  );

  logger.info({ pipelineId: id }, 'Pipeline updated');

  return rowToPipeline(result.rows[0]);
}

/**
 * Deletes a pipeline definition.
 * System pipelines and pipelines with records cannot be deleted.
 *
 * @throws {Error} NOT_FOUND — pipeline does not exist
 * @throws {Error} DELETE_BLOCKED — system pipeline or records exist
 */
export async function deletePipeline(tenantId: string, id: string): Promise<void> {
  const existing = await pool.query(
    'SELECT * FROM pipeline_definitions WHERE id = $1 AND tenant_id = $2',
    [id, tenantId],
  );

  if (existing.rows.length === 0) {
    throwNotFoundError('Pipeline not found');
  }

  const row = existing.rows[0] as Record<string, unknown>;

  if (row.is_system === true) {
    throwDeleteBlockedError('Cannot delete system pipelines');
  }

  // Check if records are using this pipeline
  const recordCount = await pool.query(
    'SELECT COUNT(*) AS count FROM records WHERE pipeline_id = $1 AND tenant_id = $2',
    [id, tenantId],
  );
  const count = parseInt(recordCount.rows[0].count as string, 10);
  if (count > 0) {
    throwDeleteBlockedError('Cannot delete pipeline with existing records');
  }

  await pool.query('DELETE FROM pipeline_definitions WHERE id = $1 AND tenant_id = $2', [id, tenantId]);

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
  const pipelineResult = await pool.query(
    'SELECT * FROM pipeline_definitions WHERE id = $1 AND tenant_id = $2',
    [pipelineId, tenantId],
  );
  if (pipelineResult.rows.length === 0) {
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
  const existing = await pool.query(
    'SELECT id FROM stage_definitions WHERE pipeline_id = $1 AND api_name = $2 AND tenant_id = $3',
    [pipelineId, params.apiName.trim(), tenantId],
  );
  if (existing.rows.length > 0) {
    throwConflictError(`A stage with api_name "${params.apiName.trim()}" already exists on this pipeline`);
  }

  // Use a transaction so sort_order shifting and INSERT are atomic
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Determine sort_order: insert before terminal stages for open stages
    const allStages = await client.query(
      'SELECT * FROM stage_definitions WHERE pipeline_id = $1 AND tenant_id = $2 ORDER BY sort_order ASC',
      [pipelineId, tenantId],
    );

    const stageType = params.stageType.trim();
    let newSortOrder: number;

    if (stageType === 'open') {
      // Find the first terminal (won/lost) stage and insert before it
      const firstTerminalIndex = allStages.rows.findIndex(
        (r: Record<string, unknown>) => r.stage_type === 'won' || r.stage_type === 'lost',
      );

      if (firstTerminalIndex >= 0) {
        newSortOrder = allStages.rows[firstTerminalIndex].sort_order as number;
        // Shift terminal stages down
        await client.query(
          `UPDATE stage_definitions
           SET sort_order = sort_order + 1
           WHERE pipeline_id = $1 AND sort_order >= $2 AND tenant_id = $3`,
          [pipelineId, newSortOrder, tenantId],
        );
      } else {
        // No terminal stages — append at the end
        const maxSort = allStages.rows.length > 0
          ? (allStages.rows[allStages.rows.length - 1].sort_order as number) + 1
          : 0;
        newSortOrder = maxSort;
      }
    } else {
      // Terminal stages go at the end
      const maxSort = allStages.rows.length > 0
        ? (allStages.rows[allStages.rows.length - 1].sort_order as number) + 1
        : 0;
      newSortOrder = maxSort;
    }

    const stageId = randomUUID();
    const now = new Date();

    const result = await client.query(
      `INSERT INTO stage_definitions
         (id, tenant_id, pipeline_id, name, api_name, sort_order, stage_type, colour, default_probability, expected_days, description, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        stageId,
        tenantId,
        pipelineId,
        params.name.trim(),
        params.apiName.trim(),
        newSortOrder,
        stageType,
        params.colour.trim(),
        params.defaultProbability ?? null,
        params.expectedDays ?? null,
        params.description?.trim() ?? null,
        now,
      ],
    );

    await client.query('COMMIT');

    logger.info({ stageId, pipelineId, apiName: params.apiName }, 'Stage created');

    return rowToStage(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
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
  const pipelineResult = await pool.query(
    'SELECT id FROM pipeline_definitions WHERE id = $1 AND tenant_id = $2',
    [pipelineId, tenantId],
  );
  if (pipelineResult.rows.length === 0) {
    throwNotFoundError('Pipeline not found');
  }

  const existing = await pool.query(
    'SELECT * FROM stage_definitions WHERE id = $1 AND pipeline_id = $2 AND tenant_id = $3',
    [stageId, pipelineId, tenantId],
  );
  if (existing.rows.length === 0) {
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
  const updates: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if ('name' in params) {
    updates.push(`name = $${paramIndex++}`);
    values.push(params.name!.trim());
  }
  if ('stageType' in params) {
    updates.push(`stage_type = $${paramIndex++}`);
    values.push(params.stageType!.trim());
  }
  if ('colour' in params) {
    updates.push(`colour = $${paramIndex++}`);
    values.push(params.colour!.trim());
  }
  if ('defaultProbability' in params) {
    updates.push(`default_probability = $${paramIndex++}`);
    values.push(params.defaultProbability ?? null);
  }
  if ('expectedDays' in params) {
    updates.push(`expected_days = $${paramIndex++}`);
    values.push(params.expectedDays ?? null);
  }
  if ('description' in params) {
    updates.push(`description = $${paramIndex++}`);
    values.push(params.description?.trim() ?? null);
  }

  if (updates.length === 0) {
    return rowToStage(existing.rows[0]);
  }

  values.push(stageId);
  values.push(pipelineId);
  values.push(tenantId);

  const result = await pool.query(
    `UPDATE stage_definitions SET ${updates.join(', ')} WHERE id = $${paramIndex++} AND pipeline_id = $${paramIndex++} AND tenant_id = $${paramIndex} RETURNING *`,
    values,
  );

  logger.info({ stageId, pipelineId }, 'Stage updated');

  return rowToStage(result.rows[0]);
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
  const pipelineResult = await pool.query(
    'SELECT * FROM pipeline_definitions WHERE id = $1 AND tenant_id = $2',
    [pipelineId, tenantId],
  );
  if (pipelineResult.rows.length === 0) {
    throwNotFoundError('Pipeline not found');
  }

  const pipelineRow = pipelineResult.rows[0] as Record<string, unknown>;
  if (pipelineRow.is_system === true) {
    throwDeleteBlockedError('Cannot delete stages from system pipelines');
  }

  const existing = await pool.query(
    'SELECT * FROM stage_definitions WHERE id = $1 AND pipeline_id = $2 AND tenant_id = $3',
    [stageId, pipelineId, tenantId],
  );
  if (existing.rows.length === 0) {
    throwNotFoundError('Stage not found');
  }

  const stageRow = existing.rows[0] as Record<string, unknown>;
  const stageType = stageRow.stage_type as string;

  // Cannot delete if records are currently in this stage
  const recordCount = await pool.query(
    'SELECT COUNT(*) AS count FROM records WHERE current_stage_id = $1 AND tenant_id = $2',
    [stageId, tenantId],
  );
  const count = parseInt(recordCount.rows[0].count as string, 10);
  if (count > 0) {
    throwDeleteBlockedError('Cannot delete stage with existing records');
  }

  // Cannot delete the last won or lost stage
  if (stageType === 'won' || stageType === 'lost') {
    const sameTypeCount = await pool.query(
      'SELECT COUNT(*) AS count FROM stage_definitions WHERE pipeline_id = $1 AND stage_type = $2 AND tenant_id = $3',
      [pipelineId, stageType, tenantId],
    );
    const typeCount = parseInt(sameTypeCount.rows[0].count as string, 10);
    if (typeCount <= 1) {
      throwDeleteBlockedError(`Cannot delete the last ${stageType} stage`);
    }
  }

  await pool.query(
    'DELETE FROM stage_definitions WHERE id = $1 AND pipeline_id = $2 AND tenant_id = $3',
    [stageId, pipelineId, tenantId],
  );

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
  const pipelineResult = await pool.query(
    'SELECT id FROM pipeline_definitions WHERE id = $1 AND tenant_id = $2',
    [pipelineId, tenantId],
  );
  if (pipelineResult.rows.length === 0) {
    throwNotFoundError('Pipeline not found');
  }

  if (!Array.isArray(stageIds) || stageIds.length === 0) {
    throwValidationError('stage_ids must be a non-empty array');
  }

  // Verify all stage IDs belong to this pipeline
  const existingStages = await pool.query(
    'SELECT id, stage_type FROM stage_definitions WHERE pipeline_id = $1 AND tenant_id = $2',
    [pipelineId, tenantId],
  );
  const existingIds = new Set(existingStages.rows.map((r: Record<string, unknown>) => r.id as string));
  const stageTypeMap = new Map(
    existingStages.rows.map((r: Record<string, unknown>) => [r.id as string, r.stage_type as string]),
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
    await pool.query(
      'UPDATE stage_definitions SET sort_order = $1 WHERE id = $2 AND pipeline_id = $3 AND tenant_id = $4',
      [i, stageIds[i], pipelineId, tenantId],
    );
  }

  logger.info({ pipelineId, stageCount: stageIds.length }, 'Stages reordered');

  // Return the updated list
  const result = await pool.query(
    'SELECT * FROM stage_definitions WHERE pipeline_id = $1 AND tenant_id = $2 ORDER BY sort_order ASC',
    [pipelineId, tenantId],
  );

  return result.rows.map((row: Record<string, unknown>) => rowToStage(row));
}
