import { Router } from 'express';
import type { Response } from 'express';
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
import { logger } from '../lib/logger.js';

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
  const { userId: ownerId } = req.user!;

  const body = req.body as { fieldValues?: Record<string, unknown> };
  const fieldValues = body.fieldValues ?? {};

  try {
    const record = await createRecord(apiName, fieldValues, ownerId);
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

  try {
    const record = await getRecord(apiName, id, ownerId);
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
  const { userId: ownerId } = req.user!;

  const body = req.body as { fieldValues?: Record<string, unknown> };
  const fieldValues = body.fieldValues ?? {};

  try {
    const record = await updateRecord(apiName, id, fieldValues, ownerId);
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

  try {
    await deleteRecord(apiName, id, ownerId);
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

recordsRouter.post('/', requireAuth, requireTenant, handleCreateRecord);
recordsRouter.get('/', requireAuth, requireTenant, handleListRecords);
recordsRouter.get('/:id', requireAuth, requireTenant, handleGetRecord);
recordsRouter.put('/:id', requireAuth, requireTenant, handleUpdateRecord);
recordsRouter.delete('/:id', requireAuth, requireTenant, handleDeleteRecord);
