import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AccountDetailPage } from '../pages/AccountDetailPage.js';

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

const baseAccount = {
  id: 'account-uuid-1',
  tenantId: 'tenant-abc',
  name: 'Acme Corp',
  industry: 'Technology',
  website: 'https://acme.example.com',
  phone: '+44 20 7946 0958',
  email: 'contact@acme.example.com',
  addressLine1: '123 Main Street',
  addressLine2: 'Suite 100',
  city: 'London',
  region: 'Greater London',
  postalCode: 'EC1A 1BB',
  country: 'United Kingdom',
  notes: 'Key enterprise customer',
  ownerId: 'user-123',
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-06-01T00:00:00.000Z',
  createdBy: 'user-123',
  opportunities: [
    {
      id: 'opp-1',
      title: 'Enterprise Deal',
      stage: 'proposal',
      value: 50000,
      currency: 'GBP',
      expectedCloseDate: '2025-12-31T00:00:00.000Z',
      createdAt: '2025-03-01T00:00:00.000Z',
      updatedAt: '2025-06-01T00:00:00.000Z',
    },
    {
      id: 'opp-2',
      title: 'Support Contract',
      stage: 'negotiation',
      value: 10000,
      expectedCloseDate: undefined,
      createdAt: '2025-04-01T00:00:00.000Z',
      updatedAt: '2025-05-01T00:00:00.000Z',
    },
  ],
};

function renderPage(id = 'account-uuid-1') {
  return render(
    <MemoryRouter initialEntries={[`/accounts/${id}`]}>
      <Routes>
        <Route path="/accounts/:id" element={<AccountDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AccountDetailPage', () => {
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

  // ── Detail view ────────────────────────────────────────────────────────────

  it('shows a loading state initially', () => {
    vi.mocked(fetch).mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('renders account details after a successful load', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => baseAccount,
    } as Response);

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Acme Corp' })).toBeInTheDocument();
    });

    expect(screen.getByText('Technology')).toBeInTheDocument();
    expect(screen.getByText('https://acme.example.com')).toBeInTheDocument();
    expect(screen.getByText('+44 20 7946 0958')).toBeInTheDocument();
    expect(screen.getByText('contact@acme.example.com')).toBeInTheDocument();
    expect(screen.getByText('123 Main Street')).toBeInTheDocument();
    expect(screen.getByText('London')).toBeInTheDocument();
    expect(screen.getByText('United Kingdom')).toBeInTheDocument();
    expect(screen.getByText('Key enterprise customer')).toBeInTheDocument();
  });

  it('shows a 404 message when the account is not found', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: 'Account not found' }),
    } as Response);

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Account not found.');
    });
  });

  it('shows an error message when the fetch fails', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('Network error'));

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Failed to connect to the server. Please try again.',
      );
    });
  });

  it('renders Edit and Delete buttons in view mode', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => baseAccount,
    } as Response);

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  it('navigates back to /accounts when "Back to accounts" is clicked', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => baseAccount,
    } as Response);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/Back to accounts/)).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText(/Back to accounts/));

    expect(mockNavigate).toHaveBeenCalledWith('/accounts');
  });

  // ── Edit mode ──────────────────────────────────────────────────────────────

  it('switches to edit mode when Edit is clicked', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => baseAccount,
    } as Response);

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));

    expect(screen.getByLabelText(/Account name/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('pre-fills the edit form with current account values', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => baseAccount,
    } as Response);

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));

    expect(screen.getByLabelText<HTMLInputElement>(/Account name/).value).toBe('Acme Corp');
    expect(screen.getByLabelText<HTMLInputElement>('Industry').value).toBe('Technology');
    expect(screen.getByLabelText<HTMLInputElement>('Email').value).toBe(
      'contact@acme.example.com',
    );
  });

  it('returns to view mode when Cancel is clicked', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => baseAccount,
    } as Response);

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.queryByLabelText(/Account name/)).not.toBeInTheDocument();
  });

  it('shows a validation error when name is cleared before saving', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => baseAccount,
    } as Response);

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));

    const nameInput = screen.getByLabelText<HTMLInputElement>(/Account name/);
    await userEvent.clear(nameInput);
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Account name is required');
    expect(fetch).toHaveBeenCalledTimes(1); // only the initial load
  });

  it('shows a validation error for invalid email', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => baseAccount,
    } as Response);

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));

    const emailInput = screen.getByLabelText<HTMLInputElement>('Email');
    await userEvent.clear(emailInput);
    await userEvent.type(emailInput, 'not-an-email');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Email must be a valid email address');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('shows a validation error for invalid phone', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => baseAccount,
    } as Response);

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));

    const phoneInput = screen.getByLabelText<HTMLInputElement>('Phone');
    await userEvent.clear(phoneInput);
    await userEvent.type(phoneInput, 'abc');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Phone must be a valid phone number');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('submits the PUT request and shows success banner on save', async () => {
    const updatedAccount = { ...baseAccount, name: 'Acme Inc' };

    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => baseAccount,
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => updatedAccount,
      } as Response);

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));

    const nameInput = screen.getByLabelText<HTMLInputElement>(/Account name/);
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'Acme Inc');

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Account updated successfully.');
    });

    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
  });

  it('shows an API error when the save request fails', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => baseAccount,
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Account name is required' }),
      } as Response);

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Account name is required');
    });
  });

  // ── Linked opportunities ───────────────────────────────────────────────────

  it('renders linked opportunities in a table', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => baseAccount,
    } as Response);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Enterprise Deal')).toBeInTheDocument();
    });

    expect(screen.getByText('Support Contract')).toBeInTheDocument();
    expect(screen.getByText('Proposal')).toBeInTheDocument();
    expect(screen.getByText('Negotiation')).toBeInTheDocument();
  });

  it('navigates to opportunity detail when an opportunity name is clicked', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => baseAccount,
    } as Response);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Enterprise Deal')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText('Enterprise Deal'));

    expect(mockNavigate).toHaveBeenCalledWith('/opportunities/opp-1');
  });

  it('shows an empty message when there are no linked opportunities', async () => {
    const accountNoOpps = { ...baseAccount, opportunities: [] };

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => accountNoOpps,
    } as Response);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('No linked opportunities yet.')).toBeInTheDocument();
    });
  });

  it('renders an Add opportunity button', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => baseAccount,
    } as Response);

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Add opportunity' })).toBeInTheDocument();
    });
  });

  // ── Delete with confirmation ───────────────────────────────────────────────

  it('shows a confirmation dialog when Delete is clicked', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => baseAccount,
    } as Response);

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/Are you sure you want to delete/)).toBeInTheDocument();
  });

  it('dismisses the delete dialog when Cancel is clicked', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => baseAccount,
    } as Response);

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    const dialog = screen.getByRole('dialog');
    const cancelBtn = within(dialog).getByRole('button', { name: 'Cancel' });
    await userEvent.click(cancelBtn);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('sends a DELETE request and navigates to /accounts on confirmation', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => baseAccount,
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 204,
      } as Response);

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    const dialog = screen.getByRole('dialog');
    const deleteBtn = within(dialog).getByRole('button', { name: 'Delete' });
    await userEvent.click(deleteBtn);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/accounts');
    });
  });

  it('shows an error in the delete dialog when the DELETE request fails', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => baseAccount,
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Failed to delete account' }),
      } as Response);

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    const dialog = screen.getByRole('dialog');
    const deleteBtn = within(dialog).getByRole('button', { name: 'Delete' });
    await userEvent.click(deleteBtn);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Failed to delete account');
    });
  });
});
