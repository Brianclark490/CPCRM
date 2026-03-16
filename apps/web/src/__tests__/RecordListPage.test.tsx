import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { RecordListPage } from '../pages/RecordListPage.js';

vi.mock('@descope/react-sdk', () => ({
  useSession: vi.fn(),
}));

const { useSession } = await import('@descope/react-sdk');

function renderPage(apiName = 'account') {
  return render(
    <MemoryRouter initialEntries={[`/objects/${apiName}`]}>
      <Routes>
        <Route path="/objects/:apiName" element={<RecordListPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function makeRecordsResponse(
  records: Array<{
    id: string;
    name: string;
    fields: Array<{ apiName: string; label: string; fieldType: string; value: unknown }>;
  }> = [],
  total = 0,
) {
  return {
    data: records.map((r) => ({
      ...r,
      fieldValues: {},
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    })),
    total,
    page: 1,
    limit: 20,
    object: {
      id: 'obj-1',
      apiName: 'account',
      label: 'Account',
      pluralLabel: 'Accounts',
      isSystem: true,
    },
  };
}

function mockFetch(recordsResponse?: ReturnType<typeof makeRecordsResponse>) {
  const fetchMock = vi.fn().mockImplementation((url: string) => {
    if (typeof url === 'string' && url.includes('/api/admin/objects') && !url.includes('/layouts')) {
      // Admin objects list
      return Promise.resolve({
        ok: true,
        json: async () => [
          { id: 'obj-1', apiName: 'account' },
        ],
      } as Response);
    }

    if (typeof url === 'string' && url.includes('/layouts/')) {
      // Layout detail
      return Promise.resolve({
        ok: true,
        json: async () => ({
          id: 'layout-1',
          objectId: 'obj-1',
          name: 'Default List',
          layoutType: 'list',
          isDefault: true,
          fields: [
            {
              fieldId: 'f1',
              fieldApiName: 'industry',
              fieldLabel: 'Industry',
              fieldType: 'text',
              sortOrder: 1,
              section: 0,
              width: 'full',
            },
          ],
        }),
      } as Response);
    }

    if (typeof url === 'string' && url.includes('/layouts')) {
      // Layouts list
      return Promise.resolve({
        ok: true,
        json: async () => [
          { id: 'layout-1', objectId: 'obj-1', name: 'Default List', layoutType: 'list', isDefault: true },
        ],
      } as Response);
    }

    if (typeof url === 'string' && url.includes('/api/objects/')) {
      // Records list
      return Promise.resolve({
        ok: true,
        json: async () => recordsResponse ?? makeRecordsResponse(),
      } as Response);
    }

    return Promise.resolve({ ok: false, json: async () => ({}) } as Response);
  });

  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('RecordListPage', () => {
  beforeEach(() => {
    vi.mocked(useSession).mockReturnValue({
      isAuthenticated: true,
      isSessionLoading: false,
      sessionToken: 'test-token',
      claims: {},
    });
  });

  it('renders the object plural label as heading', async () => {
    mockFetch(makeRecordsResponse());
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Accounts' })).toBeInTheDocument();
    });
  });

  it('renders a "New" button linking to the create page', async () => {
    mockFetch(makeRecordsResponse());
    renderPage();

    await waitFor(() => {
      const link = screen.getByRole('link', { name: /New account/i });
      expect(link).toHaveAttribute('href', '/objects/account/new');
    });
  });

  it('shows empty state when there are no records', async () => {
    mockFetch(makeRecordsResponse());
    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/No accounts yet/i)).toBeInTheDocument();
    });
  });

  it('renders records in a table with the name column', async () => {
    const response = makeRecordsResponse(
      [
        {
          id: 'rec-1',
          name: 'Acme Corp',
          fields: [
            { apiName: 'industry', label: 'Industry', fieldType: 'text', value: 'Technology' },
          ],
        },
      ],
      1,
    );

    mockFetch(response);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    });
  });

  it('renders dynamic columns from record fields', async () => {
    const response = makeRecordsResponse(
      [
        {
          id: 'rec-1',
          name: 'Acme Corp',
          fields: [
            { apiName: 'industry', label: 'Industry', fieldType: 'text', value: 'Technology' },
            { apiName: 'email', label: 'Email', fieldType: 'email', value: 'info@acme.com' },
          ],
        },
      ],
      1,
    );

    mockFetch(response);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Technology')).toBeInTheDocument();
    });
    // Email fields are rendered as a mailto link, so assert by accessible role + href.
    const emailLink = await screen.findByRole('link', { name: /info@acme\.com/i });
    expect(emailLink).toHaveAttribute('href', 'mailto:info@acme.com');
  });

  it('shows an error message when the records fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Server error' }),
      } as Response),
    );

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Failed to load records.');
    });
  });

  it('renders a search input', async () => {
    mockFetch(makeRecordsResponse());
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('searchbox')).toBeInTheDocument();
    });
  });

  it('calls the records API with search parameter after debounce', async () => {
    const fetchMock = mockFetch(makeRecordsResponse());
    const user = userEvent.setup();

    renderPage();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    const searchInput = screen.getByRole('searchbox');
    await user.type(searchInput, 'acme');

    await waitFor(
      () => {
        const calls = fetchMock.mock.calls;
        const recordsCalls = calls.filter(
          (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('/api/objects/'),
        );
        const lastCall = recordsCalls[recordsCalls.length - 1];
        expect(String(lastCall[0])).toContain('search=acme');
      },
      { timeout: 1000 },
    );
  });

  it('shows pagination controls when there are multiple pages', async () => {
    const response = makeRecordsResponse(
      Array.from({ length: 20 }, (_, i) => ({
        id: `rec-${i}`,
        name: `Record ${i}`,
        fields: [],
      })),
      45,
    );

    mockFetch(response);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeEnabled();
  });

  it('links record names to the detail page', async () => {
    const response = makeRecordsResponse(
      [
        {
          id: 'rec-42',
          name: 'Contoso Ltd',
          fields: [],
        },
      ],
      1,
    );

    mockFetch(response);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Contoso Ltd')).toBeInTheDocument();
    });

    const link = screen.getByRole('link', { name: 'Contoso Ltd' });
    expect(link).toHaveAttribute('href', '/objects/account/rec-42');
  });

  it('shows 404 error for unknown object types', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ error: 'Not found' }),
      } as Response),
    );

    renderPage('nonexistent_object');

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Object type not found.');
    });
  });
});
