import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AccountsPage } from '../pages/AccountsPage.js';

vi.mock('@descope/react-sdk', () => ({
  useSession: vi.fn(),
}));

const { useSession } = await import('@descope/react-sdk');

function renderPage() {
  return render(
    <MemoryRouter>
      <AccountsPage />
    </MemoryRouter>,
  );
}

function mockFetchSuccess(data: unknown[] = [], total = 0) {
  vi.mocked(fetch).mockResolvedValue({
    ok: true,
    json: async () => ({
      data,
      pagination: { total, limit: 20, offset: 0, hasMore: total > data.length },
    }),
  } as Response);
}

describe('AccountsPage', () => {
  beforeEach(() => {
    vi.mocked(useSession).mockReturnValue({
      isAuthenticated: true,
      isSessionLoading: false,
      sessionToken: 'test-token',
      claims: {},
    });
    vi.stubGlobal('fetch', vi.fn());
  });

  it('renders the accounts heading', async () => {
    mockFetchSuccess();
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Accounts' })).toBeInTheDocument();
    });
  });

  it('renders a "New account" button that links to /accounts/new', async () => {
    mockFetchSuccess();
    renderPage();

    expect(screen.getByRole('heading', { name: 'Accounts' })).toBeInTheDocument();

    await waitFor(() => {
      const link = screen.getByRole('link', { name: /New account/i });
      expect(link).toHaveAttribute('href', '/accounts/new');
    });
    expect(screen.getByRole('button', { name: 'New account' })).toBeInTheDocument();
  });

  it('shows the empty state when there are no accounts', async () => {
    mockFetchSuccess();
    renderPage();

    await waitFor(() => {
      expect(
        screen.getByText('No accounts yet — create your first one'),
      ).toBeInTheDocument();
    });
  });

  it('renders a list of accounts when data is returned', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            id: 'acc-1',
            name: 'Acme Corp',
            industry: 'Technology',
            phone: '+1 555-0100',
            email: 'info@acme.com',
            city: 'Seattle',
            opportunityCount: 3,
          },
        ],
        pagination: { total: 1, limit: 20, offset: 0, hasMore: false },
      }),
    } as Response);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    });
    expect(screen.getByText('Technology')).toBeInTheDocument();
    expect(screen.getByText('+1 555-0100')).toBeInTheDocument();
    expect(screen.getByText('info@acme.com')).toBeInTheDocument();
    expect(screen.getByText('Seattle')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('shows an error message when the fetch fails', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Server error' }),
    } as Response);

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Failed to load accounts.');
    });
  });

  it('renders a search input', async () => {
    mockFetchSuccess();
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('searchbox', { name: 'Search accounts' })).toBeInTheDocument();
    });
  });

  it('calls API with search parameter after debounce', async () => {
    mockFetchSuccess();
    const user = userEvent.setup();

    renderPage();

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    const searchInput = screen.getByRole('searchbox', { name: 'Search accounts' });
    await user.type(searchInput, 'acme');

    // Wait for debounce to trigger
    await waitFor(
      () => {
        const calls = vi.mocked(fetch).mock.calls;
        const lastCall = calls[calls.length - 1];
        expect(String(lastCall[0])).toContain('search=acme');
      },
      { timeout: 1000 },
    );
  });

  it('shows pagination controls when there are multiple pages', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: Array.from({ length: 20 }, (_, i) => ({
          id: `acc-${i}`,
          name: `Account ${i}`,
          opportunityCount: 0,
        })),
        pagination: { total: 45, limit: 20, offset: 0, hasMore: true },
      }),
    } as Response);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeEnabled();
  });

  it('navigates to account detail when row name link is clicked', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            id: 'acc-42',
            name: 'Contoso Ltd',
            opportunityCount: 1,
          },
        ],
        pagination: { total: 1, limit: 20, offset: 0, hasMore: false },
      }),
    } as Response);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Contoso Ltd')).toBeInTheDocument();
    });

    const link = screen.getByRole('link', { name: 'Contoso Ltd' });
    expect(link).toHaveAttribute('href', '/accounts/acc-42');
  });
});

