import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { TenantPickerPage } from '../pages/TenantPickerPage.js';

const mockNavigate = vi.fn();
const mockSelectTenant = vi.fn();
const mockMyTenants = vi.fn();

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('@descope/react-sdk', () => ({
  useDescope: vi.fn(),
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

const { useDescope, useSession } = await import('@descope/react-sdk');
const { sessionHistory } = await import('../store/sessionHistory.js');
const { setStoredTenant, getCurrentTenantId } = await import('../store/tenant.js');

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/select-tenant']}>
      <Routes>
        <Route path="/select-tenant" element={<TenantPickerPage />} />
        <Route path="/dashboard" element={<div>Dashboard</div>} />
        <Route path="/organisations/new" element={<div>Org provisioning</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('TenantPickerPage', () => {
  beforeEach(() => {
    vi.mocked(useSession).mockReturnValue({
      isAuthenticated: true,
      isSessionLoading: false,
      sessionToken: 'test-token',
      claims: {},
    });
    vi.mocked(useDescope).mockReturnValue({
      selectTenant: mockSelectTenant,
      myTenants: mockMyTenants,
      logout: vi.fn(),
    } as unknown as ReturnType<typeof useDescope>);
    vi.mocked(getCurrentTenantId).mockReturnValue(null);
    mockSelectTenant.mockResolvedValue({ ok: true });
    mockMyTenants.mockResolvedValue({ ok: true, data: [] });
    mockNavigate.mockReset();
  });

  it('shows a loading state while fetching tenants', () => {
    mockMyTenants.mockReturnValue(new Promise(() => {})); // never resolves

    renderPage();

    expect(screen.getByText('Loading organisations…')).toBeInTheDocument();
  });

  it('redirects to /organisations/new when the user has no tenants', async () => {
    mockMyTenants.mockResolvedValue({ ok: true, data: [] });

    renderPage();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/organisations/new', { replace: true });
    });
  });

  it('auto-selects and redirects to /dashboard when user has exactly one tenant', async () => {
    mockMyTenants.mockResolvedValue({
      ok: true,
      data: [{ tenantId: 'T1', name: 'Acme Corp' }],
    });

    renderPage();

    await waitFor(() => {
      expect(mockSelectTenant).toHaveBeenCalledWith('T1');
    });
    expect(setStoredTenant).toHaveBeenCalledWith('T1', 'Acme Corp');
    expect(sessionHistory.markAuthenticated).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true });
  });

  it('displays a list of tenants when user belongs to multiple', async () => {
    mockMyTenants.mockResolvedValue({
      ok: true,
      data: [
        { tenantId: 'T1', name: 'Acme Corp' },
        { tenantId: 'T2', name: 'Globex Inc' },
      ],
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Select an organisation')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Acme Corp' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Globex Inc' })).toBeInTheDocument();
  });

  it('selects a tenant and navigates to /dashboard when a tenant button is clicked', async () => {
    mockMyTenants.mockResolvedValue({
      ok: true,
      data: [
        { tenantId: 'T1', name: 'Acme Corp' },
        { tenantId: 'T2', name: 'Globex Inc' },
      ],
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Acme Corp' })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: 'Acme Corp' }));

    await waitFor(() => {
      expect(mockSelectTenant).toHaveBeenCalledWith('T1');
    });
    expect(setStoredTenant).toHaveBeenCalledWith('T1', 'Acme Corp');
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true });
  });

  it('shows an error when fetching tenants fails', async () => {
    mockMyTenants.mockRejectedValue(new Error('Network error'));

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Failed to load your organisations. Please try again.',
      );
    });
  });

  it('shows an error when selecting a tenant fails', async () => {
    mockMyTenants.mockResolvedValue({
      ok: true,
      data: [
        { tenantId: 'T1', name: 'Acme Corp' },
        { tenantId: 'T2', name: 'Globex Inc' },
      ],
    });
    mockSelectTenant.mockRejectedValue(new Error('Select failed'));

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Acme Corp' })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: 'Acme Corp' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Failed to select organisation. Please try again.',
      );
    });
  });

  it('redirects to /dashboard if session token already contains a tenant', () => {
    vi.mocked(getCurrentTenantId).mockReturnValue('T_EXISTING');

    renderPage();

    expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true });
  });
});
