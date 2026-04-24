import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MetricCard } from '../components/MetricCard.js';
import type {
  LayoutComponentDef,
  RecordData,
} from '../components/layoutTypes.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRecord(fieldValues: Record<string, unknown> = {}): RecordData {
  return {
    id: 'rec-1',
    objectId: 'obj-1',
    name: 'Acme Corp',
    fieldValues,
    ownerId: 'user-1',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-02T00:00:00Z',
    fields: [],
    relationships: [],
  };
}

function renderMetric(
  config: Record<string, unknown>,
  fieldValues: Record<string, unknown> = {},
) {
  const component: LayoutComponentDef = {
    id: 'm-1',
    type: 'metric',
    config,
  };
  return render(
    <MetricCard
      component={component}
      record={makeRecord(fieldValues)}
      fields={[]}
      objectDef={null}
    />,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('MetricCard', () => {
  // ── Field source ────────────────────────────────────────────────────────

  it('renders a plain numeric field value with the label', () => {
    renderMetric(
      {
        label: 'deals.open',
        source: { kind: 'field', fieldApiName: 'deal_count' },
      },
      { deal_count: 12 },
    );

    expect(screen.getByText('deals.open')).toBeInTheDocument();
    expect(screen.getByTestId('metric-value')).toHaveTextContent('12');
  });

  it('coerces string numbers from the record', () => {
    renderMetric(
      {
        label: 'count',
        source: { kind: 'field', fieldApiName: 'amount' },
      },
      { amount: '42' },
    );

    expect(screen.getByTestId('metric-value')).toHaveTextContent('42');
  });

  it('renders a dash when the referenced field is missing / non-numeric', () => {
    renderMetric(
      {
        label: 'foo',
        source: { kind: 'field', fieldApiName: 'missing' },
      },
      {},
    );

    expect(screen.getByTestId('metric-value')).toHaveTextContent('—');
  });

  // ── Format variants ─────────────────────────────────────────────────────

  it('formats currency values using the tenant locale', () => {
    renderMetric(
      {
        label: 'pipeline.open',
        source: { kind: 'field', fieldApiName: 'amount' },
        format: 'currency',
      },
      { amount: 12345.67 },
    );

    const value = screen.getByTestId('metric-value').textContent ?? '';
    // Default tenant locale: GBP / en-GB → "£12,345.67"
    expect(value).toMatch(/£/);
    expect(value).toMatch(/12[.,]345/);
  });

  it('formats percent values with a trailing % sign', () => {
    renderMetric(
      {
        label: 'win.rate',
        source: { kind: 'field', fieldApiName: 'rate' },
        format: 'percent',
      },
      { rate: 67 },
    );

    expect(screen.getByTestId('metric-value')).toHaveTextContent('67%');
  });

  it('formats duration values in a compact unit', () => {
    renderMetric(
      {
        label: 'avg.cycle',
        source: { kind: 'field', fieldApiName: 'seconds' },
        format: 'duration',
      },
      { seconds: 90 },
    );

    // 90s → 2m (rounded)
    expect(screen.getByTestId('metric-value')).toHaveTextContent('2m');
  });

  // ── Progress bar ────────────────────────────────────────────────────────

  it('does not render a progress bar when target is missing', () => {
    renderMetric(
      {
        label: 'x',
        source: { kind: 'field', fieldApiName: 'v' },
      },
      { v: 5 },
    );

    expect(screen.queryByTestId('metric-progress')).not.toBeInTheDocument();
  });

  it('renders progress at 0% when value is 0', () => {
    renderMetric(
      {
        label: 'x',
        source: { kind: 'field', fieldApiName: 'v' },
        target: { kind: 'literal', value: 100 },
      },
      { v: 0 },
    );

    const bar = screen.getByTestId('metric-progress');
    expect(bar).toHaveAttribute('aria-valuenow', '0');
    const fill = bar.firstElementChild as HTMLElement;
    expect(fill.style.width).toBe('0%');
  });

  it('exposes an accessible name on the progress bar that includes the metric label', () => {
    renderMetric(
      {
        label: 'pipeline.open',
        source: { kind: 'field', fieldApiName: 'v' },
        target: { kind: 'literal', value: 100 },
      },
      { v: 40 },
    );

    const bar = screen.getByTestId('metric-progress');
    expect(bar).toHaveAttribute('aria-label', 'pipeline.open: 40% of target');
  });

  it('renders progress at 50% when value is half of target', () => {
    renderMetric(
      {
        label: 'x',
        source: { kind: 'field', fieldApiName: 'v' },
        target: { kind: 'literal', value: 100 },
      },
      { v: 50 },
    );

    const bar = screen.getByTestId('metric-progress');
    expect(bar).toHaveAttribute('aria-valuenow', '50');
    const fill = bar.firstElementChild as HTMLElement;
    expect(fill.style.width).toBe('50%');
  });

  it('renders progress at 100% when value equals target', () => {
    renderMetric(
      {
        label: 'x',
        source: { kind: 'field', fieldApiName: 'v' },
        target: { kind: 'literal', value: 100 },
      },
      { v: 100 },
    );

    const bar = screen.getByTestId('metric-progress');
    expect(bar).toHaveAttribute('aria-valuenow', '100');
  });

  it('caps progress at 100% when value exceeds target', () => {
    renderMetric(
      {
        label: 'x',
        source: { kind: 'field', fieldApiName: 'v' },
        target: { kind: 'literal', value: 100 },
      },
      { v: 250 },
    );

    const bar = screen.getByTestId('metric-progress');
    expect(bar).toHaveAttribute('aria-valuenow', '100');
    const fill = bar.firstElementChild as HTMLElement;
    expect(fill.style.width).toBe('100%');
  });

  it('uses a record field as the target when target.kind === "field"', () => {
    renderMetric(
      {
        label: 'x',
        source: { kind: 'field', fieldApiName: 'actual' },
        target: { kind: 'field', fieldApiName: 'quota' },
      },
      { actual: 40, quota: 200 },
    );

    const bar = screen.getByTestId('metric-progress');
    expect(bar).toHaveAttribute('aria-valuenow', '20');
  });

  it('omits the progress bar when the target field cannot be resolved', () => {
    renderMetric(
      {
        label: 'x',
        source: { kind: 'field', fieldApiName: 'actual' },
        target: { kind: 'field', fieldApiName: 'missing' },
      },
      { actual: 40 },
    );

    expect(screen.queryByTestId('metric-progress')).not.toBeInTheDocument();
  });

  // ── Aggregate source placeholder ────────────────────────────────────────

  it('renders a clearly-marked placeholder for aggregate sources', () => {
    renderMetric({
      label: 'pipeline.total',
      source: { kind: 'aggregate', expr: 'sum(opportunities.amount)' },
      format: 'currency',
    });

    const card = screen.getByTestId('metric-card');
    expect(card).toHaveAttribute('data-metric-source', 'aggregate');

    const placeholder = within(card).getByTestId('metric-value-placeholder');
    expect(placeholder).toHaveTextContent('—');
    expect(placeholder).toHaveAttribute('title', expect.stringContaining('sum(opportunities.amount)'));

    // A stub annotation is visible so users know the value is not real.
    expect(within(card).getByText(/aggregate/i)).toBeInTheDocument();
  });

  it('does not render a progress bar for aggregate sources (no numeric value)', () => {
    renderMetric({
      label: 'x',
      source: { kind: 'aggregate', expr: 'count(*)' },
      target: { kind: 'literal', value: 100 },
    });

    expect(screen.queryByTestId('metric-progress')).not.toBeInTheDocument();
  });

  // ── Accent variants ─────────────────────────────────────────────────────

  it('applies the requested accent class', () => {
    const { container } = renderMetric(
      {
        label: 'x',
        source: { kind: 'field', fieldApiName: 'v' },
        accent: 'danger',
      },
      { v: 1 },
    );

    const card = container.querySelector('[data-testid="metric-card"]');
    expect(card?.className).toMatch(/accent-danger/);
  });
});
