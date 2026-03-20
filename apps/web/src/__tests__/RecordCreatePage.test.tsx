import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { RecordCreatePage } from '../pages/RecordCreatePage.js';

vi.mock('@descope/react-sdk', () => ({
  useSession: vi.fn(),
}));

const { useSession } = await import('@descope/react-sdk');

function renderPage(apiName = 'account') {
  return render(
    <MemoryRouter initialEntries={[`/objects/${apiName}/new`]}>
      <Routes>
        <Route path="/objects/:apiName/new" element={<RecordCreatePage />} />
        <Route path="/objects/:apiName/:id" element={<div>Detail Page</div>} />
        <Route path="/objects/:apiName" element={<div>List Page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function mockFetch(overrides: {
  objects?: Array<{ id: string; apiName: string; label: string; pluralLabel: string; isSystem: boolean }>;
  layouts?: Array<{ id: string; objectId: string; name: string; layoutType: string; isDefault: boolean }>;
  layoutDetail?: {
    id: string;
    objectId: string;
    name: string;
    layoutType: string;
    isDefault: boolean;
    fields: Array<{
      fieldId: string;
      fieldApiName: string;
      fieldLabel: string;
      fieldType: string;
      fieldRequired: boolean;
      fieldOptions: Record<string, unknown>;
      sortOrder: number;
      section: number;
      sectionLabel?: string;
      width: string;
    }>;
  };
  fieldDefs?: Array<{
    id: string;
    objectId: string;
    apiName: string;
    label: string;
    fieldType: string;
    required: boolean;
    options: Record<string, unknown>;
    sortOrder: number;
  }>;
  relationships?: Array<{
    id: string;
    sourceObjectId: string;
    targetObjectId: string;
    relationshipType: string;
    apiName: string;
    label: string;
    required: boolean;
    targetObjectApiName?: string;
    targetObjectLabel?: string;
  }>;
  createResponse?: { id: string };
  createError?: { error: string };
} = {}) {
  const objects = overrides.objects ?? [
    { id: 'obj-1', apiName: 'account', label: 'Account', pluralLabel: 'Accounts', isSystem: true },
  ];

  const layouts = overrides.layouts ?? [
    { id: 'layout-1', objectId: 'obj-1', name: 'Default Form', layoutType: 'form', isDefault: true },
  ];

  const layoutDetail = overrides.layoutDetail ?? {
    id: 'layout-1',
    objectId: 'obj-1',
    name: 'Default Form',
    layoutType: 'form',
    isDefault: true,
    fields: [
      {
        fieldId: 'f0',
        fieldApiName: 'name',
        fieldLabel: 'Account Name',
        fieldType: 'text',
        fieldRequired: true,
        fieldOptions: { max_length: 255 },
        sortOrder: 0,
        section: 0,
        sectionLabel: 'Details',
        width: 'full',
      },
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
  };

  const relationships = overrides.relationships ?? [];

  const fieldDefs = overrides.fieldDefs ?? [
    { id: 'f0', objectId: 'obj-1', apiName: 'name', label: 'Account Name', fieldType: 'text', required: true, options: { max_length: 255 }, sortOrder: 1 },
    { id: 'f1', objectId: 'obj-1', apiName: 'industry', label: 'Industry', fieldType: 'text', required: false, options: {}, sortOrder: 2 },
    { id: 'f2', objectId: 'obj-1', apiName: 'email', label: 'Email', fieldType: 'email', required: false, options: {}, sortOrder: 3 },
  ];

  const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    // Admin objects list
    if (typeof url === 'string' && url.includes('/api/admin/objects') && !url.includes('/layouts') && !url.includes('/relationships') && !url.includes('/fields')) {
      return Promise.resolve({
        ok: true,
        json: async () => objects,
      } as Response);
    }

    // Field definitions list
    if (typeof url === 'string' && url.includes('/fields')) {
      return Promise.resolve({
        ok: true,
        json: async () => fieldDefs,
      } as Response);
    }

    // Layout detail
    if (typeof url === 'string' && url.match(/\/layouts\/[^/]+$/)) {
      return Promise.resolve({
        ok: true,
        json: async () => layoutDetail,
      } as Response);
    }

    // Layouts list
    if (typeof url === 'string' && url.includes('/layouts')) {
      return Promise.resolve({
        ok: true,
        json: async () => layouts,
      } as Response);
    }

    // Relationships list
    if (typeof url === 'string' && url.includes('/relationships') && (!init || init.method !== 'POST')) {
      return Promise.resolve({
        ok: true,
        json: async () => relationships,
      } as Response);
    }

    // Create record
    if (typeof url === 'string' && url.match(/\/api\/objects\/[^/]+\/records$/) && init?.method === 'POST') {
      if (overrides.createError) {
        return Promise.resolve({
          ok: false,
          status: 400,
          json: async () => overrides.createError,
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        status: 201,
        json: async () => overrides.createResponse ?? { id: 'new-rec-1' },
      } as Response);
    }

    // Link relationship
    if (typeof url === 'string' && url.includes('/relationships') && init?.method === 'POST') {
      return Promise.resolve({
        ok: true,
        status: 201,
        json: async () => ({ id: 'link-1' }),
      } as Response);
    }

    // Records search (for relationship dropdown)
    if (typeof url === 'string' && url.match(/\/api\/objects\/[^/]+\/records\?/)) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          data: [
            { id: 'rec-1', name: 'Related Record 1' },
            { id: 'rec-2', name: 'Related Record 2' },
          ],
          total: 2,
          page: 1,
          limit: 10,
        }),
      } as Response);
    }

    return Promise.resolve({ ok: false, json: async () => ({}) } as Response);
  });

  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('RecordCreatePage', () => {
  beforeEach(() => {
    vi.mocked(useSession).mockReturnValue({
      isAuthenticated: true,
      isSessionLoading: false,
      sessionToken: 'test-token',
      claims: {},
    });
  });

  it('renders the create page heading with object label', async () => {
    mockFetch();
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Create account/i })).toBeInTheDocument();
    });
  });

  it('renders a breadcrumb navigation to the list page', async () => {
    mockFetch();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Accounts')).toBeInTheDocument();
    });
  });

  it('renders the name field from layout', async () => {
    mockFetch();
    renderPage();

    await waitFor(() => {
      expect(screen.getByLabelText(/Account Name/)).toBeInTheDocument();
    });
  });

  it('renders form fields from the layout', async () => {
    mockFetch();
    renderPage();

    await waitFor(() => {
      expect(screen.getByLabelText('Industry')).toBeInTheDocument();
      expect(screen.getByLabelText('Email')).toBeInTheDocument();
    });
  });

  it('renders section labels from layout metadata', async () => {
    mockFetch();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Details')).toBeInTheDocument();
    });
  });

  it('shows validation error when required name field is empty on submit', async () => {
    mockFetch();
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Create account/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Create account/i }));

    await waitFor(() => {
      expect(screen.getByText('Account Name is required')).toBeInTheDocument();
    });
  });

  it('shows validation error for required fields', async () => {
    mockFetch({
      layoutDetail: {
        id: 'layout-1',
        objectId: 'obj-1',
        name: 'Default Form',
        layoutType: 'form',
        isDefault: true,
        fields: [
          {
            fieldId: 'f0',
            fieldApiName: 'name',
            fieldLabel: 'Account Name',
            fieldType: 'text',
            fieldRequired: true,
            fieldOptions: { max_length: 255 },
            sortOrder: 0,
            section: 0,
            sectionLabel: 'Details',
            width: 'full',
          },
          {
            fieldId: 'f1',
            fieldApiName: 'industry',
            fieldLabel: 'Industry',
            fieldType: 'text',
            fieldRequired: true,
            fieldOptions: {},
            sortOrder: 1,
            section: 0,
            sectionLabel: 'Details',
            width: 'half',
          },
        ],
      },
    });
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByLabelText(/Industry/)).toBeInTheDocument();
    });

    // Fill in Account Name but leave required field empty
    await user.type(screen.getByLabelText(/Account Name/), 'Test Record');
    await user.click(screen.getByRole('button', { name: /Create account/i }));

    await waitFor(() => {
      expect(screen.getByText('Industry is required')).toBeInTheDocument();
    });
  });

  it('shows email validation error for invalid email', async () => {
    mockFetch({
      layoutDetail: {
        id: 'layout-1',
        objectId: 'obj-1',
        name: 'Default Form',
        layoutType: 'form',
        isDefault: true,
        fields: [
          {
            fieldId: 'f0',
            fieldApiName: 'name',
            fieldLabel: 'Account Name',
            fieldType: 'text',
            fieldRequired: true,
            fieldOptions: { max_length: 255 },
            sortOrder: 0,
            section: 0,
            sectionLabel: 'Details',
            width: 'full',
          },
          {
            fieldId: 'f2',
            fieldApiName: 'email',
            fieldLabel: 'Email',
            fieldType: 'email',
            fieldRequired: false,
            fieldOptions: {},
            sortOrder: 1,
            section: 0,
            sectionLabel: 'Details',
            width: 'half',
          },
        ],
      },
    });
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByLabelText('Email')).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText(/Account Name/), 'Test Record');
    await user.type(screen.getByLabelText('Email'), 'not-an-email');
    await user.click(screen.getByRole('button', { name: /Create account/i }));

    await waitFor(() => {
      expect(screen.getByText('Email must be a valid email address')).toBeInTheDocument();
    });
  });

  it('submits the form and redirects on success', async () => {
    const fetchMock = mockFetch({ createResponse: { id: 'new-rec-42' } });
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByLabelText(/Account Name/)).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText(/Account Name/), 'New Account');
    await user.click(screen.getByRole('button', { name: /Create account/i }));

    await waitFor(() => {
      // Verify the record creation API was called
      const calls = fetchMock.mock.calls;
      const createCall = calls.find(
        (c: unknown[]) =>
          typeof c[0] === 'string' &&
          (c[0] as string).match(/\/api\/objects\/account\/records$/) &&
          (c[1] as RequestInit)?.method === 'POST',
      );
      expect(createCall).toBeDefined();
    });

    // Should redirect to detail page
    await waitFor(() => {
      expect(screen.getByText('Detail Page')).toBeInTheDocument();
    });
  });

  it('shows server error message on create failure', async () => {
    mockFetch({ createError: { error: 'Validation failed: name too long' } });
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByLabelText(/Account Name/)).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText(/Account Name/), 'Test Account');
    await user.click(screen.getByRole('button', { name: /Create account/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Validation failed: name too long');
    });
  });

  it('shows error when object type is not found', async () => {
    mockFetch({ objects: [] });
    renderPage('nonexistent');

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Object type not found.');
    });
  });

  it('renders cancel button that navigates back', async () => {
    mockFetch();
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => {
      expect(screen.getByText('List Page')).toBeInTheDocument();
    });
  });

  it('renders relationship fields when relationships exist', async () => {
    mockFetch({
      relationships: [
        {
          id: 'rel-1',
          sourceObjectId: 'obj-1',
          targetObjectId: 'obj-2',
          relationshipType: 'lookup',
          apiName: 'parent_account',
          label: 'Parent Account',
          required: false,
          targetObjectApiName: 'account',
          targetObjectLabel: 'Account',
        },
      ],
    });
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Relationships')).toBeInTheDocument();
      expect(screen.getByText('Parent Account')).toBeInTheDocument();
    });
  });

  it('shows required indicator on required relationship fields', async () => {
    mockFetch({
      relationships: [
        {
          id: 'rel-1',
          sourceObjectId: 'obj-1',
          targetObjectId: 'obj-2',
          relationshipType: 'lookup',
          apiName: 'parent_account',
          label: 'Parent Account',
          required: true,
          targetObjectApiName: 'account',
          targetObjectLabel: 'Account',
        },
      ],
    });
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Parent Account')).toBeInTheDocument();
    });

    // Try to submit without selecting a relationship
    await user.type(screen.getByLabelText(/Account Name/), 'Test Record');
    await user.click(screen.getByRole('button', { name: /Create account/i }));

    await waitFor(() => {
      expect(screen.getByText('Parent Account is required')).toBeInTheDocument();
    });
  });

  it('renders different field types correctly', async () => {
    mockFetch({
      layoutDetail: {
        id: 'layout-1',
        objectId: 'obj-1',
        name: 'Default Form',
        layoutType: 'form',
        isDefault: true,
        fields: [
          {
            fieldId: 'f1',
            fieldApiName: 'description',
            fieldLabel: 'Description',
            fieldType: 'textarea',
            fieldRequired: false,
            fieldOptions: {},
            sortOrder: 1,
            section: 0,
            sectionLabel: 'Details',
            width: 'full',
          },
          {
            fieldId: 'f2',
            fieldApiName: 'is_active',
            fieldLabel: 'Active',
            fieldType: 'boolean',
            fieldRequired: false,
            fieldOptions: {},
            sortOrder: 2,
            section: 0,
            sectionLabel: 'Details',
            width: 'half',
          },
          {
            fieldId: 'f3',
            fieldApiName: 'status',
            fieldLabel: 'Status',
            fieldType: 'dropdown',
            fieldRequired: false,
            fieldOptions: { choices: ['Active', 'Inactive', 'Pending'] },
            sortOrder: 3,
            section: 0,
            sectionLabel: 'Details',
            width: 'half',
          },
        ],
      },
    });
    renderPage();

    await waitFor(() => {
      // Textarea
      expect(screen.getByLabelText('Description')).toBeInTheDocument();
      // Boolean (toggle displays as "No" initially)
      expect(screen.getByText('No')).toBeInTheDocument();
      // Dropdown
      expect(screen.getByLabelText('Status')).toBeInTheDocument();
    });
  });

  it('clears field error when user types in the field', async () => {
    mockFetch();
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByLabelText(/Account Name/)).toBeInTheDocument();
    });

    // Submit to trigger validation
    await user.click(screen.getByRole('button', { name: /Create account/i }));

    await waitFor(() => {
      expect(screen.getByText('Account Name is required')).toBeInTheDocument();
    });

    // Type to clear error
    await user.type(screen.getByLabelText(/Account Name/), 'A');

    await waitFor(() => {
      expect(screen.queryByText('Account Name is required')).not.toBeInTheDocument();
    });
  });

  it('renders number field with validation for range', async () => {
    mockFetch({
      layoutDetail: {
        id: 'layout-1',
        objectId: 'obj-1',
        name: 'Default Form',
        layoutType: 'form',
        isDefault: true,
        fields: [
          {
            fieldId: 'f0',
            fieldApiName: 'name',
            fieldLabel: 'Account Name',
            fieldType: 'text',
            fieldRequired: true,
            fieldOptions: { max_length: 255 },
            sortOrder: 0,
            section: 0,
            sectionLabel: 'Details',
            width: 'full',
          },
          {
            fieldId: 'f1',
            fieldApiName: 'amount',
            fieldLabel: 'Amount',
            fieldType: 'number',
            fieldRequired: false,
            fieldOptions: { min: 0, max: 1000 },
            sortOrder: 1,
            section: 0,
            sectionLabel: 'Details',
            width: 'half',
          },
        ],
      },
    });
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByLabelText('Amount')).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText(/Account Name/), 'Test');
    // The FieldInput's number handler will convert "2000" to Number(2000)
    // We need to fire change manually since FieldInput onChange returns a number
    await user.type(screen.getByLabelText('Amount'), '2000');
    await user.click(screen.getByRole('button', { name: /Create account/i }));

    await waitFor(() => {
      expect(screen.getByText('Amount must be at most 1000')).toBeInTheDocument();
    });
  });

  it('falls back to field definitions when no form layout exists', async () => {
    mockFetch({
      layouts: [],
      fieldDefs: [
        { id: 'f0', objectId: 'obj-1', apiName: 'name', label: 'Account Name', fieldType: 'text', required: true, options: { max_length: 255 }, sortOrder: 1 },
        { id: 'f1', objectId: 'obj-1', apiName: 'acr_gbp', label: 'ACR (GBP)', fieldType: 'currency', required: false, options: {}, sortOrder: 2 },
        { id: 'f2', objectId: 'obj-1', apiName: 'gp_percent', label: 'GP %', fieldType: 'number', required: false, options: {}, sortOrder: 3 },
      ],
    });
    renderPage();

    await waitFor(() => {
      expect(screen.getByLabelText(/Account Name/)).toBeInTheDocument();
      expect(screen.getByLabelText('ACR (GBP)')).toBeInTheDocument();
      expect(screen.getByLabelText('GP %')).toBeInTheDocument();
    });
  });

  it('falls back to field definitions when form layout has no fields', async () => {
    mockFetch({
      layoutDetail: {
        id: 'layout-1',
        objectId: 'obj-1',
        name: 'Default Form',
        layoutType: 'form',
        isDefault: true,
        fields: [],
      },
      fieldDefs: [
        { id: 'f0', objectId: 'obj-1', apiName: 'name', label: 'Account Name', fieldType: 'text', required: true, options: { max_length: 255 }, sortOrder: 1 },
        { id: 'f1', objectId: 'obj-1', apiName: 'industry', label: 'Industry', fieldType: 'text', required: false, options: {}, sortOrder: 2 },
      ],
    });
    renderPage();

    await waitFor(() => {
      expect(screen.getByLabelText(/Account Name/)).toBeInTheDocument();
      expect(screen.getByLabelText('Industry')).toBeInTheDocument();
    });

    // Section label should use the object label
    expect(screen.getByText('Account details')).toBeInTheDocument();
  });
});
