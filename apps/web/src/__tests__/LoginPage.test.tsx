import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { LoginPage } from '../pages/LoginPage.js';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('@descope/react-sdk', () => ({
  Descope: ({
    flowId,
    theme,
    onSuccess,
    onError,
  }: {
    flowId: string;
    theme?: string;
    onSuccess: () => void;
    onError: (e: CustomEvent) => void;
  }) => (
    <div data-testid="descope-widget" data-theme={theme}>
      <span data-testid="descope-flow-id">{flowId}</span>
      <button onClick={onSuccess}>Simulate success</button>
      <button onClick={() => onError(new CustomEvent('error', { detail: 'login failed' }))}>
        Simulate error
      </button>
    </div>
  ),
  useSession: vi.fn(),
}));

vi.mock('../store/sessionHistory.js', () => ({
  sessionHistory: {
    subscribe: vi.fn(() => vi.fn()),
    getSnapshot: vi.fn(() => false),
    markAuthenticated: vi.fn(),
    clearAuthenticated: vi.fn(),
  },
}));

const { useSession } = await import('@descope/react-sdk');
const { sessionHistory } = await import('../store/sessionHistory.js');

describe('LoginPage', () => {
  beforeEach(() => {
    vi.mocked(useSession).mockReturnValue({
      isAuthenticated: false,
      isSessionLoading: false,
      sessionToken: '',
      claims: {},
    });
  });

  it('renders the heading and Descope flow', () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    expect(screen.getByText('Sign in to CPCRM')).toBeInTheDocument();
    expect(screen.getByTestId('descope-flow-id')).toHaveTextContent('sign-up-or-in');
  });

  it('passes theme="dark" to the Descope widget', () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    expect(screen.getByTestId('descope-widget')).toHaveAttribute('data-theme', 'dark');
  });

  it('marks session as authenticated and navigates to /select-tenant on successful login', () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    screen.getByText('Simulate success').click();

    expect(sessionHistory.markAuthenticated).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('/select-tenant');
  });

  it('logs an error when login fails', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    screen.getByText('Simulate error').click();

    expect(consoleSpy).toHaveBeenCalledWith('Descope login error:', 'login failed');

    consoleSpy.mockRestore();
  });

  it('shows a session expired message when redirected with session_expired reason', () => {
    render(
      <MemoryRouter initialEntries={[{ pathname: '/login', state: { reason: 'session_expired' } }]}>
        <LoginPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Your session has expired. Please sign in again.',
    );
  });

  it('does not show session expired message on a normal visit', () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('redirects to /dashboard when already authenticated', () => {
    vi.mocked(useSession).mockReturnValue({
      isAuthenticated: true,
      isSessionLoading: false,
      sessionToken: 'valid_token',
      claims: {},
    });

    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/dashboard" element={<div>Dashboard</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.queryByText('Sign in to CPCRM')).not.toBeInTheDocument();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });
});
