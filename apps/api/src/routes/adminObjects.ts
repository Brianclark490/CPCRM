import { Router } from 'express';
import type { Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import {
  createObjectDefinition,
  listObjectDefinitions,
  getObjectDefinitionById,
  updateObjectDefinition,
  deleteObjectDefinition,
} from '../services/objectDefinitionService.js';
import type { UpdateObjectDefinitionParams } from '../services/objectDefinitionService.js';
import { adminFieldsRouter } from './adminFields.js';
import { adminObjectRelationshipsRouter } from './adminRelationships.js';
import { adminLayoutsRouter } from './adminLayouts.js';
import { logger } from '../lib/logger.js';

export const adminObjectsRouter = Router();

/**
 * POST /admin/objects
 *
 * Creates a new object definition with default form and list layouts.
 *
 * Requires: valid Bearer token (requireAuth).
 *
 * Request body (JSON):
 *   {
 *     "apiName": string,     — snake_case, 3–50 chars, unique, not a reserved word
 *     "label": string,       — display name
 *     "pluralLabel": string,  — plural display name
 *     "description"?: string,
 *     "icon"?: string
 *   }
 *
 * Responses:
 *   201  – object definition created
 *   400  – validation error
 *   401  – missing or invalid Bearer token
 *   409  – api_name already exists
 *   500  – unexpected server error
 */
export async function handleCreateObject(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const body = req.body as {
    apiName?: string;
    api_name?: string;
    label?: string;
    pluralLabel?: string;
    plural_label?: string;
    description?: string;
    icon?: string;
  };

  const { userId } = req.user!;

  // Accept both camelCase and snake_case for api_name and plural_label
  const apiName = body.apiName ?? body.api_name ?? '';
  const pluralLabel = body.pluralLabel ?? body.plural_label ?? '';

  try {
    const objectDef = await createObjectDefinition({
      apiName,
      label: body.label ?? '',
      pluralLabel,
      description: body.description,
      icon: body.icon,
      ownerId: userId,
    });

    res.status(201).json(objectDef);
  } catch (err: unknown) {
    const code = (err as Error & { code?: string }).code;

    if (code === 'VALIDATION_ERROR') {
      res.status(400).json({ error: (err as Error).message, code: 'VALIDATION_ERROR' });
      return;
    }

    if (code === 'CONFLICT') {
      res.status(409).json({ error: (err as Error).message, code: 'CONFLICT' });
      return;
    }

    logger.error({ err, userId }, 'Unexpected error creating object definition');
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

/**
 * GET /admin/objects
 *
 * Returns all object definitions with field count and record count.
 * Includes both system and custom objects.
 *
 * Requires: valid Bearer token (requireAuth).
 *
 * Responses:
 *   200  – array of object definitions with counts
 *   401  – missing or invalid Bearer token
 *   500  – unexpected server error
 */
export async function handleListObjects(
  _req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  try {
    const objects = await listObjectDefinitions();
    res.status(200).json(objects);
  } catch (err: unknown) {
    logger.error({ err }, 'Unexpected error listing object definitions');
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

/**
 * GET /admin/objects/:id
 *
 * Returns a single object definition by ID with nested fields, relationships,
 * and layouts.
 *
 * Requires: valid Bearer token (requireAuth).
 *
 * Responses:
 *   200  – object definition with nested data
 *   401  – missing or invalid Bearer token
 *   404  – object not found
 *   500  – unexpected server error
 */
export async function handleGetObject(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const { id } = req.params as { id: string };

  try {
    const objectDef = await getObjectDefinitionById(id);

    if (!objectDef) {
      res.status(404).json({ error: 'Object definition not found', code: 'NOT_FOUND' });
      return;
    }

    res.status(200).json(objectDef);
  } catch (err: unknown) {
    logger.error({ err, objectId: id }, 'Unexpected error fetching object definition');
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

/**
 * PUT /admin/objects/:id
 *
 * Updates an existing object definition.
 * System objects cannot have their api_name changed.
 * Only label, pluralLabel, description, and icon can be updated.
 *
 * Requires: valid Bearer token (requireAuth).
 *
 * Request body (JSON) — all fields optional:
 *   {
 *     "label"?: string,
 *     "pluralLabel"?: string,
 *     "description"?: string | null,
 *     "icon"?: string | null
 *   }
 *
 * Responses:
 *   200  – updated object definition
 *   400  – validation error
 *   401  – missing or invalid Bearer token
 *   404  – object not found
 *   500  – unexpected server error
 */
export async function handleUpdateObject(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const { id } = req.params as { id: string };

  const body = req.body as {
    label?: string;
    pluralLabel?: string;
    plural_label?: string;
    description?: string | null;
    icon?: string | null;
  };

  const params: UpdateObjectDefinitionParams = {};
  if ('label' in body) params.label = body.label;
  if ('pluralLabel' in body) params.pluralLabel = body.pluralLabel;
  if ('plural_label' in body && !('pluralLabel' in body)) params.pluralLabel = body.plural_label;
  if ('description' in body) params.description = body.description;
  if ('icon' in body) params.icon = body.icon;

  try {
    const updated = await updateObjectDefinition(id, params);
    res.status(200).json(updated);
  } catch (err: unknown) {
    const code = (err as Error & { code?: string }).code;

    if (code === 'VALIDATION_ERROR') {
      res.status(400).json({ error: (err as Error).message, code: 'VALIDATION_ERROR' });
      return;
    }

    if (code === 'NOT_FOUND') {
      res.status(404).json({ error: 'Object definition not found', code: 'NOT_FOUND' });
      return;
    }

    logger.error({ err, objectId: id }, 'Unexpected error updating object definition');
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

/**
 * DELETE /admin/objects/:id
 *
 * Deletes an object definition. Only allowed for non-system objects with no
 * existing records.
 *
 * Requires: valid Bearer token (requireAuth).
 *
 * Responses:
 *   204  – object definition deleted
 *   400  – system object or records exist
 *   401  – missing or invalid Bearer token
 *   404  – object not found
 *   500  – unexpected server error
 */
export async function handleDeleteObject(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const { id } = req.params as { id: string };

  try {
    await deleteObjectDefinition(id);
    res.status(204).end();
  } catch (err: unknown) {
    const code = (err as Error & { code?: string }).code;

    if (code === 'NOT_FOUND') {
      res.status(404).json({ error: 'Object definition not found', code: 'NOT_FOUND' });
      return;
    }

    if (code === 'DELETE_BLOCKED') {
      res.status(400).json({ error: (err as Error).message, code: 'DELETE_BLOCKED' });
      return;
    }

    logger.error({ err, objectId: id }, 'Unexpected error deleting object definition');
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

adminObjectsRouter.post('/', requireAuth, handleCreateObject);
adminObjectsRouter.get('/', requireAuth, handleListObjects);
adminObjectsRouter.get('/:id', requireAuth, handleGetObject);
adminObjectsRouter.put('/:id', requireAuth, handleUpdateObject);
adminObjectsRouter.delete('/:id', requireAuth, handleDeleteObject);

// Nested field definition routes: /admin/objects/:objectId/fields
adminObjectsRouter.use('/:objectId/fields', adminFieldsRouter);

// Nested relationship definition routes: /admin/objects/:objectId/relationships
adminObjectsRouter.use('/:objectId/relationships', adminObjectRelationshipsRouter);

// Nested layout definition routes: /admin/objects/:objectId/layouts
adminObjectsRouter.use('/:objectId/layouts', adminLayoutsRouter);
