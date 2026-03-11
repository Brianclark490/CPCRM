import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AdminPage } from '../pages/AdminPage.js';

describe('AdminPage', () => {
  it('renders the admin heading', () => {
    render(<AdminPage />);

    expect(screen.getByRole('heading', { name: 'Admin' })).toBeInTheDocument();
  });

  it('renders a coming soon message', () => {
    render(<AdminPage />);

    expect(screen.getByText('Administration coming soon.')).toBeInTheDocument();
  });
});
