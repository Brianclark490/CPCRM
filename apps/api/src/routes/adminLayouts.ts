import { Router } from 'express';
import type { Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireTenant } from '../middleware/tenant.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import {
  createLayoutDefinition,
  listLayoutDefinitions,
  getLayoutDefinitionById,
  updateLayoutDefinition,
  setLayoutFields,
  deleteLayoutDefinition,
} from '../services/layoutDefinitionService.js';
import type { UpdateLayoutDefinitionParams, LayoutSectionInput } from '../services/layoutDefinitionService.js';
import { logger } from '../lib/logger.js';

export const adminLayoutsRouter = Router({ mergeParams: true });

/**
 * POST /admin/objects/:objectId/layouts
 *
 * Creates a new layout definition on the specified object.
 *
 * Request body (JSON):
 *   {
 *     "name": string,
 *     "layout_type": string,
 *     "is_default"?: boolean
 *   }
 *
 * Responses:
 *   201  – layout definition created
 *   400  – validation error
 *   401  – missing or invalid Bearer token
 *   404  – parent object not found
 *   409  – layout name already exists on this object
 *   500  – unexpected server error
 */
export async function handleCreateLayout(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const { objectId } = req.params as { objectId: string };

  const body = req.body as {
    name?: string;
    layout_type?: string;
    layoutType?: string;
    is_default?: boolean;
    isDefault?: boolean;
  };

  const layoutType = body.layout_type ?? body.layoutType ?? '';
  const isDefault = body.is_default ?? body.isDefault;

  try {
    const layout = await createLayoutDefinition(req.user!.tenantId!, objectId, {
      name: body.name ?? '',
      layoutType,
      isDefault,
    });

    res.status(201).json(layout);
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

    logger.error({ err, objectId }, 'Unexpected error creating layout definition');
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

/**
 * GET /admin/objects/:objectId/layouts
 *
 * Returns all layout definitions for the specified object, ordered by
 * layout_type and name.
 *
 * Responses:
 *   200  – array of layout definitions
 *   401  – missing or invalid Bearer token
 *   404  – parent object not found
 *   500  – unexpected server error
 */
export async function handleListLayouts(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const { objectId } = req.params as { objectId: string };

  try {
    const layouts = await listLayoutDefinitions(req.user!.tenantId!, objectId);
    res.status(200).json(layouts);
  } catch (err: unknown) {
    const code = (err as Error & { code?: string }).code;

    if (code === 'NOT_FOUND') {
      res.status(404).json({ error: (err as Error).message, code: 'NOT_FOUND' });
      return;
    }

    logger.error({ err, objectId }, 'Unexpected error listing layout definitions');
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

/**
 * GET /admin/objects/:objectId/layouts/:id
 *
 * Returns a single layout definition by ID with nested field metadata.
 *
 * Responses:
 *   200  – layout definition with fields
 *   401  – missing or invalid Bearer token
 *   404  – layout or parent object not found
 *   500  – unexpected server error
 */
export async function handleGetLayout(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const { objectId, id } = req.params as { objectId: string; id: string };

  try {
    const layout = await getLayoutDefinitionById(req.user!.tenantId!, objectId, id);
    res.status(200).json(layout);
  } catch (err: unknown) {
    const code = (err as Error & { code?: string }).code;

    if (code === 'NOT_FOUND') {
      res.status(404).json({ error: (err as Error).message, code: 'NOT_FOUND' });
      return;
    }

    logger.error({ err, objectId, layoutId: id }, 'Unexpected error fetching layout definition');
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

/**
 * PUT /admin/objects/:objectId/layouts/:id
 *
 * Updates a layout definition's metadata (name and/or layout_type).
 *
 * Request body (JSON) — all fields optional:
 *   {
 *     "name"?: string,
 *     "layout_type"?: string
 *   }
 *
 * Responses:
 *   200  – updated layout definition
 *   400  – validation error
 *   401  – missing or invalid Bearer token
 *   404  – layout or parent object not found
 *   409  – layout name already exists on this object
 *   500  – unexpected server error
 */
export async function handleUpdateLayout(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const { objectId, id } = req.params as { objectId: string; id: string };

  const body = req.body as {
    name?: string;
    layout_type?: string;
    layoutType?: string;
  };

  const params: UpdateLayoutDefinitionParams = {};
  if ('name' in body) params.name = body.name;
  if ('layout_type' in body) params.layoutType = body.layout_type;
  if ('layoutType' in body && !('layout_type' in body)) params.layoutType = body.layoutType;

  try {
    const updated = await updateLayoutDefinition(req.user!.tenantId!, objectId, id, params);
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

    if (code === 'CONFLICT') {
      res.status(409).json({ error: (err as Error).message, code: 'CONFLICT' });
      return;
    }

    logger.error({ err, objectId, layoutId: id }, 'Unexpected error updating layout definition');
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

/**
 * PUT /admin/objects/:objectId/layouts/:id/fields
 *
 * Sets the layout field arrangement (full replacement).
 * This is the main endpoint for the layout builder UI.
 *
 * Request body (JSON):
 *   {
 *     "sections": [
 *       {
 *         "label"?: string,
 *         "fields": [
 *           { "field_id": string, "width"?: string }
 *         ]
 *       }
 *     ]
 *   }
 *
 * Replaces all existing layout_fields for this layout.
 * Each section becomes a numbered group. Fields within a section have
 * sort_order based on array position.
 *
 * Responses:
 *   200  – layout definition with full field metadata
 *   400  – validation error
 *   401  – missing or invalid Bearer token
 *   404  – layout or parent object not found
 *   500  – unexpected server error
 */
export async function handleSetLayoutFields(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const { objectId, id } = req.params as { objectId: string; id: string };

  const body = req.body as {
    sections?: LayoutSectionInput[];
  };

  try {
    const result = await setLayoutFields(req.user!.tenantId!, objectId, id, body.sections ?? []);
    res.status(200).json(result);
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

    logger.error({ err, objectId, layoutId: id }, 'Unexpected error setting layout fields');
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

/**
 * DELETE /admin/objects/:objectId/layouts/:id
 *
 * Deletes a layout definition. Default layouts cannot be deleted.
 *
 * Responses:
 *   204  – layout definition deleted
 *   400  – default layout (delete blocked)
 *   401  – missing or invalid Bearer token
 *   404  – layout or parent object not found
 *   500  – unexpected server error
 */
export async function handleDeleteLayout(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const { objectId, id } = req.params as { objectId: string; id: string };

  try {
    await deleteLayoutDefinition(req.user!.tenantId!, objectId, id);
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

    logger.error({ err, objectId, layoutId: id }, 'Unexpected error deleting layout definition');
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

adminLayoutsRouter.post('/', requireAuth, requireTenant, handleCreateLayout);
adminLayoutsRouter.get('/', requireAuth, requireTenant, handleListLayouts);
adminLayoutsRouter.get('/:id', requireAuth, requireTenant, handleGetLayout);
adminLayoutsRouter.put('/:id', requireAuth, requireTenant, handleUpdateLayout);
adminLayoutsRouter.put('/:id/fields', requireAuth, requireTenant, handleSetLayoutFields);
adminLayoutsRouter.delete('/:id', requireAuth, requireTenant, handleDeleteLayout);
