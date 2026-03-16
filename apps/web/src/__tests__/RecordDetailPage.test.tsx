import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { RecordDetailPage } from '../pages/RecordDetailPage.js';

vi.mock('@descope/react-sdk', () => ({
  useSession: vi.fn(),
}));

const { useSession } = await import('@descope/react-sdk');

function renderPage(apiName = 'account', id = 'rec-1') {
  return render(
    <MemoryRouter initialEntries={[`/objects/${apiName}/${id}`]}>
      <Routes>
        <Route path="/objects/:apiName/:id" element={<RecordDetailPage />} />
        <Route path="/objects/:apiName" element={<div>List Page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function makeRecordResponse(overrides: Partial<{
  id: string;
  name: string;
  fields: Array<{ apiName: string; label: string; fieldType: string; value: unknown }>;
  relationships: Array<{
    relationshipId: string;
    label: string;
    relationshipType: string;
    direction: string;
    records: Array<{ id: string; name: string; fieldValues: Record<string, unknown> }>;
  }>;
  fieldValues: Record<string, unknown>;
}> = {}) {
  return {
    id: overrides.id ?? 'rec-1',
    objectId: 'obj-1',
    name: overrides.name ?? 'Test Record',
    fieldValues: overrides.fieldValues ?? { industry: 'Technology', email: 'test@example.com' },
    ownerId: 'user-1',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-02T00:00:00Z',
    fields: overrides.fields ?? [
      { apiName: 'industry', label: 'Industry', fieldType: 'text', value: 'Technology' },
      { apiName: 'email', label: 'Email', fieldType: 'email', value: 'test@example.com' },
    ],
    relationships: overrides.relationships ?? [],
  };
}

function mockFetch(recordResponse?: ReturnType<typeof makeRecordResponse>) {
  const fetchMock = vi.fn().mockImplementation((url: string) => {
    // Admin objects list
    if (typeof url === 'string' && url.includes('/api/admin/objects') && !url.includes('/layouts')) {
      return Promise.resolve({
        ok: true,
        json: async () => [
          { id: 'obj-1', apiName: 'account', label: 'Account', pluralLabel: 'Accounts', isSystem: true },
        ],
      } as Response);
    }

    // Layout detail
    if (typeof url === 'string' && url.includes('/layouts/')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          id: 'layout-1',
          objectId: 'obj-1',
          name: 'Default Form',
          layoutType: 'form',
          isDefault: true,
          fields: [
            {
              fieldId: 'f1',
              fieldApiName: 'industry',
              fieldLabel: 'Industry',
              fieldType: 'text',
              fieldRequired: false,
              fieldOptions: {},
              sortOrder: 1,
              section: 0,
              sectionLabel: 'Details',
              width: 'half',
            },
            {
              fieldId: 'f2',
              fieldApiName: 'email',
              fieldLabel: 'Email',
              fieldType: 'email',
              fieldRequired: false,
              fieldOptions: {},
              sortOrder: 2,
              section: 0,
              sectionLabel: 'Details',
              width: 'half',
            },
          ],
        }),
      } as Response);
    }

    // Layouts list
    if (typeof url === 'string' && url.includes('/layouts')) {
      return Promise.resolve({
        ok: true,
        json: async () => [
          { id: 'layout-1', objectId: 'obj-1', name: 'Default Form', layoutType: 'form', isDefault: true },
        ],
      } as Response);
    }

    // Single record
    if (typeof url === 'string' && url.match(/\/api\/objects\/[^/]+\/records\/[^/?]+$/)) {
      return Promise.resolve({
        ok: true,
        json: async () => recordResponse ?? makeRecordResponse(),
      } as Response);
    }

    return Promise.resolve({ ok: false, json: async () => ({}) } as Response);
  });

  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('RecordDetailPage', () => {
  beforeEach(() => {
    vi.mocked(useSession).mockReturnValue({
      isAuthenticated: true,
      isSessionLoading: false,
      sessionToken: 'test-token',
      claims: {},
    });
  });

  it('renders the record name as heading', async () => {
    mockFetch(makeRecordResponse({ name: 'Acme Corp' }));
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Acme Corp' })).toBeInTheDocument();
    });
  });

  it('renders field values using FieldRenderer', async () => {
    mockFetch(makeRecordResponse());
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Technology')).toBeInTheDocument();
    });

    // Email should be rendered as a mailto link
    const emailLink = await screen.findByRole('link', { name: /test@example\.com/i });
    expect(emailLink).toHaveAttribute('href', 'mailto:test@example.com');
  });

  it('renders a back link to the list page', async () => {
    mockFetch(makeRecordResponse());
    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/Back to accounts/i)).toBeInTheDocument();
    });
  });

  it('shows edit and delete buttons', async () => {
    mockFetch(makeRecordResponse());
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    });
  });

  it('enters edit mode when Edit is clicked', async () => {
    mockFetch(makeRecordResponse());
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Edit' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    });
  });

  it('exits edit mode when Cancel is clicked', async () => {
    mockFetch(makeRecordResponse());
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Edit' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    });
  });

  it('shows error message when record is not found', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (typeof url === 'string' && url.includes('/api/admin/objects') && !url.includes('/layouts')) {
          return Promise.resolve({
            ok: true,
            json: async () => [
              { id: 'obj-1', apiName: 'account', label: 'Account', pluralLabel: 'Accounts', isSystem: true },
            ],
          } as Response);
        }
        if (typeof url === 'string' && url.match(/\/api\/objects\/[^/]+\/records\/[^/?]+$/)) {
          return Promise.resolve({
            ok: false,
            status: 404,
            json: async () => ({ error: 'Record not found' }),
          } as Response);
        }
        return Promise.resolve({ ok: false, json: async () => ({}) } as Response);
      }),
    );

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Record not found.');
    });
  });

  it('shows delete confirmation dialog', async () => {
    mockFetch(makeRecordResponse());
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Confirm deletion' })).toBeInTheDocument();
      expect(screen.getByText(/Are you sure you want to delete/)).toBeInTheDocument();
    });
  });

  it('renders related records', async () => {
    const record = makeRecordResponse({
      relationships: [
        {
          relationshipId: 'rel-1',
          label: 'Opportunities',
          relationshipType: 'lookup',
          direction: 'source',
          records: [
            { id: 'opp-1', name: 'Big Deal', fieldValues: {} },
            { id: 'opp-2', name: 'Small Deal', fieldValues: {} },
          ],
        },
      ],
    });

    mockFetch(record);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Opportunities')).toBeInTheDocument();
      expect(screen.getByText('Big Deal')).toBeInTheDocument();
      expect(screen.getByText('Small Deal')).toBeInTheDocument();
    });
  });

  it('shows empty state for related records with no records', async () => {
    const record = makeRecordResponse({
      relationships: [
        {
          relationshipId: 'rel-1',
          label: 'Contacts',
          relationshipType: 'lookup',
          direction: 'source',
          records: [],
        },
      ],
    });

    mockFetch(record);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Contacts')).toBeInTheDocument();
      expect(screen.getByText('No related records')).toBeInTheDocument();
    });
  });

  it('renders layout sections from form layout', async () => {
    mockFetch(makeRecordResponse());
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Details')).toBeInTheDocument();
    });
  });

  it('renders metadata with created and last modified dates', async () => {
    mockFetch(makeRecordResponse());
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Created')).toBeInTheDocument();
      expect(screen.getByText('Last modified')).toBeInTheDocument();
    });
  });

  it('renders boolean field types correctly', async () => {
    const record = makeRecordResponse({
      fields: [
        { apiName: 'is_active', label: 'Active', fieldType: 'boolean', value: true },
      ],
      fieldValues: { is_active: true },
    });

    // Mock without layouts to test field fallback
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/api/admin/objects') && !url.includes('/layouts')) {
        return Promise.resolve({
          ok: true,
          json: async () => [
            { id: 'obj-1', apiName: 'account', label: 'Account', pluralLabel: 'Accounts', isSystem: true },
          ],
        } as Response);
      }
      if (typeof url === 'string' && url.includes('/layouts')) {
        return Promise.resolve({ ok: true, json: async () => [] } as Response);
      }
      if (typeof url === 'string' && url.match(/\/api\/objects\/[^/]+\/records\/[^/?]+$/)) {
        return Promise.resolve({
          ok: true,
          json: async () => record,
        } as Response);
      }
      return Promise.resolve({ ok: false, json: async () => ({}) } as Response);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Yes')).toBeInTheDocument();
    });
  });

  it('renders dropdown field types correctly', async () => {
    const record = makeRecordResponse({
      fields: [
        { apiName: 'status', label: 'Status', fieldType: 'dropdown', value: 'Active' },
      ],
      fieldValues: { status: 'Active' },
    });

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/api/admin/objects') && !url.includes('/layouts')) {
        return Promise.resolve({
          ok: true,
          json: async () => [
            { id: 'obj-1', apiName: 'account', label: 'Account', pluralLabel: 'Accounts', isSystem: true },
          ],
        } as Response);
      }
      if (typeof url === 'string' && url.includes('/layouts')) {
        return Promise.resolve({ ok: true, json: async () => [] } as Response);
      }
      if (typeof url === 'string' && url.match(/\/api\/objects\/[^/]+\/records\/[^/?]+$/)) {
        return Promise.resolve({
          ok: true,
          json: async () => record,
        } as Response);
      }
      return Promise.resolve({ ok: false, json: async () => ({}) } as Response);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Active')).toBeInTheDocument();
    });
  });
});
