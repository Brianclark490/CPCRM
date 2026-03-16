import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
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
      expect(screen.getByRole('heading', { name: 'Opportunity' })).toBeInTheDocument();
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

  it('renders tabs for Fields, Relationships, Layouts', async () => {
    mockFetchObject();
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Fields' })).toBeInTheDocument();
    });
    expect(screen.getByRole('tab', { name: 'Relationships' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Layouts' })).toBeInTheDocument();
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
    expect(requiredBadges.length).toBe(2); // Name and Stage are required
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

  it('switches to Relationships tab', async () => {
    mockFetchObject();
    const user = userEvent.setup();

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Relationships' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('tab', { name: 'Relationships' }));

    expect(screen.getByText('Relationship management coming soon.')).toBeInTheDocument();
  });

  it('switches to Layouts tab', async () => {
    mockFetchObject();
    const user = userEvent.setup();

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Layouts' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('tab', { name: 'Layouts' }));

    expect(screen.getByText('Layout builder coming soon.')).toBeInTheDocument();
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
});
