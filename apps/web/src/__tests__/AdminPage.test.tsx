import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AdminPage } from '../pages/AdminPage.js';

vi.mock('../store/superAdmin.js', () => ({
  useSuperAdmin: vi.fn(),
}));

const { useSuperAdmin } = await import('../store/superAdmin.js');

function renderPage() {
  return render(
    <MemoryRouter>
      <AdminPage />
    </MemoryRouter>,
  );
}

describe('AdminPage', () => {
  beforeEach(() => {
    vi.mocked(useSuperAdmin).mockReturnValue({ isSuperAdmin: false, loading: false });
  });

  it('renders the admin heading', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: 'Admin' })).toBeInTheDocument();
  });

  it('renders the subtitle', () => {
    renderPage();

    expect(
      screen.getByText('Configure your workspace and manage users'),
    ).toBeInTheDocument();
  });

  it('renders a card linking to the Object Manager', () => {
    renderPage();

    const link = screen.getByRole('link', { name: /Object manager/i });
    expect(link).toHaveAttribute('href', '/admin/objects');
    expect(screen.getByText('Objects, fields, layouts, relationships')).toBeInTheDocument();
  });

  it('renders a card linking to the Pipeline Manager', () => {
    renderPage();

    const link = screen.getByRole('link', { name: /Pipeline manager/i });
    expect(link).toHaveAttribute('href', '/admin/pipelines');
    expect(screen.getByText('Pipelines, stages, gates, probabilities')).toBeInTheDocument();
  });

  it('renders a card linking to User Management', () => {
    renderPage();

    const link = screen.getByRole('link', { name: /User management/i });
    expect(link).toHaveAttribute('href', '/admin/users');
    expect(screen.getByText('Invite users, assign roles, deactivate')).toBeInTheDocument();
  });

  it('renders a card linking to Audit Log', () => {
    renderPage();

    const link = screen.getByRole('link', { name: /Audit log/i });
    expect(link).toHaveAttribute('href', '/admin/audit');
    expect(screen.getByText('Login history, role changes, data access')).toBeInTheDocument();
  });

  it('renders a card linking to Tenant Settings', () => {
    renderPage();

    const link = screen.getByRole('link', { name: /Tenant settings/i });
    expect(link).toHaveAttribute('href', '/admin/settings');
    expect(screen.getByText('Company name, branding, defaults')).toBeInTheDocument();
  });

  it('renders a card linking to Roles when user is a super-admin', () => {
    vi.mocked(useSuperAdmin).mockReturnValue({ isSuperAdmin: true, loading: false });

    renderPage();

    const link = screen.getByRole('link', { name: /Roles and permissions/i });
    expect(link).toHaveAttribute('href', '/admin/roles');
    expect(screen.getByText('Manage roles and permission assignments')).toBeInTheDocument();
  });

  it('does not render the Roles card when user is not a super-admin', () => {
    vi.mocked(useSuperAdmin).mockReturnValue({ isSuperAdmin: false, loading: false });

    renderPage();

    expect(screen.queryByRole('link', { name: /Roles and permissions/i })).not.toBeInTheDocument();
  });

  it('renders 5 cards for non-super-admin users', () => {
    vi.mocked(useSuperAdmin).mockReturnValue({ isSuperAdmin: false, loading: false });

    renderPage();

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(5);
  });

  it('renders 6 cards for super-admin users', () => {
    vi.mocked(useSuperAdmin).mockReturnValue({ isSuperAdmin: true, loading: false });

    renderPage();

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(6);
  });
});
