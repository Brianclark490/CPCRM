import { Router } from 'express';
import type { Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import {
  createPipeline,
  listPipelines,
  getPipelineById,
  updatePipeline,
  deletePipeline,
  createStage,
  updateStage,
  deleteStage,
  reorderStages,
} from '../services/pipelineService.js';
import type { UpdatePipelineParams } from '../services/pipelineService.js';
import { logger } from '../lib/logger.js';

export const adminPipelinesRouter = Router();

// ─── Pipeline handlers ───────────────────────────────────────────────────────

/**
 * POST /admin/pipelines
 *
 * Creates a new pipeline with auto-created terminal stages.
 *
 * Request body (JSON):
 *   {
 *     "name": string,
 *     "api_name": string,
 *     "object_id": string,
 *     "description"?: string
 *   }
 *
 * Responses:
 *   201  – pipeline created with terminal stages
 *   400  – validation error
 *   401  – missing or invalid Bearer token
 *   404  – object_id not found
 *   409  – api_name already exists
 *   500  – unexpected server error
 */
export async function handleCreatePipeline(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const body = req.body as {
    name?: string;
    apiName?: string;
    api_name?: string;
    objectId?: string;
    object_id?: string;
    description?: string;
  };

  const { userId } = req.user!;

  const apiName = body.apiName ?? body.api_name ?? '';
  const objectId = body.objectId ?? body.object_id ?? '';

  try {
    const pipeline = await createPipeline({
      name: body.name ?? '',
      apiName,
      objectId,
      description: body.description,
      ownerId: userId,
    });

    res.status(201).json(pipeline);
  } catch (err: unknown) {
    const code = (err as Error & { code?: string }).code;

    if (code === 'VALIDATION_ERROR') {
      res.status(400).json({ error: (err as Error).message, code: 'VALIDATION_ERROR' });
      return;
    }

    if (code === 'NOT_FOUND') {
      res.status(404).json({ error: (err as Error).message, code: 'NOT_FOUND' });
      return;
    }

    if (code === 'CONFLICT') {
      res.status(409).json({ error: (err as Error).message, code: 'CONFLICT' });
      return;
    }

    logger.error({ err, userId }, 'Unexpected error creating pipeline');
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

/**
 * GET /admin/pipelines
 *
 * Returns all pipeline definitions.
 *
 * Responses:
 *   200  – array of pipeline definitions
 *   401  – missing or invalid Bearer token
 *   500  – unexpected server error
 */
export async function handleListPipelines(
  _req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  try {
    const pipelines = await listPipelines();
    res.status(200).json(pipelines);
  } catch (err: unknown) {
    logger.error({ err }, 'Unexpected error listing pipelines');
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

/**
 * GET /admin/pipelines/:id
 *
 * Returns a single pipeline with stages and gates.
 *
 * Responses:
 *   200  – pipeline with nested stages and gates
 *   401  – missing or invalid Bearer token
 *   404  – pipeline not found
 *   500  – unexpected server error
 */
export async function handleGetPipeline(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const { id } = req.params as { id: string };

  try {
    const pipeline = await getPipelineById(id);

    if (!pipeline) {
      res.status(404).json({ error: 'Pipeline not found', code: 'NOT_FOUND' });
      return;
    }

    res.status(200).json(pipeline);
  } catch (err: unknown) {
    logger.error({ err, pipelineId: id }, 'Unexpected error fetching pipeline');
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

/**
 * PUT /admin/pipelines/:id
 *
 * Updates a pipeline definition.
 *
 * Request body (JSON) — all fields optional:
 *   {
 *     "name"?: string,
 *     "description"?: string | null,
 *     "is_default"?: boolean
 *   }
 *
 * Responses:
 *   200  – updated pipeline
 *   400  – validation error
 *   401  – missing or invalid Bearer token
 *   404  – pipeline not found
 *   500  – unexpected server error
 */
export async function handleUpdatePipeline(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const { id } = req.params as { id: string };

  const body = req.body as {
    name?: string;
    description?: string | null;
    isDefault?: boolean;
    is_default?: boolean;
  };

  const params: UpdatePipelineParams = {};
  if ('name' in body) params.name = body.name;
  if ('description' in body) params.description = body.description;
  if ('isDefault' in body) params.isDefault = body.isDefault;
  if ('is_default' in body && !('isDefault' in body)) params.isDefault = body.is_default;

  try {
    const updated = await updatePipeline(id, params);
    res.status(200).json(updated);
  } catch (err: unknown) {
    const code = (err as Error & { code?: string }).code;

    if (code === 'VALIDATION_ERROR') {
      res.status(400).json({ error: (err as Error).message, code: 'VALIDATION_ERROR' });
      return;
    }

    if (code === 'NOT_FOUND') {
      res.status(404).json({ error: (err as Error).message, code: 'NOT_FOUND' });
      return;
    }

    logger.error({ err, pipelineId: id }, 'Unexpected error updating pipeline');
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

/**
 * DELETE /admin/pipelines/:id
 *
 * Deletes a pipeline. Custom only, no records using it.
 *
 * Responses:
 *   204  – pipeline deleted
 *   400  – system pipeline or records exist
 *   401  – missing or invalid Bearer token
 *   404  – pipeline not found
 *   500  – unexpected server error
 */
export async function handleDeletePipeline(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const { id } = req.params as { id: string };

  try {
    await deletePipeline(id);
    res.status(204).end();
  } catch (err: unknown) {
    const code = (err as Error & { code?: string }).code;

    if (code === 'NOT_FOUND') {
      res.status(404).json({ error: (err as Error).message, code: 'NOT_FOUND' });
      return;
    }

    if (code === 'DELETE_BLOCKED') {
      res.status(400).json({ error: (err as Error).message, code: 'DELETE_BLOCKED' });
      return;
    }

    logger.error({ err, pipelineId: id }, 'Unexpected error deleting pipeline');
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

// ─── Stage handlers ──────────────────────────────────────────────────────────

/**
 * POST /admin/pipelines/:pipelineId/stages
 *
 * Adds a stage to a pipeline.
 *
 * Request body (JSON):
 *   {
 *     "name": string,
 *     "api_name": string,
 *     "stage_type": "open" | "won" | "lost",
 *     "colour": string,
 *     "default_probability"?: number,
 *     "expected_days"?: number,
 *     "description"?: string
 *   }
 *
 * Responses:
 *   201  – stage created
 *   400  – validation error
 *   401  – missing or invalid Bearer token
 *   404  – pipeline not found
 *   409  – api_name already exists on this pipeline
 *   500  – unexpected server error
 */
export async function handleCreateStage(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const { pipelineId } = req.params as { pipelineId: string };

  const body = req.body as {
    name?: string;
    apiName?: string;
    api_name?: string;
    stageType?: string;
    stage_type?: string;
    colour?: string;
    defaultProbability?: number;
    default_probability?: number;
    expectedDays?: number;
    expected_days?: number;
    description?: string;
  };

  const apiName = body.apiName ?? body.api_name ?? '';
  const stageType = body.stageType ?? body.stage_type ?? '';
  const defaultProbability = body.defaultProbability ?? body.default_probability;
  const expectedDays = body.expectedDays ?? body.expected_days;

  try {
    const stage = await createStage(pipelineId, {
      name: body.name ?? '',
      apiName,
      stageType,
      colour: body.colour ?? '',
      defaultProbability,
      expectedDays,
      description: body.description,
    });

    res.status(201).json(stage);
  } catch (err: unknown) {
    const code = (err as Error & { code?: string }).code;

    if (code === 'VALIDATION_ERROR') {
      res.status(400).json({ error: (err as Error).message, code: 'VALIDATION_ERROR' });
      return;
    }

    if (code === 'NOT_FOUND') {
      res.status(404).json({ error: (err as Error).message, code: 'NOT_FOUND' });
      return;
    }

    if (code === 'CONFLICT') {
      res.status(409).json({ error: (err as Error).message, code: 'CONFLICT' });
      return;
    }

    logger.error({ err, pipelineId }, 'Unexpected error creating stage');
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

/**
 * PUT /admin/pipelines/:pipelineId/stages/:id
 *
 * Updates a stage definition.
 *
 * Request body (JSON) — all fields optional:
 *   {
 *     "name"?: string,
 *     "stage_type"?: string,
 *     "colour"?: string,
 *     "default_probability"?: number | null,
 *     "expected_days"?: number | null,
 *     "description"?: string | null
 *   }
 *
 * Responses:
 *   200  – updated stage
 *   400  – validation error
 *   401  – missing or invalid Bearer token
 *   404  – stage or pipeline not found
 *   500  – unexpected server error
 */
export async function handleUpdateStage(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const { pipelineId, id } = req.params as { pipelineId: string; id: string };

  const body = req.body as {
    name?: string;
    stageType?: string;
    stage_type?: string;
    colour?: string;
    defaultProbability?: number | null;
    default_probability?: number | null;
    expectedDays?: number | null;
    expected_days?: number | null;
    description?: string | null;
  };

  const params: Record<string, unknown> = {};
  if ('name' in body) params.name = body.name;
  if ('stageType' in body) params.stageType = body.stageType;
  if ('stage_type' in body && !('stageType' in body)) params.stageType = body.stage_type;
  if ('colour' in body) params.colour = body.colour;
  if ('defaultProbability' in body) params.defaultProbability = body.defaultProbability;
  if ('default_probability' in body && !('defaultProbability' in body)) params.defaultProbability = body.default_probability;
  if ('expectedDays' in body) params.expectedDays = body.expectedDays;
  if ('expected_days' in body && !('expectedDays' in body)) params.expectedDays = body.expected_days;
  if ('description' in body) params.description = body.description;

  try {
    const updated = await updateStage(pipelineId, id, params as {
      name?: string;
      stageType?: string;
      colour?: string;
      defaultProbability?: number | null;
      expectedDays?: number | null;
      description?: string | null;
    });
    res.status(200).json(updated);
  } catch (err: unknown) {
    const code = (err as Error & { code?: string }).code;

    if (code === 'VALIDATION_ERROR') {
      res.status(400).json({ error: (err as Error).message, code: 'VALIDATION_ERROR' });
      return;
    }

    if (code === 'NOT_FOUND') {
      res.status(404).json({ error: (err as Error).message, code: 'NOT_FOUND' });
      return;
    }

    logger.error({ err, pipelineId, stageId: id }, 'Unexpected error updating stage');
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

/**
 * DELETE /admin/pipelines/:pipelineId/stages/:id
 *
 * Deletes a stage. Cannot delete if records are in it, if it's the last
 * won/lost stage, or if the pipeline is a system pipeline.
 *
 * Responses:
 *   204  – stage deleted
 *   400  – deletion blocked
 *   401  – missing or invalid Bearer token
 *   404  – stage or pipeline not found
 *   500  – unexpected server error
 */
export async function handleDeleteStage(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const { pipelineId, id } = req.params as { pipelineId: string; id: string };

  try {
    await deleteStage(pipelineId, id);
    res.status(204).end();
  } catch (err: unknown) {
    const code = (err as Error & { code?: string }).code;

    if (code === 'NOT_FOUND') {
      res.status(404).json({ error: (err as Error).message, code: 'NOT_FOUND' });
      return;
    }

    if (code === 'DELETE_BLOCKED') {
      res.status(400).json({ error: (err as Error).message, code: 'DELETE_BLOCKED' });
      return;
    }

    logger.error({ err, pipelineId, stageId: id }, 'Unexpected error deleting stage');
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

/**
 * PATCH /admin/pipelines/:pipelineId/stages/reorder
 *
 * Reorders stages within a pipeline. Won/lost stages must remain at the end.
 *
 * Request body (JSON):
 *   { "stage_ids": string[] }
 *
 * Responses:
 *   200  – reordered stages
 *   400  – validation error
 *   401  – missing or invalid Bearer token
 *   404  – pipeline not found
 *   500  – unexpected server error
 */
export async function handleReorderStages(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const { pipelineId } = req.params as { pipelineId: string };

  const body = req.body as {
    stage_ids?: string[];
    stageIds?: string[];
  };

  const stageIds = body.stage_ids ?? body.stageIds ?? [];

  try {
    const stages = await reorderStages(pipelineId, stageIds);
    res.status(200).json(stages);
  } catch (err: unknown) {
    const code = (err as Error & { code?: string }).code;

    if (code === 'VALIDATION_ERROR') {
      res.status(400).json({ error: (err as Error).message, code: 'VALIDATION_ERROR' });
      return;
    }

    if (code === 'NOT_FOUND') {
      res.status(404).json({ error: (err as Error).message, code: 'NOT_FOUND' });
      return;
    }

    logger.error({ err, pipelineId }, 'Unexpected error reordering stages');
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

// ─── Route registration ──────────────────────────────────────────────────────

adminPipelinesRouter.post('/', requireAuth, handleCreatePipeline);
adminPipelinesRouter.get('/', requireAuth, handleListPipelines);
adminPipelinesRouter.get('/:id', requireAuth, handleGetPipeline);
adminPipelinesRouter.put('/:id', requireAuth, handleUpdatePipeline);
adminPipelinesRouter.delete('/:id', requireAuth, handleDeletePipeline);

// Stage routes nested under pipelines
adminPipelinesRouter.post('/:pipelineId/stages', requireAuth, handleCreateStage);
adminPipelinesRouter.put('/:pipelineId/stages/:id', requireAuth, handleUpdateStage);
adminPipelinesRouter.delete('/:pipelineId/stages/:id', requireAuth, handleDeleteStage);
adminPipelinesRouter.patch('/:pipelineId/stages/reorder', requireAuth, handleReorderStages);
