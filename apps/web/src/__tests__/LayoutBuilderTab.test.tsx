import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LayoutBuilderTab } from '../components/LayoutBuilderTab.js';

vi.mock('@descope/react-sdk', () => ({
  useSession: vi.fn(() => ({ sessionToken: 'test-token' })),
}));

// ─── Test data ──────────────────────────────────────────────────────────────

const sampleFields = [
  {
    id: 'f1',
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
    id: 'f2',
    objectId: 'obj-1',
    apiName: 'email',
    label: 'Email',
    fieldType: 'email',
    required: false,
    options: {},
    sortOrder: 2,
    isSystem: false,
  },
  {
    id: 'f3',
    objectId: 'obj-1',
    apiName: 'amount',
    label: 'Amount',
    fieldType: 'currency',
    required: false,
    options: { min: 0, precision: 2 },
    sortOrder: 3,
    isSystem: false,
  },
];

const sampleLayouts = [
  { id: 'layout-form', objectId: 'obj-1', name: 'Default Form', layoutType: 'form', isDefault: true, createdAt: '2025-01-01', updatedAt: '2025-01-01' },
  { id: 'layout-list', objectId: 'obj-1', name: 'Default List', layoutType: 'list', isDefault: true, createdAt: '2025-01-01', updatedAt: '2025-01-01' },
];

const formLayoutDetail = {
  id: 'layout-form',
  objectId: 'obj-1',
  name: 'Default Form',
  layoutType: 'form',
  isDefault: true,
  createdAt: '2025-01-01',
  updatedAt: '2025-01-01',
  fields: [
    {
      id: 'lf1',
      layoutId: 'layout-form',
      fieldId: 'f1',
      section: 0,
      sectionLabel: 'Basic Info',
      sortOrder: 1,
      width: 'full',
      fieldApiName: 'name',
      fieldLabel: 'Name',
      fieldType: 'text',
      fieldRequired: true,
      fieldOptions: {},
    },
  ],
};

const listLayoutDetail = {
  id: 'layout-list',
  objectId: 'obj-1',
  name: 'Default List',
  layoutType: 'list',
  isDefault: true,
  createdAt: '2025-01-01',
  updatedAt: '2025-01-01',
  fields: [
    {
      id: 'lf2',
      layoutId: 'layout-list',
      fieldId: 'f1',
      section: 0,
      sectionLabel: 'Columns',
      sortOrder: 1,
      width: 'full',
      fieldApiName: 'name',
      fieldLabel: 'Name',
      fieldType: 'text',
      fieldRequired: true,
      fieldOptions: {},
    },
  ],
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function mockFetch(overrides?: {
  layouts?: typeof sampleLayouts;
  layoutDetail?: typeof formLayoutDetail;
  saveResponse?: unknown;
  createResponse?: unknown;
}) {
  const layouts = overrides?.layouts ?? sampleLayouts;

  const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    // Layout detail
    if (typeof url === 'string' && url.match(/\/layouts\/[^/]+\/fields$/) && init?.method === 'PUT') {
      return Promise.resolve({
        ok: true,
        json: async () => overrides?.saveResponse ?? formLayoutDetail,
      } as Response);
    }

    if (typeof url === 'string' && url.match(/\/layouts\/[^/]+$/) && init?.method === 'DELETE') {
      return Promise.resolve({ ok: true, status: 204 } as Response);
    }

    if (typeof url === 'string' && url.match(/\/layouts\/layout-form$/)) {
      return Promise.resolve({
        ok: true,
        json: async () => overrides?.layoutDetail ?? formLayoutDetail,
      } as Response);
    }

    if (typeof url === 'string' && url.match(/\/layouts\/layout-list$/)) {
      return Promise.resolve({
        ok: true,
        json: async () => listLayoutDetail,
      } as Response);
    }

    if (typeof url === 'string' && url.match(/\/layouts\/[^/]+$/)) {
      return Promise.resolve({
        ok: true,
        json: async () => overrides?.layoutDetail ?? formLayoutDetail,
      } as Response);
    }

    // Create layout
    if (typeof url === 'string' && url.includes('/layouts') && init?.method === 'POST') {
      if (overrides?.createResponse) {
        return Promise.resolve({
          ok: true,
          json: async () => overrides.createResponse,
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ id: 'layout-new', objectId: 'obj-1', name: 'Custom Form', layoutType: 'form', isDefault: false }),
      } as Response);
    }

    // Layouts list
    if (typeof url === 'string' && url.includes('/layouts')) {
      return Promise.resolve({
        ok: true,
        json: async () => layouts,
      } as Response);
    }

    return Promise.resolve({ ok: false, json: async () => ({}) } as Response);
  });

  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderComponent(props?: Partial<{
  objectId: string;
  fields: typeof sampleFields;
}>) {
  return render(
    <LayoutBuilderTab
      objectId={props?.objectId ?? 'obj-1'}
      fields={props?.fields ?? sampleFields}
    />,
  );
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('LayoutBuilderTab', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ── Loading state ───────────────────────────────────────────

  it('shows loading text initially', () => {
    mockFetch();
    renderComponent();

    expect(screen.getByText('Loading layouts…')).toBeInTheDocument();
  });

  // ── Error state ─────────────────────────────────────────────

  it('shows error when layouts fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Server error' }),
    } as Response));

    renderComponent();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Failed to load layouts.');
    });
  });

  // ── Layout selector ─────────────────────────────────────────

  it('renders a layout selector with available layouts', async () => {
    mockFetch();
    renderComponent();

    await waitFor(() => {
      const select = screen.getByLabelText('Layout');
      expect(select).toBeInTheDocument();
    });

    // Check layout options are rendered
    expect(screen.getByText('Default Form (form)')).toBeInTheDocument();
    expect(screen.getByText('Default List (list)')).toBeInTheDocument();
  });

  it('renders a "Create new layout" option', async () => {
    mockFetch();
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('+ Create new layout')).toBeInTheDocument();
    });
  });

  // ── Empty state ─────────────────────────────────────────────

  it('shows empty state when there are no layouts', async () => {
    mockFetch({ layouts: [] });
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('No layouts yet')).toBeInTheDocument();
    });
  });

  // ── Form layout builder ─────────────────────────────────────

  it('shows form builder with available fields and preview for form layout', async () => {
    mockFetch();
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Available Fields')).toBeInTheDocument();
      expect(screen.getByText('Form Preview')).toBeInTheDocument();
    });
  });

  it('shows placed fields in the section', async () => {
    mockFetch();
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Basic Info')).toBeInTheDocument();
    });

    // The "Name" field should appear in the section
    expect(screen.getByText('Name')).toBeInTheDocument();
  });

  it('shows unplaced fields in the available fields panel', async () => {
    mockFetch();
    renderComponent();

    // Email and Amount are not placed — wait for them to appear after layout detail loads
    await waitFor(() => {
      expect(screen.getByText('Available Fields')).toBeInTheDocument();
      expect(screen.getByText('Email')).toBeInTheDocument();
      expect(screen.getByText('Amount')).toBeInTheDocument();
    });
  });

  it('shows "All fields have been placed" when all fields are in the layout', async () => {
    const fullLayoutDetail = {
      ...formLayoutDetail,
      fields: [
        ...formLayoutDetail.fields,
        {
          id: 'lf2',
          layoutId: 'layout-form',
          fieldId: 'f2',
          section: 0,
          sectionLabel: 'Basic Info',
          sortOrder: 2,
          width: 'half',
          fieldApiName: 'email',
          fieldLabel: 'Email',
          fieldType: 'email',
          fieldRequired: false,
          fieldOptions: {},
        },
        {
          id: 'lf3',
          layoutId: 'layout-form',
          fieldId: 'f3',
          section: 0,
          sectionLabel: 'Basic Info',
          sortOrder: 3,
          width: 'half',
          fieldApiName: 'amount',
          fieldLabel: 'Amount',
          fieldType: 'currency',
          fieldRequired: false,
          fieldOptions: {},
        },
      ],
    };

    mockFetch({ layoutDetail: fullLayoutDetail });
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('All fields have been placed.')).toBeInTheDocument();
    });
  });

  // ── Add section ─────────────────────────────────────────────

  it('adds a new section when "Add section" is clicked', async () => {
    mockFetch();
    const user = userEvent.setup();
    renderComponent();

    // Wait for layout detail to fully load (Basic Info comes from formLayoutDetail)
    await waitFor(() => {
      expect(screen.getByText('Basic Info')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Add section/ }));

    await waitFor(() => {
      expect(screen.getByText('Section 2')).toBeInTheDocument();
    });
  });

  // ── Remove section ──────────────────────────────────────────

  it('removes a section when its delete button is clicked', async () => {
    mockFetch();
    const user = userEvent.setup();
    renderComponent();

    // Wait for layout detail to fully load (Basic Info comes from formLayoutDetail)
    await waitFor(() => {
      expect(screen.getByText('Basic Info')).toBeInTheDocument();
    });

    // Add a second section first so we can remove one
    await user.click(screen.getByRole('button', { name: /Add section/ }));

    await waitFor(() => {
      expect(screen.getByText('Section 2')).toBeInTheDocument();
    });

    // Remove the new section
    const removeButtons = screen.getAllByRole('button', { name: /Remove section/ });
    await user.click(removeButtons[removeButtons.length - 1]);

    await waitFor(() => {
      expect(screen.queryByText('Section 2')).not.toBeInTheDocument();
    });
  });

  // ── Toggle field width ──────────────────────────────────────

  it('toggles field width when the toggle button is clicked', async () => {
    mockFetch();
    const user = userEvent.setup();
    renderComponent();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Toggle width for Name/ })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Toggle width for Name/ }));

    // After toggle, dirty flag shows save button
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Save layout' })).toBeInTheDocument();
    });
  });

  // ── Remove field from section ─────────────────────────────

  it('removes a field from a section when the remove button is clicked', async () => {
    mockFetch();
    const user = userEvent.setup();
    renderComponent();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Remove Name from layout/ })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Remove Name from layout/ }));

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Remove Name from layout/ })).not.toBeInTheDocument();
    });
  });

  // ── Dirty / Save ────────────────────────────────────────────

  it('shows save button when layout is dirty', async () => {
    mockFetch();
    const user = userEvent.setup();
    renderComponent();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Toggle width for Name/ })).toBeInTheDocument();
    });

    // Make dirty by toggling width
    await user.click(screen.getByRole('button', { name: /Toggle width for Name/ }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Save layout' })).toBeInTheDocument();
    });
  });

  it('does not show save button when layout is not dirty', async () => {
    mockFetch();
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Available Fields')).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: 'Save layout' })).not.toBeInTheDocument();
  });

  it('calls the save API when save button is clicked', async () => {
    const fetchMock = mockFetch();
    const user = userEvent.setup();
    renderComponent();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Toggle width for Name/ })).toBeInTheDocument();
    });

    // Make dirty
    await user.click(screen.getByRole('button', { name: /Toggle width for Name/ }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Save layout' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Save layout' }));

    await waitFor(() => {
      const saveCalls = fetchMock.mock.calls.filter(
        (c: unknown[]) =>
          typeof c[0] === 'string' &&
          (c[0] as string).includes('/fields') &&
          (c[1] as RequestInit)?.method === 'PUT',
      );
      expect(saveCalls.length).toBeGreaterThan(0);
    });
  });

  it('shows success message after saving', async () => {
    mockFetch();
    const user = userEvent.setup();
    renderComponent();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Toggle width for Name/ })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Toggle width for Name/ }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Save layout' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Save layout' }));

    await waitFor(() => {
      expect(screen.getByText('Layout saved successfully.')).toBeInTheDocument();
    });
  });

  // ── Create layout modal ─────────────────────────────────────

  it('opens create modal when "+ Create new layout" is selected', async () => {
    mockFetch();
    const user = userEvent.setup();
    renderComponent();

    await waitFor(() => {
      expect(screen.getByLabelText('Layout')).toBeInTheDocument();
    });

    await user.selectOptions(screen.getByLabelText('Layout'), '__create__');

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Create layout' })).toBeInTheDocument();
    });
  });

  it('validates name is required in create modal', async () => {
    mockFetch();
    const user = userEvent.setup();
    renderComponent();

    await waitFor(() => {
      expect(screen.getByLabelText('Layout')).toBeInTheDocument();
    });

    await user.selectOptions(screen.getByLabelText('Layout'), '__create__');

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Create layout' })).toBeInTheDocument();
    });

    // Click create without filling name
    await user.click(screen.getByRole('button', { name: 'Create layout' }));

    await waitFor(() => {
      expect(screen.getByText('Name is required')).toBeInTheDocument();
    });
  });

  it('closes create modal when cancel is clicked', async () => {
    mockFetch();
    const user = userEvent.setup();
    renderComponent();

    await waitFor(() => {
      expect(screen.getByLabelText('Layout')).toBeInTheDocument();
    });

    await user.selectOptions(screen.getByLabelText('Layout'), '__create__');

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Create layout' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Create layout' })).not.toBeInTheDocument();
    });
  });

  // ── Delete layout ───────────────────────────────────────────

  it('does not show delete button for default layouts', async () => {
    mockFetch();
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Available Fields')).toBeInTheDocument();
    });

    // Default Form is isDefault: true — should not have delete button
    expect(screen.queryByRole('button', { name: /Delete/ })).not.toBeInTheDocument();
  });

  it('shows delete button for non-default layouts', async () => {
    const customLayouts = [
      ...sampleLayouts,
      { id: 'layout-custom', objectId: 'obj-1', name: 'Custom Form', layoutType: 'form', isDefault: false, createdAt: '2025-01-01', updatedAt: '2025-01-01' },
    ];

    mockFetch({ layouts: customLayouts });
    const user = userEvent.setup();
    renderComponent();

    await waitFor(() => {
      expect(screen.getByLabelText('Layout')).toBeInTheDocument();
    });

    // Select the custom layout
    await user.selectOptions(screen.getByLabelText('Layout'), 'layout-custom');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Delete/ })).toBeInTheDocument();
    });
  });

  // ── List layout builder ─────────────────────────────────────

  it('shows list builder with column selection when list layout is selected', async () => {
    mockFetch();
    const user = userEvent.setup();
    renderComponent();

    await waitFor(() => {
      expect(screen.getByLabelText('Layout')).toBeInTheDocument();
    });

    // Select the list layout
    await user.selectOptions(screen.getByLabelText('Layout'), 'layout-list');

    await waitFor(() => {
      expect(screen.getByText('Select Columns')).toBeInTheDocument();
    });
  });

  it('shows column order when columns are selected in list layout', async () => {
    mockFetch();
    const user = userEvent.setup();
    renderComponent();

    await waitFor(() => {
      expect(screen.getByLabelText('Layout')).toBeInTheDocument();
    });

    await user.selectOptions(screen.getByLabelText('Layout'), 'layout-list');

    await waitFor(() => {
      expect(screen.getByText('Column Order')).toBeInTheDocument();
    });
  });

  // ── Rename section ──────────────────────────────────────────

  it('allows renaming a section by clicking its label', async () => {
    mockFetch();
    const user = userEvent.setup();
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Basic Info')).toBeInTheDocument();
    });

    // Click the section label to start renaming
    await user.click(screen.getByTitle('Click to rename'));

    // Should show the rename input
    const renameInput = screen.getByLabelText('Section name');
    expect(renameInput).toBeInTheDocument();
    expect(renameInput).toHaveValue('Basic Info');
  });

  // ── Move field up/down ──────────────────────────────────────

  it('disables move up button for the first field', async () => {
    mockFetch();
    renderComponent();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Move Name up' })).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: 'Move Name up' })).toBeDisabled();
  });

  it('disables move down button for the last field', async () => {
    mockFetch();
    renderComponent();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Move Name down' })).toBeInTheDocument();
    });

    // Only one field in the section, so down should be disabled
    expect(screen.getByRole('button', { name: 'Move Name down' })).toBeDisabled();
  });

  // ── Connection failure ──────────────────────────────────────

  it('shows connection error when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));
    renderComponent();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Failed to connect to the server.');
    });
  });
});
