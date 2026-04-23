import { type ReactElement } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { RouteErrorBoundary } from '../components/RouteErrorBoundary.js';

vi.mock('@descope/react-sdk', () => ({
  useUser: vi.fn(() => ({ user: { userId: 'user-1', email: 'alice@example.com' } })),
  useSession: vi.fn(() => ({ sessionToken: null, isAuthenticated: true, isSessionLoading: false })),
}));

vi.mock('../store/tenant.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../store/tenant.js')>();
  return {
    ...actual,
    useTenant: vi.fn(() => ({ tenantId: 'tenant-1', tenantName: 'Acme' })),
  };
});

vi.mock('../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const { logger } = await import('../lib/logger.js');

function Thrower({ shouldThrow, message = 'boom' }: { shouldThrow: boolean; message?: string }) {
  if (shouldThrow) {
    throw new Error(message);
  }
  return <div>Child content</div>;
}

describe('RouteErrorBoundary', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.mocked(logger.error).mockClear();
    // React logs caught errors to console.error; silence the expected noise.
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('renders children when no error is thrown', () => {
    render(
      <MemoryRouter>
        <RouteErrorBoundary>
          <Thrower shouldThrow={false} />
        </RouteErrorBoundary>
      </MemoryRouter>,
    );

    expect(screen.getByText('Child content')).toBeInTheDocument();
    expect(screen.queryByTestId('route-error-fallback')).not.toBeInTheDocument();
  });

  it('renders the fallback when a child throws', () => {
    render(
      <MemoryRouter>
        <RouteErrorBoundary>
          <Thrower shouldThrow message="kaboom" />
        </RouteErrorBoundary>
      </MemoryRouter>,
    );

    expect(screen.getByTestId('route-error-fallback')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /Something went wrong on this page/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Try again/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Reload/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Copy error/i })).toBeInTheDocument();
  });

  it('reports the error through the logger with route and user context', () => {
    render(
      <MemoryRouter initialEntries={['/admin/users']}>
        <RouteErrorBoundary>
          <Thrower shouldThrow message="kaboom" />
        </RouteErrorBoundary>
      </MemoryRouter>,
    );

    expect(logger.error).toHaveBeenCalledTimes(1);
    const [, context] = vi.mocked(logger.error).mock.calls[0];
    expect(context).toMatchObject({
      route: '/admin/users',
      errorName: 'Error',
      errorMessage: 'kaboom',
      userId: 'user-1',
      userEmail: 'alice@example.com',
      tenantId: 'tenant-1',
    });
    expect(typeof (context as Record<string, unknown>).componentStack).toBe('string');
  });

  it('recovers when the user clicks "Try again" and the child stops throwing', async () => {
    function Harness() {
      return (
        <MemoryRouter>
          <RouteErrorBoundary>
            <ConditionalThrower />
          </RouteErrorBoundary>
        </MemoryRouter>
      );
    }

    let shouldThrow = true;
    function ConditionalThrower() {
      if (shouldThrow) {
        throw new Error('first render boom');
      }
      return <div>Recovered content</div>;
    }

    render(<Harness />);

    expect(screen.getByTestId('route-error-fallback')).toBeInTheDocument();

    // Stop throwing, then reset the boundary via the button.
    shouldThrow = false;
    await userEvent.click(screen.getByRole('button', { name: /Try again/i }));

    expect(screen.getByText('Recovered content')).toBeInTheDocument();
    expect(screen.queryByTestId('route-error-fallback')).not.toBeInTheDocument();
  });

  it('resets automatically when the route changes', async () => {
    function PageA(): ReactElement {
      throw new Error('page A failed');
    }
    function PageB() {
      return <div>Page B content</div>;
    }
    function NavigateAway() {
      const navigate = useNavigate();
      return (
        <button type="button" onClick={() => navigate('/b')}>
          Go to B
        </button>
      );
    }

    render(
      <MemoryRouter initialEntries={['/a']}>
        <NavigateAway />
        <RouteErrorBoundary>
          <Routes>
            <Route path="/a" element={<PageA />} />
            <Route path="/b" element={<PageB />} />
          </Routes>
        </RouteErrorBoundary>
      </MemoryRouter>,
    );

    expect(screen.getByTestId('route-error-fallback')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Go to B/i }));

    expect(screen.getByText('Page B content')).toBeInTheDocument();
    expect(screen.queryByTestId('route-error-fallback')).not.toBeInTheDocument();
  });

  it('copies error details to the clipboard when "Copy error" is clicked', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    render(
      <MemoryRouter>
        <RouteErrorBoundary>
          <Thrower shouldThrow message="clipboard test" />
        </RouteErrorBoundary>
      </MemoryRouter>,
    );

    await userEvent.click(screen.getByRole('button', { name: /Copy error/i }));

    expect(writeText).toHaveBeenCalledTimes(1);
    const copiedText = writeText.mock.calls[0][0] as string;
    expect(copiedText).toContain('Error');
    expect(copiedText).toContain('clipboard test');
    expect(await screen.findByRole('status')).toHaveTextContent('Copied');
  });

  it('does not show "Copied" when the clipboard API is unavailable', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: undefined,
      configurable: true,
    });

    render(
      <MemoryRouter>
        <RouteErrorBoundary>
          <Thrower shouldThrow message="no clipboard" />
        </RouteErrorBoundary>
      </MemoryRouter>,
    );

    await userEvent.click(screen.getByRole('button', { name: /Copy error/i }));

    // Give any queued microtasks / timers a chance to settle.
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('does not show "Copied" when the clipboard write rejects', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    render(
      <MemoryRouter>
        <RouteErrorBoundary>
          <Thrower shouldThrow message="rejected" />
        </RouteErrorBoundary>
      </MemoryRouter>,
    );

    await userEvent.click(screen.getByRole('button', { name: /Copy error/i }));

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
