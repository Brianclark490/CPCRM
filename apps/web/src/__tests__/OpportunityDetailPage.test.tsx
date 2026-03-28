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

const baseAccount = {
  id: 'account-uuid-123',
  name: 'Acme Corp',
  tenantId: 'tenant-abc',
  ownerId: 'user-123',
};

/**
 * Helper to mock fetch with opportunity load + account resolve + pipeline stages.
 */
function mockLoadWithAccount(opp: Omit<typeof baseOpportunity, 'accountId'> & { accountId?: string } = baseOpportunity, account = baseAccount) {
  vi.mocked(fetch).mockImplementation(async (url) => {
    const urlStr = typeof url === 'string' ? url : url.toString();

    // Pipeline stages fetch
    if (urlStr.includes('/api/admin/pipelines/')) {
      return {
        ok: true,
        json: async () => ({
          id: 'pipeline-1',
          stages: [
            { id: 's1', name: 'Prospecting', apiName: 'prospecting', sortOrder: 1, stageType: 'open', defaultProbability: 10, colour: 'blue' },
            { id: 's2', name: 'Qualification', apiName: 'qualification', sortOrder: 2, stageType: 'open', defaultProbability: 25, colour: 'blue' },
            { id: 's3', name: 'Proposal', apiName: 'proposal', sortOrder: 3, stageType: 'open', defaultProbability: 50, colour: 'green' },
            { id: 's4', name: 'Negotiation', apiName: 'negotiation', sortOrder: 4, stageType: 'open', defaultProbability: 75, colour: 'yellow' },
            { id: 's5', name: 'Closed Won', apiName: 'closed_won', sortOrder: 5, stageType: 'won', defaultProbability: 100, colour: 'green' },
            { id: 's6', name: 'Closed Lost', apiName: 'closed_lost', sortOrder: 6, stageType: 'lost', defaultProbability: 0, colour: 'red' },
          ],
        }),
      } as Response;
    }

    // Pipeline list fetch
    if (urlStr.includes('/api/admin/pipelines')) {
      return {
        ok: true,
        json: async () => [{ id: 'pipeline-1', isDefault: true }],
      } as Response;
    }

    // Account detail fetch (for name resolution)
    if (urlStr.includes('/api/accounts/')) {
      return {
        ok: true,
        json: async () => account,
      } as Response;
    }

    // Account search (for dropdown)
    if (urlStr.includes('/api/accounts')) {
      return {
        ok: true,
        json: async () => ({ data: [account] }),
      } as Response;
    }

    // Opportunity fetch
    return {
      ok: true,
      json: async () => opp,
    } as Response;
  });
}

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
    mockLoadWithAccount();

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'New Partnership Deal' })).toBeInTheDocument();
    });

    // 'Prospecting' appears in the header badge, the details grid, and the pipeline stage selector
    const prospectingElements = screen.getAllByText('Prospecting');
    expect(prospectingElements.length).toBeGreaterThanOrEqual(2);
    // Shows account name instead of raw ID
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    expect(screen.getByText('user-123')).toBeInTheDocument();
    expect(screen.getByText('A great opportunity')).toBeInTheDocument();
  });

  it('shows "No account linked" when opportunity has no account', async () => {
    const oppWithoutAccount = { ...baseOpportunity, accountId: undefined };
    mockLoadWithAccount(oppWithoutAccount);

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'New Partnership Deal' })).toBeInTheDocument();
    });

    expect(screen.getByText('No account linked')).toBeInTheDocument();
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
    mockLoadWithAccount();

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    });
  });

  it('navigates back to /opportunities when "Back to opportunities" is clicked', async () => {
    mockLoadWithAccount();

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/Back to opportunities/)).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText(/Back to opportunities/));

    expect(mockNavigate).toHaveBeenCalledWith('/opportunities');
  });

  // ── Edit mode ──────────────────────────────────────────────────────────────

  it('switches to edit mode when Edit is clicked', async () => {
    mockLoadWithAccount();

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
    mockLoadWithAccount();

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));

    expect(screen.getByLabelText<HTMLInputElement>(/Opportunity name/).value).toBe(
      'New Partnership Deal',
    );
    // Stage is now read-only in edit mode (changes go through move-stage endpoint)
    expect(screen.getByText('Stage')).toBeInTheDocument();
  });

  it('returns to view mode when Cancel is clicked', async () => {
    mockLoadWithAccount();

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
    mockLoadWithAccount();

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));

    const titleInput = screen.getByLabelText<HTMLInputElement>(/Opportunity name/);
    await userEvent.clear(titleInput);
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Opportunity name is required');
  });

  it('submits PUT with updated value when a valid number is entered', async () => {
    const updatedOpportunity = { ...baseOpportunity, value: 99000 };

    let callCount = 0;
    vi.mocked(fetch).mockImplementation(async (url) => {
      const urlStr = typeof url === 'string' ? url : url.toString();

      if (urlStr.includes('/api/admin/pipelines/')) {
        return { ok: true, json: async () => ({ id: 'pipeline-1', stages: [] }) } as Response;
      }
      if (urlStr.includes('/api/admin/pipelines')) {
        return { ok: true, json: async () => [{ id: 'pipeline-1', isDefault: true }] } as Response;
      }

      if (urlStr.includes('/api/accounts/')) {
        return { ok: true, json: async () => baseAccount } as Response;
      }

      if (urlStr.includes('/api/accounts')) {
        return { ok: true, json: async () => ({ data: [baseAccount] }) } as Response;
      }

      callCount++;
      if (callCount === 1) {
        return { ok: true, json: async () => baseOpportunity } as Response;
      }
      return { ok: true, json: async () => updatedOpportunity } as Response;
    });

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
      expect(screen.getByRole('status')).toHaveTextContent('Opportunity updated successfully.');
    });
  });

  it('submits the PUT request and shows success banner on save', async () => {
    const updatedOpportunity = { ...baseOpportunity, title: 'Updated Deal' };

    let callCount = 0;
    vi.mocked(fetch).mockImplementation(async (url) => {
      const urlStr = typeof url === 'string' ? url : url.toString();

      if (urlStr.includes('/api/admin/pipelines/')) {
        return { ok: true, json: async () => ({ id: 'pipeline-1', stages: [] }) } as Response;
      }
      if (urlStr.includes('/api/admin/pipelines')) {
        return { ok: true, json: async () => [{ id: 'pipeline-1', isDefault: true }] } as Response;
      }

      if (urlStr.includes('/api/accounts/')) {
        return { ok: true, json: async () => baseAccount } as Response;
      }

      if (urlStr.includes('/api/accounts')) {
        return { ok: true, json: async () => ({ data: [baseAccount] }) } as Response;
      }

      callCount++;
      if (callCount === 1) {
        return { ok: true, json: async () => baseOpportunity } as Response;
      }
      return { ok: true, json: async () => updatedOpportunity } as Response;
    });

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
    let callCount = 0;
    vi.mocked(fetch).mockImplementation(async (url) => {
      const urlStr = typeof url === 'string' ? url : url.toString();

      if (urlStr.includes('/api/admin/pipelines/')) {
        return { ok: true, json: async () => ({ id: 'pipeline-1', stages: [] }) } as Response;
      }
      if (urlStr.includes('/api/admin/pipelines')) {
        return { ok: true, json: async () => [{ id: 'pipeline-1', isDefault: true }] } as Response;
      }

      if (urlStr.includes('/api/accounts/')) {
        return { ok: true, json: async () => baseAccount } as Response;
      }

      if (urlStr.includes('/api/accounts')) {
        return { ok: true, json: async () => ({ data: [baseAccount] }) } as Response;
      }

      callCount++;
      if (callCount === 1) {
        return { ok: true, json: async () => baseOpportunity } as Response;
      }
      return {
        ok: false,
        json: async () => ({ error: 'Opportunity title is required' }),
      } as Response;
    });

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
