import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { OrganisationProvisioningPage } from '../pages/OrganisationProvisioningPage.js';

const mockNavigate = vi.fn();
const mockLogout = vi.fn();

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('@descope/react-sdk', () => ({
  useSession: vi.fn(),
  useDescope: vi.fn(),
}));

const { useSession, useDescope } = await import('@descope/react-sdk');

function renderPage() {
  return render(
    <MemoryRouter>
      <OrganisationProvisioningPage />
    </MemoryRouter>,
  );
}

describe('OrganisationProvisioningPage', () => {
  beforeEach(() => {
    vi.mocked(useSession).mockReturnValue({
      isAuthenticated: true,
      isSessionLoading: false,
      sessionToken: 'test-token',
      claims: {},
    });
    vi.mocked(useDescope).mockReturnValue(
      { logout: mockLogout } as unknown as ReturnType<typeof useDescope>,
    );
    mockLogout.mockResolvedValue(undefined);
    mockNavigate.mockReset();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('renders the page heading and form fields', () => {
    renderPage();

    expect(screen.getByText('Create your organisation')).toBeInTheDocument();
    expect(screen.getByLabelText('Organisation name')).toBeInTheDocument();
    expect(screen.getByLabelText('Description (optional)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create organisation' })).toBeInTheDocument();
  });

  it('shows a client-side validation error when name is empty and form is submitted', async () => {
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: 'Create organisation' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Organisation name is required');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('submits with the correct payload and shows success screen on 201 response', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response);

    renderPage();

    await userEvent.type(screen.getByLabelText('Organisation name'), 'Acme Corp');
    await userEvent.type(screen.getByLabelText('Description (optional)'), 'Our main org');
    await userEvent.click(screen.getByRole('button', { name: 'Create organisation' }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        '/api/organisations',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: 'Acme Corp', description: 'Our main org' }),
        }),
      );
    });

    const postCall = vi
      .mocked(fetch)
      .mock.calls.find(([url, init]) => url === '/api/organisations' && init?.method === 'POST');
    expect(postCall).toBeDefined();
    expect(postCall![1]?.credentials).toBe('include');
    const postHeaders = new Headers(postCall![1]?.headers);
    expect(postHeaders.get('Content-Type')).toBe('application/json');

    expect(screen.getByText('Organisation created')).toBeInTheDocument();
  });

  it('shows an API error message when the server returns a non-ok response', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Organisation name must be 100 characters or fewer' }),
    } as Response);

    renderPage();

    await userEvent.type(screen.getByLabelText('Organisation name'), 'x'.repeat(101));
    await userEvent.click(screen.getByRole('button', { name: 'Create organisation' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Organisation name must be 100 characters or fewer',
      );
    });
  });

  it('shows a network error message when fetch throws', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('Network error'));

    renderPage();

    await userEvent.type(screen.getByLabelText('Organisation name'), 'Acme Corp');
    await userEvent.click(screen.getByRole('button', { name: 'Create organisation' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Failed to connect to the server. Please try again.',
      );
    });
  });

  it('navigates to /dashboard when "Go to dashboard" is clicked after success', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response);

    renderPage();

    await userEvent.type(screen.getByLabelText('Organisation name'), 'Acme Corp');
    await userEvent.click(screen.getByRole('button', { name: 'Create organisation' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Go to dashboard' })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: 'Go to dashboard' }));

    expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
  });

  it('calls logout and navigates to /login when Sign out is clicked', async () => {
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(mockLogout).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('/login');
  });
});
