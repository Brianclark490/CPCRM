import DescopeClient from '@descope/node-sdk';
import type { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger.js';

class MissingDescopeConfigError extends Error {
  constructor() {
    super('DESCOPE_PROJECT_ID environment variable is required');
    this.name = 'MissingDescopeConfigError';
  }
}

let descopeClientInstance: ReturnType<typeof DescopeClient> | undefined;

function getDescopeClient(): ReturnType<typeof DescopeClient> {
  if (!descopeClientInstance) {
    const projectId = process.env.DESCOPE_PROJECT_ID;
    if (!projectId) {
      throw new MissingDescopeConfigError();
    }
    descopeClientInstance = DescopeClient({ projectId });
  }
  return descopeClientInstance;
}

/**
 * Resolved tenant context from the Descope JWT token payload.
 */
interface TenantClaims {
  tenantId?: string;
  roles: string[];
  permissions: string[];
}

/**
 * Extracts the active tenant ID, roles, and permissions from the Descope JWT
 * token payload.
 *
 * Descope includes a `dct` (default current tenant) claim when the user is
 * authenticated within a specific tenant context.  The `tenants` claim is a
 * map of tenantId → tenant metadata containing `roles` and `permissions`
 * arrays when RBAC is enabled.
 *
 * Resolution rules:
 * 1. If the token carries a `dct` claim, it is used as the current tenant ID.
 *    Roles and permissions are read from `tenants[dct]`.
 * 2. If `dct` is absent but the `tenants` map contains exactly one entry,
 *    that entry's tenant ID is used.
 * 3. If `dct` is absent and the `tenants` map contains multiple entries,
 *    the first is used and a warning is logged.
 * 4. If no tenant information is available, roles and permissions fall back
 *    to the top-level `roles` / `permissions` claims (global Descope RBAC).
 */
function resolveTenantClaims(
  token: Record<string, unknown>,
  context?: { path?: string; userId?: string },
): TenantClaims {
  const tenants = token['tenants'];
  const tenantMap: Record<string, Record<string, unknown>> =
    tenants !== null && typeof tenants === 'object' && !Array.isArray(tenants)
      ? (tenants as Record<string, Record<string, unknown>>)
      : {};

  // Prefer the explicit `dct` (default current tenant) claim from Descope
  const dct = token['dct'];
  if (typeof dct === 'string' && dct.length > 0) {
    const tenantData = tenantMap[dct] ?? {};
    return {
      tenantId: dct,
      roles: Array.isArray(tenantData['roles']) ? (tenantData['roles'] as string[]) : [],
      permissions: Array.isArray(tenantData['permissions'])
        ? (tenantData['permissions'] as string[])
        : [],
    };
  }

  // Fall back to the tenants map when dct is not present
  const tenantIds = Object.keys(tenantMap);
  if (tenantIds.length > 0) {
    if (tenantIds.length > 1) {
      logger.warn(
        { path: context?.path, userId: context?.userId, tenantCount: tenantIds.length },
        'Ambiguous tenant context: JWT carries multiple tenant claims; using the first',
      );
    }
    const tenantId = tenantIds[0];
    const tenantData = tenantMap[tenantId] ?? {};
    return {
      tenantId,
      roles: Array.isArray(tenantData['roles']) ? (tenantData['roles'] as string[]) : [],
      permissions: Array.isArray(tenantData['permissions'])
        ? (tenantData['permissions'] as string[])
        : [],
    };
  }

  // No tenant claim — fall back to top-level roles/permissions (global RBAC)
  return {
    tenantId: undefined,
    roles: Array.isArray(token['roles']) ? (token['roles'] as string[]) : [],
    permissions: Array.isArray(token['permissions']) ? (token['permissions'] as string[]) : [],
  };
}

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    email?: string;
    name?: string;
    /** Active tenant ID — resolved from the Descope JWT tenant claim or subdomain routing */
    tenantId?: string;
    /** Descope roles assigned to the user (from the JWT tenant claim) */
    roles: string[];
    /** Descope permissions assigned to the user (from the JWT tenant claim) */
    permissions: string[];
    /** CRM User record ID — set by user sync after JWT validation */
    recordId?: string;
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
    const client = getDescopeClient();
    const authInfo = await client.validateSession(sessionToken);
    const userId = authInfo.token.sub;

    if (!userId) {
      logger.warn({ path: req.path }, 'Auth rejected: token missing subject claim');
      res.status(401).json({ error: 'Invalid token: missing subject claim' });
      return;
    }

    const claims = resolveTenantClaims(authInfo.token, { path: req.path, userId });

    req.user = {
      userId,
      email: authInfo.token.email as string | undefined,
      name: authInfo.token.name as string | undefined,
      tenantId: claims.tenantId,
      roles: claims.roles,
      permissions: claims.permissions,
    };

    next();
  } catch (err) {
    if (err instanceof MissingDescopeConfigError) {
      logger.error({ path: req.path }, 'Auth service unavailable: DESCOPE_PROJECT_ID is not configured');
      res.status(503).json({ error: 'Authentication service unavailable' });
      return;
    }
    logger.warn({ path: req.path }, 'Auth rejected: token validation failed');
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
