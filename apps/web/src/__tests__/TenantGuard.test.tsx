import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { TenantGuard } from '../components/TenantGuard.js';

const mockNavigate = vi.fn();
const mockSelectTenant = vi.fn();

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('@descope/react-sdk', () => ({
  useDescope: vi.fn(),
  useUser: vi.fn(),
  useSession: vi.fn(),
}));

vi.mock('../store/sessionHistory.js', () => ({
  sessionHistory: {
    subscribe: vi.fn(() => vi.fn()),
    getSnapshot: vi.fn(() => false),
    markAuthenticated: vi.fn(),
    clearAuthenticated: vi.fn(),
  },
}));

vi.mock('../store/tenant.js', () => ({
  setStoredTenant: vi.fn(),
  clearStoredTenant: vi.fn(),
  getCurrentTenantId: vi.fn(),
}));

const { useDescope, useUser, useSession } = await import('@descope/react-sdk');
const { sessionHistory } = await import('../store/sessionHistory.js');
const { setStoredTenant } = await import('../store/tenant.js');

/**
 * Helper to build a minimal JWT with the given payload (no signature verification).
 */
function buildJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.signature`;
}

function renderGuard() {
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Routes>
        <Route
          path="/dashboard"
          element={
            <TenantGuard>
              <div>Protected content</div>
            </TenantGuard>
          }
        />
        <Route path="/select-tenant" element={<div>Tenant picker</div>} />
        <Route path="/organisations/new" element={<div>Org provisioning</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('TenantGuard', () => {
  beforeEach(() => {
    vi.mocked(useDescope).mockReturnValue({
      selectTenant: mockSelectTenant,
      logout: vi.fn(),
    } as unknown as ReturnType<typeof useDescope>);
    mockSelectTenant.mockResolvedValue({ ok: true });
    mockNavigate.mockReset();
    vi.mocked(setStoredTenant).mockReset();
    vi.mocked(sessionHistory.markAuthenticated).mockReset();
  });

  it('renders children immediately when the JWT already has a dct claim', () => {
    const token = buildJwt({ dct: 'T_ACME', sub: 'user1' });

    vi.mocked(useSession).mockReturnValue({
      isAuthenticated: true,
      isSessionLoading: false,
      sessionToken: token,
      claims: {},
    });
    vi.mocked(useUser).mockReturnValue({
      user: { userTenants: [{ tenantId: 'T_ACME' }] },
      isUserLoading: false,
    } as ReturnType<typeof useUser>);

    renderGuard();

    expect(screen.getByText('Protected content')).toBeInTheDocument();
  });

  it('shows loading while user data is still loading', () => {
    vi.mocked(useSession).mockReturnValue({
      isAuthenticated: true,
      isSessionLoading: false,
      sessionToken: buildJwt({ sub: 'user1', tenants: { T1: {} } }),
      claims: {},
    });
    vi.mocked(useUser).mockReturnValue({
      user: undefined,
      isUserLoading: true,
    } as ReturnType<typeof useUser>);

    renderGuard();

    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
  });

  it('auto-selects tenant when user has exactly one tenant', async () => {
    const token = buildJwt({ sub: 'user1', tenants: { T1: {} } });

    vi.mocked(useSession).mockReturnValue({
      isAuthenticated: true,
      isSessionLoading: false,
      sessionToken: token,
      claims: {},
    });
    vi.mocked(useUser).mockReturnValue({
      user: { userTenants: [{ tenantId: 'T1', tenantName: 'Acme Corp' }] },
      isUserLoading: false,
    } as ReturnType<typeof useUser>);

    renderGuard();

    await waitFor(() => {
      expect(mockSelectTenant).toHaveBeenCalledWith('T1');
    });
    expect(setStoredTenant).toHaveBeenCalledWith('T1', 'Acme Corp');
    expect(sessionHistory.markAuthenticated).toHaveBeenCalled();
    expect(screen.getByText('Protected content')).toBeInTheDocument();
  });

  it('uses tenantId as fallback name when tenantName is missing', async () => {
    const token = buildJwt({ sub: 'user1', tenants: { T1: {} } });

    vi.mocked(useSession).mockReturnValue({
      isAuthenticated: true,
      isSessionLoading: false,
      sessionToken: token,
      claims: {},
    });
    vi.mocked(useUser).mockReturnValue({
      user: { userTenants: [{ tenantId: 'T1' }] },
      isUserLoading: false,
    } as ReturnType<typeof useUser>);

    renderGuard();

    await waitFor(() => {
      expect(mockSelectTenant).toHaveBeenCalledWith('T1');
    });
    expect(setStoredTenant).toHaveBeenCalledWith('T1', 'T1');
  });

  it('redirects to /select-tenant when user has multiple tenants', async () => {
    const token = buildJwt({ sub: 'user1', tenants: { T1: {}, T2: {} } });

    vi.mocked(useSession).mockReturnValue({
      isAuthenticated: true,
      isSessionLoading: false,
      sessionToken: token,
      claims: {},
    });
    vi.mocked(useUser).mockReturnValue({
      user: {
        userTenants: [
          { tenantId: 'T1', tenantName: 'Acme Corp' },
          { tenantId: 'T2', tenantName: 'Globex Inc' },
        ],
      },
      isUserLoading: false,
    } as ReturnType<typeof useUser>);

    renderGuard();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/select-tenant', { replace: true });
    });
  });

  it('redirects to /organisations/new when user has no tenants', async () => {
    const token = buildJwt({ sub: 'user1' });

    vi.mocked(useSession).mockReturnValue({
      isAuthenticated: true,
      isSessionLoading: false,
      sessionToken: token,
      claims: {},
    });
    vi.mocked(useUser).mockReturnValue({
      user: { userTenants: [] },
      isUserLoading: false,
    } as ReturnType<typeof useUser>);

    renderGuard();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/organisations/new', { replace: true });
    });
  });

  it('redirects to /select-tenant when single-tenant selectTenant fails', async () => {
    const token = buildJwt({ sub: 'user1', tenants: { T1: {} } });

    vi.mocked(useSession).mockReturnValue({
      isAuthenticated: true,
      isSessionLoading: false,
      sessionToken: token,
      claims: {},
    });
    vi.mocked(useUser).mockReturnValue({
      user: { userTenants: [{ tenantId: 'T1' }] },
      isUserLoading: false,
    } as ReturnType<typeof useUser>);

    mockSelectTenant.mockRejectedValue(new Error('Select failed'));

    renderGuard();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/select-tenant', { replace: true });
    });
  });

  it('does not call selectTenant when dct is already present', () => {
    const token = buildJwt({ dct: 'T_ACME', sub: 'user1' });

    vi.mocked(useSession).mockReturnValue({
      isAuthenticated: true,
      isSessionLoading: false,
      sessionToken: token,
      claims: {},
    });
    vi.mocked(useUser).mockReturnValue({
      user: { userTenants: [{ tenantId: 'T_ACME' }] },
      isUserLoading: false,
    } as ReturnType<typeof useUser>);

    renderGuard();

    expect(mockSelectTenant).not.toHaveBeenCalled();
    expect(screen.getByText('Protected content')).toBeInTheDocument();
  });
});
