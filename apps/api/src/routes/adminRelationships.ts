import { Router } from 'express';
import type { Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireTenant } from '../middleware/tenant.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import {
  createRelationshipDefinition,
  listRelationshipDefinitions,
  deleteRelationshipDefinition,
} from '../services/relationshipDefinitionService.js';
import { logger } from '../lib/logger.js';
import { parsePaginationQuery, paginateInMemory } from '../lib/pagination.js';
import { isAppError } from '../lib/appError.js';

export const adminRelationshipsRouter = Router();
export const adminObjectRelationshipsRouter = Router({ mergeParams: true });

/**
 * POST /admin/relationships
 *
 * Creates a new relationship definition between two objects.
 *
 * Request body (JSON):
 *   {
 *     "source_object_id": string,
 *     "target_object_id": string,
 *     "relationship_type": "lookup" | "parent_child",
 *     "api_name": string,
 *     "label": string,
 *     "reverse_label"?: string,
 *     "required"?: boolean
 *   }
 *
 * Responses:
 *   201  – relationship definition created
 *   400  – validation error
 *   401  – missing or invalid Bearer token
 *   404  – source or target object not found
 *   409  – api_name already exists on the source object
 *   500  – unexpected server error
 */
export async function handleCreateRelationship(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const body = req.body as {
    source_object_id?: string;
    sourceObjectId?: string;
    target_object_id?: string;
    targetObjectId?: string;
    relationship_type?: string;
    relationshipType?: string;
    api_name?: string;
    apiName?: string;
    label?: string;
    reverse_label?: string;
    reverseLabel?: string;
    required?: boolean;
  };

  const sourceObjectId = body.source_object_id ?? body.sourceObjectId ?? '';
  const targetObjectId = body.target_object_id ?? body.targetObjectId ?? '';
  const relationshipType = body.relationship_type ?? body.relationshipType ?? '';
  const apiName = body.api_name ?? body.apiName ?? '';
  const reverseLabel = body.reverse_label ?? body.reverseLabel;

  try {
    const relationship = await createRelationshipDefinition(req.user!.tenantId!, {
      sourceObjectId,
      targetObjectId,
      relationshipType,
      apiName,
      label: body.label ?? '',
      reverseLabel,
      required: body.required,
    });

    res.status(201).json(relationship);
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

    logger.error({ err }, 'Unexpected error creating relationship definition');
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

/**
 * GET /admin/objects/:objectId/relationships
 *
 * Returns all relationship definitions where the specified object is either
 * the source or target. Includes related object metadata (label, plural_label)
 * for UI display.
 *
 * Responses:
 *   200  – array of relationship definitions with object metadata
 *   401  – missing or invalid Bearer token
 *   404  – object not found
 *   500  – unexpected server error
 */
export async function handleListRelationships(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const { objectId } = req.params as { objectId: string };

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
    const relationships = await listRelationshipDefinitions(req.user!.tenantId!, objectId);
    res.status(200).json(paginateInMemory(relationships, pagination));
  } catch (err: unknown) {
    const code = (err as Error & { code?: string }).code;

    if (code === 'NOT_FOUND') {
      res.status(404).json({ error: (err as Error).message, code: 'NOT_FOUND' });
      return;
    }

    logger.error({ err, objectId }, 'Unexpected error listing relationship definitions');
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

/**
 * DELETE /admin/relationships/:id
 *
 * Deletes a relationship definition. System relationships (between two system
 * objects, e.g. opportunity→account) cannot be deleted.
 * Cascades to record_relationships.
 *
 * Responses:
 *   204  – relationship definition deleted
 *   400  – system relationship (delete blocked)
 *   401  – missing or invalid Bearer token
 *   404  – relationship not found
 *   500  – unexpected server error
 */
export async function handleDeleteRelationship(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const { id } = req.params as { id: string };

  try {
    await deleteRelationshipDefinition(req.user!.tenantId!, id);
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

    logger.error({ err, relationshipId: id }, 'Unexpected error deleting relationship definition');
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

adminRelationshipsRouter.post('/', requireAuth, requireTenant, handleCreateRelationship);
adminRelationshipsRouter.delete('/:id', requireAuth, requireTenant, handleDeleteRelationship);

adminObjectRelationshipsRouter.get('/', requireAuth, requireTenant, handleListRelationships);
