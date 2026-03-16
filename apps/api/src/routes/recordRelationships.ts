import { Router } from 'express';
import type { Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireTenant } from '../middleware/tenant.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import {
  linkRecords,
  unlinkRecords,
  getRelatedRecords,
} from '../services/recordRelationshipService.js';
import { logger } from '../lib/logger.js';

export const recordRelationshipsRouter = Router();

/**
 * POST /records/:id/relationships
 *
 * Links the record to another record through a defined relationship.
 *
 * Request body (JSON):
 *   { "relationship_id": string, "target_record_id": string }
 *
 * Responses:
 *   201  – link created
 *   400  – validation error (type mismatch, missing fields)
 *   401  – missing or invalid Bearer token
 *   403  – no active tenant context
 *   404  – record or relationship definition not found
 *   409  – duplicate link or parent already exists
 *   500  – unexpected server error
 */
export async function handleLinkRecords(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const { id } = req.params as { id: string };
  const { userId: ownerId } = req.user!;

  const body = req.body as {
    relationship_id?: string;
    relationshipId?: string;
    target_record_id?: string;
    targetRecordId?: string;
  };

  const relationshipId = body.relationship_id ?? body.relationshipId ?? '';
  const targetRecordId = body.target_record_id ?? body.targetRecordId ?? '';

  try {
    const link = await linkRecords(id, relationshipId, targetRecordId, ownerId);
    res.status(201).json(link);
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

    logger.error({ err, recordId: id, ownerId }, 'Unexpected error linking records');
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

/**
 * DELETE /records/:id/relationships/:relId
 *
 * Removes a link between two records.
 *
 * Responses:
 *   204  – link removed
 *   401  – missing or invalid Bearer token
 *   403  – no active tenant context
 *   404  – record or link not found
 *   500  – unexpected server error
 */
export async function handleUnlinkRecords(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const { id, relId } = req.params as { id: string; relId: string };
  const { userId: ownerId } = req.user!;

  try {
    await unlinkRecords(id, relId, ownerId);
    res.status(204).end();
  } catch (err: unknown) {
    const code = (err as Error & { code?: string }).code;

    if (code === 'NOT_FOUND') {
      res.status(404).json({ error: (err as Error).message, code: 'NOT_FOUND' });
      return;
    }

    logger.error({ err, recordId: id, relId, ownerId }, 'Unexpected error unlinking records');
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

/**
 * GET /records/:id/related/:objectApiName
 *
 * Returns records related to :id that belong to the specified object type.
 * Includes name and key field values for display.
 *
 * Query parameters:
 *   page?: number  — page number, defaults to 1
 *   limit?: number — results per page, defaults to 20 (max 100)
 *
 * Responses:
 *   200  – { data: RelatedRecordRow[], total, page, limit }
 *   401  – missing or invalid Bearer token
 *   403  – no active tenant context
 *   404  – record or object type not found
 *   500  – unexpected server error
 */
export async function handleGetRelatedRecords(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const { id, objectApiName } = req.params as { id: string; objectApiName: string };
  const { userId: ownerId } = req.user!;

  const query = req.query as { page?: string; limit?: string };
  const page = Math.max(1, parseInt(query.page ?? '1', 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? '20', 10) || 20));

  try {
    const result = await getRelatedRecords(id, objectApiName, ownerId, page, limit);
    res.status(200).json(result);
  } catch (err: unknown) {
    const code = (err as Error & { code?: string }).code;

    if (code === 'NOT_FOUND') {
      res.status(404).json({ error: (err as Error).message, code: 'NOT_FOUND' });
      return;
    }

    logger.error({ err, recordId: id, objectApiName, ownerId }, 'Unexpected error fetching related records');
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

recordRelationshipsRouter.post('/:id/relationships', requireAuth, requireTenant, handleLinkRecords);
recordRelationshipsRouter.delete('/:id/relationships/:relId', requireAuth, requireTenant, handleUnlinkRecords);
recordRelationshipsRouter.get('/:id/related/:objectApiName', requireAuth, requireTenant, handleGetRelatedRecords);
