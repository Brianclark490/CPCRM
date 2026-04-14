import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { PlatformTenantsPage } from '../pages/PlatformTenantsPage.js';

vi.mock('@descope/react-sdk', () => ({
  useSession: vi.fn(),
}));

const { useSession } = await import('@descope/react-sdk');

function renderPage() {
  return render(
    <MemoryRouter>
      <PlatformTenantsPage />
    </MemoryRouter>,
  );
}

function mockFetchSuccess(data: { tenants: unknown[]; total: number }) {
  vi.mocked(fetch).mockResolvedValue({
    ok: true,
    json: async () => ({
      data: data.tenants,
      pagination: {
        total: data.total,
        limit: 50,
        offset: 0,
        hasMore: false,
      },
    }),
  } as Response);
}

const sampleTenants = {
  tenants: [
    {
      id: 'acme-corp',
      name: 'Acme Corporation',
      slug: 'acme-corp',
      status: 'active',
      plan: 'pro',
      created_at: '2025-01-15T10:00:00Z',
    },
    {
      id: 'beta-inc',
      name: 'Beta Inc',
      slug: 'beta-inc',
      status: 'suspended',
      plan: 'free',
      created_at: '2025-02-20T10:00:00Z',
    },
  ],
  total: 2,
};

describe('PlatformTenantsPage', () => {
  beforeEach(() => {
    vi.mocked(useSession).mockReturnValue({
      isAuthenticated: true,
      isSessionLoading: false,
      sessionToken: 'test-token',
      claims: {},
    });
    vi.stubGlobal('fetch', vi.fn());
  });

  it('renders the page heading', async () => {
    mockFetchSuccess({ tenants: [], total: 0 });
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Tenant Management' })).toBeInTheDocument();
    });
  });

  it('renders a "Create tenant" button', async () => {
    mockFetchSuccess({ tenants: [], total: 0 });
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Create tenant/ })).toBeInTheDocument();
    });
  });

  it('shows empty state when there are no tenants', async () => {
    mockFetchSuccess({ tenants: [], total: 0 });
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('No tenants yet')).toBeInTheDocument();
    });
  });

  it('renders a table of tenants when data is returned', async () => {
    mockFetchSuccess(sampleTenants);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Acme Corporation')).toBeInTheDocument();
    });
    expect(screen.getByText('Beta Inc')).toBeInTheDocument();
    expect(screen.getByText('acme-corp')).toBeInTheDocument();
    expect(screen.getByText('beta-inc')).toBeInTheDocument();
  });

  it('shows status badges with correct text', async () => {
    mockFetchSuccess(sampleTenants);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('active')).toBeInTheDocument();
    });
    expect(screen.getByText('suspended')).toBeInTheDocument();
  });

  it('shows plan badges', async () => {
    mockFetchSuccess(sampleTenants);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('pro')).toBeInTheDocument();
    });
    expect(screen.getByText('free')).toBeInTheDocument();
  });

  it('shows an error message when the fetch fails', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Server error' }),
    } as Response);

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Failed to load tenants.');
    });
  });

  it('opens the create modal when "Create tenant" button is clicked', async () => {
    mockFetchSuccess({ tenants: [], total: 0 });
    const user = userEvent.setup();

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Create tenant/ })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Create tenant/ }));

    expect(screen.getByRole('dialog', { name: 'Create tenant' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Tenant name/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Slug/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Admin email/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Admin name/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Plan/)).toBeInTheDocument();
  });

  it('auto-generates slug from tenant name', async () => {
    mockFetchSuccess({ tenants: [], total: 0 });
    const user = userEvent.setup();

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Create tenant/ })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Create tenant/ }));

    const nameInput = screen.getByLabelText(/Tenant name/);
    await user.type(nameInput, 'Acme Corporation');

    const slugInput = screen.getByLabelText(/Slug/) as HTMLInputElement;
    expect(slugInput.value).toBe('acme-corporation');
  });

  it('validates required fields in the create modal', async () => {
    mockFetchSuccess({ tenants: [], total: 0 });
    const user = userEvent.setup();

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Create tenant/ })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Create tenant/ }));

    const submitButton = screen.getByRole('button', { name: /Create and invite/ });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Tenant name is required')).toBeInTheDocument();
    });
  });

  it('closes create modal when cancel is clicked', async () => {
    mockFetchSuccess({ tenants: [], total: 0 });
    const user = userEvent.setup();

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Create tenant/ })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Create tenant/ }));
    expect(screen.getByRole('dialog', { name: 'Create tenant' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog', { name: 'Create tenant' })).not.toBeInTheDocument();
  });

  it('links tenant names to detail page', async () => {
    mockFetchSuccess(sampleTenants);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Acme Corporation')).toBeInTheDocument();
    });

    const link = screen.getByRole('link', { name: 'Acme Corporation' });
    expect(link).toHaveAttribute('href', '/platform/tenants/acme-corp');
  });
});
