import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { DragEndEvent } from '@dnd-kit/core';
import { usePageLayoutDnd } from '../features/page-builder/hooks/usePageLayoutDnd.js';
import type {
  BuilderLayout,
  ComponentDefinition,
} from '../components/builderTypes.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeLayout(): BuilderLayout {
  return {
    id: 'pl-1',
    objectId: 'obj-1',
    name: 'Default',
    header: { primaryField: 'name', secondaryFields: [] },
    zones: { kpi: [], leftRail: [], rightRail: [] },
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
            components: [],
          },
        ],
      },
    ],
  };
}

const registry: ComponentDefinition[] = [
  {
    type: 'metric',
    label: 'Metric',
    icon: 'gauge',
    category: 'widgets',
    allowedZones: ['kpi'],
    configSchema: {},
    defaultConfig: {},
  },
  {
    type: 'activity_timeline',
    label: 'Activity',
    icon: 'clock',
    category: 'widgets',
    allowedZones: ['main', 'rightRail'],
    configSchema: {},
    defaultConfig: {},
  },
  {
    type: 'identity_panel',
    label: 'Identity',
    icon: 'user',
    category: 'widgets',
    allowedZones: ['leftRail', 'main', 'rightRail'],
    configSchema: {},
    defaultConfig: {},
  },
];

function setupHook(initial: BuilderLayout, onRejectZoneDrop = vi.fn()) {
  let current = initial;
  const updateLayout = vi.fn((mutator: (draft: BuilderLayout) => BuilderLayout) => {
    current = mutator(structuredClone(current));
  });

  const hook = renderHook(() =>
    usePageLayoutDnd({
      layout: current,
      updateLayout,
      registry,
      onRejectZoneDrop,
    }),
  );

  return {
    hook,
    getLayout: () => current,
    updateLayout,
    onRejectZoneDrop,
  };
}

function paletteDropEvent(
  componentType: string,
  over: DragEndEvent['over'],
): DragEndEvent {
  return {
    active: {
      id: `palette-widget-${componentType}`,
      data: {
        current: {
          origin: 'palette',
          componentType,
          defaultConfig: {},
        },
      },
      rect: { current: { initial: null, translated: null } },
    },
    over,
    delta: { x: 0, y: 0 },
    collisions: [],
    activatorEvent: new Event('pointer'),
  } as unknown as DragEndEvent;
}

function zoneDropTarget(zone: 'kpi' | 'leftRail' | 'rightRail'): DragEndEvent['over'] {
  return {
    id: `zone-drop-${zone}`,
    data: { current: { origin: 'zone', zone } },
    rect: { top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0 },
    disabled: false,
  } as unknown as DragEndEvent['over'];
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('usePageLayoutDnd — zone drops', () => {
  it('drops a palette metric into the KPI zone', () => {
    const { hook, getLayout } = setupHook(makeLayout());

    act(() => {
      hook.result.current.handleDragEnd(
        paletteDropEvent('metric', zoneDropTarget('kpi')),
      );
    });

    const layout = getLayout();
    expect(layout.zones.kpi).toHaveLength(1);
    expect(layout.zones.kpi[0].type).toBe('metric');
  });

  it('drops a palette panel into the left rail as a new section', () => {
    const { hook, getLayout } = setupHook(makeLayout());

    act(() => {
      hook.result.current.handleDragEnd(
        paletteDropEvent('identity_panel', zoneDropTarget('leftRail')),
      );
    });

    const layout = getLayout();
    expect(layout.zones.leftRail).toHaveLength(1);
    expect(layout.zones.leftRail[0].components).toHaveLength(1);
    expect(layout.zones.leftRail[0].components[0].type).toBe('identity_panel');
  });

  it('rejects a metric drop on the left rail (not in allowedZones)', () => {
    const { hook, getLayout, onRejectZoneDrop } = setupHook(makeLayout());

    act(() => {
      hook.result.current.handleDragEnd(
        paletteDropEvent('metric', zoneDropTarget('leftRail')),
      );
    });

    expect(getLayout().zones.leftRail).toHaveLength(0);
    expect(onRejectZoneDrop).toHaveBeenCalledWith('metric', 'leftRail');
  });

  it('rejects a metric drop into a main-zone new-section target', () => {
    const { hook, getLayout, onRejectZoneDrop } = setupHook(makeLayout());

    const newSectionTarget = {
      id: 'add-section-tab-1-1',
      data: { current: { origin: 'new-section', tabId: 'tab-1', columns: 1 } },
    } as unknown as DragEndEvent['over'];

    act(() => {
      hook.result.current.handleDragEnd(
        paletteDropEvent('metric', newSectionTarget),
      );
    });

    // tab-1 already has one section; no new section should be appended.
    expect(getLayout().tabs[0].sections).toHaveLength(1);
    expect(onRejectZoneDrop).toHaveBeenCalledWith('metric', 'main');
  });

  it('allows an activity timeline drop on a right-rail zone', () => {
    const { hook, getLayout } = setupHook(makeLayout());

    act(() => {
      hook.result.current.handleDragEnd(
        paletteDropEvent('activity_timeline', zoneDropTarget('rightRail')),
      );
    });

    expect(getLayout().zones.rightRail).toHaveLength(1);
    expect(getLayout().zones.rightRail[0].components[0].type).toBe(
      'activity_timeline',
    );
  });
});
