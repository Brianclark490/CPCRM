import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AdminPage } from '../pages/AdminPage.js';

function renderPage() {
  return render(
    <MemoryRouter>
      <AdminPage />
    </MemoryRouter>,
  );
}

describe('AdminPage', () => {
  it('renders the admin heading', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: 'Admin' })).toBeInTheDocument();
  });

  it('renders a link to the Object Manager', () => {
    renderPage();

    const link = screen.getByRole('link', { name: 'Object Manager' });
    expect(link).toHaveAttribute('href', '/admin/objects');
  });
});
