import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IdentityPanel } from '../components/IdentityPanel.js';
import type {
  LayoutComponentDef,
  RecordData,
  ObjectDefinitionRef,
} from '../components/layoutTypes.js';

const objectDef: ObjectDefinitionRef = {
  id: 'obj-1',
  apiName: 'account',
  label: 'Account',
  pluralLabel: 'Accounts',
  isSystem: true,
};

function makeRecord(overrides: Partial<RecordData> = {}): RecordData {
  return {
    id: 'rec-1',
    objectId: 'obj-1',
    name: 'Acme',
    fieldValues: {
      name: 'Acme Corp',
      status: 'Active',
      industry: 'Tech',
      empty_field: '',
    },
    ownerId: 'u-1',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-02T00:00:00Z',
    fields: [
      { apiName: 'name', label: 'Account Name', fieldType: 'text' },
      { apiName: 'status', label: 'Status', fieldType: 'text' },
      { apiName: 'industry', label: 'Industry', fieldType: 'text' },
      { apiName: 'empty_field', label: 'Empty', fieldType: 'text' },
    ],
    relationships: [],
    ...overrides,
  };
}

function makeComponent(config: Record<string, unknown>): LayoutComponentDef {
  return { id: 'c-1', type: 'identity', config };
}

describe('IdentityPanel', () => {
  it('renders configured field labels and values', () => {
    const record = makeRecord();
    render(
      <IdentityPanel
        component={makeComponent({ fields: ['name', 'status', 'industry'] })}
        record={record}
        fields={record.fields}
        objectDef={objectDef}
      />,
    );

    expect(screen.getByText('Account Name')).toBeInTheDocument();
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Industry')).toBeInTheDocument();
    expect(screen.getByText('Tech')).toBeInTheDocument();
  });

  it('preserves the configured order of fields', () => {
    const record = makeRecord();
    render(
      <IdentityPanel
        component={makeComponent({ fields: ['industry', 'name', 'status'] })}
        record={record}
        fields={record.fields}
        objectDef={objectDef}
      />,
    );

    const labels = screen.getAllByRole('term').map((el) => el.textContent);
    expect(labels).toEqual(['Industry', 'Account Name', 'Status']);
  });

  it('shows an em-dash for empty field values', () => {
    const record = makeRecord();
    render(
      <IdentityPanel
        component={makeComponent({ fields: ['empty_field'] })}
        record={record}
        fields={record.fields}
        objectDef={objectDef}
      />,
    );

    expect(screen.getByText('Empty')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('skips field names not present in the field definitions', () => {
    const record = makeRecord();
    render(
      <IdentityPanel
        component={makeComponent({ fields: ['name', 'does_not_exist'] })}
        record={record}
        fields={record.fields}
        objectDef={objectDef}
      />,
    );

    expect(screen.getByText('Account Name')).toBeInTheDocument();
    expect(screen.queryByText('does_not_exist')).not.toBeInTheDocument();
  });

  it('renders an empty-state when no fields are configured', () => {
    const record = makeRecord();
    render(
      <IdentityPanel
        component={makeComponent({ fields: [] })}
        record={record}
        fields={record.fields}
        objectDef={objectDef}
      />,
    );

    expect(screen.getByTestId('identity-panel-empty')).toBeInTheDocument();
  });
});
