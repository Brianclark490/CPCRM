import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PageBuilderPage } from '../pages/PageBuilderPage.js';

vi.mock('@descope/react-sdk', () => ({
  useSession: vi.fn(),
}));

const { useSession } = await import('@descope/react-sdk');

// ─── Sample data ──────────────────────────────────────────────────────────────

const sampleObject = {
  id: 'obj-1',
  apiName: 'account',
  label: 'Account',
  pluralLabel: 'Accounts',
  description: 'Customer accounts',
  icon: '🏢',
  isSystem: true,
  fields: [
    {
      id: 'field-1',
      apiName: 'name',
      label: 'Name',
      fieldType: 'text',
      required: true,
    },
    {
      id: 'field-2',
      apiName: 'email',
      label: 'Email',
      fieldType: 'email',
      required: false,
    },
    {
      id: 'field-3',
      apiName: 'phone',
      label: 'Phone',
      fieldType: 'phone',
      required: false,
    },
  ],
};

const sampleRelationships = [
  {
    id: 'rel-1',
    sourceObjectId: 'obj-1',
    targetObjectId: 'obj-2',
    relationshipType: 'lookup',
    apiName: 'account_opportunity',
    label: 'Opportunities',
    required: false,
    targetObjectLabel: 'Opportunity',
    targetObjectPluralLabel: 'Opportunities',
    targetObjectApiName: 'opportunity',
    sourceObjectApiName: 'account',
    sourceObjectLabel: 'Account',
    sourceObjectPluralLabel: 'Accounts',
  },
  {
    id: 'rel-2',
    sourceObjectId: 'obj-3',
    targetObjectId: 'obj-1',
    relationshipType: 'lookup',
    apiName: 'contact_account',
    label: 'Account',
    reverseLabel: 'Contacts',
    required: false,
    targetObjectLabel: 'Account',
    targetObjectPluralLabel: 'Accounts',
    targetObjectApiName: 'account',
    sourceObjectApiName: 'contact',
    sourceObjectLabel: 'Contact',
    sourceObjectPluralLabel: 'Contacts',
  },
];

const sampleRelatedObject = {
  id: 'obj-2',
  apiName: 'opportunity',
  label: 'Opportunity',
  pluralLabel: 'Opportunities',
  isSystem: true,
  fields: [
    {
      id: 'rel-field-1',
      apiName: 'opp_name',
      label: 'Opportunity Name',
      fieldType: 'text',
      required: true,
    },
    {
      id: 'rel-field-2',
      apiName: 'amount',
      label: 'Amount',
      fieldType: 'currency',
      required: false,
    },
  ],
};

const sampleRegistry = [
  {
    type: 'field',
    label: 'Field',
    icon: 'text-cursor',
    category: 'fields',
    configSchema: {
      fieldId: { type: 'string', required: true, description: 'UUID of the field' },
      span: { type: 'number', description: 'Grid columns to span' },
      readOnly: { type: 'boolean', description: 'Render as read-only' },
    },
    defaultConfig: { fieldId: '', span: 1, readOnly: false },
  },
  {
    type: 'related_list',
    label: 'Related List',
    icon: 'list',
    category: 'related',
    configSchema: {
      relationshipId: { type: 'string', required: true },
      limit: { type: 'number', description: 'Max rows' },
    },
    defaultConfig: { relationshipId: '', limit: 5 },
  },
  {
    type: 'activity_timeline',
    label: 'Activity Timeline',
    icon: 'clock',
    category: 'widgets',
    configSchema: {
      showFilters: { type: 'boolean', description: 'Show filters' },
    },
    defaultConfig: { showFilters: true },
  },
];

const samplePageLayouts = [
  {
    id: 'pl-1',
    objectId: 'obj-1',
    name: 'Account - Default',
    role: null,
    isDefault: true,
    version: 1,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  },
];

const samplePageLayoutDetail = {
  id: 'pl-1',
  objectId: 'obj-1',
  name: 'Account - Default',
  role: null,
  isDefault: true,
  version: 1,
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  layout: {
    id: 'pl-1',
    objectId: 'obj-1',
    name: 'Account - Default',
    header: { primaryField: 'name', secondaryFields: ['email'] },
    tabs: [
      {
        id: 'tab-1',
        label: 'Details',
        sections: [
          {
            id: 'sec-1',
            type: 'field_section',
            label: 'General',
            columns: 2,
            components: [
              {
                id: 'comp-1',
                type: 'field',
                config: { fieldApiName: 'name', span: 1, readOnly: false },
              },
            ],
          },
        ],
      },
    ],
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderPage(objectId = 'obj-1') {
  return render(
    <MemoryRouter initialEntries={[`/admin/objects/${objectId}/page-builder`]}>
      <Routes>
        <Route
          path="/admin/objects/:objectId/page-builder"
          element={<PageBuilderPage />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

function mockAllFetches() {
  const mockFetch = vi.fn();

  // 1. Object definition
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => sampleObject,
  } as Response);

  // 2. Relationships
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => sampleRelationships,
  } as Response);

  // 3. Component registry
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => sampleRegistry,
  } as Response);

  // 4. Page layouts list
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => samplePageLayouts,
  } as Response);

  // 5. Related object detail (for outgoing relationships)
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => sampleRelatedObject,
  } as Response);

  // 6. Page layout detail (auto-loaded for default layout)
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => samplePageLayoutDetail,
  } as Response);

  vi.stubGlobal('fetch', mockFetch);
  return mockFetch;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('PageBuilderPage', () => {
  beforeEach(() => {
    vi.mocked(useSession).mockReturnValue({
      isAuthenticated: true,
      isSessionLoading: false,
      sessionToken: 'test-token',
      claims: {},
    } as ReturnType<typeof useSession>);
    vi.restoreAllMocks();
  });

  it('renders loading state initially', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    renderPage();
    expect(screen.getByTestId('page-builder-loading')).toBeInTheDocument();
  });

  it('renders three-panel layout after loading', async () => {
    mockAllFetches();
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('page-builder')).toBeInTheDocument();
    });

    // Three panels
    expect(screen.getByTestId('component-palette')).toBeInTheDocument();
    expect(screen.getByTestId('builder-canvas')).toBeInTheDocument();
    expect(screen.getByTestId('properties-panel')).toBeInTheDocument();
  });

  it('renders builder toolbar with layout name', async () => {
    mockAllFetches();
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('builder-toolbar')).toBeInTheDocument();
    });

    expect(screen.getByText('Account - Default')).toBeInTheDocument();
    expect(screen.getByTestId('back-to-object')).toBeInTheDocument();
    expect(screen.getByTestId('save-draft-button')).toBeInTheDocument();
    expect(screen.getByTestId('publish-button')).toBeInTheDocument();
  });

  it('shows fields in the component palette', async () => {
    mockAllFetches();
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('component-palette')).toBeInTheDocument();
    });

    expect(screen.getByTestId('palette-item-palette-field-field-1')).toBeInTheDocument();
    expect(screen.getByTestId('palette-item-palette-field-field-2')).toBeInTheDocument();
    expect(screen.getByTestId('palette-item-palette-field-field-3')).toBeInTheDocument();
  });

  it('renders a search input for fields in the palette', async () => {
    mockAllFetches();
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('field-search-input')).toBeInTheDocument();
    });

    const input = screen.getByTestId('field-search-input') as HTMLInputElement;
    expect(input.placeholder).toBe('Search fields…');
  });

  it('filters fields when typing in the search input', async () => {
    const user = userEvent.setup();
    mockAllFetches();
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('field-search-input')).toBeInTheDocument();
    });

    // All three fields visible initially
    expect(screen.getByTestId('palette-item-palette-field-field-1')).toBeInTheDocument();
    expect(screen.getByTestId('palette-item-palette-field-field-2')).toBeInTheDocument();
    expect(screen.getByTestId('palette-item-palette-field-field-3')).toBeInTheDocument();

    // Type "email" to filter
    await user.type(screen.getByTestId('field-search-input'), 'email');

    // Only Email field should remain
    expect(screen.getByTestId('palette-item-palette-field-field-2')).toBeInTheDocument();
    expect(screen.queryByTestId('palette-item-palette-field-field-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('palette-item-palette-field-field-3')).not.toBeInTheDocument();
  });

  it('shows no-results message when search matches nothing', async () => {
    const user = userEvent.setup();
    mockAllFetches();
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('field-search-input')).toBeInTheDocument();
    });

    await user.type(screen.getByTestId('field-search-input'), 'zzzzz');

    expect(screen.getByTestId('field-search-no-results')).toBeInTheDocument();
    expect(screen.getByText('No fields match your search.')).toBeInTheDocument();
  });

  it('field search is case-insensitive', async () => {
    const user = userEvent.setup();
    mockAllFetches();
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('field-search-input')).toBeInTheDocument();
    });

    await user.type(screen.getByTestId('field-search-input'), 'NAME');

    expect(screen.getByTestId('palette-item-palette-field-field-1')).toBeInTheDocument();
    expect(screen.queryByTestId('palette-item-palette-field-field-2')).not.toBeInTheDocument();
    expect(screen.queryByTestId('palette-item-palette-field-field-3')).not.toBeInTheDocument();
  });

  it('shows relationships in the component palette', async () => {
    mockAllFetches();
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('component-palette')).toBeInTheDocument();
    });

    const outbound = screen.getByTestId('palette-item-palette-rel-rel-1');
    expect(outbound).toBeInTheDocument();
    expect(outbound).toHaveTextContent('Opportunities');

    const inbound = screen.getByTestId('palette-item-palette-rel-rel-2');
    expect(inbound).toBeInTheDocument();
    expect(inbound).toHaveTextContent('Contacts');
    expect(inbound).not.toHaveTextContent('Account');
  });

  it('shows related fields from lookup relationships in the component palette', async () => {
    mockAllFetches();
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('related-fields-group')).toBeInTheDocument();
    });

    // Should show the "Related Fields" group heading
    expect(screen.getByText('Related Fields')).toBeInTheDocument();

    // Should show the related object sub-group label
    expect(screen.getByTestId('related-fields-group-label-account_opportunity')).toBeInTheDocument();
    expect(screen.getByTestId('related-fields-group-label-account_opportunity')).toHaveTextContent('Opportunity');

    // Should show related field items with "Object → Field" label
    expect(
      screen.getByTestId('palette-item-palette-related-account_opportunity.opp_name'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('palette-item-palette-related-account_opportunity.amount'),
    ).toBeInTheDocument();

    // Should display the label with arrow notation
    expect(screen.getByText('Opportunity → Opportunity Name')).toBeInTheDocument();
    expect(screen.getByText('Opportunity → Amount')).toBeInTheDocument();
  });

  it('shows widgets from registry in the component palette', async () => {
    mockAllFetches();
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('component-palette')).toBeInTheDocument();
    });

    expect(screen.getByTestId('palette-item-palette-widget-activity_timeline')).toBeInTheDocument();
  });

  it('marks already-placed fields as greyed out', async () => {
    mockAllFetches();
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('component-palette')).toBeInTheDocument();
    });

    // 'name' field is placed in the layout, should have the placed indicator
    const nameItem = screen.getByTestId('palette-item-palette-field-field-1');
    expect(nameItem).toHaveClass(/placed/);
  });

  it('renders header zone editor', async () => {
    mockAllFetches();
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('header-zone-editor')).toBeInTheDocument();
    });
  });

  it('renders sections on the canvas', async () => {
    mockAllFetches();
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('builder-section-sec-1')).toBeInTheDocument();
    });
  });

  it('renders components within sections', async () => {
    mockAllFetches();
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('canvas-component-comp-1')).toBeInTheDocument();
    });
  });

  it('renders field-type-specific icons instead of literal icon names', async () => {
    mockAllFetches();
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('canvas-component-comp-1')).toBeInTheDocument();
    });

    const component = screen.getByTestId('canvas-component-comp-1');
    // The 'name' field has fieldType 'text', which should resolve to '✏️'
    expect(component.textContent).toContain('✏️');
    // Should NOT contain the literal icon identifier string
    expect(component.textContent).not.toContain('text-cursor');
  });

  it('shows empty properties panel when nothing selected', async () => {
    mockAllFetches();
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('properties-panel')).toBeInTheDocument();
    });

    expect(
      screen.getByText('Select a component or section to edit its properties.'),
    ).toBeInTheDocument();
  });

  it('shows component properties when a component is clicked', async () => {
    const user = userEvent.setup();
    mockAllFetches();
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('canvas-component-comp-1')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('canvas-component-comp-1'));

    await waitFor(() => {
      expect(screen.getByText('Field Properties')).toBeInTheDocument();
    });
  });

  it('shows section properties when a section is clicked', async () => {
    const user = userEvent.setup();
    mockAllFetches();
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('builder-section-sec-1')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('builder-section-sec-1'));

    await waitFor(() => {
      expect(screen.getByText('Section Properties')).toBeInTheDocument();
    });
  });

  it('can add a new tab', async () => {
    const user = userEvent.setup();
    mockAllFetches();
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('add-tab-button')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('add-tab-button'));

    await waitFor(() => {
      expect(screen.getByText('Tab 2')).toBeInTheDocument();
    });
  });

  it('can add new sections', async () => {
    const user = userEvent.setup();
    mockAllFetches();
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('add-section-1col')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('add-section-1col'));

    // Should now have 2 sections
    await waitFor(() => {
      const sections = screen.getAllByTestId(/builder-section-/);
      expect(sections.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('shows preview modal when Preview is clicked', async () => {
    const user = userEvent.setup();
    mockAllFetches();
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('preview-button')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('preview-button'));

    await waitFor(() => {
      expect(screen.getByTestId('preview-modal')).toBeInTheDocument();
    });

    expect(screen.getByText('Layout Preview')).toBeInTheDocument();
  });

  it('renders error state when API fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: 'Not found' }),
      } as Response),
    );

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  it('saves draft when Save draft is clicked', async () => {
    const user = userEvent.setup();
    const mockFetch = mockAllFetches();

    // Add response for save
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => samplePageLayoutDetail,
    } as Response);

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('add-tab-button')).toBeInTheDocument();
    });

    // Make a change to enable save
    await user.click(screen.getByTestId('add-tab-button'));

    await waitFor(() => {
      expect(screen.getByTestId('save-draft-button')).not.toBeDisabled();
    });

    await user.click(screen.getByTestId('save-draft-button'));

    // Verify a PUT was called
    await waitFor(() => {
      const putCalls = mockFetch.mock.calls.filter(
        (call: unknown[]) => {
          const init = call[1] as RequestInit | undefined;
          return init?.method === 'PUT';
        },
      );
      expect(putCalls.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('publishes layout when Publish is clicked', async () => {
    const user = userEvent.setup();
    const mockFetch = mockAllFetches();

    // Responses for publish (save + publish)
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => samplePageLayoutDetail,
    } as Response);

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('publish-button')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('publish-button'));

    await waitFor(() => {
      const postCalls = mockFetch.mock.calls.filter(
        (call: unknown[]) => {
          const url = call[0] as string;
          const init = call[1] as RequestInit | undefined;
          return init?.method === 'POST' && url.includes('/publish');
        },
      );
      expect(postCalls.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('renders visibility rule editor in section properties', async () => {
    const user = userEvent.setup();
    mockAllFetches();
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('builder-section-sec-1')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('builder-section-sec-1'));

    await waitFor(() => {
      expect(screen.getByTestId('visibility-rule-editor')).toBeInTheDocument();
    });
  });

  it('handles no page layouts by creating a default', async () => {
    const mockFetch = vi.fn();

    // Object definition
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => sampleObject,
    } as Response);

    // Relationships
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    } as Response);

    // Registry
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => sampleRegistry,
    } as Response);

    // Empty page layouts
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    } as Response);

    vi.stubGlobal('fetch', mockFetch);
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('page-builder')).toBeInTheDocument();
    });

    // Should show the canvas with a default section
    expect(screen.getByTestId('builder-canvas')).toBeInTheDocument();
    // Unsaved badge should appear since this is a new layout
    expect(screen.getByText('Unsaved')).toBeInTheDocument();
  });
});
