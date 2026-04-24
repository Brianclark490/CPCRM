import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PropertiesPanel } from '../components/PropertiesPanel.js';
import type {
  BuilderComponent,
  ComponentDefinition,
} from '../components/builderTypes.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderPanel(
  component: BuilderComponent,
  def: ComponentDefinition,
  handlers: Partial<
    Parameters<typeof PropertiesPanel>[0]
  > = {},
) {
  const props = {
    selectedItem: { kind: 'component' as const, component, sectionId: 'sec-1' },
    registry: [def],
    fields: [],
    onComponentChange: vi.fn(),
    onComponentVisibilityChange: vi.fn(),
    onSectionChange: vi.fn(),
    onSectionVisibilityChange: vi.fn(),
    ...handlers,
  };
  return { ...render(<PropertiesPanel {...props} />), props };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('PropertiesPanel — object-typed config fields', () => {
  const metricDef: ComponentDefinition = {
    type: 'metric',
    label: 'Metric Card',
    icon: 'gauge',
    category: 'widgets',
    allowedZones: ['kpi'],
    configSchema: {
      label: { type: 'string', description: 'Display label' },
      source: { type: 'object', description: 'Value source' },
      target: { type: 'object', description: 'Optional target' },
    },
    defaultConfig: {
      label: '',
      source: { kind: 'field', fieldApiName: 'amount' },
    },
  };

  const metricComponent: BuilderComponent = {
    id: 'comp-1',
    type: 'metric',
    config: {
      label: 'pipeline.open',
      source: { kind: 'field', fieldApiName: 'amount' },
    },
  };

  it('renders object-typed fields as read-only JSON previews', () => {
    renderPanel(metricComponent, metricDef);

    const sourceBlock = screen.getByTestId('prop-object-source');
    const textarea = sourceBlock.querySelector('textarea')!;
    expect(textarea).toBeInTheDocument();
    expect(textarea).toHaveAttribute('readOnly');
    expect(textarea.value).toContain('"kind": "field"');
    expect(textarea.value).toContain('"fieldApiName": "amount"');
  });

  it('does not fire onChange when the user types in an object field textarea', () => {
    const { props } = renderPanel(metricComponent, metricDef);

    const sourceBlock = screen.getByTestId('prop-object-source');
    const textarea = sourceBlock.querySelector('textarea')!;
    // Read-only inputs swallow keystrokes, so firing an input event should
    // not trigger a config update.
    fireEvent.change(textarea, { target: { value: 'garbage' } });
    expect(props.onComponentChange).not.toHaveBeenCalled();
  });

  it('flags the read-only state in the hint text', () => {
    renderPanel(metricComponent, metricDef);

    const sourceBlock = screen.getByTestId('prop-object-source');
    expect(sourceBlock.textContent).toMatch(/read-only/i);
  });

  it('associates the object-field textarea with its label for screen readers', () => {
    renderPanel(metricComponent, metricDef);

    // getByLabelText only succeeds when <label htmlFor> matches the textarea's id.
    const textarea = screen.getByLabelText('source') as HTMLTextAreaElement;
    expect(textarea.tagName).toBe('TEXTAREA');
    expect(textarea.readOnly).toBe(true);
  });

  it('still renders editable string fields alongside object fields', () => {
    renderPanel(metricComponent, metricDef);

    const labelInput = screen.getByLabelText('label') as HTMLInputElement;
    expect(labelInput).toBeInTheDocument();
    expect(labelInput.readOnly).toBe(false);
  });
});
