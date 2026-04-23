import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ContactsPanel } from '../components/ContactsPanel.js';
import type {
  LayoutComponentDef,
  RecordData,
  ObjectDefinitionRef,
  RelationshipRef,
} from '../components/layoutTypes.js';

const objectDef: ObjectDefinitionRef = {
  id: 'obj-1',
  apiName: 'account',
  label: 'Account',
  pluralLabel: 'Accounts',
  isSystem: true,
};

function makeRelationship(overrides: Partial<RelationshipRef> = {}): RelationshipRef {
  return {
    relationshipId: 'rel-contacts',
    label: 'Contacts',
    relationshipType: 'lookup',
    direction: 'source',
    relatedObjectApiName: 'contact',
    records: [
      {
        id: 'c-1',
        name: 'Jane Doe',
        fieldValues: { role: 'CEO', isPrimary: true },
      },
      {
        id: 'c-2',
        name: 'John Smith',
        fieldValues: { role: 'CTO', isPrimary: false },
      },
    ],
    ...overrides,
  };
}

function makeRecord(relationships: RelationshipRef[] = []): RecordData {
  return {
    id: 'rec-1',
    objectId: 'obj-1',
    name: 'Acme',
    fieldValues: {},
    ownerId: 'u-1',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-02T00:00:00Z',
    fields: [],
    relationships,
  };
}

function makeComponent(config: Record<string, unknown>): LayoutComponentDef {
  return { id: 'c-1', type: 'contacts', config };
}

function renderPanel(
  config: Record<string, unknown>,
  relationships: RelationshipRef[],
) {
  const record = makeRecord(relationships);
  return render(
    <MemoryRouter>
      <ContactsPanel
        component={makeComponent(config)}
        record={record}
        fields={record.fields}
        objectDef={objectDef}
      />
    </MemoryRouter>,
  );
}

describe('ContactsPanel', () => {
  it('renders a row per related contact with initials, name, and role', () => {
    renderPanel({ relationshipId: 'rel-contacts' }, [makeRelationship()]);

    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(screen.getByText('John Smith')).toBeInTheDocument();
    expect(screen.getByText('CEO')).toBeInTheDocument();
    expect(screen.getByText('CTO')).toBeInTheDocument();
    // Initials derived from first letter of each word.
    expect(screen.getByText('JD')).toBeInTheDocument();
    expect(screen.getByText('JS')).toBeInTheDocument();
  });

  it('shows a PRIMARY badge only on the primary contact', () => {
    renderPanel({ relationshipId: 'rel-contacts' }, [makeRelationship()]);

    const badges = screen.getAllByTestId('contacts-panel-primary-badge');
    expect(badges).toHaveLength(1);
    expect(badges[0]).toHaveTextContent('PRIMARY');
  });

  it('links each contact to its detail page', () => {
    renderPanel({ relationshipId: 'rel-contacts' }, [makeRelationship()]);

    const link = screen.getByRole('link', { name: 'Jane Doe' });
    expect(link).toHaveAttribute('href', '/objects/contact/c-1');
  });

  it('respects the limit config', () => {
    renderPanel({ relationshipId: 'rel-contacts', limit: 1 }, [makeRelationship()]);

    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(screen.queryByText('John Smith')).not.toBeInTheDocument();
  });

  it('renders an empty-state when the relationship has no records', () => {
    renderPanel(
      { relationshipId: 'rel-contacts' },
      [makeRelationship({ records: [] })],
    );

    expect(screen.getByTestId('contacts-panel-empty-rel-contacts')).toBeInTheDocument();
  });

  it('renders nothing when the relationshipId is missing or unknown', () => {
    const { container: missing } = renderPanel({}, [makeRelationship()]);
    expect(missing).toBeEmptyDOMElement();

    const { container: unknown } = renderPanel(
      { relationshipId: 'does-not-exist' },
      [makeRelationship()],
    );
    expect(unknown).toBeEmptyDOMElement();
  });
});
