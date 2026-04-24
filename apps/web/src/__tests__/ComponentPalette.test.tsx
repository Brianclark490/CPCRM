import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { ComponentPalette } from '../components/ComponentPalette.js';
import type { ComponentDefinition, LayoutZone } from '../components/builderTypes.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderPalette(registry: ComponentDefinition[], activeZone?: LayoutZone) {
  return render(
    <DndContext>
      <ComponentPalette
        registry={registry}
        fields={[]}
        relationships={[]}
        relatedFields={[]}
        tabs={[]}
        activeZone={activeZone}
      />
    </DndContext>,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ComponentPalette — zone filter', () => {
  const mainOnlyWidget: ComponentDefinition = {
    type: 'activity_timeline',
    label: 'Activity Timeline',
    icon: 'clock',
    category: 'widgets',
    allowedZones: ['main', 'rightRail'],
    configSchema: {},
    defaultConfig: {},
  };

  const kpiOnlyWidget: ComponentDefinition = {
    type: 'metric',
    label: 'Metric Card',
    icon: 'gauge',
    category: 'widgets',
    allowedZones: ['kpi'],
    configSchema: {},
    defaultConfig: {},
  };

  const legacyWidget: ComponentDefinition = {
    // Simulates a response from an older API that doesn't yet emit allowedZones.
    type: 'activity_timeline',
    label: 'Activity Timeline',
    icon: 'clock',
    category: 'widgets',
    configSchema: {},
    defaultConfig: {},
  };

  it('hides components whose allowedZones does not include "main"', () => {
    renderPalette([mainOnlyWidget, kpiOnlyWidget]);

    expect(
      screen.getByTestId('palette-item-palette-widget-activity_timeline'),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('palette-item-palette-widget-metric'),
    ).not.toBeInTheDocument();
  });

  it('shows components whose allowedZones includes "main"', () => {
    renderPalette([mainOnlyWidget]);
    expect(
      screen.getByTestId('palette-item-palette-widget-activity_timeline'),
    ).toBeInTheDocument();
  });

  it('shows registry entries that omit allowedZones (backwards compatible)', () => {
    renderPalette([legacyWidget]);
    expect(
      screen.getByTestId('palette-item-palette-widget-activity_timeline'),
    ).toBeInTheDocument();
  });

  it('collapses a category group when all its entries are filtered out', () => {
    renderPalette([kpiOnlyWidget]);
    expect(screen.queryByText('Widgets')).not.toBeInTheDocument();
  });

  it('shows a kpi-only widget when activeZone="kpi" and hides main-only widgets', () => {
    renderPalette([mainOnlyWidget, kpiOnlyWidget], 'kpi');

    expect(
      screen.getByTestId('palette-item-palette-widget-metric'),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('palette-item-palette-widget-activity_timeline'),
    ).not.toBeInTheDocument();
  });

  it('labels the active zone in the palette hint', () => {
    renderPalette([mainOnlyWidget], 'leftRail');
    const hint = screen.getByTestId('palette-active-zone');
    expect(hint).toHaveTextContent('Left Rail');
  });
});
