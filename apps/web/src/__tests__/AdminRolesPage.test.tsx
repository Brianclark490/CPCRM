import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AdminRolesPage } from '../pages/AdminRolesPage.js';

vi.mock('@descope/react-sdk', () => ({
  useSession: vi.fn(),
  RoleManagement: ({ tenant, widgetId }: { tenant: string; widgetId: string }) => (
    <div data-testid="role-management-widget" data-tenant={tenant} data-widget-id={widgetId} />
  ),
}));

vi.mock('../store/tenant.js', () => ({
  useTenant: vi.fn(),
}));

const { useTenant } = await import('../store/tenant.js');

describe('AdminRolesPage', () => {
  beforeEach(() => {
    vi.mocked(useTenant).mockReturnValue({ tenantId: 'T_ACME', tenantName: 'Acme Corp' });
  });

  it('renders the page heading', () => {
    render(
      <MemoryRouter>
        <AdminRolesPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Roles' })).toBeInTheDocument();
  });

  it('renders the subtitle', () => {
    render(
      <MemoryRouter>
        <AdminRolesPage />
      </MemoryRouter>,
    );

    expect(
      screen.getByText('Manage roles and permissions for your organisation'),
    ).toBeInTheDocument();
  });

  it('renders the Descope RoleManagement widget with the tenant ID', () => {
    render(
      <MemoryRouter>
        <AdminRolesPage />
      </MemoryRouter>,
    );

    const widget = screen.getByTestId('role-management-widget');
    expect(widget).toBeInTheDocument();
    expect(widget).toHaveAttribute('data-tenant', 'T_ACME');
    expect(widget).toHaveAttribute('data-widget-id', 'role-management-widget');
  });

  it('shows a message when no tenant is selected', () => {
    vi.mocked(useTenant).mockReturnValue({ tenantId: null, tenantName: null });

    render(
      <MemoryRouter>
        <AdminRolesPage />
      </MemoryRouter>,
    );

    expect(
      screen.getByText('No organisation selected. Please select an organisation first.'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('role-management-widget')).not.toBeInTheDocument();
  });
});
