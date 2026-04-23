import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ActivityFeed } from '../components/ActivityFeed.js';
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

function makeRecord(): RecordData {
  return {
    id: 'rec-1',
    objectId: 'obj-1',
    name: 'Acme',
    fieldValues: {},
    ownerId: 'u-1',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-02T00:00:00Z',
    fields: [],
    relationships: [],
  };
}

function makeComponent(config: Record<string, unknown>): LayoutComponentDef {
  return { id: 'c-1', type: 'activity', config };
}

describe('ActivityFeed', () => {
  it('renders without crashing with empty config', () => {
    const record = makeRecord();
    render(
      <ActivityFeed
        component={makeComponent({})}
        record={record}
        fields={record.fields}
        objectDef={objectDef}
      />,
    );

    expect(screen.getByTestId('activity-feed')).toBeInTheDocument();
  });

  it('renders the ActivityPanel empty-state when there are no activity items', () => {
    const record = makeRecord();
    render(
      <ActivityFeed
        component={makeComponent({ limit: 10 })}
        record={record}
        fields={record.fields}
        objectDef={objectDef}
      />,
    );

    expect(screen.getByText('No recent activity')).toBeInTheDocument();
  });

  it('accepts a types filter in config without crashing', () => {
    const record = makeRecord();
    render(
      <ActivityFeed
        component={makeComponent({ types: ['call', 'note'] })}
        record={record}
        fields={record.fields}
        objectDef={objectDef}
      />,
    );

    expect(screen.getByTestId('activity-feed')).toBeInTheDocument();
  });
});
