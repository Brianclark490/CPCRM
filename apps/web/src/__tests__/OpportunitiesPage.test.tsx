import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { OpportunitiesPage } from '../pages/OpportunitiesPage.js';

function renderPage() {
  return render(
    <MemoryRouter>
      <OpportunitiesPage />
    </MemoryRouter>,
  );
}

describe('OpportunitiesPage', () => {
  it('renders the opportunities heading', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: 'Opportunities' })).toBeInTheDocument();
  });

  it('renders a "New opportunity" button that links to /opportunities/new', () => {
    renderPage();

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/opportunities/new');
    expect(screen.getByRole('button', { name: 'New opportunity' })).toBeInTheDocument();
  });
});
