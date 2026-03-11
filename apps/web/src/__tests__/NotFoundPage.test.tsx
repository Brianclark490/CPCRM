import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { NotFoundPage } from '../pages/NotFoundPage.js';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe('NotFoundPage', () => {
  it('renders the page not found heading and message', () => {
    render(
      <MemoryRouter>
        <NotFoundPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Page Not Found' })).toBeInTheDocument();
    expect(
      screen.getByText('The page you are looking for does not exist.'),
    ).toBeInTheDocument();
  });

  it('navigates to /dashboard when the button is clicked', async () => {
    render(
      <MemoryRouter>
        <NotFoundPage />
      </MemoryRouter>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Go to Dashboard' }));

    expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
  });
});
