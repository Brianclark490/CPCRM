import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OpportunitiesPage } from '../pages/OpportunitiesPage.js';

describe('OpportunitiesPage', () => {
  it('renders the opportunities heading', () => {
    render(<OpportunitiesPage />);

    expect(screen.getByRole('heading', { name: 'Opportunities' })).toBeInTheDocument();
  });

  it('renders a coming soon message', () => {
    render(<OpportunitiesPage />);

    expect(screen.getByText('Opportunities management coming soon.')).toBeInTheDocument();
  });
});
