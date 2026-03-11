import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AccountsPage } from '../pages/AccountsPage.js';

describe('AccountsPage', () => {
  it('renders the accounts heading', () => {
    render(<AccountsPage />);

    expect(screen.getByRole('heading', { name: 'Accounts' })).toBeInTheDocument();
  });

  it('renders a coming soon message', () => {
    render(<AccountsPage />);

    expect(screen.getByText('Accounts management coming soon.')).toBeInTheDocument();
  });
});
