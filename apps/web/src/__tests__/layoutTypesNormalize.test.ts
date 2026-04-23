import { describe, it, expect } from 'vitest';
import {
  EMPTY_ZONES,
  normalizeLayout,
  type LayoutZones,
  type PageLayout,
} from '../components/layoutTypes.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const LEGACY_LAYOUT: PageLayout = {
  id: 'pl-1',
  objectId: 'obj-1',
  name: 'Default',
  header: { primaryField: 'name', secondaryFields: ['stage'] },
  tabs: [
    {
      id: 'tab-1',
      label: 'Details',
      sections: [
        {
          id: 'sec-1',
          type: 'field_section',
          label: 'Info',
          columns: 2,
          components: [
            { id: 'comp-1', type: 'field', config: { fieldApiName: 'name' } },
          ],
        },
      ],
    },
  ],
};

const POPULATED_ZONES: LayoutZones = {
  kpi: [{ id: 'k-1', type: 'kpi', config: { fieldApiName: 'amount' } }],
  leftRail: [
    {
      id: 'lr-1',
      type: 'field_section',
      label: 'Left',
      columns: 1,
      components: [],
    },
  ],
  rightRail: [],
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('normalizeLayout', () => {
  it('fills in default zones when zones is missing (legacy layout)', () => {
    const normalized = normalizeLayout(LEGACY_LAYOUT);
    expect(normalized.zones).toEqual(EMPTY_ZONES);
    // Preserves everything else unchanged
    expect(normalized.tabs).toBe(LEGACY_LAYOUT.tabs);
    expect(normalized.header).toBe(LEGACY_LAYOUT.header);
  });

  it('fills in default zones when zones is explicitly null', () => {
    const input = { ...LEGACY_LAYOUT, zones: null } as unknown as PageLayout;
    const normalized = normalizeLayout(input);
    expect(normalized.zones).toEqual(EMPTY_ZONES);
  });

  it('round-trips a layout that already has populated zones', () => {
    const newShape: PageLayout = { ...LEGACY_LAYOUT, zones: POPULATED_ZONES };
    const normalized = normalizeLayout(newShape);
    expect(normalized.zones).toEqual(POPULATED_ZONES);
    expect(normalized.zones.kpi).toEqual(POPULATED_ZONES.kpi);
    expect(normalized.zones.leftRail).toEqual(POPULATED_ZONES.leftRail);
    expect(normalized.zones.rightRail).toEqual(POPULATED_ZONES.rightRail);
    // Re-normalising a populated layout is idempotent.
    expect(normalizeLayout(normalized)).toEqual(normalized);
  });

  it('fills missing rail arrays when zones is partially populated', () => {
    const partial = {
      ...LEGACY_LAYOUT,
      zones: { kpi: POPULATED_ZONES.kpi } as Partial<LayoutZones> as LayoutZones,
    };
    const normalized = normalizeLayout(partial);
    expect(normalized.zones.kpi).toEqual(POPULATED_ZONES.kpi);
    expect(normalized.zones.leftRail).toEqual([]);
    expect(normalized.zones.rightRail).toEqual([]);
  });

  it('does not mutate the input layout', () => {
    const snapshot = JSON.parse(JSON.stringify(LEGACY_LAYOUT));
    normalizeLayout(LEGACY_LAYOUT);
    expect(LEGACY_LAYOUT).toEqual(snapshot);
  });
});
