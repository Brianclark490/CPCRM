import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { FieldBuilderPage } from '../pages/FieldBuilderPage.js';

vi.mock('@descope/react-sdk', () => ({
  useSession: vi.fn(),
}));

const { useSession } = await import('@descope/react-sdk');

function renderPage(objectId = 'obj-1') {
  return render(
    <MemoryRouter initialEntries={[`/admin/objects/${objectId}`]}>
      <Routes>
        <Route path="/admin/objects/:id" element={<FieldBuilderPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

const sampleObject = {
  id: 'obj-1',
  apiName: 'opportunity',
  label: 'Opportunity',
  pluralLabel: 'Opportunities',
  description: 'Sales opportunities',
  icon: '💼',
  isSystem: true,
  fields: [
    {
      id: 'field-1',
      objectId: 'obj-1',
      apiName: 'name',
      label: 'Name',
      fieldType: 'text',
      required: true,
      options: {},
      sortOrder: 1,
      isSystem: true,
    },
    {
      id: 'field-2',
      objectId: 'obj-1',
      apiName: 'amount',
      label: 'Amount',
      fieldType: 'currency',
      required: false,
      options: { min: 0, precision: 2 },
      sortOrder: 2,
      isSystem: false,
    },
    {
      id: 'field-3',
      objectId: 'obj-1',
      apiName: 'stage',
      label: 'Stage',
      fieldType: 'dropdown',
      required: true,
      options: { choices: ['Prospecting', 'Negotiation', 'Closed Won'] },
      sortOrder: 3,
      isSystem: false,
    },
  ],
  relationships: [],
  layouts: [],
};

function mockFetchObject(data: unknown = sampleObject) {
  vi.mocked(fetch).mockResolvedValue({
    ok: true,
    json: async () => data,
  } as Response);
}

const sampleAllObjects = [
  {
    id: 'obj-1',
    apiName: 'opportunity',
    label: 'Opportunity',
    pluralLabel: 'Opportunities',
    isSystem: true,
    fieldCount: 3,
    recordCount: 0,
  },
  {
    id: 'obj-2',
    apiName: 'account',
    label: 'Account',
    pluralLabel: 'Accounts',
    isSystem: true,
    fieldCount: 2,
    recordCount: 0,
  },
  {
    id: 'obj-3',
    apiName: 'custom_project',
    label: 'Custom Project',
    pluralLabel: 'Custom Projects',
    isSystem: false,
    fieldCount: 1,
    recordCount: 0,
  },
];

const sampleRelationships = [
  {
    id: 'rel-1',
    sourceObjectId: 'obj-1',
    targetObjectId: 'obj-2',
    relationshipType: 'lookup',
    apiName: 'opportunity_account',
    label: 'Account',
    reverseLabel: 'Opportunities',
    required: true,
    createdAt: '2024-01-01T00:00:00Z',
    sourceObjectLabel: 'Opportunity',
    sourceObjectPluralLabel: 'Opportunities',
    targetObjectLabel: 'Account',
    targetObjectPluralLabel: 'Accounts',
  },
  {
    id: 'rel-2',
    sourceObjectId: 'obj-1',
    targetObjectId: 'obj-3',
    relationshipType: 'parent_child',
    apiName: 'opportunity_project',
    label: 'Project',
    reverseLabel: undefined,
    required: false,
    createdAt: '2024-01-02T00:00:00Z',
    sourceObjectLabel: 'Opportunity',
    sourceObjectPluralLabel: 'Opportunities',
    targetObjectLabel: 'Custom Project',
    targetObjectPluralLabel: 'Custom Projects',
  },
];

function mockFetchForRelationshipsTab(
  relationships = sampleRelationships,
  objects = sampleAllObjects,
) {
  const mockFetch = vi.fn();
  // First call: fetch object definition
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => sampleObject,
  } as Response);
  // Second call: fetch relationships
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => relationships,
  } as Response);
  // Third call: fetch all objects
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => objects,
  } as Response);
  vi.stubGlobal('fetch', mockFetch);
  return mockFetch;
}

describe('FieldBuilderPage', () => {
  beforeEach(() => {
    vi.mocked(useSession).mockReturnValue({
      isAuthenticated: true,
      isSessionLoading: false,
      sessionToken: 'test-token',
      claims: {},
    });
    vi.stubGlobal('fetch', vi.fn());
  });

  it('renders the object label and api name', async () => {
    mockFetchObject();
    renderPage();

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /Opportunity/ }),
      ).toBeInTheDocument();
    });
    expect(screen.getByText('opportunity')).toBeInTheDocument();
  });

  it('renders the object description', async () => {
    mockFetchObject();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Sales opportunities')).toBeInTheDocument();
    });
  });

  it('resolves text icon names to emoji icons', async () => {
    mockFetchObject({ ...sampleObject, icon: 'building' });
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('🏢')).toBeInTheDocument();
    });
    expect(screen.queryByText('building')).not.toBeInTheDocument();
  });

  it('renders the breadcrumb with a link to Object Manager', async () => {
    mockFetchObject();
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Object Manager' })).toHaveAttribute(
        'href',
        '/admin/objects',
      );
    });
  });

  it('renders tabs for Fields, Relationships, and Page Layout', async () => {
    mockFetchObject();
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Fields' })).toBeInTheDocument();
    });
    expect(screen.getByRole('tab', { name: 'Relationships' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Page Layout' })).toBeInTheDocument();
  });

  it('shows the Fields tab as active by default', async () => {
    mockFetchObject();
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Fields' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
    });
  });

  it('renders a table of fields with correct columns', async () => {
    mockFetchObject();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Name')).toBeInTheDocument();
    });
    expect(screen.getByText('Amount')).toBeInTheDocument();
    expect(screen.getByText('Stage')).toBeInTheDocument();
  });

  it('displays field types as badges', async () => {
    mockFetchObject();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('text')).toBeInTheDocument();
    });
    expect(screen.getByText('currency')).toBeInTheDocument();
    expect(screen.getByText('dropdown')).toBeInTheDocument();
  });

  it('shows required badge for required fields', async () => {
    mockFetchObject();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Name')).toBeInTheDocument();
    });

    const requiredBadges = screen.getAllByText('Required');
    // 1 column header + 2 badges (Name and Stage are required)
    expect(requiredBadges.length).toBe(3);
  });

  it('shows system badge with lock icon for system fields', async () => {
    mockFetchObject();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Name')).toBeInTheDocument();
    });

    expect(screen.getByText('System')).toBeInTheDocument();
  });

  it('shows delete button only for custom fields', async () => {
    mockFetchObject();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Amount')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: 'Delete Amount' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete Stage' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete Name' })).not.toBeInTheDocument();
  });

  it('shows reorder buttons for each field', async () => {
    mockFetchObject();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Name')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: 'Move Name up' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move Name down' })).toBeInTheDocument();
  });

  it('disables up button for first field and down button for last field', async () => {
    mockFetchObject();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Name')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: 'Move Name up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Stage down' })).toBeDisabled();
  });

  it('renders an "Add field" button', async () => {
    mockFetchObject();
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Add field/ })).toBeInTheDocument();
    });
  });

  it('opens the add field modal when "Add field" button is clicked', async () => {
    mockFetchObject();
    const user = userEvent.setup();

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Add field/ })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Add field/ }));

    expect(screen.getByRole('dialog', { name: 'Add field' })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Label/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^API name/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Field type/)).toBeInTheDocument();
  });

  it('auto-generates api_name from label in add field modal', async () => {
    mockFetchObject();
    const user = userEvent.setup();

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Add field/ })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Add field/ }));

    const labelInput = screen.getByLabelText(/^Label/);
    await user.type(labelInput, 'My Custom Field');

    const apiNameInput = screen.getByLabelText(/^API name/) as HTMLInputElement;
    expect(apiNameInput.value).toBe('my_custom_field');
  });

  it('shows choices editor when dropdown field type is selected', async () => {
    mockFetchObject();
    const user = userEvent.setup();

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Add field/ })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Add field/ }));

    const fieldTypeSelect = screen.getByLabelText(/^Field type/);
    await user.selectOptions(fieldTypeSelect, 'dropdown');

    expect(screen.getByText('Choices')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add choice/ })).toBeInTheDocument();
  });

  it('shows number options when number field type is selected', async () => {
    mockFetchObject();
    const user = userEvent.setup();

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Add field/ })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Add field/ }));

    const fieldTypeSelect = screen.getByLabelText(/^Field type/);
    await user.selectOptions(fieldTypeSelect, 'number');

    expect(screen.getByLabelText('Min')).toBeInTheDocument();
    expect(screen.getByLabelText('Max')).toBeInTheDocument();
    expect(screen.getByLabelText('Precision')).toBeInTheDocument();
  });

  it('shows max length option when text field type is selected', async () => {
    mockFetchObject();
    const user = userEvent.setup();

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Add field/ })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Add field/ }));

    // Text is the default, so max length should be visible
    expect(screen.getByLabelText('Max length')).toBeInTheDocument();
  });

  it('validates required fields in the add field modal', async () => {
    mockFetchObject();
    const user = userEvent.setup();

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Add field/ })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Add field/ }));

    // Clear the label and submit
    const submitButtons = screen.getAllByRole('button', { name: /Add field/ });
    const submitButton = submitButtons[submitButtons.length - 1];
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Label is required')).toBeInTheDocument();
    });
  });

  it('opens delete confirmation when delete button is clicked', async () => {
    mockFetchObject();
    const user = userEvent.setup();

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Amount')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Delete Amount' }));

    expect(screen.getByRole('dialog', { name: 'Confirm delete' })).toBeInTheDocument();
    expect(screen.getByText(/Are you sure you want to delete/)).toBeInTheDocument();
  });

  it('closes the add field modal when cancel is clicked', async () => {
    mockFetchObject();
    const user = userEvent.setup();

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Add field/ })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Add field/ }));
    expect(screen.getByRole('dialog', { name: 'Add field' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog', { name: 'Add field' })).not.toBeInTheDocument();
  });

  it('switches to Relationships tab and shows relationships', async () => {
    mockFetchForRelationshipsTab();
    const user = userEvent.setup();

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Relationships' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('tab', { name: 'Relationships' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Relationships/ })).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /Add relationship/ })).toBeInTheDocument();
  });

  it('displays relationship list with label, related object, type, and required badge', async () => {
    mockFetchForRelationshipsTab();
    const user = userEvent.setup();

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Relationships' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('tab', { name: 'Relationships' }));

    await waitFor(() => {
      expect(screen.getAllByText('Account').length).toBeGreaterThan(0);
    });

    expect(screen.getByText('Project')).toBeInTheDocument();
    expect(screen.getByText('Lookup')).toBeInTheDocument();
    expect(screen.getByText('Parent–Child')).toBeInTheDocument();
    expect(screen.getByText('Custom Project')).toBeInTheDocument();
  });

  it('shows system badge for system relationships', async () => {
    mockFetchForRelationshipsTab();
    const user = userEvent.setup();

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Relationships' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('tab', { name: 'Relationships' }));

    await waitFor(() => {
      expect(screen.getAllByText('Account').length).toBeGreaterThan(0);
    });

    // rel-1 is between two system objects (obj-1 and obj-2), so it should show System badge
    expect(screen.getByText('System')).toBeInTheDocument();
  });

  it('shows delete button only for non-system relationships', async () => {
    mockFetchForRelationshipsTab();
    const user = userEvent.setup();

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Relationships' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('tab', { name: 'Relationships' }));

    await waitFor(() => {
      expect(screen.getByText('Project')).toBeInTheDocument();
    });

    // rel-2 (Project) is between system obj-1 and custom obj-3, so delete should be available
    expect(screen.getByRole('button', { name: 'Delete Project' })).toBeInTheDocument();
    // rel-1 (Account) is between two system objects, no delete button
    expect(screen.queryByRole('button', { name: 'Delete Account' })).not.toBeInTheDocument();
  });

  it('shows reverse label context for relationships', async () => {
    mockFetchForRelationshipsTab();
    const user = userEvent.setup();

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Relationships' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('tab', { name: 'Relationships' }));

    await waitFor(() => {
      expect(screen.getAllByText('Account').length).toBeGreaterThan(0);
    });

    expect(
      screen.getByText("Shows as 'Opportunities' on the Account page"),
    ).toBeInTheDocument();
  });

  it('opens add relationship modal', async () => {
    mockFetchForRelationshipsTab();
    const user = userEvent.setup();

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Relationships' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('tab', { name: 'Relationships' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Add relationship/ })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Add relationship/ }));

    expect(screen.getByRole('dialog', { name: 'Add relationship' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Target object/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Relationship type/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Label/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Reverse label/)).toBeInTheDocument();
  });

  it('validates required fields in add relationship modal', async () => {
    mockFetchForRelationshipsTab();
    const user = userEvent.setup();

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Relationships' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('tab', { name: 'Relationships' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Add relationship/ })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Add relationship/ }));

    // Submit without filling out form
    const submitButtons = screen.getAllByRole('button', { name: /Add relationship/ });
    const submitButton = submitButtons[submitButtons.length - 1];
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Target object is required')).toBeInTheDocument();
    });
  });

  it('opens delete confirmation for non-system relationship', async () => {
    mockFetchForRelationshipsTab();
    const user = userEvent.setup();

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Relationships' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('tab', { name: 'Relationships' }));

    await waitFor(() => {
      expect(screen.getByText('Project')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Delete Project' }));

    expect(
      screen.getByRole('dialog', { name: 'Confirm delete relationship' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Are you sure you want to delete the/)).toBeInTheDocument();
  });

  it('shows empty state when no relationships exist', async () => {
    mockFetchForRelationshipsTab([]);
    const user = userEvent.setup();

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Relationships' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('tab', { name: 'Relationships' }));

    await waitFor(() => {
      expect(screen.getByText('No relationships yet')).toBeInTheDocument();
    });
  });

  it('shows an error message when the fetch fails', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Not found' }),
    } as Response);

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Failed to load object definition.',
      );
    });
  });

  it('shows field count in the section header', async () => {
    mockFetchObject();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('(3)')).toBeInTheDocument();
    });
  });

  it('shows empty state when there are no fields', async () => {
    mockFetchObject({
      ...sampleObject,
      fields: [],
    });
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('No fields yet')).toBeInTheDocument();
    });
  });

  it('opens the edit field modal when clicking a custom field row', async () => {
    mockFetchObject();
    const user = userEvent.setup();

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Amount')).toBeInTheDocument();
    });

    // Click the Amount field row to edit it
    const amountRow = screen.getByText('Amount').closest('tr')!;
    await user.click(amountRow);

    expect(screen.getByRole('dialog', { name: 'Edit field' })).toBeInTheDocument();
    const labelInput = screen.getByLabelText(/^Label/) as HTMLInputElement;
    expect(labelInput.value).toBe('Amount');
  });

  it('opens the edit field modal when clicking a system field row', async () => {
    mockFetchObject();
    const user = userEvent.setup();

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Name')).toBeInTheDocument();
    });

    // Click the system field "Name" row to edit it
    const nameRow = screen.getByText('Name').closest('tr')!;
    await user.click(nameRow);

    expect(screen.getByRole('dialog', { name: 'Edit field' })).toBeInTheDocument();
    const labelInput = screen.getByLabelText(/^Label/) as HTMLInputElement;
    expect(labelInput.value).toBe('Name');
  });

  it('disables field type and api name but allows other inputs when editing a system field', async () => {
    mockFetchObject();
    const user = userEvent.setup();

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Name')).toBeInTheDocument();
    });

    const nameRow = screen.getByText('Name').closest('tr')!;
    await user.click(nameRow);

    expect(screen.getByRole('dialog', { name: 'Edit field' })).toBeInTheDocument();

    // API name and field type should be disabled
    expect(screen.getByLabelText(/^API name/)).toBeDisabled();
    expect(screen.getByLabelText(/^Field type/)).toBeDisabled();

    // Label, description, required, and default value should be enabled
    expect(screen.getByLabelText(/^Label/)).not.toBeDisabled();
    expect(screen.getByLabelText(/^Description/)).not.toBeDisabled();
    expect(screen.getByLabelText(/^Default value/)).not.toBeDisabled();

    // System field type hint should be visible
    expect(screen.getByText('Field type cannot be changed on system fields.')).toBeInTheDocument();
  });

  it('allows editing dropdown choices on a system dropdown field', async () => {
    const objectWithSystemDropdown = {
      ...sampleObject,
      fields: [
        {
          id: 'field-sys-dropdown',
          objectId: 'obj-1',
          apiName: 'status',
          label: 'Status',
          fieldType: 'dropdown',
          required: true,
          options: { choices: ['Active', 'Inactive'] },
          sortOrder: 1,
          isSystem: true,
        },
      ],
    };
    mockFetchObject(objectWithSystemDropdown);
    const user = userEvent.setup();

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('cell', { name: 'Status' })).toBeInTheDocument();
    });

    const statusCell = screen.getByRole('cell', { name: 'Status' });
    const statusRow = statusCell.closest('tr')!;
    await user.click(statusRow);

    expect(screen.getByRole('dialog', { name: 'Edit field' })).toBeInTheDocument();

    // Choices editor should be visible with existing choices
    expect(screen.getByText('Choices')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add choice/ })).toBeInTheDocument();

    // Existing choices should be populated
    const choiceInputs = screen.getAllByPlaceholderText(/Choice \d+/);
    expect(choiceInputs).toHaveLength(2);
    expect((choiceInputs[0] as HTMLInputElement).value).toBe('Active');
    expect((choiceInputs[1] as HTMLInputElement).value).toBe('Inactive');
  });

  it('calls the reorder API when moving a field', async () => {
    const mockFetch = vi.fn();
    // First call: fetch object
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => sampleObject,
    } as Response);
    // Second call: reorder
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => sampleObject.fields,
    } as Response);

    vi.stubGlobal('fetch', mockFetch);

    const user = userEvent.setup();

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Amount')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Move Amount down' }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    const reorderCall = mockFetch.mock.calls[1];
    expect(reorderCall[0]).toBe('/api/admin/objects/obj-1/fields/reorder');
    expect(reorderCall[1].method).toBe('PATCH');
  });

  it('shows multi_select choices editor', async () => {
    mockFetchObject();
    const user = userEvent.setup();

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Add field/ })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Add field/ }));

    const fieldTypeSelect = screen.getByLabelText(/^Field type/);
    await user.selectOptions(fieldTypeSelect, 'multi_select');

    expect(screen.getByText('Choices')).toBeInTheDocument();
  });

  it('shows currency options (min, max, precision)', async () => {
    mockFetchObject();
    const user = userEvent.setup();

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Add field/ })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Add field/ }));

    const fieldTypeSelect = screen.getByLabelText(/^Field type/);
    await user.selectOptions(fieldTypeSelect, 'currency');

    expect(screen.getByLabelText('Min')).toBeInTheDocument();
    expect(screen.getByLabelText('Max')).toBeInTheDocument();
    expect(screen.getByLabelText('Precision')).toBeInTheDocument();
  });

  it('switches to Page Layout tab when clicked', async () => {
    const mockFetch = vi.fn();
    // First call: fetch object definition
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => sampleObject,
    } as Response);
    // Second call: fetch layouts (from LayoutBuilderTab)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    } as Response);
    vi.stubGlobal('fetch', mockFetch);

    const user = userEvent.setup();

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Page Layout' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('tab', { name: 'Page Layout' }));

    expect(screen.getByRole('tab', { name: 'Page Layout' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

});
