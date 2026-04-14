import { Router } from 'express';
import type { Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireTenant } from '../middleware/tenant.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import {
  listStageGates,
  createStageGate,
  updateStageGate,
  deleteStageGate,
} from '../services/stageGateService.js';
import type { UpdateStageGateParams } from '../services/stageGateService.js';
import { logger } from '../lib/logger.js';
import { parsePaginationQuery, paginateInMemory } from '../lib/pagination.js';
import { isAppError } from '../lib/appError.js';

export const adminStageGatesRouter = Router({ mergeParams: true });

/**
 * GET /admin/stages/:stageId/gates
 *
 * Lists all gates for a stage, including field metadata.
 *
 * Responses:
 *   200  – array of stage gates with field metadata
 *   401  – missing or invalid Bearer token
 *   404  – stage not found
 *   500  – unexpected server error
 */
export async function handleListGates(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const { stageId } = req.params as { stageId: string };

  let pagination;
  try {
    pagination = parsePaginationQuery(req.query);
  } catch (err) {
    if (isAppError(err)) {
      res
        .status(err.statusCode)
        .json({ error: err.message, code: err.code, ...(err.details ?? {}) });
      return;
    }
    throw err;
  }

  try {
    const gates = await listStageGates(req.user!.tenantId!, stageId);
    res.status(200).json(paginateInMemory(gates, pagination));
  } catch (err: unknown) {
    const code = (err as Error & { code?: string }).code;

    if (code === 'NOT_FOUND') {
      res.status(404).json({ error: (err as Error).message, code: 'NOT_FOUND' });
      return;
    }

    logger.error({ err, stageId }, 'Unexpected error listing stage gates');
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

/**
 * POST /admin/stages/:stageId/gates
 *
 * Adds a gate to a stage.
 *
 * Request body (JSON):
 *   {
 *     "field_id": string,
 *     "gate_type": string,
 *     "gate_value"?: string | null,
 *     "error_message"?: string | null
 *   }
 *
 * Responses:
 *   201  – gate created with field metadata
 *   400  – validation error
 *   401  – missing or invalid Bearer token
 *   404  – stage or field not found
 *   409  – duplicate gate for same field on same stage
 *   500  – unexpected server error
 */
export async function handleCreateGate(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const { stageId } = req.params as { stageId: string };

  const body = req.body as {
    field_id?: string;
    fieldId?: string;
    gate_type?: string;
    gateType?: string;
    gate_value?: string | null;
    gateValue?: string | null;
    error_message?: string | null;
    errorMessage?: string | null;
  };

  const fieldId = body.field_id ?? body.fieldId ?? '';
  const gateType = body.gate_type ?? body.gateType ?? '';
  const gateValue = body.gate_value ?? body.gateValue;
  const errorMessage = body.error_message ?? body.errorMessage;

  try {
    const gate = await createStageGate(req.user!.tenantId!, stageId, {
      fieldId,
      gateType,
      gateValue: gateValue ?? null,
      errorMessage: errorMessage ?? null,
    });

    res.status(201).json(gate);
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

    logger.error({ err, stageId }, 'Unexpected error creating stage gate');
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

/**
 * PUT /admin/stages/:stageId/gates/:id
 *
 * Updates a gate.
 *
 * Request body (JSON) — all fields optional:
 *   {
 *     "gate_type"?: string,
 *     "gate_value"?: string | null,
 *     "error_message"?: string | null
 *   }
 *
 * Responses:
 *   200  – updated gate with field metadata
 *   400  – validation error
 *   401  – missing or invalid Bearer token
 *   404  – stage or gate not found
 *   500  – unexpected server error
 */
export async function handleUpdateGate(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const { stageId, id } = req.params as { stageId: string; id: string };

  const body = req.body as {
    gate_type?: string;
    gateType?: string;
    gate_value?: string | null;
    gateValue?: string | null;
    error_message?: string | null;
    errorMessage?: string | null;
  };

  const params: UpdateStageGateParams = {};
  if ('gate_type' in body) params.gateType = body.gate_type;
  if ('gateType' in body && !('gate_type' in body)) params.gateType = body.gateType;
  if ('gate_value' in body) params.gateValue = body.gate_value;
  if ('gateValue' in body && !('gate_value' in body)) params.gateValue = body.gateValue;
  if ('error_message' in body) params.errorMessage = body.error_message;
  if ('errorMessage' in body && !('error_message' in body)) params.errorMessage = body.errorMessage;

  try {
    const gate = await updateStageGate(req.user!.tenantId!, stageId, id, params);

    res.status(200).json(gate);
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

    logger.error({ err, stageId, gateId: id }, 'Unexpected error updating stage gate');
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

/**
 * DELETE /admin/stages/:stageId/gates/:id
 *
 * Removes a gate.
 *
 * Responses:
 *   204  – gate deleted
 *   401  – missing or invalid Bearer token
 *   404  – stage or gate not found
 *   500  – unexpected server error
 */
export async function handleDeleteGate(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const { stageId, id } = req.params as { stageId: string; id: string };

  try {
    await deleteStageGate(req.user!.tenantId!, stageId, id);
    res.status(204).end();
  } catch (err: unknown) {
    const code = (err as Error & { code?: string }).code;

    if (code === 'NOT_FOUND') {
      res.status(404).json({ error: (err as Error).message, code: 'NOT_FOUND' });
      return;
    }

    logger.error({ err, stageId, gateId: id }, 'Unexpected error deleting stage gate');
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

adminStageGatesRouter.get('/', requireAuth, requireTenant, handleListGates);
adminStageGatesRouter.post('/', requireAuth, requireTenant, handleCreateGate);
adminStageGatesRouter.put('/:id', requireAuth, requireTenant, handleUpdateGate);
adminStageGatesRouter.delete('/:id', requireAuth, requireTenant, handleDeleteGate);
