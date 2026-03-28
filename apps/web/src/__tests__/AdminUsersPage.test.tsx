import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AdminUsersPage } from '../pages/AdminUsersPage.js';

vi.mock('@descope/react-sdk', () => ({
  useSession: vi.fn(),
  UserManagement: ({ tenant, widgetId, theme }: { tenant: string; widgetId: string; theme?: string }) => (
    <div data-testid="user-management-widget" data-tenant={tenant} data-widget-id={widgetId} data-theme={theme} />
  ),
}));

vi.mock('../store/tenant.js', () => ({
  useTenant: vi.fn(),
}));

const { useSession } = await import('@descope/react-sdk');
const { useTenant } = await import('../store/tenant.js');

describe('AdminUsersPage', () => {
  beforeEach(() => {
    vi.mocked(useTenant).mockReturnValue({ tenantId: 'T_ACME', tenantName: 'Acme Corp' });
    vi.mocked(useSession).mockReturnValue({
      isAuthenticated: true,
      isSessionLoading: false,
      sessionToken: 'test-token',
      claims: {},
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [], total: 0 }),
    } as Response));
  });

  it('renders the page heading', () => {
    render(
      <MemoryRouter>
        <AdminUsersPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'User management' })).toBeInTheDocument();
  });

  it('renders the subtitle', () => {
    render(
      <MemoryRouter>
        <AdminUsersPage />
      </MemoryRouter>,
    );

    expect(
      screen.getByText('Invite, manage, and remove users in your organisation'),
    ).toBeInTheDocument();
  });

  it('renders the Descope UserManagement widget with the tenant ID', () => {
    render(
      <MemoryRouter>
        <AdminUsersPage />
      </MemoryRouter>,
    );

    const widget = screen.getByTestId('user-management-widget');
    expect(widget).toBeInTheDocument();
    expect(widget).toHaveAttribute('data-tenant', 'T_ACME');
    expect(widget).toHaveAttribute('data-widget-id', 'user-management-widget');
  });

  it('passes theme="dark" to the UserManagement widget', () => {
    render(
      <MemoryRouter>
        <AdminUsersPage />
      </MemoryRouter>,
    );

    expect(screen.getByTestId('user-management-widget')).toHaveAttribute('data-theme', 'dark');
  });

  it('shows a message when no tenant is selected', () => {
    vi.mocked(useTenant).mockReturnValue({ tenantId: null, tenantName: null });

    render(
      <MemoryRouter>
        <AdminUsersPage />
      </MemoryRouter>,
    );

    expect(
      screen.getByText('No organisation selected. Please select an organisation first.'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('user-management-widget')).not.toBeInTheDocument();
  });

  it('renders the CRM users section heading', () => {
    render(
      <MemoryRouter>
        <AdminUsersPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'CRM users' })).toBeInTheDocument();
  });

  it('renders the authentication management section heading', () => {
    render(
      <MemoryRouter>
        <AdminUsersPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Authentication management' })).toBeInTheDocument();
  });

  it('shows empty state when no CRM users exist', async () => {
    render(
      <MemoryRouter>
        <AdminUsersPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(
        screen.getByText('No CRM user records yet. Users are created automatically when they log in.'),
      ).toBeInTheDocument();
    });
  });

  it('renders CRM user rows when users exist', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            id: 'user-1',
            name: 'Alice Smith',
            fieldValues: { email: 'alice@example.com', role: 'admin', job_title: 'CEO', is_active: true },
          },
          {
            id: 'user-2',
            name: 'Bob Jones',
            fieldValues: { email: 'bob@example.com', role: 'user', job_title: '', is_active: false },
          },
        ],
        total: 2,
      }),
    } as Response));

    render(
      <MemoryRouter>
        <AdminUsersPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    });
    expect(screen.getByText('Bob Jones')).toBeInTheDocument();
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Inactive')).toBeInTheDocument();
  });

  it('renders user name as link to record detail', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            id: 'user-1',
            name: 'Alice Smith',
            fieldValues: { email: 'alice@example.com', role: 'admin', is_active: true },
          },
        ],
        total: 1,
      }),
    } as Response));

    render(
      <MemoryRouter>
        <AdminUsersPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      const link = screen.getByRole('link', { name: 'Alice Smith' });
      expect(link).toHaveAttribute('href', '/objects/user/user-1');
    });
  });
});
