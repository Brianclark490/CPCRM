import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DashboardPage } from '../pages/DashboardPage.js';

vi.mock('@descope/react-sdk', () => ({
  useUser: vi.fn(),
}));

const { useUser } = await import('@descope/react-sdk');

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.mocked(useUser).mockReturnValue(
      { user: null, isUserLoading: false } as unknown as ReturnType<typeof useUser>,
    );
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
});

