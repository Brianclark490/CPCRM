import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { CreateOpportunityPage } from '../pages/CreateOpportunityPage.js';

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
      <CreateOpportunityPage />
    </MemoryRouter>,
  );
}

describe('CreateOpportunityPage', () => {
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

    expect(screen.getByRole('heading', { name: 'Create opportunity' })).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toBeInTheDocument();
    expect(screen.getByLabelText('Account')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create opportunity' })).toBeInTheDocument();
  });

  it('renders optional form fields', () => {
    renderPage();

    expect(screen.getByLabelText('Value (optional)')).toBeInTheDocument();
    expect(screen.getByLabelText('Currency (optional)')).toBeInTheDocument();
    expect(screen.getByLabelText('Expected close date (optional)')).toBeInTheDocument();
    expect(screen.getByLabelText('Description (optional)')).toBeInTheDocument();
  });

  it('shows a client-side validation error when title is empty', async () => {
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: 'Create opportunity' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Opportunity title is required');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('shows a client-side validation error when accountId is empty', async () => {
    renderPage();

    await userEvent.type(screen.getByLabelText('Title'), 'New Deal');
    await userEvent.click(screen.getByRole('button', { name: 'Create opportunity' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Account is required');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('submits with the correct payload and shows success screen on 201 response', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response);

    renderPage();

    await userEvent.type(screen.getByLabelText('Title'), 'New Partnership Deal');
    await userEvent.type(screen.getByLabelText('Account'), 'account-uuid-123');
    await userEvent.click(screen.getByRole('button', { name: 'Create opportunity' }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        '/api/opportunities',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({
            title: 'New Partnership Deal',
            accountId: 'account-uuid-123',
            value: undefined,
            currency: undefined,
            expectedCloseDate: undefined,
            description: undefined,
          }),
        }),
      );
    });

    expect(screen.getByText('Opportunity created')).toBeInTheDocument();
    expect(
      screen.getByText('Your opportunity has been created successfully.'),
    ).toBeInTheDocument();
  });

  it('submits with optional fields when provided', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response);

    renderPage();

    await userEvent.type(screen.getByLabelText('Title'), 'Q4 Deal');
    await userEvent.type(screen.getByLabelText('Account'), 'account-uuid');
    await userEvent.type(screen.getByLabelText('Currency (optional)'), 'GBP');
    await userEvent.type(screen.getByLabelText('Description (optional)'), 'Strategic deal');
    await userEvent.click(screen.getByRole('button', { name: 'Create opportunity' }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        '/api/opportunities',
        expect.objectContaining({
          body: expect.stringContaining('"currency":"GBP"'),
        }),
      );
    });
  });

  it('shows an API error message when the server returns a non-ok response', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Opportunity title is required' }),
    } as Response);

    renderPage();

    await userEvent.type(screen.getByLabelText('Title'), 'x');
    await userEvent.type(screen.getByLabelText('Account'), 'account-uuid');
    await userEvent.click(screen.getByRole('button', { name: 'Create opportunity' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Opportunity title is required');
    });
  });

  it('shows a network error message when fetch throws', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('Network error'));

    renderPage();

    await userEvent.type(screen.getByLabelText('Title'), 'New Deal');
    await userEvent.type(screen.getByLabelText('Account'), 'account-uuid');
    await userEvent.click(screen.getByRole('button', { name: 'Create opportunity' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Failed to connect to the server. Please try again.',
      );
    });
  });

  it('navigates to /opportunities when "View opportunities" is clicked after success', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response);

    renderPage();

    await userEvent.type(screen.getByLabelText('Title'), 'New Deal');
    await userEvent.type(screen.getByLabelText('Account'), 'account-uuid');
    await userEvent.click(screen.getByRole('button', { name: 'Create opportunity' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'View opportunities' })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: 'View opportunities' }));

    expect(mockNavigate).toHaveBeenCalledWith('/opportunities');
  });

  it('navigates to /opportunities when Cancel is clicked', async () => {
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(mockNavigate).toHaveBeenCalledWith('/opportunities');
  });
});
