import DescopeClient from '@descope/node-sdk';
import type { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger.js';

const projectId = process.env.DESCOPE_PROJECT_ID;

if (!projectId) {
  throw new Error('DESCOPE_PROJECT_ID environment variable is required');
}

const descopeClient = DescopeClient({ projectId });

/**
 * Extracts the active tenant ID from the Descope JWT token payload.
 * Descope includes a `tenants` claim (map of tenantId → tenant metadata)
 * when the user is authenticated within a tenant context.
 *
 * Resolution rules:
 * - If the token carries exactly one tenant claim, that tenant ID is returned.
 * - If the token carries multiple tenant claims (ambiguous), the first ID is
 *   returned and a warning is logged. Multi-tenant token support is not a
 *   current product requirement; this case should not arise in normal use.
 * - If the token carries no tenant claim (or the claim is empty), undefined
 *   is returned and the request will be rejected by requireTenant.
 */
function resolveTenantId(
  token: Record<string, unknown>,
  context?: { path?: string; userId?: string },
): string | undefined {
  const tenants = token['tenants'];
  if (tenants !== null && typeof tenants === 'object' && !Array.isArray(tenants)) {
    const tenantIds = Object.keys(tenants as Record<string, unknown>);
    if (tenantIds.length === 0) return undefined;
    if (tenantIds.length > 1) {
      logger.warn(
        { path: context?.path, userId: context?.userId, tenantCount: tenantIds.length },
        'Ambiguous tenant context: JWT carries multiple tenant claims; using the first',
      );
    }
    return tenantIds[0];
  }
  return undefined;
}

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    email?: string;
    name?: string;
    /** Active tenant ID — resolved from the Descope JWT tenant claim or subdomain routing */
    tenantId?: string;
  };
}

export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    logger.warn({ path: req.path }, 'Auth rejected: missing or invalid Authorization header');
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }

  const sessionToken = authHeader.slice(7);

  try {
    const authInfo = await descopeClient.validateSession(sessionToken);
    const userId = authInfo.token.sub;

    if (!userId) {
      logger.warn({ path: req.path }, 'Auth rejected: token missing subject claim');
      res.status(401).json({ error: 'Invalid token: missing subject claim' });
      return;
    }

    req.user = {
      userId,
      email: authInfo.token.email as string | undefined,
      name: authInfo.token.name as string | undefined,
      tenantId: resolveTenantId(authInfo.token, { path: req.path, userId }),
    };

    next();
  } catch {
    logger.warn({ path: req.path }, 'Auth rejected: token validation failed');
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
