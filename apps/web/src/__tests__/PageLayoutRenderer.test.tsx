import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { PageLayoutRenderer } from '../components/PageLayoutRenderer.js';
import type {
  PageLayout,
  RecordData,
  ObjectDefinitionRef,
} from '../components/layoutTypes.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeLayout(overrides: Partial<PageLayout> = {}): PageLayout {
  return {
    id: 'layout-1',
    objectId: 'obj-1',
    name: 'Default Layout',
    header: {
      primaryField: 'name',
      secondaryFields: ['status', 'industry'],
    },
    tabs: [
      {
        id: 'tab-details',
        label: 'Details',
        sections: [
          {
            id: 'sec-1',
            label: 'Basic Information',
            columns: 2,
            components: [
              {
                id: 'comp-1',
                type: 'field',
                config: { fieldApiName: 'email' },
              },
              {
                id: 'comp-2',
                type: 'field',
                config: { fieldApiName: 'phone' },
              },
            ],
          },
        ],
      },
    ],
    ...overrides,
  };
}

function makeRecord(overrides: Partial<RecordData> = {}): RecordData {
  return {
    id: 'rec-1',
    objectId: 'obj-1',
    name: 'Acme Corp',
    fieldValues: {
      name: 'Acme Corp',
      status: 'Active',
      industry: 'Technology',
      email: 'info@acme.com',
      phone: '+1-555-0100',
    },
    ownerId: 'user-1',
    ownerName: 'Brian Clark',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-02T00:00:00Z',
    fields: [
      { apiName: 'email', label: 'Email', fieldType: 'email' },
      { apiName: 'phone', label: 'Phone', fieldType: 'phone' },
      { apiName: 'status', label: 'Status', fieldType: 'dropdown' },
      { apiName: 'industry', label: 'Industry', fieldType: 'text' },
    ],
    relationships: [],
    ...overrides,
  };
}

const defaultObjectDef: ObjectDefinitionRef = {
  id: 'obj-1',
  apiName: 'account',
  label: 'Account',
  pluralLabel: 'Accounts',
  isSystem: true,
};

function renderLayout(
  layout: PageLayout = makeLayout(),
  record: RecordData = makeRecord(),
  objectDef: ObjectDefinitionRef | null = defaultObjectDef,
  actions?: React.ReactNode,
) {
  return render(
    <MemoryRouter>
      <PageLayoutRenderer
        layout={layout}
        record={record}
        fields={record.fields}
        objectDef={objectDef}
        actions={actions}
      />
    </MemoryRouter>,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('PageLayoutRenderer', () => {
  // ── Header ──────────────────────────────────────────────────────────────

  it('renders the record header with primary field', () => {
    renderLayout();
    expect(screen.getByRole('heading', { name: 'Acme Corp' })).toBeInTheDocument();
  });

  it('renders secondary field badges in the header', () => {
    renderLayout();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Industry')).toBeInTheDocument();
  });

  it('renders the owner chip in the header', () => {
    renderLayout();
    expect(screen.getByText('Brian Clark')).toBeInTheDocument();
  });

  it('renders action buttons passed via props', () => {
    const actions = <button>Edit</button>;
    renderLayout(makeLayout(), makeRecord(), defaultObjectDef, actions);
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
  });

  it('header stays visible regardless of tab', () => {
    const layout = makeLayout({
      tabs: [
        {
          id: 'tab-1',
          label: 'Details',
          sections: [],
        },
        {
          id: 'tab-2',
          label: 'Related',
          sections: [],
        },
      ],
    });

    renderLayout(layout);

    // Header visible with first tab
    expect(screen.getByTestId('record-header')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Acme Corp' })).toBeInTheDocument();
  });

  // ── Tabs ────────────────────────────────────────────────────────────────

  it('does not render tab bar when there is only one tab', () => {
    renderLayout();
    expect(screen.queryByTestId('layout-tab-bar')).not.toBeInTheDocument();
  });

  it('renders tab bar when there are multiple tabs', () => {
    const layout = makeLayout({
      tabs: [
        { id: 'tab-1', label: 'Details', sections: [] },
        { id: 'tab-2', label: 'Related', sections: [] },
      ],
    });

    renderLayout(layout);
    expect(screen.getByTestId('layout-tab-bar')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Details' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Related' })).toBeInTheDocument();
  });

  it('switches active tab content when clicking a tab', async () => {
    const user = userEvent.setup();
    const layout = makeLayout({
      tabs: [
        {
          id: 'tab-1',
          label: 'Details',
          sections: [
            {
              id: 'sec-d',
              label: 'Detail Section',
              columns: 1,
              components: [
                { id: 'c1', type: 'field', config: { fieldApiName: 'email' } },
              ],
            },
          ],
        },
        {
          id: 'tab-2',
          label: 'Related',
          sections: [
            {
              id: 'sec-r',
              label: 'Related Section',
              columns: 1,
              components: [
                { id: 'c2', type: 'field', config: { fieldApiName: 'phone' } },
              ],
            },
          ],
        },
      ],
    });

    renderLayout(layout);

    // First tab content is visible
    expect(screen.getByTestId('tab-content-tab-1')).toBeInTheDocument();
    expect(screen.getByText('Detail Section')).toBeInTheDocument();

    // Switch to second tab
    await user.click(screen.getByRole('tab', { name: 'Related' }));
    expect(screen.getByTestId('tab-content-tab-2')).toBeInTheDocument();
    expect(screen.getByText('Related Section')).toBeInTheDocument();

    // Header is still visible after tab switch
    expect(screen.getByRole('heading', { name: 'Acme Corp' })).toBeInTheDocument();
  });

  // ── Sections ────────────────────────────────────────────────────────────

  it('renders section labels', () => {
    renderLayout();
    expect(screen.getByText('Basic Information')).toBeInTheDocument();
  });

  it('renders sections in 2-column layout', () => {
    renderLayout();
    const section = screen.getByTestId('layout-section-sec-1');
    expect(section).toBeInTheDocument();
  });

  it('sections are collapsible', async () => {
    const user = userEvent.setup();
    renderLayout();

    // Section content is visible initially
    expect(screen.getByText('Email')).toBeInTheDocument();

    // Click section header to collapse
    await user.click(screen.getByRole('button', { name: /Basic Information/ }));

    // Field labels should be hidden
    expect(screen.queryByText('Email')).not.toBeInTheDocument();

    // Click again to expand
    await user.click(screen.getByRole('button', { name: /Basic Information/ }));
    expect(screen.getByText('Email')).toBeInTheDocument();
  });

  it('renders field spanning (span: 2) fills full width', () => {
    const layout = makeLayout({
      tabs: [
        {
          id: 'tab-1',
          label: 'Details',
          sections: [
            {
              id: 'sec-span',
              label: 'Span Test',
              columns: 2,
              components: [
                {
                  id: 'comp-full',
                  type: 'field',
                  config: { fieldApiName: 'email', span: 2 },
                },
                {
                  id: 'comp-half',
                  type: 'field',
                  config: { fieldApiName: 'phone', span: 1 },
                },
              ],
            },
          ],
        },
      ],
    });

    const { container } = renderLayout(layout);
    // The full-span item should have the spanFull class
    const spanFullItems = container.querySelectorAll('[class*="spanFull"]');
    expect(spanFullItems.length).toBeGreaterThanOrEqual(1);
  });

  // ── Visibility ──────────────────────────────────────────────────────────

  it('hides sections when visibility rule evaluates to false', () => {
    const layout = makeLayout({
      tabs: [
        {
          id: 'tab-1',
          label: 'Details',
          sections: [
            {
              id: 'sec-visible',
              label: 'Visible Section',
              columns: 1,
              components: [],
            },
            {
              id: 'sec-hidden',
              label: 'Hidden Section',
              columns: 1,
              visibility: {
                operator: 'AND',
                conditions: [
                  { field: 'status', op: 'equals', value: 'Closed' },
                ],
              },
              components: [],
            },
          ],
        },
      ],
    });

    renderLayout(layout, makeRecord({ fieldValues: { ...makeRecord().fieldValues, status: 'Active' } }));

    expect(screen.getByText('Visible Section')).toBeInTheDocument();
    expect(screen.queryByText('Hidden Section')).not.toBeInTheDocument();
  });

  it('shows sections when visibility rule evaluates to true', () => {
    const layout = makeLayout({
      tabs: [
        {
          id: 'tab-1',
          label: 'Details',
          sections: [
            {
              id: 'sec-conditional',
              label: 'Conditional Section',
              columns: 1,
              visibility: {
                operator: 'AND',
                conditions: [
                  { field: 'status', op: 'equals', value: 'Active' },
                ],
              },
              components: [],
            },
          ],
        },
      ],
    });

    renderLayout(layout, makeRecord({ fieldValues: { ...makeRecord().fieldValues, status: 'Active' } }));

    expect(screen.getByText('Conditional Section')).toBeInTheDocument();
  });

  it('hides individual components when visibility rule fails', () => {
    const layout = makeLayout({
      tabs: [
        {
          id: 'tab-1',
          label: 'Details',
          sections: [
            {
              id: 'sec-1',
              label: 'Test Section',
              columns: 1,
              components: [
                {
                  id: 'comp-visible',
                  type: 'field',
                  config: { fieldApiName: 'email' },
                },
                {
                  id: 'comp-hidden',
                  type: 'field',
                  config: { fieldApiName: 'phone' },
                  visibility: {
                    operator: 'AND',
                    conditions: [
                      { field: 'status', op: 'equals', value: 'Closed' },
                    ],
                  },
                },
              ],
            },
          ],
        },
      ],
    });

    renderLayout(layout, makeRecord());

    expect(screen.getByText('Email')).toBeInTheDocument();
    // Phone field should be hidden because status is 'Active', not 'Closed'
    expect(screen.queryByText('Phone')).not.toBeInTheDocument();
  });

  // ── Related list ────────────────────────────────────────────────────────

  it('renders related list with correct related records', () => {
    const record = makeRecord({
      relationships: [
        {
          relationshipId: 'rel-1',
          label: 'Opportunities',
          relationshipType: 'lookup',
          direction: 'source' as const,
          relatedObjectApiName: 'opportunity',
          records: [
            { id: 'opp-1', name: 'Big Deal', fieldValues: {} },
            { id: 'opp-2', name: 'Small Deal', fieldValues: {} },
          ],
        },
      ],
    });

    const layout = makeLayout({
      tabs: [
        {
          id: 'tab-1',
          label: 'Details',
          sections: [
            {
              id: 'sec-1',
              label: 'Related',
              columns: 1,
              components: [
                {
                  id: 'comp-rel',
                  type: 'related_list',
                  config: { relationshipId: 'rel-1' },
                },
              ],
            },
          ],
        },
      ],
    });

    renderLayout(layout, record);

    expect(screen.getByText('Opportunities')).toBeInTheDocument();
    expect(screen.getByText('Big Deal')).toBeInTheDocument();
    expect(screen.getByText('Small Deal')).toBeInTheDocument();
  });

  // ── Unknown component types ─────────────────────────────────────────────

  it('logs warning for unknown component types but does not crash', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const layout = makeLayout({
      tabs: [
        {
          id: 'tab-1',
          label: 'Details',
          sections: [
            {
              id: 'sec-1',
              label: 'Test',
              columns: 1,
              components: [
                {
                  id: 'comp-unknown',
                  type: 'unknown_widget',
                  config: {},
                },
              ],
            },
          ],
        },
      ],
    });

    renderLayout(layout);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Unknown component type "unknown_widget"'),
    );

    warnSpy.mockRestore();
  });

  // ── Placeholder widgets ─────────────────────────────────────────────────

  it('renders placeholder widgets for activity_timeline', () => {
    const layout = makeLayout({
      tabs: [
        {
          id: 'tab-1',
          label: 'Details',
          sections: [
            {
              id: 'sec-1',
              label: 'Widgets',
              columns: 1,
              components: [
                { id: 'w1', type: 'activity_timeline', config: {} },
              ],
            },
          ],
        },
      ],
    });

    renderLayout(layout);
    expect(screen.getByText('Activity Timeline')).toBeInTheDocument();
    expect(screen.getByText('Coming soon')).toBeInTheDocument();
  });

  it('renders placeholder widgets for notes, stage_history, files', () => {
    const layout = makeLayout({
      tabs: [
        {
          id: 'tab-1',
          label: 'Details',
          sections: [
            {
              id: 'sec-1',
              label: 'Widgets',
              columns: 1,
              components: [
                { id: 'w2', type: 'notes', config: {} },
                { id: 'w3', type: 'stage_history', config: {} },
                { id: 'w4', type: 'files', config: {} },
              ],
            },
          ],
        },
      ],
    });

    renderLayout(layout);
    expect(screen.getByText('Notes')).toBeInTheDocument();
    expect(screen.getByText('Stage History')).toBeInTheDocument();
    expect(screen.getByText('Files')).toBeInTheDocument();
  });

  // ── Section with initially collapsed state ──────────────────────────────

  it('renders section collapsed when collapsed is true', () => {
    const layout = makeLayout({
      tabs: [
        {
          id: 'tab-1',
          label: 'Details',
          sections: [
            {
              id: 'sec-collapsed',
              label: 'Collapsed Section',
              columns: 1,
              collapsed: true,
              components: [
                { id: 'c1', type: 'field', config: { fieldApiName: 'email' } },
              ],
            },
          ],
        },
      ],
    });

    renderLayout(layout);

    // Section label is visible
    expect(screen.getByText('Collapsed Section')).toBeInTheDocument();
    // But the field content is hidden
    expect(screen.queryByText('Email')).not.toBeInTheDocument();
  });
});
