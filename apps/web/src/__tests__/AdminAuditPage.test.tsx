import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AdminAuditPage } from '../pages/AdminAuditPage.js';

vi.mock('@descope/react-sdk', () => ({
  useSession: vi.fn(),
  AuditManagement: ({ tenant, widgetId, theme }: { tenant: string; widgetId: string; theme?: string }) => (
    <div data-testid="audit-management-widget" data-tenant={tenant} data-widget-id={widgetId} data-theme={theme} />
  ),
}));

vi.mock('../store/tenant.js', () => ({
  useTenant: vi.fn(),
}));

const { useTenant } = await import('../store/tenant.js');

describe('AdminAuditPage', () => {
  beforeEach(() => {
    vi.mocked(useTenant).mockReturnValue({ tenantId: 'T_ACME', tenantName: 'Acme Corp' });
  });

  it('renders the page heading', () => {
    render(
      <MemoryRouter>
        <AdminAuditPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Audit log' })).toBeInTheDocument();
  });

  it('renders the subtitle', () => {
    render(
      <MemoryRouter>
        <AdminAuditPage />
      </MemoryRouter>,
    );

    expect(
      screen.getByText('Login history, role changes, and data access events'),
    ).toBeInTheDocument();
  });

  it('renders the Descope AuditManagement widget with the tenant ID', () => {
    render(
      <MemoryRouter>
        <AdminAuditPage />
      </MemoryRouter>,
    );

    const widget = screen.getByTestId('audit-management-widget');
    expect(widget).toBeInTheDocument();
    expect(widget).toHaveAttribute('data-tenant', 'T_ACME');
    expect(widget).toHaveAttribute('data-widget-id', 'audit-management-widget');
  });

  it('passes theme="dark" to the AuditManagement widget', () => {
    render(
      <MemoryRouter>
        <AdminAuditPage />
      </MemoryRouter>,
    );

    expect(screen.getByTestId('audit-management-widget')).toHaveAttribute('data-theme', 'dark');
  });

  it('shows a message when no tenant is selected', () => {
    vi.mocked(useTenant).mockReturnValue({ tenantId: null, tenantName: null });

    render(
      <MemoryRouter>
        <AdminAuditPage />
      </MemoryRouter>,
    );

    expect(
      screen.getByText('No organisation selected. Please select an organisation first.'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('audit-management-widget')).not.toBeInTheDocument();
  });
});
