import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { CreateAccountPage } from '../pages/CreateAccountPage.js';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('@descope/react-sdk', () => ({
  useSession: vi.fn(),
}));

const { useSession } = await import('@descope/react-sdk');

function renderPage() {
  return render(
    <MemoryRouter>
      <CreateAccountPage />
    </MemoryRouter>,
  );
}

describe('CreateAccountPage', () => {
  beforeEach(() => {
    vi.mocked(useSession).mockReturnValue({
      isAuthenticated: true,
      isSessionLoading: false,
      sessionToken: 'test-token',
      claims: {},
    });
    mockNavigate.mockReset();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('renders the page heading and required form fields', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: 'Create account' })).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create account' })).toBeInTheDocument();
  });

  it('renders optional form fields', () => {
    renderPage();

    expect(screen.getByLabelText('Industry')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Phone')).toBeInTheDocument();
    expect(screen.getByLabelText('Website')).toBeInTheDocument();
    expect(screen.getByLabelText('Address line 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Address line 2')).toBeInTheDocument();
    expect(screen.getByLabelText('City')).toBeInTheDocument();
    expect(screen.getByLabelText('Region')).toBeInTheDocument();
    expect(screen.getByLabelText('Postal code')).toBeInTheDocument();
    expect(screen.getByLabelText('Country')).toBeInTheDocument();
    expect(screen.getByLabelText('Notes')).toBeInTheDocument();
  });

  it('shows a client-side validation error when name is empty', async () => {
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Account name is required');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('shows a validation error for invalid email format', async () => {
    renderPage();

    await userEvent.type(screen.getByLabelText('Name'), 'Acme Corp');
    await userEvent.type(screen.getByLabelText('Email'), 'not-an-email');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Please enter a valid email address');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('shows a validation error for invalid phone format', async () => {
    renderPage();

    await userEvent.type(screen.getByLabelText('Name'), 'Acme Corp');
    await userEvent.type(screen.getByLabelText('Phone'), 'abc');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Please enter a valid phone number');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('submits with the correct payload and redirects to account detail on success', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'new-account-uuid' }),
    } as Response);

    renderPage();

    await userEvent.type(screen.getByLabelText('Name'), 'Acme Corp');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        '/api/accounts',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            name: 'Acme Corp',
            industry: undefined,
            website: undefined,
            phone: undefined,
            email: undefined,
            addressLine1: undefined,
            addressLine2: undefined,
            city: undefined,
            region: undefined,
            postalCode: undefined,
            country: undefined,
            notes: undefined,
          }),
        }),
      );
    });

    const postCall = vi
      .mocked(fetch)
      .mock.calls.find(([url, init]) => url === '/api/accounts' && init?.method === 'POST');
    expect(postCall).toBeDefined();
    expect(postCall![1]?.credentials).toBe('include');
    const postHeaders = new Headers(postCall![1]?.headers);
    expect(postHeaders.get('Content-Type')).toBe('application/json');

    expect(mockNavigate).toHaveBeenCalledWith('/accounts/new-account-uuid');
  });

  it('submits with optional fields when provided', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'account-123' }),
    } as Response);

    renderPage();

    await userEvent.type(screen.getByLabelText('Name'), 'Acme Corp');
    await userEvent.type(screen.getByLabelText('Email'), 'info@acme.com');
    await userEvent.type(screen.getByLabelText('Phone'), '+44 20 7946 0958');
    await userEvent.selectOptions(screen.getByLabelText('Industry'), 'Technology');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        '/api/accounts',
        expect.objectContaining({
          body: expect.stringContaining('"industry":"Technology"'),
        }),
      );
    });
  });

  it('shows an API error message when the server returns a non-ok response', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Account name is required' }),
    } as Response);

    renderPage();

    await userEvent.type(screen.getByLabelText('Name'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Account name is required');
    });
  });

  it('shows a network error message when fetch throws', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('Network error'));

    renderPage();

    await userEvent.type(screen.getByLabelText('Name'), 'Acme Corp');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Failed to connect to the server. Please try again.',
      );
    });
  });

  it('navigates to /accounts when Cancel is clicked', async () => {
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(mockNavigate).toHaveBeenCalledWith('/accounts');
  });

  it('navigates to /accounts when breadcrumb link is clicked', async () => {
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: 'Accounts' }));

    expect(mockNavigate).toHaveBeenCalledWith('/accounts');
  });

  it('shows custom industry field when "Other" is selected', async () => {
    renderPage();

    expect(screen.queryByLabelText('Custom industry')).not.toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('Industry'), 'Other');

    expect(screen.getByLabelText('Custom industry')).toBeInTheDocument();
  });

  it('submits custom industry value when "Other" is selected', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'account-456' }),
    } as Response);

    renderPage();

    await userEvent.type(screen.getByLabelText('Name'), 'Acme Corp');
    await userEvent.selectOptions(screen.getByLabelText('Industry'), 'Other');
    await userEvent.type(screen.getByLabelText('Custom industry'), 'Space Exploration');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        '/api/accounts',
        expect.objectContaining({
          body: expect.stringContaining('"industry":"Space Exploration"'),
        }),
      );
    });
  });

  it('keeps form data when an API error occurs', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Server error' }),
    } as Response);

    renderPage();

    await userEvent.type(screen.getByLabelText('Name'), 'Acme Corp');
    await userEvent.type(screen.getByLabelText('Email'), 'info@acme.com');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    expect(screen.getByLabelText('Name')).toHaveValue('Acme Corp');
    expect(screen.getByLabelText('Email')).toHaveValue('info@acme.com');
  });
});
