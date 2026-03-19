import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PlatformTenantDetailPage } from '../pages/PlatformTenantDetailPage.js';

vi.mock('@descope/react-sdk', () => ({
  useSession: vi.fn(),
}));

const { useSession } = await import('@descope/react-sdk');

const sampleTenant = {
  id: 'acme-corp',
  name: 'Acme Corporation',
  slug: 'acme-corp',
  status: 'active',
  plan: 'pro',
  settings: {},
  created_at: '2025-01-15T10:00:00Z',
  updated_at: '2025-01-15T10:00:00Z',
  userCount: 3,
};

const sampleUsers = [
  {
    userId: 'U1',
    loginId: 'admin@acme.com',
    email: 'admin@acme.com',
    name: 'John Smith',
    roles: ['admin'],
    status: 'enabled',
    lastLogin: null,
  },
  {
    userId: 'U2',
    loginId: 'user@acme.com',
    email: 'user@acme.com',
    name: 'Jane Doe',
    roles: ['user'],
    status: 'enabled',
    lastLogin: null,
  },
];

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/platform/tenants/acme-corp']}>
      <Routes>
        <Route path="/platform/tenants/:id" element={<PlatformTenantDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('PlatformTenantDetailPage', () => {
  beforeEach(() => {
    vi.mocked(useSession).mockReturnValue({
      isAuthenticated: true,
      isSessionLoading: false,
      sessionToken: 'test-token',
      claims: {},
    });
    vi.stubGlobal('fetch', vi.fn());
  });

  it('renders tenant details after loading', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => sampleTenant,
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => sampleUsers,
      } as Response);

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Acme Corporation' })).toBeInTheDocument();
    });

    expect(screen.getByText('acme-corp')).toBeInTheDocument();
    expect(screen.getByText('active')).toBeInTheDocument();
    expect(screen.getByText('pro')).toBeInTheDocument();
  });

  it('shows back link to tenants list', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => sampleTenant,
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      } as Response);

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /Back to tenants/ })).toBeInTheDocument();
    });

    expect(screen.getByRole('link', { name: /Back to tenants/ })).toHaveAttribute(
      'href',
      '/platform/tenants',
    );
  });

  it('shows user list when users are returned', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => sampleTenant,
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => sampleUsers,
      } as Response);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('John Smith')).toBeInTheDocument();
    });

    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(screen.getByText('admin@acme.com')).toBeInTheDocument();
    expect(screen.getByText('user@acme.com')).toBeInTheDocument();
  });

  it('shows suspend button for active tenants', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => sampleTenant,
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      } as Response);

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Suspend tenant/ })).toBeInTheDocument();
    });
  });

  it('shows reactivate button for suspended tenants', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ...sampleTenant, status: 'suspended' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      } as Response);

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Reactivate tenant/ })).toBeInTheDocument();
    });
  });

  it('shows danger zone with delete button', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => sampleTenant,
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      } as Response);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Danger Zone')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /Delete tenant/ })).toBeInTheDocument();
  });

  it('shows invite user button', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => sampleTenant,
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      } as Response);

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Invite user/ })).toBeInTheDocument();
    });
  });

  it('opens invite modal when invite user button is clicked', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => sampleTenant,
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      } as Response);

    const user = userEvent.setup();

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Invite user/ })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Invite user/ }));

    expect(screen.getByRole('dialog', { name: 'Invite user' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Email/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Name/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Role/)).toBeInTheDocument();
  });

  it('opens delete modal when delete tenant button is clicked', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => sampleTenant,
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      } as Response);

    const user = userEvent.setup();

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Delete tenant/ })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Delete tenant/ }));

    expect(screen.getByRole('dialog', { name: 'Delete tenant' })).toBeInTheDocument();
    expect(screen.getByText(/Are you sure you want to delete/)).toBeInTheDocument();
  });

  it('shows error when tenant is not found', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: 'Not found' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      } as Response);

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Tenant not found.');
    });
  });
});
