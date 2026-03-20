import { useState, useEffect, type ReactNode } from 'react';
import { useDescope, useUser, useSession } from '@descope/react-sdk';
import { useNavigate } from 'react-router-dom';
import { setStoredTenant } from '../store/tenant.js';
import { sessionHistory } from '../store/sessionHistory.js';

/**
 * Checks whether the Descope session JWT contains a `dct` (current tenant) claim.
 * This claim is set after `selectTenant()` is called.
 */
function hasDctClaim(token: string): boolean {
  try {
    const base64Url = token.split('.')[1];
    if (!base64Url) return false;
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(base64)) as Record<string, unknown>;
    return typeof payload.dct === 'string' && payload.dct.length > 0;
  } catch {
    return false;
  }
}

interface TenantGuardProps {
  children: ReactNode;
}

/**
 * Ensures a tenant is selected before rendering children.
 *
 * - If the JWT already contains a `dct` claim, the children render immediately.
 * - If the user belongs to exactly one tenant, `selectTenant` is called automatically.
 * - If the user belongs to multiple tenants, they are redirected to `/select-tenant`.
 * - If the user has no tenants, they are redirected to `/organisations/new`.
 */
export function TenantGuard({ children }: TenantGuardProps) {
  const sdk = useDescope();
  const { user, isUserLoading } = useUser();
  const { sessionToken } = useSession();
  const navigate = useNavigate();

  // Derived truth: if the token already has dct, we are ready (no state update needed)
  const tokenHasTenant = !!sessionToken && hasDctClaim(sessionToken);

  // State only for the "we selected tenant during this mount" path
  const [selectedTenantReady, setSelectedTenantReady] = useState(false);

  const tenantReady = tokenHasTenant || selectedTenantReady;

  useEffect(() => {
    if (tenantReady) return;
    if (isUserLoading) return;

    let cancelled = false;

    async function ensureTenant() {
      const tenants = user?.userTenants ?? [];

      if (tenants.length === 0) {
        if (!cancelled) void navigate('/organisations/new', { replace: true });
        return;
      }

      if (tenants.length === 1) {
        try {
          const tenant = tenants[0];
          await sdk.selectTenant(tenant.tenantId);
          if (!cancelled) {
            const name =
              (tenant as Record<string, unknown>).tenantName as string | undefined;
            setStoredTenant(tenant.tenantId, name ?? tenant.tenantId);
            sessionHistory.markAuthenticated();
            setSelectedTenantReady(true);
          }
        } catch {
          if (!cancelled) void navigate('/select-tenant', { replace: true });
        }
        return;
      }

      // Multiple tenants — let the user pick
      if (!cancelled) void navigate('/select-tenant', { replace: true });
    }

    if (user) {
      void ensureTenant();
    }

    return () => {
      cancelled = true;
    };
  }, [tenantReady, user, isUserLoading, sessionToken, sdk, navigate]);

  if (!tenantReady) {
    return <div>Loading...</div>;
  }

  return <>{children}</>;
}
