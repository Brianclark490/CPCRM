import type { BuilderLayout, BuilderZones } from '../../components/builderTypes.js';

let _idCounter = 0;
export function uid(): string {
  _idCounter += 1;
  return `builder-${Date.now()}-${_idCounter}`;
}

export function createEmptyZones(): BuilderZones {
  return { kpi: [], leftRail: [], rightRail: [] };
}

// Back-fill missing or partial zones from older layouts so the builder
// always operates on a populated shape.
export function normalizeBuilderZones(
  zones: Partial<BuilderZones> | null | undefined,
): BuilderZones {
  return {
    kpi: Array.isArray(zones?.kpi) ? zones!.kpi! : [],
    leftRail: Array.isArray(zones?.leftRail) ? zones!.leftRail! : [],
    rightRail: Array.isArray(zones?.rightRail) ? zones!.rightRail! : [],
  };
}

export function createDefaultLayout(objectId: string, name: string): BuilderLayout {
  return {
    id: '',
    objectId,
    name,
    header: { primaryField: 'name', secondaryFields: [] },
    zones: createEmptyZones(),
    tabs: [
      {
        id: uid(),
        label: 'Details',
        sections: [
          {
            id: uid(),
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

export function findSection(
  layout: BuilderLayout,
  sectionId: string,
): { tabIndex: number; sectionIndex: number } | null {
  for (let ti = 0; ti < layout.tabs.length; ti++) {
    for (let si = 0; si < layout.tabs[ti].sections.length; si++) {
      if (layout.tabs[ti].sections[si].id === sectionId) {
        return { tabIndex: ti, sectionIndex: si };
      }
    }
  }
  return null;
}

// Locate a section across tabs + rails. Sections live in three places
// (tab body + both rails), and most mutators don't care which — returning
// the parent array lets callers mutate in place without branching.
export function findAnySection(
  layout: BuilderLayout,
  sectionId: string,
):
  | { scope: 'tab'; tabIndex: number; sectionIndex: number }
  | { scope: 'leftRail' | 'rightRail'; sectionIndex: number }
  | null {
  const tabLoc = findSection(layout, sectionId);
  if (tabLoc) return { scope: 'tab', ...tabLoc };

  for (const rail of ['leftRail', 'rightRail'] as const) {
    const idx = layout.zones[rail].findIndex((s) => s.id === sectionId);
    if (idx >= 0) return { scope: rail, sectionIndex: idx };
  }
  return null;
}

// Resolve a component id anywhere in the layout (tab sections, rails, KPI).
export function findAnyComponent(
  layout: BuilderLayout,
  componentId: string,
):
  | { scope: 'tab-section'; tabIndex: number; sectionIndex: number; componentIndex: number }
  | { scope: 'rail-section'; rail: 'leftRail' | 'rightRail'; sectionIndex: number; componentIndex: number }
  | { scope: 'kpi'; componentIndex: number }
  | null {
  for (let ti = 0; ti < layout.tabs.length; ti++) {
    for (let si = 0; si < layout.tabs[ti].sections.length; si++) {
      const ci = layout.tabs[ti].sections[si].components.findIndex((c) => c.id === componentId);
      if (ci >= 0) {
        return { scope: 'tab-section', tabIndex: ti, sectionIndex: si, componentIndex: ci };
      }
    }
  }
  for (const rail of ['leftRail', 'rightRail'] as const) {
    for (let si = 0; si < layout.zones[rail].length; si++) {
      const ci = layout.zones[rail][si].components.findIndex((c) => c.id === componentId);
      if (ci >= 0) {
        return { scope: 'rail-section', rail, sectionIndex: si, componentIndex: ci };
      }
    }
  }
  const kpiIdx = layout.zones.kpi.findIndex((c) => c.id === componentId);
  if (kpiIdx >= 0) return { scope: 'kpi', componentIndex: kpiIdx };
  return null;
}
