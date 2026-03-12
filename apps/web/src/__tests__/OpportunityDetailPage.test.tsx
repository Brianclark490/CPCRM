import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { OpportunityDetailPage } from '../pages/OpportunityDetailPage.js';

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

const baseOpportunity = {
  id: 'opp-uuid-1',
  tenantId: 'tenant-abc',
  accountId: 'account-uuid-123',
  ownerId: 'user-123',
  title: 'New Partnership Deal',
  stage: 'prospecting',
  value: 50000,
  currency: 'GBP',
  expectedCloseDate: '2025-12-31T00:00:00.000Z',
  description: 'A great opportunity',
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-06-01T00:00:00.000Z',
  createdBy: 'user-123',
};

function renderPage(id = 'opp-uuid-1') {
  return render(
    <MemoryRouter initialEntries={[`/opportunities/${id}`]}>
      <Routes>
        <Route path="/opportunities/:id" element={<OpportunityDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('OpportunityDetailPage', () => {
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

  it('renders opportunity details after a successful load', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => baseOpportunity,
    } as Response);

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'New Partnership Deal' })).toBeInTheDocument();
    });

    // 'Prospecting' appears in both the header badge and the details grid
    expect(screen.getAllByText('Prospecting')).toHaveLength(2);
    expect(screen.getByText('account-uuid-123')).toBeInTheDocument();
    expect(screen.getByText('user-123')).toBeInTheDocument();
    expect(screen.getByText('A great opportunity')).toBeInTheDocument();
  });

  it('shows a 404 message when the opportunity is not found', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: 'Opportunity not found' }),
    } as Response);

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Opportunity not found.');
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

  it('renders an Edit button in view mode', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => baseOpportunity,
    } as Response);

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    });
  });

  it('navigates back to /opportunities when "Back to opportunities" is clicked', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => baseOpportunity,
    } as Response);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/Back to opportunities/)).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText(/Back to opportunities/));

    expect(mockNavigate).toHaveBeenCalledWith('/opportunities');
  });

  // ── Edit mode ──────────────────────────────────────────────────────────────

  it('switches to edit mode when Edit is clicked', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => baseOpportunity,
    } as Response);

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));

    expect(screen.getByLabelText(/Opportunity name/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('pre-fills the edit form with current opportunity values', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => baseOpportunity,
    } as Response);

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));

    expect(screen.getByLabelText<HTMLInputElement>(/Opportunity name/).value).toBe(
      'New Partnership Deal',
    );
    expect(screen.getByLabelText<HTMLSelectElement>('Stage').value).toBe('prospecting');
  });

  it('returns to view mode when Cancel is clicked', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => baseOpportunity,
    } as Response);

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.queryByLabelText(/Opportunity name/)).not.toBeInTheDocument();
  });

  it('shows a validation error when title is cleared before saving', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => baseOpportunity,
    } as Response);

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));

    const titleInput = screen.getByLabelText<HTMLInputElement>(/Opportunity name/);
    await userEvent.clear(titleInput);
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Opportunity name is required');
    expect(fetch).toHaveBeenCalledTimes(1); // only the initial load
  });

  it('submits PUT with updated value when a valid number is entered', async () => {
    const updatedOpportunity = { ...baseOpportunity, value: 99000 };

    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => baseOpportunity,
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => updatedOpportunity,
      } as Response);

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));

    const valueInput = screen.getByLabelText<HTMLInputElement>(/Estimated value/);
    await userEvent.clear(valueInput);
    await userEvent.type(valueInput, '99000');

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    expect(screen.getByRole('status')).toHaveTextContent('Opportunity updated successfully.');
  });

  it('submits the PUT request and shows success banner on save', async () => {
    const updatedOpportunity = { ...baseOpportunity, title: 'Updated Deal' };

    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => baseOpportunity,
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => updatedOpportunity,
      } as Response);

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));

    const titleInput = screen.getByLabelText<HTMLInputElement>(/Opportunity name/);
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, 'Updated Deal');

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(
        'Opportunity updated successfully.',
      );
    });

    // Back in view mode after save
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
  });

  it('shows an API error when the save request fails', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => baseOpportunity,
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Opportunity title is required' }),
      } as Response);

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Opportunity title is required');
    });
  });
});
