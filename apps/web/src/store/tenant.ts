import { useSession } from '@descope/react-sdk';

export interface TenantInfo {
  tenantId: string | null;
  tenantName: string | null;
}

/**
 * Decodes the payload section of a JWT without verifying the signature.
 * Used client-side only to read claims like the selected tenant.
 */
function parseJwtPayload(token: string): Record<string, unknown> {
  try {
    const base64Url = token.split('.')[1];
    if (!base64Url) return {};
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(base64);
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return {};
  }
}

const STORAGE_KEY = 'cpcrm_tenant';

/**
 * Persists the selected tenant display info into sessionStorage so it
 * survives page refreshes within the same browser tab.
 */
export function setStoredTenant(tenantId: string, tenantName: string): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ id: tenantId, name: tenantName }));
  } catch {
    // sessionStorage may be unavailable in some environments
  }
}

export function clearStoredTenant(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // noop
  }
}

function getStoredTenantName(tenantId: string): string | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as { id: string; name: string };
    return data.id === tenantId ? data.name : null;
  } catch {
    return null;
  }
}

/**
 * Extracts the currently selected tenant ID from a Descope session JWT.
 *
 * Checks the `dct` claim first (set after `selectTenant` is called), then
 * falls back to the `tenants` claim if there is exactly one tenant.
 */
export function getCurrentTenantId(token: string): string | null {
  const payload = parseJwtPayload(token);

  if (typeof payload.dct === 'string' && payload.dct) {
    return payload.dct;
  }

  if (payload.tenants && typeof payload.tenants === 'object') {
    const ids = Object.keys(payload.tenants as Record<string, unknown>);
    if (ids.length === 1) return ids[0];
  }

  return null;
}

/**
 * Returns the current tenant context derived from the Descope session token.
 *
 * - `tenantId` is read from the JWT claims.
 * - `tenantName` is read from sessionStorage (set during tenant selection).
 */
export function useTenant(): TenantInfo {
  const { sessionToken } = useSession();

  if (!sessionToken) {
    return { tenantId: null, tenantName: null };
  }

  const tenantId = getCurrentTenantId(sessionToken);
  const tenantName = tenantId ? getStoredTenantName(tenantId) : null;

  return { tenantId, tenantName };
}
