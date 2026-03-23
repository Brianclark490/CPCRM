import { Router } from 'express';
import type { Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireTenant } from '../middleware/tenant.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import {
  createPageLayout,
  listPageLayouts,
  getPageLayoutById,
  updatePageLayout,
  publishPageLayout,
  listPageLayoutVersions,
  deletePageLayout,
  copyLayout,
  revertLayout,
} from '../services/pageLayoutService.js';
import type { CreatePageLayoutParams, UpdatePageLayoutParams } from '../services/pageLayoutService.js';
import { COMPONENT_REGISTRY } from '../lib/componentRegistry.js';
import { logger } from '../lib/logger.js';
import rateLimit from 'express-rate-limit';

const adminPageLayoutsRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
});

export const adminPageLayoutsRouter = Router({ mergeParams: true });

/**
 * POST /admin/objects/:objectId/page-layouts
 *
 * Creates a new page layout on the specified object.
 *
 * Request body (JSON):
 *   {
 *     "name": string,
 *     "role"?: string | null,
 *     "is_default"?: boolean,
 *     "layout": PageLayoutJson
 *   }
 *
 * Responses:
 *   201  – page layout created
 *   400  – validation error
 *   401  – missing or invalid Bearer token
 *   404  – parent object not found
 *   409  – layout already exists for this object/role
 *   500  – unexpected server error
 */
export async function handleCreatePageLayout(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const { objectId } = req.params as { objectId: string };

  const body = req.body as {
    name?: string;
    role?: string | null;
    is_default?: boolean;
    isDefault?: boolean;
    layout?: unknown;
  };

  const params: CreatePageLayoutParams = {
    name: body.name ?? '',
    role: body.role,
    isDefault: body.is_default ?? body.isDefault,
    layout: body.layout as CreatePageLayoutParams['layout'],
  };

  try {
    const layout = await createPageLayout(req.user!.tenantId!, objectId, params);
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

    logger.error({ err, objectId }, 'Unexpected error creating page layout');
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

/**
 * GET /admin/objects/:objectId/page-layouts
 *
 * Returns all page layouts for the specified object, ordered by name.
 *
 * Responses:
 *   200  – array of page layouts
 *   401  – missing or invalid Bearer token
 *   404  – parent object not found
 *   500  – unexpected server error
 */
export async function handleListPageLayouts(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const { objectId } = req.params as { objectId: string };

  try {
    const layouts = await listPageLayouts(req.user!.tenantId!, objectId);
    res.status(200).json(layouts);
  } catch (err: unknown) {
    const code = (err as Error & { code?: string }).code;

    if (code === 'NOT_FOUND') {
      res.status(404).json({ error: (err as Error).message, code: 'NOT_FOUND' });
      return;
    }

    logger.error({ err, objectId }, 'Unexpected error listing page layouts');
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

/**
 * GET /admin/objects/:objectId/page-layouts/:id
 *
 * Returns a single page layout by ID.
 *
 * Responses:
 *   200  – page layout
 *   401  – missing or invalid Bearer token
 *   404  – layout or parent object not found
 *   500  – unexpected server error
 */
export async function handleGetPageLayout(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const { objectId, id } = req.params as { objectId: string; id: string };

  try {
    const layout = await getPageLayoutById(req.user!.tenantId!, objectId, id);
    res.status(200).json(layout);
  } catch (err: unknown) {
    const code = (err as Error & { code?: string }).code;

    if (code === 'NOT_FOUND') {
      res.status(404).json({ error: (err as Error).message, code: 'NOT_FOUND' });
      return;
    }

    logger.error({ err, objectId, layoutId: id }, 'Unexpected error fetching page layout');
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

/**
 * PUT /admin/objects/:objectId/page-layouts/:id
 *
 * Updates a page layout's metadata and/or draft layout.
 *
 * Request body (JSON) — all fields optional:
 *   {
 *     "name"?: string,
 *     "role"?: string | null,
 *     "layout"?: PageLayoutJson,
 *     "is_default"?: boolean
 *   }
 *
 * Responses:
 *   200  – updated page layout
 *   400  – validation error
 *   401  – missing or invalid Bearer token
 *   404  – layout or parent object not found
 *   409  – role conflict with another layout
 *   500  – unexpected server error
 */
export async function handleUpdatePageLayout(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const { objectId, id } = req.params as { objectId: string; id: string };

  const body = req.body as {
    name?: string;
    role?: string | null;
    layout?: unknown;
    is_default?: boolean;
    isDefault?: boolean;
  };

  const params: UpdatePageLayoutParams = {};
  if ('name' in body) params.name = body.name;
  if ('role' in body) params.role = body.role;
  if ('layout' in body) params.layout = body.layout as UpdatePageLayoutParams['layout'];
  if ('is_default' in body) params.isDefault = body.is_default;
  if ('isDefault' in body && !('is_default' in body)) params.isDefault = body.isDefault;

  try {
    const updated = await updatePageLayout(req.user!.tenantId!, objectId, id, params);
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

    logger.error({ err, objectId, layoutId: id }, 'Unexpected error updating page layout');
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

/**
 * POST /admin/objects/:objectId/page-layouts/:id/publish
 *
 * Publishes a page layout — copies the draft to published_layout,
 * increments the version, and creates a version snapshot.
 *
 * Responses:
 *   200  – published page layout
 *   401  – missing or invalid Bearer token
 *   404  – layout or parent object not found
 *   500  – unexpected server error
 */
export async function handlePublishPageLayout(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const { objectId, id } = req.params as { objectId: string; id: string };

  try {
    const published = await publishPageLayout(
      req.user!.tenantId!,
      objectId,
      id,
      req.user!.userId,
    );
    res.status(200).json(published);
  } catch (err: unknown) {
    const code = (err as Error & { code?: string }).code;

    if (code === 'NOT_FOUND') {
      res.status(404).json({ error: (err as Error).message, code: 'NOT_FOUND' });
      return;
    }

    logger.error({ err, objectId, layoutId: id }, 'Unexpected error publishing page layout');
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

/**
 * GET /admin/objects/:objectId/page-layouts/:id/versions
 *
 * Returns all version snapshots for a page layout, newest first.
 *
 * Responses:
 *   200  – array of page layout versions
 *   401  – missing or invalid Bearer token
 *   404  – layout or parent object not found
 *   500  – unexpected server error
 */
export async function handleListPageLayoutVersions(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const { objectId, id } = req.params as { objectId: string; id: string };

  try {
    const versions = await listPageLayoutVersions(req.user!.tenantId!, objectId, id);
    res.status(200).json(versions);
  } catch (err: unknown) {
    const code = (err as Error & { code?: string }).code;

    if (code === 'NOT_FOUND') {
      res.status(404).json({ error: (err as Error).message, code: 'NOT_FOUND' });
      return;
    }

    logger.error({ err, objectId, layoutId: id }, 'Unexpected error listing page layout versions');
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

/**
 * DELETE /admin/objects/:objectId/page-layouts/:id
 *
 * Deletes a page layout. Default layouts cannot be deleted.
 *
 * Responses:
 *   204  – page layout deleted
 *   400  – default layout (delete blocked)
 *   401  – missing or invalid Bearer token
 *   404  – layout or parent object not found
 *   500  – unexpected server error
 */
export async function handleDeletePageLayout(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const { objectId, id } = req.params as { objectId: string; id: string };

  try {
    await deletePageLayout(req.user!.tenantId!, objectId, id);
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

    logger.error({ err, objectId, layoutId: id }, 'Unexpected error deleting page layout');
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

/**
 * GET /admin/component-registry
 *
 * Returns the full component registry — used by the layout builder to
 * populate the component palette.
 *
 * Responses:
 *   200  – array of component definitions
 */
export async function handleGetComponentRegistry(
  _req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  res.status(200).json(COMPONENT_REGISTRY);
}

/**
 * POST /admin/objects/:objectId/page-layouts/:id/copy
 *
 * Copies layout JSON from a source layout into this layout's draft.
 *
 * Request body (JSON):
 *   { "sourceLayoutId": "uuid" }
 *
 * Responses:
 *   200  – updated page layout with copied JSON
 *   400  – missing sourceLayoutId
 *   401  – missing or invalid Bearer token
 *   404  – layout, source layout, or parent object not found
 *   500  – unexpected server error
 */
export async function handleCopyLayout(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const { objectId, id } = req.params as { objectId: string; id: string };
  const body = req.body as { sourceLayoutId?: string };

  if (!body.sourceLayoutId || typeof body.sourceLayoutId !== 'string') {
    res.status(400).json({ error: 'sourceLayoutId is required', code: 'VALIDATION_ERROR' });
    return;
  }

  try {
    const result = await copyLayout(
      req.user!.tenantId!,
      objectId,
      id,
      body.sourceLayoutId,
    );
    res.status(200).json(result);
  } catch (err: unknown) {
    const code = (err as Error & { code?: string }).code;

    if (code === 'NOT_FOUND') {
      res.status(404).json({ error: (err as Error).message, code: 'NOT_FOUND' });
      return;
    }

    logger.error({ err, objectId, layoutId: id }, 'Unexpected error copying page layout');
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

/**
 * POST /admin/objects/:objectId/page-layouts/:id/revert
 *
 * Restores a page layout's draft from a specific version snapshot.
 *
 * Request body (JSON):
 *   { "version": number }
 *
 * Responses:
 *   200  – updated page layout with reverted JSON
 *   400  – missing or invalid version
 *   401  – missing or invalid Bearer token
 *   404  – layout, version, or parent object not found
 *   500  – unexpected server error
 */
export async function handleRevertLayout(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const { objectId, id } = req.params as { objectId: string; id: string };
  const body = req.body as { version?: number };

  if (body.version === undefined || typeof body.version !== 'number' || body.version < 1) {
    res.status(400).json({ error: 'version must be a positive integer', code: 'VALIDATION_ERROR' });
    return;
  }

  try {
    const result = await revertLayout(
      req.user!.tenantId!,
      objectId,
      id,
      body.version,
    );
    res.status(200).json(result);
  } catch (err: unknown) {
    const code = (err as Error & { code?: string }).code;

    if (code === 'NOT_FOUND') {
      res.status(404).json({ error: (err as Error).message, code: 'NOT_FOUND' });
      return;
    }

    logger.error({ err, objectId, layoutId: id }, 'Unexpected error reverting page layout');
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

adminPageLayoutsRouter.post('/', requireAuth, adminPageLayoutsRateLimiter, requireTenant, handleCreatePageLayout);
adminPageLayoutsRouter.get('/', requireAuth, adminPageLayoutsRateLimiter, requireTenant, handleListPageLayouts);
adminPageLayoutsRouter.get('/:id', requireAuth, adminPageLayoutsRateLimiter, requireTenant, handleGetPageLayout);
adminPageLayoutsRouter.put('/:id', requireAuth, adminPageLayoutsRateLimiter, requireTenant, handleUpdatePageLayout);
adminPageLayoutsRouter.post('/:id/publish', requireAuth, adminPageLayoutsRateLimiter, requireTenant, handlePublishPageLayout);
adminPageLayoutsRouter.get('/:id/versions', requireAuth, adminPageLayoutsRateLimiter, requireTenant, handleListPageLayoutVersions);
adminPageLayoutsRouter.post('/:id/copy', requireAuth, adminPageLayoutsRateLimiter, requireTenant, handleCopyLayout);
adminPageLayoutsRouter.post('/:id/revert', requireAuth, adminPageLayoutsRateLimiter, requireTenant, handleRevertLayout);
adminPageLayoutsRouter.delete('/:id', requireAuth, adminPageLayoutsRateLimiter, requireTenant, handleDeletePageLayout);

export const componentRegistryRouter = Router();
componentRegistryRouter.get('/', requireAuth, adminPageLayoutsRateLimiter, requireTenant, handleGetComponentRegistry);
