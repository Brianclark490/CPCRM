import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
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
    onSuccess,
    onError,
  }: {
    flowId: string;
    onSuccess: () => void;
    onError: (e: CustomEvent) => void;
  }) => (
    <div>
      <span data-testid="descope-flow-id">{flowId}</span>
      <button onClick={onSuccess}>Simulate success</button>
      <button onClick={() => onError(new CustomEvent('error', { detail: 'login failed' }))}>
        Simulate error
      </button>
    </div>
  ),
}));

describe('LoginPage', () => {
  it('renders the heading and Descope flow', () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    expect(screen.getByText('Sign in to CPCRM')).toBeInTheDocument();
    expect(screen.getByTestId('descope-flow-id')).toHaveTextContent('sign-up-or-in');
  });

  it('navigates to /dashboard on successful login', () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    screen.getByText('Simulate success').click();

    expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
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
});
