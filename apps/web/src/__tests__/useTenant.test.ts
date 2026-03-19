import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getCurrentTenantId,
  setStoredTenant,
  clearStoredTenant,
} from '../store/tenant.js';

/**
 * Helper to build a minimal JWT with the given payload (no signature verification).
 */
function buildJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.signature`;
}

describe('getCurrentTenantId', () => {
  it('returns the dct claim when present', () => {
    const token = buildJwt({ dct: 'T_ACME', sub: 'user1' });
    expect(getCurrentTenantId(token)).toBe('T_ACME');
  });

  it('returns the single tenant ID from the tenants claim when dct is absent', () => {
    const token = buildJwt({ tenants: { T_SINGLE: { roles: [] } } });
    expect(getCurrentTenantId(token)).toBe('T_SINGLE');
  });

  it('returns null when multiple tenants exist and dct is absent', () => {
    const token = buildJwt({ tenants: { T1: {}, T2: {} } });
    expect(getCurrentTenantId(token)).toBeNull();
  });

  it('returns null for an empty token', () => {
    expect(getCurrentTenantId('')).toBeNull();
  });

  it('returns null for a malformed token', () => {
    expect(getCurrentTenantId('not.a.valid-jwt')).toBeNull();
  });

  it('prefers dct over the tenants claim', () => {
    const token = buildJwt({ dct: 'T_SELECTED', tenants: { T_OTHER: {} } });
    expect(getCurrentTenantId(token)).toBe('T_SELECTED');
  });
});

describe('setStoredTenant / clearStoredTenant', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it('stores and retrieves tenant info via sessionStorage', () => {
    setStoredTenant('T1', 'Acme Corp');
    const raw = sessionStorage.getItem('cpcrm_tenant');
    expect(raw).not.toBeNull();

    const parsed = JSON.parse(raw!) as { id: string; name: string };
    expect(parsed).toEqual({ id: 'T1', name: 'Acme Corp' });
  });

  it('clears stored tenant info', () => {
    setStoredTenant('T1', 'Acme Corp');
    clearStoredTenant();
    expect(sessionStorage.getItem('cpcrm_tenant')).toBeNull();
  });
});
