import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ProtectedRoute } from '../components/ProtectedRoute.js';

vi.mock('@descope/react-sdk', () => ({
  useSession: vi.fn(),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../store/sessionHistory.js', () => ({
  sessionHistory: {
    subscribe: vi.fn(() => vi.fn()),
    getSnapshot: vi.fn(),
    markAuthenticated: vi.fn(),
    clearAuthenticated: vi.fn(),
  },
}));

const { useSession } = await import('@descope/react-sdk');
const { sessionHistory } = await import('../store/sessionHistory.js');

function LoginSpy({ onState }: { onState: (s: unknown) => void }) {
  const location = useLocation();
  onState(location.state ?? undefined);
  return <div>Login page</div>;
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    vi.mocked(sessionHistory.getSnapshot).mockReturnValue(false);
  });

  it('shows loading indicator while session is loading', () => {
    vi.mocked(useSession).mockReturnValue({
      isAuthenticated: false,
      isSessionLoading: true,
      sessionToken: '',
      claims: {},
    });

    render(
      <MemoryRouter>
        <ProtectedRoute>
          <div>Protected content</div>
        </ProtectedRoute>
      </MemoryRouter>,
    );

    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
  });

  it('redirects to /login when not authenticated', () => {
    vi.mocked(useSession).mockReturnValue({
      isAuthenticated: false,
      isSessionLoading: false,
      sessionToken: '',
      claims: {},
    });

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <div>Protected content</div>
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<div>Login page</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
    expect(screen.getByText('Login page')).toBeInTheDocument();
  });

  it('renders children when authenticated', () => {
    vi.mocked(useSession).mockReturnValue({
      isAuthenticated: true,
      isSessionLoading: false,
      sessionToken: 'valid_token',
      claims: {},
    });

    render(
      <MemoryRouter>
        <ProtectedRoute>
          <div>Protected content</div>
        </ProtectedRoute>
      </MemoryRouter>,
    );

    expect(screen.getByText('Protected content')).toBeInTheDocument();
  });

  it('redirects without session_expired state when user was never authenticated', () => {
    let capturedState: unknown;

    vi.mocked(useSession).mockReturnValue({
      isAuthenticated: false,
      isSessionLoading: false,
      sessionToken: '',
      claims: {},
    });
    vi.mocked(sessionHistory.getSnapshot).mockReturnValue(false);

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <div>Protected content</div>
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<LoginSpy onState={(s) => { capturedState = s; }} />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(capturedState).toBeUndefined();
  });

  it('redirects with session_expired state when the session has expired', () => {
    let capturedState: unknown;

    vi.mocked(useSession).mockReturnValue({
      isAuthenticated: false,
      isSessionLoading: false,
      sessionToken: '',
      claims: {},
    });
    vi.mocked(sessionHistory.getSnapshot).mockReturnValue(true);

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <div>Protected content</div>
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<LoginSpy onState={(s) => { capturedState = s; }} />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(capturedState).toEqual({ reason: 'session_expired' });
  });
});
