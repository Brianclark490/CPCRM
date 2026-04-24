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

  it('rejects unknown component types when a registry is loaded', () => {
    const { hook, getLayout, onRejectZoneDrop } = setupHook(makeLayout());

    act(() => {
      hook.result.current.handleDragEnd(
        paletteDropEvent('unknown_widget', zoneDropTarget('rightRail')),
      );
    });

    expect(getLayout().zones.rightRail).toHaveLength(0);
    expect(onRejectZoneDrop).toHaveBeenCalledWith('unknown_widget', 'rightRail');
  });
});

// ─── Cross-zone component moves ────────────────────────────────────────────

describe('usePageLayoutDnd — canvas component reorder across zones', () => {
  function canvasComponentDragEvent(
    sourceSectionId: string,
    componentId: string,
    over: DragEndEvent['over'],
  ): DragEndEvent {
    return {
      active: {
        id: componentId,
        data: {
          current: { origin: 'canvas', sectionId: sourceSectionId, componentId },
        },
        rect: { current: { initial: null, translated: null } },
      },
      over,
      delta: { x: 0, y: 0 },
      collisions: [],
      activatorEvent: new Event('pointer'),
    } as unknown as DragEndEvent;
  }

  function sectionDropTarget(sectionId: string): DragEndEvent['over'] {
    return {
      id: `droppable-${sectionId}`,
      data: { current: { sectionId } },
    } as unknown as DragEndEvent['over'];
  }

  it('moves an identity_panel from a main section into a left-rail section', () => {
    const layout = makeLayout();
    layout.tabs[0].sections[0].components.push({
      id: 'c-identity',
      type: 'identity_panel',
      config: {},
    });
    layout.zones.leftRail.push({
      id: 'rail-sec-1',
      type: 'field_section',
      label: 'Rail Section',
      columns: 1,
      components: [],
    });
    const { hook, getLayout } = setupHook(layout);

    act(() => {
      hook.result.current.handleDragEnd(
        canvasComponentDragEvent('sec-1', 'c-identity', sectionDropTarget('rail-sec-1')),
      );
    });

    const updated = getLayout();
    expect(updated.tabs[0].sections[0].components).toHaveLength(0);
    expect(updated.zones.leftRail[0].components).toHaveLength(1);
    expect(updated.zones.leftRail[0].components[0].id).toBe('c-identity');
  });

  it('rejects moving a main-only component into a rail and keeps it in place', () => {
    const layout = makeLayout();
    layout.tabs[0].sections[0].components.push({
      id: 'c-timeline',
      type: 'activity_timeline',
      config: {},
    });
    layout.zones.leftRail.push({
      id: 'rail-sec-1',
      type: 'field_section',
      label: 'Rail Section',
      columns: 1,
      components: [],
    });
    const onRejectZoneDrop = vi.fn();
    const { hook, getLayout } = setupHook(layout, onRejectZoneDrop);

    act(() => {
      hook.result.current.handleDragEnd(
        canvasComponentDragEvent('sec-1', 'c-timeline', sectionDropTarget('rail-sec-1')),
      );
    });

    const updated = getLayout();
    // Regression guard: the earlier implementation spliced first and
    // bailed when `findSection` couldn't resolve the rail target,
    // causing silent data loss. We expect the component to stay put.
    expect(updated.tabs[0].sections[0].components).toHaveLength(1);
    expect(updated.tabs[0].sections[0].components[0].id).toBe('c-timeline');
    expect(updated.zones.leftRail[0].components).toHaveLength(0);
    expect(onRejectZoneDrop).toHaveBeenCalledWith('activity_timeline', 'leftRail');
  });
});

