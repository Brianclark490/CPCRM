import { Router } from 'express';
import type { Response } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../middleware/auth.js';
import { requireTenant } from '../middleware/tenant.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import {
  createRecord,
  listRecords,
  getRecord,
  updateRecord,
  deleteRecord,
} from '../services/recordService.js';
import { convertLead } from '../services/leadConversionService.js';
import { moveRecordStage } from '../services/stageMovementService.js';
import type { GateValidationError } from '../services/stageMovementService.js';
import { getStagesForObjectType } from '../services/pipelineService.js';
import { logger } from '../lib/logger.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const recordsRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // limit each IP to 300 requests per window
  standardHeaders: true,
  legacyHeaders: false,
});

export const recordsRouter = Router({ mergeParams: true });

/**
 * POST /objects/:apiName/records
 *
 * Creates a new record of the specified object type.
 * Field values are validated against the object's field definitions.
 *
 * Request body (JSON):
 *   { "fieldValues": { "field_api_name": value, ... } }
 *
 * Responses:
 *   201  – record created
 *   400  – validation error
 *   401  – missing or invalid Bearer token
 *   403  – no active tenant context
 *   404  – object type not found
 *   500  – unexpected server error
 */
export async function handleCreateRecord(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const { apiName } = req.params as { apiName: string };
  const { userId: ownerId, name: ownerName } = req.user!;

  const body = req.body as { fieldValues?: Record<string, unknown> };
  const fieldValues = body.fieldValues ?? {};

  try {
    const record = await createRecord(req.user!.tenantId!, apiName, fieldValues, ownerId, ownerName);
    res.status(201).json(record);
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

    logger.error({ err, apiName, ownerId }, 'Unexpected error creating record');
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

/**
 * GET /objects/:apiName/records
 *
 * Returns a paginated list of records for the specified object type.
 * Supports searching, sorting, and pagination.
 *
 * Query parameters:
 *   search?: string  — matches against name and text/email fields
 *   page?: number    — page number, defaults to 1
 *   limit?: number   — results per page, defaults to 20 (max 100)
 *   sort_by?: string — field api_name or "name"/"created_at"/"updated_at"
 *   sort_dir?: string — "asc" or "desc"
 *
 * Responses:
 *   200  – { data: Record[], total, page, limit, object: ObjectDefinition }
 *   401  – missing or invalid Bearer token
 *   403  – no active tenant context
 *   404  – object type not found
 *   500  – unexpected server error
 */
export async function handleListRecords(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const { apiName } = req.params as { apiName: string };
  const { userId: ownerId } = req.user!;

  const query = req.query as {
    search?: string;
    page?: string;
    limit?: string;
    sort_by?: string;
    sort_dir?: string;
  };

  const page = Math.max(1, parseInt(query.page ?? '1', 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? '20', 10) || 20));

  try {
    const result = await listRecords({
      tenantId: req.user!.tenantId!,
      apiName,
      ownerId,
      search: query.search,
      page,
      limit,
      sortBy: query.sort_by,
      sortDir: query.sort_dir,
    });

    res.status(200).json(result);
  } catch (err: unknown) {
    const code = (err as Error & { code?: string }).code;

    if (code === 'NOT_FOUND') {
      res.status(404).json({ error: (err as Error).message, code: 'NOT_FOUND' });
      return;
    }

    logger.error({ err, apiName, ownerId }, 'Unexpected error listing records');
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

/**
 * GET /objects/:apiName/records/:id
 *
 * Returns a single record with field labels and related records.
 *
 * Responses:
 *   200  – record with relationships
 *   401  – missing or invalid Bearer token
 *   403  – no active tenant context
 *   404  – object type or record not found
 *   500  – unexpected server error
 */
export async function handleGetRecord(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const { apiName, id } = req.params as { apiName: string; id: string };
  const { userId: ownerId } = req.user!;

  if (!UUID_RE.test(id)) {
    res.status(400).json({ error: 'Invalid record ID format', code: 'VALIDATION_ERROR' });
    return;
  }

  try {
    const record = await getRecord(req.user!.tenantId!, apiName, id, ownerId);
    res.status(200).json(record);
  } catch (err: unknown) {
    const code = (err as Error & { code?: string }).code;

    if (code === 'NOT_FOUND') {
      res.status(404).json({ error: (err as Error).message, code: 'NOT_FOUND' });
      return;
    }

    logger.error({ err, apiName, recordId: id, ownerId }, 'Unexpected error fetching record');
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

/**
 * PUT /objects/:apiName/records/:id
 *
 * Updates an existing record. Only validates changed fields (partial update).
 *
 * Request body (JSON):
 *   { "fieldValues": { "field_api_name": value, ... } }
 *
 * Responses:
 *   200  – updated record
 *   400  – validation error
 *   401  – missing or invalid Bearer token
 *   403  – no active tenant context
 *   404  – object type or record not found
 *   500  – unexpected server error
 */
export async function handleUpdateRecord(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const { apiName, id } = req.params as { apiName: string; id: string };
  const { userId: ownerId, name: userName } = req.user!;

  if (!UUID_RE.test(id)) {
    res.status(400).json({ error: 'Invalid record ID format', code: 'VALIDATION_ERROR' });
    return;
  }

  const body = req.body as { fieldValues?: Record<string, unknown> };
  const fieldValues = body.fieldValues ?? {};

  try {
    const record = await updateRecord(req.user!.tenantId!, apiName, id, fieldValues, ownerId, userName);
    res.status(200).json(record);
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

    logger.error({ err, apiName, recordId: id, ownerId }, 'Unexpected error updating record');
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

/**
 * DELETE /objects/:apiName/records/:id
 *
 * Deletes a record and its associated record_relationships.
 *
 * Responses:
 *   204  – record deleted
 *   401  – missing or invalid Bearer token
 *   403  – no active tenant context
 *   404  – object type or record not found
 *   500  – unexpected server error
 */
export async function handleDeleteRecord(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const { apiName, id } = req.params as { apiName: string; id: string };
  const { userId: ownerId } = req.user!;

  if (!UUID_RE.test(id)) {
    res.status(400).json({ error: 'Invalid record ID format', code: 'VALIDATION_ERROR' });
    return;
  }

  try {
    await deleteRecord(req.user!.tenantId!, apiName, id, ownerId);
    res.status(204).end();
  } catch (err: unknown) {
    const code = (err as Error & { code?: string }).code;

    if (code === 'NOT_FOUND') {
      res.status(404).json({ error: (err as Error).message, code: 'NOT_FOUND' });
      return;
    }

    logger.error({ err, apiName, recordId: id, ownerId }, 'Unexpected error deleting record');
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

/**
 * POST /objects/:apiName/records/:id/convert
 *
 * Converts a Lead record into an Account + Contact + Opportunity.
 * Only valid for the "lead" object type.
 *
 * Request body (JSON):
 *   {
 *     "create_account": true,
 *     "account_id": null,
 *     "create_opportunity": true
 *   }
 *
 * Responses:
 *   200  – conversion result with created/linked records
 *   400  – lead already converted or validation error
 *   401  – missing or invalid Bearer token
 *   403  – no active tenant context
 *   404  – lead not found
 *   500  – unexpected server error
 */
export async function handleConvertLead(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const { apiName, id } = req.params as { apiName: string; id: string };
  const { userId: ownerId } = req.user!;

  if (apiName !== 'lead') {
    res.status(400).json({ error: 'Conversion is only supported for lead records', code: 'VALIDATION_ERROR' });
    return;
  }

  if (!UUID_RE.test(id)) {
    res.status(400).json({ error: 'Invalid record ID format', code: 'VALIDATION_ERROR' });
    return;
  }

  const body = req.body as {
    create_account?: boolean;
    account_id?: string | null;
    create_opportunity?: boolean;
  };

  if (body.account_id && !UUID_RE.test(body.account_id)) {
    res.status(400).json({ error: 'Invalid account ID format', code: 'VALIDATION_ERROR' });
    return;
  }

  try {
    const result = await convertLead(req.user!.tenantId!, id, ownerId, {
      createAccount: body.create_account,
      accountId: body.account_id,
      createOpportunity: body.create_opportunity,
    });
    res.status(200).json(result);
  } catch (err: unknown) {
    const code = (err as Error & { code?: string }).code;

    if (code === 'ALREADY_CONVERTED') {
      res.status(400).json({ error: (err as Error).message, code: 'ALREADY_CONVERTED' });
      return;
    }

    if (code === 'VALIDATION_ERROR') {
      res.status(400).json({ error: (err as Error).message, code: 'VALIDATION_ERROR' });
      return;
    }

    if (code === 'NOT_FOUND') {
      res.status(404).json({ error: (err as Error).message, code: 'NOT_FOUND' });
      return;
    }

    logger.error({ err, recordId: id, ownerId }, 'Unexpected error converting lead');
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

/**
 * POST /objects/:apiName/records/:id/move-stage
 *
 * Moves a record to a new pipeline stage with gate validation.
 *
 * Request body (JSON):
 *   { "target_stage_id": "uuid" }
 *
 * Responses:
 *   200  – updated record after successful move
 *   400  – validation error (e.g. not in a pipeline, same stage)
 *   401  – missing or invalid Bearer token
 *   403  – no active tenant context
 *   404  – record or target stage not found
 *   422  – gate validation failed (with field-level detail)
 *   500  – unexpected server error
 */
export async function handleMoveStage(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const { apiName, id } = req.params as { apiName: string; id: string };
  const { userId: ownerId } = req.user!;

  if (!UUID_RE.test(id)) {
    res.status(400).json({ error: 'Invalid record ID format', code: 'VALIDATION_ERROR' });
    return;
  }

  const body = req.body as { target_stage_id?: string };

  if (!body.target_stage_id || !UUID_RE.test(body.target_stage_id)) {
    res.status(400).json({ error: 'target_stage_id must be a valid UUID', code: 'VALIDATION_ERROR' });
    return;
  }

  try {
    const result = await moveRecordStage(req.user!.tenantId!, apiName, id, body.target_stage_id, ownerId);
    res.status(200).json(result);
  } catch (err: unknown) {
    const code = (err as Error & { code?: string }).code;

    if (code === 'GATE_VALIDATION_FAILED') {
      const gateErr = err as GateValidationError;
      res.status(422).json({
        error: gateErr.message,
        code: 'GATE_VALIDATION_FAILED',
        failures: gateErr.failures,
      });
      return;
    }

    if (code === 'VALIDATION_ERROR') {
      res.status(400).json({ error: (err as Error).message, code: 'VALIDATION_ERROR' });
      return;
    }

    if (code === 'NOT_FOUND') {
      res.status(404).json({ error: (err as Error).message, code: 'NOT_FOUND' });
      return;
    }

    logger.error({ err, apiName, recordId: id, ownerId }, 'Unexpected error moving record stage');
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

/**
 * GET /objects/:apiName/records/pipeline-stages
 *
 * Returns the stages for the default pipeline of the specified object type.
 * Used by the record detail page to populate the pipeline-aware stage selector.
 *
 * Responses:
 *   200  – { pipelineId: string | null, stages: StageDefinition[] }
 *   401  – missing or invalid Bearer token
 *   403  – no active tenant context
 *   500  – unexpected server error
 */
export async function handleGetPipelineStages(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const { apiName } = req.params as { apiName: string };

  try {
    const result = await getStagesForObjectType(req.user!.tenantId!, apiName);
    if (!result) {
      res.status(200).json({ pipelineId: null, stages: [] });
      return;
    }
    res.status(200).json(result);
  } catch (err: unknown) {
    logger.error({ err, apiName }, 'Unexpected error fetching pipeline stages');
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

recordsRouter.get('/pipeline-stages', recordsRateLimiter, requireAuth, requireTenant, handleGetPipelineStages);
recordsRouter.post('/:id/move-stage', recordsRateLimiter, requireAuth, requireTenant, handleMoveStage);
recordsRouter.post('/:id/convert', recordsRateLimiter, requireAuth, requireTenant, handleConvertLead);
recordsRouter.post('/', recordsRateLimiter, requireAuth, requireTenant, handleCreateRecord);
recordsRouter.get('/', recordsRateLimiter, requireAuth, requireTenant, handleListRecords);
recordsRouter.get('/:id', recordsRateLimiter, requireAuth, requireTenant, handleGetRecord);
recordsRouter.put('/:id', recordsRateLimiter, requireAuth, requireTenant, handleUpdateRecord);
recordsRouter.delete('/:id', recordsRateLimiter, requireAuth, requireTenant, handleDeleteRecord);
