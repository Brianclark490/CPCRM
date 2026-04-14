import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DashboardPage } from '../pages/DashboardPage.js';

vi.mock('@descope/react-sdk', () => ({
  useUser: vi.fn(),
  useSession: vi.fn(),
}));

const { useUser, useSession } = await import('@descope/react-sdk');

function mockFetchCounts(opportunityTotal = 0, accountTotal = 0) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/api/v1/objects/opportunity')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            data: [],
            pagination: { total: opportunityTotal, limit: 1, offset: 0, hasMore: false },
          }),
        });
      }
      if (typeof url === 'string' && url.includes('/api/v1/objects/account')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            data: [],
            pagination: { total: accountTotal, limit: 1, offset: 0, hasMore: false },
          }),
        });
      }
      return Promise.resolve({ ok: false });
    }),
  );
}

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.mocked(useUser).mockReturnValue(
      { user: null, isUserLoading: false } as unknown as ReturnType<typeof useUser>,
    );
    vi.mocked(useSession).mockReturnValue({
      isAuthenticated: true,
      isSessionLoading: false,
      sessionToken: 'test-token',
      claims: {},
    });
    mockFetchCounts();
  });

  it('renders the dashboard heading', () => {
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('shows a welcome message with the user name', () => {
    vi.mocked(useUser).mockReturnValue({
      user: { name: 'Alice', email: 'alice@example.com' },
      isUserLoading: false,
    } as unknown as ReturnType<typeof useUser>);

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    expect(screen.getByText('Welcome, Alice')).toBeInTheDocument();
  });

  it('falls back to email when user has no name', () => {
    vi.mocked(useUser).mockReturnValue({
      user: { name: undefined, email: 'alice@example.com' },
      isUserLoading: false,
    } as unknown as ReturnType<typeof useUser>);

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    expect(screen.getByText('Welcome, alice@example.com')).toBeInTheDocument();
  });

  it('renders Quick Action links for New Opportunity and New Account', () => {
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    const newOppLink = screen.getByRole('link', { name: /New Opportunity/i });
    expect(newOppLink).toBeInTheDocument();
    expect(newOppLink).toHaveAttribute('href', '/objects/opportunity/new');

    const newAccLink = screen.getByRole('link', { name: /New Account/i });
    expect(newAccLink).toBeInTheDocument();
    expect(newAccLink).toHaveAttribute('href', '/objects/account/new');
  });

  it('updates stat counts after fetching record totals', async () => {
    mockFetchCounts(12, 7);

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('12')).toBeInTheDocument();
    });
    expect(screen.getByText('7')).toBeInTheDocument();
  });
});

