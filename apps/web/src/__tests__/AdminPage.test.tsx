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

  it('renders a link to the Object Manager', () => {
    renderPage();

    const link = screen.getByRole('link', { name: 'Object Manager' });
    expect(link).toHaveAttribute('href', '/admin/objects');
  });

  it('renders a link to the Pipeline Manager', () => {
    renderPage();

    const link = screen.getByRole('link', { name: 'Pipeline Manager' });
    expect(link).toHaveAttribute('href', '/admin/pipelines');
  });

  it('renders a link to User Management', () => {
    renderPage();

    const link = screen.getByRole('link', { name: 'User Management' });
    expect(link).toHaveAttribute('href', '/admin/users');
  });

  it('renders a link to Roles when user is a super-admin', () => {
    vi.mocked(useSuperAdmin).mockReturnValue({ isSuperAdmin: true, loading: false });

    renderPage();

    const link = screen.getByRole('link', { name: 'Roles' });
    expect(link).toHaveAttribute('href', '/admin/roles');
  });

  it('does not render a link to Roles when user is not a super-admin', () => {
    vi.mocked(useSuperAdmin).mockReturnValue({ isSuperAdmin: false, loading: false });

    renderPage();

    expect(screen.queryByRole('link', { name: 'Roles' })).not.toBeInTheDocument();
  });
});
