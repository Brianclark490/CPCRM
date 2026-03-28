import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AppShell } from '../components/AppShell.js';

const mockNavigate = vi.fn();
const mockLogout = vi.fn();

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('@descope/react-sdk', () => ({
  useUser: vi.fn(),
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
  useTenant: vi.fn(),
  clearStoredTenant: vi.fn(),
}));

vi.mock('../store/superAdmin.js', () => ({
  useSuperAdmin: vi.fn(),
}));

vi.mock('../store/useTheme.js', () => ({
  useTheme: vi.fn(),
}));

const { useUser, useDescope, useSession } = await import('@descope/react-sdk');
const { sessionHistory } = await import('../store/sessionHistory.js');
const { useTenant, clearStoredTenant } = await import('../store/tenant.js');
const { useSuperAdmin } = await import('../store/superAdmin.js');
const { useTheme } = await import('../store/useTheme.js');

function mockFetchObjects(objects: Array<{ id?: string; apiName: string; pluralLabel: string; icon?: string }> = []) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => objects.map((o, i) => ({ id: o.id ?? `obj-${i}`, ...o })),
  } as Response));
}

describe('AppShell', () => {
  beforeEach(() => {
    vi.mocked(useUser).mockReturnValue(
      { user: { name: 'Test User', email: 'test@example.com' }, isUserLoading: false } as unknown as ReturnType<typeof useUser>,
    );
    vi.mocked(useDescope).mockReturnValue(
      { logout: mockLogout } as unknown as ReturnType<typeof useDescope>,
    );
    vi.mocked(useSession).mockReturnValue({
      isAuthenticated: true,
      isSessionLoading: false,
      sessionToken: 'test-token',
      claims: {},
    });
    vi.mocked(useTenant).mockReturnValue({ tenantId: null, tenantName: null });
    vi.mocked(useSuperAdmin).mockReturnValue({ isSuperAdmin: false, loading: false });
    vi.mocked(useTheme).mockReturnValue({ theme: 'dark', toggle: vi.fn() });
    mockLogout.mockResolvedValue(undefined);
    mockNavigate.mockReset();
    mockFetchObjects();
  });

  it('renders the CPCRM brand name', () => {
    render(
      <MemoryRouter>
        <AppShell>
          <div>Page content</div>
        </AppShell>
      </MemoryRouter>,
    );

    expect(screen.getByText('CPCRM')).toBeInTheDocument();
  });

  it('renders the Dashboard navigation link in the top bar', () => {
    render(
      <MemoryRouter>
        <AppShell>
          <div>Page content</div>
        </AppShell>
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
  });

  it('renders the Admin navigation link in the top bar', () => {
    render(
      <MemoryRouter>
        <AppShell>
          <div>Page content</div>
        </AppShell>
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Admin' })).toBeInTheDocument();
  });

  it('renders Admin links inside the profile dropdown', async () => {
    render(
      <MemoryRouter>
        <AppShell>
          <div>Page content</div>
        </AppShell>
      </MemoryRouter>,
    );

    // Admin links not visible until dropdown is opened
    expect(screen.queryByRole('menuitem', { name: /Object manager/ })).not.toBeInTheDocument();

    // Open the profile dropdown
    await userEvent.click(screen.getByRole('button', { name: /User menu/ }));

    // Admin links visible in the dropdown
    expect(screen.getByRole('menuitem', { name: /Object manager/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Pipeline manager/ })).toBeInTheDocument();
  });

  it('renders My profile link inside the profile dropdown', async () => {
    render(
      <MemoryRouter>
        <AppShell>
          <div>Page content</div>
        </AppShell>
      </MemoryRouter>,
    );

    // Open the profile dropdown
    await userEvent.click(screen.getByRole('button', { name: /User menu/ }));

    const profileLink = screen.getByRole('menuitem', { name: /My profile/ });
    expect(profileLink).toBeInTheDocument();
    expect(profileLink).toHaveAttribute('href', '/settings/profile');
  });

  it('renders dynamic object tabs when API returns objects', async () => {
    mockFetchObjects([
      { apiName: 'account', pluralLabel: 'Accounts', icon: '🏢' },
      { apiName: 'opportunity', pluralLabel: 'Opportunities' },
    ]);

    render(
      <MemoryRouter>
        <AppShell>
          <div>Page content</div>
        </AppShell>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /Accounts/ })).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: /Opportunities/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Accounts/ })).toHaveAttribute('href', '/objects/account');
    expect(screen.getByRole('link', { name: /Opportunities/ })).toHaveAttribute('href', '/objects/opportunity');
  });

  it('renders the tab bar with object navigation role', async () => {
    mockFetchObjects([
      { apiName: 'account', pluralLabel: 'Accounts' },
    ]);

    render(
      <MemoryRouter>
        <AppShell>
          <div>Page content</div>
        </AppShell>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole('navigation', { name: 'Object navigation' })).toBeInTheDocument();
    });
  });

  it('renders child content in the main area', () => {
    render(
      <MemoryRouter>
        <AppShell>
          <div>Page content</div>
        </AppShell>
      </MemoryRouter>,
    );

    expect(screen.getByText('Page content')).toBeInTheDocument();
  });

  it('shows the authenticated user name in the profile dropdown', async () => {
    vi.mocked(useUser).mockReturnValue({
      user: { name: 'Alice', email: 'alice@example.com' },
      isUserLoading: false,
    } as unknown as ReturnType<typeof useUser>);

    render(
      <MemoryRouter>
        <AppShell>
          <div>Page content</div>
        </AppShell>
      </MemoryRouter>,
    );

    // Open the profile dropdown
    await userEvent.click(screen.getByRole('button', { name: /User menu for Alice/ }));

    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  it('falls back to email when user has no name', async () => {
    vi.mocked(useUser).mockReturnValue({
      user: { name: undefined, email: 'alice@example.com' },
      isUserLoading: false,
    } as unknown as ReturnType<typeof useUser>);

    render(
      <MemoryRouter>
        <AppShell>
          <div>Page content</div>
        </AppShell>
      </MemoryRouter>,
    );

    // Open the profile dropdown — the avatar label uses the email fallback
    await userEvent.click(screen.getByRole('button', { name: /User menu for alice@example.com/ }));

    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
  });

  it('calls logout, clears session history and stored tenant, and navigates to /login when sign out is clicked', async () => {
    render(
      <MemoryRouter>
        <AppShell>
          <div>Page content</div>
        </AppShell>
      </MemoryRouter>,
    );

    // Open the profile dropdown and click Sign out
    await userEvent.click(screen.getByRole('button', { name: /User menu/ }));
    await userEvent.click(screen.getByRole('menuitem', { name: /Sign out/ }));

    expect(mockLogout).toHaveBeenCalled();
    expect(sessionHistory.clearAuthenticated).toHaveBeenCalled();
    expect(clearStoredTenant).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('/login');
  });

  it('makes object tabs draggable', async () => {
    mockFetchObjects([
      { id: 'id-1', apiName: 'account', pluralLabel: 'Accounts', icon: '🏢' },
      { id: 'id-2', apiName: 'opportunity', pluralLabel: 'Opportunities' },
    ]);

    render(
      <MemoryRouter>
        <AppShell>
          <div>Page content</div>
        </AppShell>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /Accounts/ })).toBeInTheDocument();
    });

    const accountTab = screen.getByRole('link', { name: /Accounts/ });
    expect(accountTab).toHaveAttribute('draggable', 'true');
  });

  it('calls reorder API after drag and drop', async () => {
    const fetchSpy = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { id: 'id-1', apiName: 'account', pluralLabel: 'Accounts', icon: '🏢' },
          { id: 'id-2', apiName: 'opportunity', pluralLabel: 'Opportunities' },
        ],
      })
      .mockResolvedValueOnce({ ok: true });

    vi.stubGlobal('fetch', fetchSpy);

    render(
      <MemoryRouter>
        <AppShell>
          <div>Page content</div>
        </AppShell>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /Accounts/ })).toBeInTheDocument();
    });

    const accountTab = screen.getByRole('link', { name: /Accounts/ });
    const opportunityTab = screen.getByRole('link', { name: /Opportunities/ });

    // Use fireEvent which works with React's synthetic event system
    fireEvent.dragStart(accountTab);
    fireEvent.dragEnter(opportunityTab);
    fireEvent.dragOver(opportunityTab);
    fireEvent.drop(opportunityTab);

    // Wait for the reorder API call
    await waitFor(() => {
      const reorderCall = fetchSpy.mock.calls.find(
        (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('/reorder'),
      );
      expect(reorderCall).toBeDefined();
    });
  });

  it('displays the tenant name in the header when a tenant is selected', () => {
    vi.mocked(useTenant).mockReturnValue({ tenantId: 'T1', tenantName: 'Acme Corp' });

    render(
      <MemoryRouter>
        <AppShell>
          <div>Page content</div>
        </AppShell>
      </MemoryRouter>,
    );

    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    expect(screen.getByTitle('Switch organisation')).toBeInTheDocument();
  });

  it('does not display a tenant badge when no tenant is selected', () => {
    vi.mocked(useTenant).mockReturnValue({ tenantId: null, tenantName: null });

    render(
      <MemoryRouter>
        <AppShell>
          <div>Page content</div>
        </AppShell>
      </MemoryRouter>,
    );

    expect(screen.queryByTitle('Switch organisation')).not.toBeInTheDocument();
  });

  it('links the tenant badge to /select-tenant for switching', () => {
    vi.mocked(useTenant).mockReturnValue({ tenantId: 'T1', tenantName: 'Acme Corp' });

    render(
      <MemoryRouter>
        <AppShell>
          <div>Page content</div>
        </AppShell>
      </MemoryRouter>,
    );

    const badge = screen.getByTitle('Switch organisation');
    expect(badge).toHaveAttribute('href', '/select-tenant');
  });

  it('shows Platform link in the profile dropdown when user is a super-admin', async () => {
    vi.mocked(useSuperAdmin).mockReturnValue({ isSuperAdmin: true, loading: false });

    render(
      <MemoryRouter>
        <AppShell>
          <div>Page content</div>
        </AppShell>
      </MemoryRouter>,
    );

    // Open the profile dropdown
    await userEvent.click(screen.getByRole('button', { name: /User menu/ }));

    expect(screen.getByRole('menuitem', { name: /Tenant management/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Tenant management/ })).toHaveAttribute('href', '/platform/tenants');
  });

  it('does not show Platform link for non-super-admins', async () => {
    vi.mocked(useSuperAdmin).mockReturnValue({ isSuperAdmin: false, loading: false });

    render(
      <MemoryRouter>
        <AppShell>
          <div>Page content</div>
        </AppShell>
      </MemoryRouter>,
    );

    // Open the profile dropdown
    await userEvent.click(screen.getByRole('button', { name: /User menu/ }));

    expect(screen.queryByRole('menuitem', { name: /Tenant management/ })).not.toBeInTheDocument();
  });
});
