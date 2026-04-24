import { useState, useEffect, useCallback } from 'react';
import { useSession } from '@descope/react-sdk';
import { useApiClient, unwrapList } from '../../../lib/apiClient.js';
import {
  useSensor,
  useSensors,
  PointerSensor,
  KeyboardSensor,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import type {
  ComponentDefinition,
  FieldRef,
  RelationshipRef,
  RelatedFieldRef,
  BuilderLayout,
  BuilderTab,
  BuilderSection,
  BuilderComponent,
  PageLayoutListItem,
  LayoutZone,
} from '../../../components/builderTypes.js';
import type { HeaderConfig, VisibilityRule } from '../../../components/layoutTypes.js';
import type { SelectedItem } from '../../../components/PropertiesPanel.js';
import type { ObjectDefinitionDetail, RelationshipApiItem, RelatedObjectFields } from '../types.js';
import {
  uid,
  createDefaultLayout,
  findAnySection,
  findAnyComponent,
  normalizeBuilderZones,
} from '../helpers.js';

// Active zone state for the page builder canvas. Matches the full
// `LayoutZone` union: 'header' runs through the dedicated
// `HeaderZoneEditor`, while 'main' / 'kpi' / 'leftRail' / 'rightRail'
// are the zones the canvas exposes as drop targets.
export type ActiveZone = LayoutZone;

type RailZone = 'leftRail' | 'rightRail';

export function usePageLayout(objectId: string | undefined) {
  const { sessionToken } = useSession();
  const api = useApiClient();

  // Data state
  const [objectDef, setObjectDef] = useState<ObjectDefinitionDetail | null>(null);
  const [fields, setFields] = useState<FieldRef[]>([]);
  const [relationships, setRelationships] = useState<RelationshipRef[]>([]);
  const [relatedFields, setRelatedFields] = useState<RelatedFieldRef[]>([]);
  const [registry, setRegistry] = useState<ComponentDefinition[]>([]);

  // Builder state
  const [layout, setLayout] = useState<BuilderLayout | null>(null);
  const [selectedLayoutId, setSelectedLayoutId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeZone, setActiveZone] = useState<ActiveZone>('main');
  const [dirty, setDirty] = useState(false);

  // UI state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [allLayouts, setAllLayouts] = useState<PageLayoutListItem[]>([]);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // ── Data fetching ──────────────────────────────────────────

  const loadLayoutDetail = useCallback(async (layoutId: string) => {
    if (!sessionToken || !objectId) return;

    try {
      const res = await api.request(
        `/api/v1/admin/objects/${objectId}/page-layouts/${layoutId}`,
      );

      if (res.ok) {
        const data = (await res.json()) as {
          id: string;
          name: string;
          layout: BuilderLayout | null;
        };
        if (data.layout) {
          // Back-compat: older server responses may omit `zones`.
          setLayout({
            ...data.layout,
            zones: normalizeBuilderZones(data.layout.zones),
          });
        } else {
          setLayout(createDefaultLayout(objectId, data.name ?? 'Default'));
        }
        setDirty(false);
      }
    } catch {
      // keep current layout
    }
  }, [sessionToken, api, objectId]);

  const fetchData = useCallback(async () => {
    if (!sessionToken || !objectId) return;

    setLoading(true);
    setError(null);

    try {
      const [objRes, relRes, regRes, layoutsRes] = await Promise.all([
        api.request(`/api/v1/admin/objects/${objectId}`),
        api.request(`/api/v1/admin/objects/${objectId}/relationships`),
        api.request('/api/v1/admin/component-registry'),
        api.request(`/api/v1/admin/objects/${objectId}/page-layouts`),
      ]);

      if (!objRes.ok) {
        setError('Failed to load object definition.');
        return;
      }

      const objData = (await objRes.json()) as ObjectDefinitionDetail;
      setObjectDef(objData);
      setFields(objData.fields ?? []);

      if (relRes.ok) {
        const relData = unwrapList<RelationshipApiItem>(await relRes.json());
        const firstNonEmpty = (...vals: Array<string | null | undefined>) =>
          vals.find((v) => typeof v === 'string' && v.trim().length > 0) ?? '';
        setRelationships(
          relData.map((r) => {
            const isInbound = r.targetObjectId === objectId;
            const displayLabel = isInbound
              ? firstNonEmpty(r.reverseLabel, r.sourceObjectPluralLabel, r.label)
              : firstNonEmpty(r.label, r.targetObjectPluralLabel);
            return {
              id: r.id,
              label: r.label,
              displayLabel,
              apiName: r.apiName,
              relationshipType: r.relationshipType,
              targetObjectLabel: r.targetObjectLabel,
            };
          }),
        );

        const outgoingRels = relData.filter((r) => r.sourceObjectId === objectId);
        const uniqueTargetIds = [...new Set(outgoingRels.map((r) => r.targetObjectId))];

        const relatedObjResults = await Promise.all(
          uniqueTargetIds.map((targetId) =>
            api.request(`/api/v1/admin/objects/${targetId}`)
              .then(async (res) => {
                if (!res.ok) return null;
                return (await res.json()) as RelatedObjectFields;
              })
              .catch(() => null),
          ),
        );

        const relatedObjMap = new Map<string, RelatedObjectFields>();
        for (const obj of relatedObjResults) {
          if (obj) relatedObjMap.set(obj.id, obj);
        }

        const builtRelatedFields: RelatedFieldRef[] = [];
        for (const rel of outgoingRels) {
          const targetObj = relatedObjMap.get(rel.targetObjectId);
          if (!targetObj) continue;
          for (const field of targetObj.fields) {
            builtRelatedFields.push({
              relationshipId: rel.id,
              relationshipApiName: rel.apiName,
              relationshipLabel: rel.label,
              relatedObjectApiName: targetObj.apiName,
              relatedObjectLabel: targetObj.label,
              fieldId: field.id,
              fieldApiName: field.apiName,
              fieldLabel: field.label,
              fieldType: field.fieldType,
            });
          }
        }

        setRelatedFields(builtRelatedFields);
      }

      if (regRes.ok) {
        const regData = unwrapList<ComponentDefinition>(await regRes.json());
        setRegistry(regData);
      }

      if (layoutsRes.ok) {
        const layoutsData = unwrapList<PageLayoutListItem>(await layoutsRes.json());
        setAllLayouts(layoutsData);

        if (layoutsData.length > 0) {
          const defaultLayout = layoutsData.find((l) => l.isDefault) ?? layoutsData[0];
          setSelectedLayoutId(defaultLayout.id);
          await loadLayoutDetail(defaultLayout.id);
        } else {
          setLayout(createDefaultLayout(objectId, `${objData.label} - Default`));
          setDirty(true);
        }
      }
    } catch {
      setError('Failed to connect to the server. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [sessionToken, api, objectId, loadLayoutDetail]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // ── Layout mutation helpers ────────────────────────────────

  const updateLayout = useCallback((mutator: (draft: BuilderLayout) => BuilderLayout) => {
    setLayout((prev) => {
      if (!prev) return prev;
      return mutator(structuredClone(prev));
    });
    setDirty(true);
  }, []);

  const handleHeaderChange = useCallback((header: HeaderConfig) => {
    updateLayout((draft) => ({ ...draft, header }));
  }, [updateLayout]);

  const handleAddTab = useCallback(() => {
    updateLayout((draft) => {
      draft.tabs.push({
        id: uid(),
        label: `Tab ${draft.tabs.length + 1}`,
        sections: [{ id: uid(), type: 'field_section', label: 'General', columns: 2, components: [] }],
      });
      return draft;
    });
  }, [updateLayout]);

  const handleRenameTab = useCallback((tabId: string, label: string) => {
    updateLayout((draft) => {
      const tab = draft.tabs.find((t: BuilderTab) => t.id === tabId);
      if (tab) tab.label = label;
      return draft;
    });
  }, [updateLayout]);

  const handleRemoveTab = useCallback((tabId: string) => {
    updateLayout((draft) => {
      draft.tabs = draft.tabs.filter((t: BuilderTab) => t.id !== tabId);
      return draft;
    });
  }, [updateLayout]);

  const handleAddSection = useCallback((tabId: string, columns: number) => {
    updateLayout((draft) => {
      const tab = draft.tabs.find((t: BuilderTab) => t.id === tabId);
      if (tab) {
        tab.sections.push({
          id: uid(),
          type: 'field_section',
          label: `Section ${tab.sections.length + 1}`,
          columns,
          components: [],
        });
      }
      return draft;
    });
  }, [updateLayout]);

  const handleRemoveSection = useCallback((sectionId: string) => {
    updateLayout((draft) => {
      for (const tab of draft.tabs) {
        tab.sections = tab.sections.filter((s: BuilderSection) => s.id !== sectionId);
      }
      for (const rail of ['leftRail', 'rightRail'] as const) {
        draft.zones[rail] = draft.zones[rail].filter(
          (s: BuilderSection) => s.id !== sectionId,
        );
      }
      return draft;
    });
    if (selectedId === sectionId) setSelectedId(null);
  }, [updateLayout, selectedId]);

  const handleRenameSection = useCallback((sectionId: string, label: string) => {
    updateLayout((draft) => {
      for (const tab of draft.tabs) {
        const section = tab.sections.find((s: BuilderSection) => s.id === sectionId);
        if (section) section.label = label;
      }
      for (const rail of ['leftRail', 'rightRail'] as const) {
        const section = draft.zones[rail].find(
          (s: BuilderSection) => s.id === sectionId,
        );
        if (section) section.label = label;
      }
      return draft;
    });
  }, [updateLayout]);

  const handleRemoveComponent = useCallback((sectionId: string, componentId: string) => {
    updateLayout((draft) => {
      // `sectionId === ''` is the canvas's signal that the component lives
      // in the KPI strip (which has no section wrapper).
      if (sectionId === '') {
        draft.zones.kpi = draft.zones.kpi.filter(
          (c: BuilderComponent) => c.id !== componentId,
        );
        return draft;
      }
      const loc = findAnySection(draft, sectionId);
      if (!loc) return draft;
      if (loc.scope === 'tab') {
        draft.tabs[loc.tabIndex].sections[loc.sectionIndex].components =
          draft.tabs[loc.tabIndex].sections[loc.sectionIndex].components.filter(
            (c: BuilderComponent) => c.id !== componentId,
          );
      } else {
        draft.zones[loc.scope][loc.sectionIndex].components =
          draft.zones[loc.scope][loc.sectionIndex].components.filter(
            (c: BuilderComponent) => c.id !== componentId,
          );
      }
      return draft;
    });
    if (selectedId === componentId) setSelectedId(null);
  }, [updateLayout, selectedId]);

  const handleSelectComponent = useCallback((componentId: string) => {
    setSelectedId(componentId);
  }, []);

  const handleSelectSection = useCallback((sectionId: string) => {
    setSelectedId(sectionId);
  }, []);

  const handleComponentChange = useCallback((
    _sectionId: string,
    componentId: string,
    config: Record<string, unknown>,
  ) => {
    updateLayout((draft) => {
      const loc = findAnyComponent(draft, componentId);
      if (!loc) return draft;
      if (loc.scope === 'tab-section') {
        const comp = draft.tabs[loc.tabIndex].sections[loc.sectionIndex].components[loc.componentIndex];
        comp.config = config;
      } else if (loc.scope === 'rail-section') {
        const comp = draft.zones[loc.rail][loc.sectionIndex].components[loc.componentIndex];
        comp.config = config;
      } else {
        draft.zones.kpi[loc.componentIndex].config = config;
      }
      return draft;
    });
  }, [updateLayout]);

  const handleComponentVisibilityChange = useCallback((
    _sectionId: string,
    componentId: string,
    rule: VisibilityRule | null,
  ) => {
    updateLayout((draft) => {
      const loc = findAnyComponent(draft, componentId);
      if (!loc) return draft;
      if (loc.scope === 'tab-section') {
        draft.tabs[loc.tabIndex].sections[loc.sectionIndex].components[loc.componentIndex].visibility = rule;
      } else if (loc.scope === 'rail-section') {
        draft.zones[loc.rail][loc.sectionIndex].components[loc.componentIndex].visibility = rule;
      } else {
        draft.zones.kpi[loc.componentIndex].visibility = rule;
      }
      return draft;
    });
  }, [updateLayout]);

  const handleSectionChange = useCallback((
    sectionId: string,
    patch: { label?: string; columns?: number },
  ) => {
    updateLayout((draft) => {
      const applyPatch = (section: BuilderSection) => {
        if (patch.label !== undefined) section.label = patch.label;
        if (patch.columns !== undefined) section.columns = patch.columns;
      };
      for (const tab of draft.tabs) {
        const section = tab.sections.find((s: BuilderSection) => s.id === sectionId);
        if (section) applyPatch(section);
      }
      for (const rail of ['leftRail', 'rightRail'] as const) {
        const section = draft.zones[rail].find(
          (s: BuilderSection) => s.id === sectionId,
        );
        if (section) applyPatch(section);
      }
      return draft;
    });
  }, [updateLayout]);

  const handleSectionVisibilityChange = useCallback((sectionId: string, rule: VisibilityRule | null) => {
    updateLayout((draft) => {
      for (const tab of draft.tabs) {
        const section = tab.sections.find((s: BuilderSection) => s.id === sectionId);
        if (section) section.visibility = rule;
      }
      for (const rail of ['leftRail', 'rightRail'] as const) {
        const section = draft.zones[rail].find(
          (s: BuilderSection) => s.id === sectionId,
        );
        if (section) section.visibility = rule;
      }
      return draft;
    });
  }, [updateLayout]);

  // ── Zone-aware helpers ─────────────────────────────────────
  //
  // The page builder edits the zoned shell directly: KPI cards and rail
  // sections live in `layout.zones` rather than inside a tab. These
  // handlers keep the tab-level helpers above focused on `main` while
  // giving the canvas a parallel set of mutators that won't accidentally
  // reach into tabs.

  const handleAddKpiComponent = useCallback((comp: BuilderComponent) => {
    updateLayout((draft) => {
      draft.zones.kpi.push(comp);
      return draft;
    });
  }, [updateLayout]);

  const handleRemoveKpiComponent = useCallback((componentId: string) => {
    updateLayout((draft) => {
      draft.zones.kpi = draft.zones.kpi.filter(
        (c: BuilderComponent) => c.id !== componentId,
      );
      return draft;
    });
    if (selectedId === componentId) setSelectedId(null);
  }, [updateLayout, selectedId]);

  const handleAddRailSection = useCallback((rail: RailZone, columns: number) => {
    updateLayout((draft) => {
      draft.zones[rail].push({
        id: uid(),
        type: 'field_section',
        label: `Section ${draft.zones[rail].length + 1}`,
        columns,
        components: [],
      });
      return draft;
    });
  }, [updateLayout]);

  const handleRemoveRailSection = useCallback((rail: RailZone, sectionId: string) => {
    updateLayout((draft) => {
      draft.zones[rail] = draft.zones[rail].filter(
        (s: BuilderSection) => s.id !== sectionId,
      );
      return draft;
    });
    if (selectedId === sectionId) setSelectedId(null);
  }, [updateLayout, selectedId]);

  // ── Derive selected item for properties panel ──────────────

  const getSelectedItem = useCallback((): SelectedItem | null => {
    if (!selectedId || !layout) return null;

    for (const tab of layout.tabs) {
      const section = tab.sections.find((s) => s.id === selectedId);
      if (section) return { kind: 'section', section };
    }
    for (const rail of ['leftRail', 'rightRail'] as const) {
      const section = layout.zones[rail].find((s) => s.id === selectedId);
      if (section) return { kind: 'section', section };
    }

    for (const tab of layout.tabs) {
      for (const section of tab.sections) {
        const component = section.components.find((c) => c.id === selectedId);
        if (component) return { kind: 'component', component, sectionId: section.id };
      }
    }
    for (const rail of ['leftRail', 'rightRail'] as const) {
      for (const section of layout.zones[rail]) {
        const component = section.components.find((c) => c.id === selectedId);
        if (component) return { kind: 'component', component, sectionId: section.id };
      }
    }
    // KPI components live directly in `zones.kpi` with no section wrapper.
    const kpiComp = layout.zones.kpi.find((c) => c.id === selectedId);
    if (kpiComp) return { kind: 'component', component: kpiComp, sectionId: '' };

    return null;
  }, [selectedId, layout]);

  return {
    objectDef, fields, relationships, relatedFields, registry,
    layout, selectedLayoutId, selectedId, activeZone, dirty, allLayouts, sensors,
    loading, error,
    setLayout, setSelectedLayoutId, setDirty, setSelectedId, setActiveZone, setAllLayouts,
    loadLayoutDetail, updateLayout, getSelectedItem,
    handleHeaderChange, handleAddTab, handleRenameTab, handleRemoveTab,
    handleAddSection, handleRemoveSection, handleRenameSection,
    handleRemoveComponent, handleSelectComponent, handleSelectSection,
    handleComponentChange, handleComponentVisibilityChange,
    handleSectionChange, handleSectionVisibilityChange,
    handleAddKpiComponent, handleRemoveKpiComponent,
    handleAddRailSection, handleRemoveRailSection,
  };
}
