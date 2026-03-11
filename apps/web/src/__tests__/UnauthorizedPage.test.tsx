import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { UnauthorizedPage } from '../pages/UnauthorizedPage.js';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe('UnauthorizedPage', () => {
  it('renders the access denied heading and message', () => {
    render(
      <MemoryRouter>
        <UnauthorizedPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Access Denied' })).toBeInTheDocument();
    expect(
      screen.getByText('You do not have permission to view this page.'),
    ).toBeInTheDocument();
  });

  it('navigates to /dashboard when the button is clicked', async () => {
    render(
      <MemoryRouter>
        <UnauthorizedPage />
      </MemoryRouter>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Go to Dashboard' }));

    expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
  });
});
