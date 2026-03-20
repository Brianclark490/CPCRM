import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AdminUsersPage } from '../pages/AdminUsersPage.js';

vi.mock('@descope/react-sdk', () => ({
  useSession: vi.fn(),
  UserManagement: ({ tenant, widgetId }: { tenant: string; widgetId: string }) => (
    <div data-testid="user-management-widget" data-tenant={tenant} data-widget-id={widgetId} />
  ),
}));

vi.mock('../store/tenant.js', () => ({
  useTenant: vi.fn(),
}));

const { useTenant } = await import('../store/tenant.js');

describe('AdminUsersPage', () => {
  beforeEach(() => {
    vi.mocked(useTenant).mockReturnValue({ tenantId: 'T_ACME', tenantName: 'Acme Corp' });
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
});
