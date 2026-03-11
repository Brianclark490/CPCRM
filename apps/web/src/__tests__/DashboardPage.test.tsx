import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { DashboardPage } from '../pages/DashboardPage.js';

const mockNavigate = vi.fn();
const mockLogout = vi.fn();

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('@descope/react-sdk', () => ({
  useUser: vi.fn(),
  useDescope: vi.fn(),
}));

vi.mock('../store/sessionHistory.js', () => ({
  sessionHistory: {
    subscribe: vi.fn(() => vi.fn()),
    getSnapshot: vi.fn(() => false),
    markAuthenticated: vi.fn(),
    clearAuthenticated: vi.fn(),
  },
}));

const { useUser, useDescope } = await import('@descope/react-sdk');
const { sessionHistory } = await import('../store/sessionHistory.js');

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.mocked(useDescope).mockReturnValue(
      { logout: mockLogout } as unknown as ReturnType<typeof useDescope>,
    );
    mockLogout.mockResolvedValue(undefined);
    mockNavigate.mockReset();
  });

  it('renders the dashboard heading', () => {
    vi.mocked(useUser).mockReturnValue(
      { user: null, isUserLoading: false } as unknown as ReturnType<typeof useUser>,
    );

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

  it('calls logout, clears session history, and navigates to /login when sign out is clicked', async () => {
    vi.mocked(useUser).mockReturnValue(
      { user: null, isUserLoading: false } as unknown as ReturnType<typeof useUser>,
    );

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(mockLogout).toHaveBeenCalled();
    expect(sessionHistory.clearAuthenticated).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('/login');
  });
});
