import { Router } from 'express';
import type { Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireTenant } from '../middleware/tenant.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { pool } from '../db/client.js';
import { logger } from '../lib/logger.js';

export const pageLayoutsRouter = Router({ mergeParams: true });

/**
 * GET /objects/:apiName/page-layout
 *
 * Returns the effective published page layout for the current user.
 *
 * Resolution order:
 * 1. Published layout matching the user's first role
 * 2. Default published layout (is_default = true)
 *
 * Returns ONLY the published_layout JSON — not the full admin record.
 *
 * Responses:
 *   200  – published layout JSON
 *   204  – no published layout exists (frontend should fall back)
 *   401  – missing or invalid Bearer token
 *   403  – no active tenant context
 *   404  – object type not found
 *   500  – unexpected server error
 */
export async function handleGetEffectivePageLayout(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const { apiName } = req.params as { apiName: string };
  const tenantId = req.user!.tenantId!;
  const userRoles = req.user!.roles;

  try {
    // Resolve the object by apiName + tenantId
    const objResult = await pool.query(
      'SELECT id FROM object_definitions WHERE api_name = $1 AND tenant_id = $2',
      [apiName, tenantId],
    );

    if (objResult.rows.length === 0) {
      res.status(404).json({ error: 'Object not found' });
      return;
    }

    const objectId = objResult.rows[0].id as string;

    // Try role-specific layout first (check the user's first role)
    let publishedLayout: unknown = null;

    if (userRoles.length > 0) {
      const roleResult = await pool.query(
        `SELECT published_layout FROM page_layouts
         WHERE tenant_id = $1 AND object_id = $2 AND role = $3 AND status = 'published'
         LIMIT 1`,
        [tenantId, objectId, userRoles[0]],
      );

      if (roleResult.rows[0]?.published_layout) {
        publishedLayout = roleResult.rows[0].published_layout;
      }
    }

    // Fall back to default published layout
    if (!publishedLayout) {
      const defaultResult = await pool.query(
        `SELECT published_layout FROM page_layouts
         WHERE tenant_id = $1 AND object_id = $2 AND is_default = true AND status = 'published'
         LIMIT 1`,
        [tenantId, objectId],
      );

      if (defaultResult.rows[0]?.published_layout) {
        publishedLayout = defaultResult.rows[0].published_layout;
      }
    }

    if (!publishedLayout) {
      res.status(204).end();
      return;
    }

    res.json(publishedLayout);
  } catch (err: unknown) {
    logger.error({ err, apiName }, 'Unexpected error fetching effective page layout');
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

pageLayoutsRouter.get('/', requireAuth, requireTenant, handleGetEffectivePageLayout);
