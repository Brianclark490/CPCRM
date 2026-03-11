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
 * Returns the first tenant ID found, or undefined if the token carries no tenant claim.
 */
function resolveTenantId(token: Record<string, unknown>): string | undefined {
  const tenants = token['tenants'];
  if (tenants !== null && typeof tenants === 'object' && !Array.isArray(tenants)) {
    const tenantIds = Object.keys(tenants as Record<string, unknown>);
    return tenantIds.length > 0 ? tenantIds[0] : undefined;
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
      tenantId: resolveTenantId(authInfo.token),
    };

    next();
  } catch {
    logger.warn({ path: req.path }, 'Auth rejected: token validation failed');
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
