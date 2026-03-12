import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { OpportunitiesPage } from '../pages/OpportunitiesPage.js';

vi.mock('@descope/react-sdk', () => ({
  useSession: vi.fn(),
}));

const { useSession } = await import('@descope/react-sdk');

function renderPage() {
  return render(
    <MemoryRouter>
      <OpportunitiesPage />
    </MemoryRouter>,
  );
}

describe('OpportunitiesPage', () => {
  beforeEach(() => {
    vi.mocked(useSession).mockReturnValue({
      isAuthenticated: true,
      isSessionLoading: false,
      sessionToken: 'test-token',
      claims: {},
    });
    vi.stubGlobal('fetch', vi.fn());
  });

  it('renders the opportunities heading', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => [],
    } as Response);

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Opportunities' })).toBeInTheDocument();
    });
  });

  it('renders a "New opportunity" button that links to /opportunities/new', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => [],
    } as Response);

    renderPage();

    // heading + button should be present before and after the async load
    expect(screen.getByRole('heading', { name: 'Opportunities' })).toBeInTheDocument();

    await waitFor(() => {
      const link = screen.getByRole('link');
      expect(link).toHaveAttribute('href', '/opportunities/new');
    });
    expect(screen.getByRole('button', { name: 'New opportunity' })).toBeInTheDocument();
  });

  it('shows the empty state when there are no opportunities', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => [],
    } as Response);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('No opportunities yet.')).toBeInTheDocument();
    });
  });

  it('renders a list of opportunities when data is returned', async () => {
    const now = new Date().toISOString();
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: 'opp-1',
          title: 'New Partnership Deal',
          accountId: 'account-uuid',
          stage: 'prospecting',
          updatedAt: now,
        },
      ],
    } as Response);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('New Partnership Deal')).toBeInTheDocument();
    });
    expect(screen.getByText('Prospecting')).toBeInTheDocument();
  });

  it('shows an error message when the fetch fails', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Server error' }),
    } as Response);

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Failed to load opportunities.');
    });
  });
});
