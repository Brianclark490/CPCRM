import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
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
    relatedObjectApiName: string;
    records: Array<{ id: string; name: string; fieldValues: Record<string, unknown> }>;
  }>;
  fieldValues: Record<string, unknown>;
  ownerName: string;
  updatedBy: string;
  updatedByName: string;
}> = {}) {
  return {
    id: overrides.id ?? 'rec-1',
    objectId: 'obj-1',
    name: overrides.name ?? 'Test Record',
    fieldValues: overrides.fieldValues ?? { industry: 'Technology', email: 'test@example.com' },
    ownerId: 'user-1',
    ownerName: overrides.ownerName,
    updatedBy: overrides.updatedBy,
    updatedByName: overrides.updatedByName,
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

  it('renders a breadcrumb navigation to the list page', async () => {
    mockFetch(makeRecordResponse());
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Accounts')).toBeInTheDocument();
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
          relatedObjectApiName: 'opportunity',
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
          relatedObjectApiName: 'contact',
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

  it('renders + New button on related list sections', async () => {
    const record = makeRecordResponse({
      relationships: [
        {
          relationshipId: 'rel-1',
          label: 'Activities',
          relationshipType: 'lookup',
          direction: 'source',
          relatedObjectApiName: 'activity',
          records: [],
        },
      ],
    });

    mockFetch(record);
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('new-related-activity')).toBeInTheDocument();
      expect(screen.getByTestId('new-related-activity')).toHaveTextContent('+ New');
    });
  });

  it('opens inline form when + New button is clicked', async () => {
    const record = makeRecordResponse({
      relationships: [
        {
          relationshipId: 'rel-1',
          label: 'Activities',
          relationshipType: 'lookup',
          direction: 'source',
          relatedObjectApiName: 'activity',
          records: [],
        },
      ],
    });

    const fetchMock = mockFetch(record);

    // Add mock for field definitions fetch
    fetchMock.mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/api/admin/objects') && !url.includes('/layouts') && !url.includes('/fields')) {
        return Promise.resolve({
          ok: true,
          json: async () => [
            { id: 'obj-1', apiName: 'account', label: 'Account', pluralLabel: 'Accounts', isSystem: true },
            { id: 'obj-2', apiName: 'activity', label: 'Activity', pluralLabel: 'Activities', isSystem: true },
          ],
        } as Response);
      }
      if (typeof url === 'string' && url.includes('/fields')) {
        return Promise.resolve({
          ok: true,
          json: async () => [
            { id: 'f1', objectId: 'obj-2', apiName: 'subject', label: 'Subject', fieldType: 'text', required: true, options: {}, sortOrder: 1 },
          ],
        } as Response);
      }
      if (typeof url === 'string' && url.includes('/layouts/')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            id: 'layout-1', objectId: 'obj-1', name: 'Default Form', layoutType: 'form', isDefault: true,
            fields: [
              { fieldId: 'f1', fieldApiName: 'industry', fieldLabel: 'Industry', fieldType: 'text', fieldRequired: false, fieldOptions: {}, sortOrder: 1, section: 0, sectionLabel: 'Details', width: 'half' },
            ],
          }),
        } as Response);
      }
      if (typeof url === 'string' && url.includes('/layouts')) {
        return Promise.resolve({
          ok: true,
          json: async () => [{ id: 'layout-1', objectId: 'obj-1', name: 'Default Form', layoutType: 'form', isDefault: true }],
        } as Response);
      }
      if (typeof url === 'string' && url.match(/\/api\/objects\/[^/]+\/records\/[^/?]+$/)) {
        return Promise.resolve({
          ok: true,
          json: async () => record,
        } as Response);
      }
      return Promise.resolve({ ok: false, json: async () => ({}) } as Response);
    });

    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('new-related-activity')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('new-related-activity'));

    await waitFor(() => {
      expect(screen.getByTestId('inline-record-form') || screen.getByTestId('inline-form-loading')).toBeInTheDocument();
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
      expect(screen.getByText('Owner')).toBeInTheDocument();
    });
  });

  it('renders owner and last modified by names when provided', async () => {
    mockFetch(makeRecordResponse({
      ownerName: 'Brian Clark',
      updatedBy: 'user-2',
      updatedByName: 'Lewis Walls',
    }));
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Brian Clark')).toBeInTheDocument();
      expect(screen.getByText('Lewis Walls')).toBeInTheDocument();
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

  // ── Lead conversion tests ──────────────────────────────────────────────────

  describe('Lead conversion', () => {
    function makeLeadRecord(overrides: Partial<{ fieldValues: Record<string, unknown> }> = {}) {
      return makeRecordResponse({
        id: 'lead-1',
        name: 'Jane Smith',
        fields: [
          { apiName: 'first_name', label: 'First Name', fieldType: 'text', value: 'Jane' },
          { apiName: 'last_name', label: 'Last Name', fieldType: 'text', value: 'Smith' },
          { apiName: 'email', label: 'Email', fieldType: 'email', value: 'jane@example.com' },
          { apiName: 'company', label: 'Company', fieldType: 'text', value: 'Acme Corp' },
          { apiName: 'status', label: 'Status', fieldType: 'dropdown', value: 'New' },
        ],
        fieldValues: {
          first_name: 'Jane',
          last_name: 'Smith',
          email: 'jane@example.com',
          company: 'Acme Corp',
          status: 'New',
          ...overrides.fieldValues,
        },
      });
    }

    function mockLeadFetch(leadRecord: ReturnType<typeof makeRecordResponse>) {
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (typeof url === 'string' && url.includes('/api/admin/objects') && !url.includes('/layouts')) {
          return Promise.resolve({
            ok: true,
            json: async () => [
              { id: 'obj-lead', apiName: 'lead', label: 'Lead', pluralLabel: 'Leads', isSystem: true },
            ],
          } as Response);
        }
        if (typeof url === 'string' && url.includes('/layouts/')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              id: 'layout-1',
              objectId: 'obj-lead',
              name: 'Default Form',
              layoutType: 'form',
              isDefault: true,
              fields: [],
            }),
          } as Response);
        }
        if (typeof url === 'string' && url.includes('/layouts')) {
          return Promise.resolve({
            ok: true,
            json: async () => [
              { id: 'layout-1', objectId: 'obj-lead', name: 'Default Form', layoutType: 'form', isDefault: true },
            ],
          } as Response);
        }
        if (typeof url === 'string' && url.match(/\/api\/objects\/[^/]+\/records\/[^/?]+$/)) {
          return Promise.resolve({
            ok: true,
            json: async () => leadRecord,
          } as Response);
        }
        return Promise.resolve({ ok: false, json: async () => ({}) } as Response);
      });

      vi.stubGlobal('fetch', fetchMock);
      return fetchMock;
    }

    it('shows Convert Lead button on unconverted leads', async () => {
      mockLeadFetch(makeLeadRecord());
      renderPage('lead', 'lead-1');

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Convert Lead' })).toBeInTheDocument();
      });
    });

    it('does not show Convert Lead button for non-lead objects', async () => {
      mockFetch(makeRecordResponse());
      renderPage('account', 'rec-1');

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Test Record' })).toBeInTheDocument();
      });

      expect(screen.queryByRole('button', { name: 'Convert Lead' })).not.toBeInTheDocument();
    });

    it('shows Converted badge and links when lead is converted', async () => {
      const convertedLead = makeLeadRecord({
        fieldValues: {
          status: 'Converted',
          converted_account_id: 'acc-1',
          converted_contact_id: 'con-1',
          converted_opportunity_id: 'opp-1',
        },
      });
      mockLeadFetch(convertedLead);
      renderPage('lead', 'lead-1');

      await waitFor(() => {
        expect(screen.getByText('Converted')).toBeInTheDocument();
      });

      expect(screen.getByRole('link', { name: 'View Account' })).toHaveAttribute(
        'href',
        '/objects/account/acc-1',
      );
      expect(screen.getByRole('link', { name: 'View Contact' })).toHaveAttribute(
        'href',
        '/objects/contact/con-1',
      );
      expect(screen.getByRole('link', { name: 'View Opportunity' })).toHaveAttribute(
        'href',
        '/objects/opportunity/opp-1',
      );
    });

    it('hides Edit and Delete buttons when lead is converted', async () => {
      const convertedLead = makeLeadRecord({
        fieldValues: {
          status: 'Converted',
          converted_account_id: 'acc-1',
          converted_contact_id: 'con-1',
        },
      });
      mockLeadFetch(convertedLead);
      renderPage('lead', 'lead-1');

      await waitFor(() => {
        expect(screen.getByText('Converted')).toBeInTheDocument();
      });

      expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Convert Lead' })).not.toBeInTheDocument();
    });

    it('opens conversion modal when Convert Lead is clicked', async () => {
      mockLeadFetch(makeLeadRecord());
      const user = userEvent.setup();
      renderPage('lead', 'lead-1');

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Convert Lead' })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Convert Lead' }));

      await waitFor(() => {
        expect(screen.getByRole('dialog', { name: /Convert Lead: Jane Smith/i })).toBeInTheDocument();
      });
    });

    it('shows field mapping preview in conversion modal', async () => {
      mockLeadFetch(makeLeadRecord());
      const user = userEvent.setup();
      renderPage('lead', 'lead-1');

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Convert Lead' })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Convert Lead' }));

      const dialog = await screen.findByRole('dialog', { name: /Convert Lead: Jane Smith/i });
      const modal = within(dialog);

      await waitFor(() => {
        expect(modal.getByText('Account')).toBeInTheDocument();
        expect(modal.getByText('Acme Corp')).toBeInTheDocument();
        expect(modal.getByText('Contact')).toBeInTheDocument();
        expect(modal.getByText('jane@example.com')).toBeInTheDocument();
      });
    });

    it('allows toggling opportunity creation off', async () => {
      mockLeadFetch(makeLeadRecord());
      const user = userEvent.setup();
      renderPage('lead', 'lead-1');

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Convert Lead' })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Convert Lead' }));

      await waitFor(() => {
        expect(screen.getByText('Opportunity')).toBeInTheDocument();
      });

      const checkbox = screen.getByLabelText('Create opportunity');
      expect(checkbox).toBeChecked();

      await user.click(checkbox);
      expect(checkbox).not.toBeChecked();
    });

    it('closes modal when Cancel is clicked', async () => {
      mockLeadFetch(makeLeadRecord());
      const user = userEvent.setup();
      renderPage('lead', 'lead-1');

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Convert Lead' })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Convert Lead' }));

      await waitFor(() => {
        expect(screen.getByRole('dialog', { name: /Convert Lead/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Cancel' }));

      await waitFor(() => {
        expect(screen.queryByRole('dialog', { name: /Convert Lead/i })).not.toBeInTheDocument();
      });
    });
  });
});
