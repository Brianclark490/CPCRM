import type { BuilderLayout } from '../../components/builderTypes.js';

let _idCounter = 0;
export function uid(): string {
  _idCounter += 1;
  return `builder-${Date.now()}-${_idCounter}`;
}

export function createDefaultLayout(objectId: string, name: string): BuilderLayout {
  return {
    id: '',
    objectId,
    name,
    header: { primaryField: 'name', secondaryFields: [] },
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
