import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useSession } from '@descope/react-sdk';
import { useApiClient } from '../lib/apiClient.js';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragStartEvent, DragEndEvent } from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import type {
  ComponentDefinition,
  FieldRef,
  RelationshipRef,
  RelatedFieldRef,
  BuilderLayout,
  BuilderSection,
  BuilderComponent,
  BuilderTab,
  PageLayoutListItem,
  PaletteDragData,
  CanvasComponentDragData,
  CanvasSectionDragData,
} from '../components/builderTypes.js';
import type { HeaderConfig, VisibilityRule } from '../components/layoutTypes.js';
import { BuilderToolbar } from '../components/BuilderToolbar.js';
import type { RoleLayout } from '../components/BuilderToolbar.js';
import { ComponentPalette } from '../components/ComponentPalette.js';
import { BuilderCanvas } from '../components/BuilderCanvas.js';
import { PropertiesPanel } from '../components/PropertiesPanel.js';
import type { SelectedItem } from '../components/PropertiesPanel.js';
import { PageLayoutRenderer } from '../components/PageLayoutRenderer.js';
import { VersionHistoryPanel } from '../components/VersionHistoryPanel.js';
import type { VersionEntry } from '../components/VersionHistoryPanel.js';
import { CopyLayoutModal } from '../components/CopyLayoutModal.js';
import styles from './PageBuilderPage.module.css';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ObjectDefinitionDetail {
  id: string;
  apiName: string;
  label: string;
  pluralLabel: string;
  description?: string;
  icon?: string;
  isSystem: boolean;
  fields: FieldRef[];
}

interface RelationshipApiItem {
  id: string;
  sourceObjectId: string;
  targetObjectId: string;
  relationshipType: string;
  apiName: string;
  label: string;
  reverseLabel?: string;
  required: boolean;
  targetObjectLabel: string;
  targetObjectApiName: string;
  sourceObjectApiName: string;
  sourceObjectLabel: string;
}

interface RelatedObjectFields {
  id: string;
  apiName: string;
  label: string;
  fields: FieldRef[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

let _idCounter = 0;
function uid(): string {
  _idCounter += 1;
  return `builder-${Date.now()}-${_idCounter}`;
}

function createDefaultLayout(objectId: string, name: string): BuilderLayout {
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

function findSection(
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

// ─── Component ────────────────────────────────────────────────────────────────

export function PageBuilderPage() {
  const { objectId } = useParams<{ objectId: string }>();
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
  const [dirty, setDirty] = useState(false);

  // UI state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  // Role-based layout state
  const [allLayouts, setAllLayouts] = useState<PageLayoutListItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [versions, setVersions] = useState<VersionEntry[]>([]);
  const [reverting, setReverting] = useState(false);
  const [usingDefault, setUsingDefault] = useState(false);

  // Active drag state
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // ── Fetch data ──────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    if (!sessionToken || !objectId) return;

    setLoading(true);
    setError(null);

    try {
      const [objRes, relRes, regRes, layoutsRes] = await Promise.all([
        api.request(`/api/admin/objects/${objectId}`),
        api.request(`/api/admin/objects/${objectId}/relationships`),
        api.request('/api/admin/component-registry'),
        api.request(`/api/admin/objects/${objectId}/page-layouts`),
      ]);

      if (!objRes.ok) {
        setError('Failed to load object definition.');
        return;
      }

      const objData = (await objRes.json()) as ObjectDefinitionDetail;
      setObjectDef(objData);
      setFields(objData.fields ?? []);

      if (relRes.ok) {
        const relData = (await relRes.json()) as RelationshipApiItem[];
        setRelationships(
          relData.map((r) => ({
            id: r.id,
            label: r.label,
            apiName: r.apiName,
            relationshipType: r.relationshipType,
            targetObjectLabel: r.targetObjectLabel,
          })),
        );

        // Fetch fields for related objects (outgoing lookups from this object)
        const outgoingRels = relData.filter((r) => r.sourceObjectId === objectId);
        const uniqueTargetIds = [...new Set(outgoingRels.map((r) => r.targetObjectId))];

        const relatedObjResults = await Promise.all(
          uniqueTargetIds.map((targetId) =>
            api.request(`/api/admin/objects/${targetId}`)
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
        const regData = (await regRes.json()) as ComponentDefinition[];
        setRegistry(regData);
      }

      if (layoutsRes.ok) {
        const layoutsData = (await layoutsRes.json()) as PageLayoutListItem[];
        setAllLayouts(layoutsData);

        // Auto-select the default layout or first one
        if (layoutsData.length > 0) {
          const defaultLayout = layoutsData.find((l) => l.isDefault) ?? layoutsData[0];
          setSelectedLayoutId(defaultLayout.id);
          setUsingDefault(false);
          await loadLayoutDetail(defaultLayout.id);
        } else {
          // No layouts yet — create a default
          setLayout(createDefaultLayout(objectId, `${objData.label} - Default`));
          setDirty(true);
        }
      }
    } catch {
      setError('Failed to connect to the server. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [sessionToken, api, objectId]);

  const loadLayoutDetail = async (layoutId: string) => {
    if (!sessionToken || !objectId) return;

    try {
      const res = await api.request(
        `/api/admin/objects/${objectId}/page-layouts/${layoutId}`,
      );

      if (res.ok) {
        const data = (await res.json()) as {
          id: string;
          name: string;
          layout: BuilderLayout | null;
        };
        if (data.layout) {
          setLayout(data.layout);
        } else {
          setLayout(createDefaultLayout(objectId!, data.name ?? 'Default'));
        }
        setDirty(false);
      }
    } catch {
      // keep current layout
    }
  };

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // ── Layout mutation helpers ─────────────────────────────────

  const updateLayout = (mutator: (draft: BuilderLayout) => BuilderLayout) => {
    setLayout((prev) => {
      if (!prev) return prev;
      const next = mutator(structuredClone(prev));
      return next;
    });
    setDirty(true);
  };

  // Header
  const handleHeaderChange = (header: HeaderConfig) => {
    updateLayout((draft) => ({ ...draft, header }));
  };

  // Tabs
  const handleAddTab = () => {
    updateLayout((draft) => {
      draft.tabs.push({
        id: uid(),
        label: `Tab ${draft.tabs.length + 1}`,
        sections: [{ id: uid(), type: 'field_section', label: 'General', columns: 2, components: [] }],
      });
      return draft;
    });
  };

  const handleRenameTab = (tabId: string, label: string) => {
    updateLayout((draft) => {
      const tab = draft.tabs.find((t: BuilderTab) => t.id === tabId);
      if (tab) tab.label = label;
      return draft;
    });
  };

  const handleRemoveTab = (tabId: string) => {
    updateLayout((draft) => {
      draft.tabs = draft.tabs.filter((t: BuilderTab) => t.id !== tabId);
      return draft;
    });
  };

  // Sections
  const handleAddSection = (tabId: string, columns: number) => {
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
  };

  const handleRemoveSection = (sectionId: string) => {
    updateLayout((draft) => {
      for (const tab of draft.tabs) {
        tab.sections = tab.sections.filter((s: BuilderSection) => s.id !== sectionId);
      }
      return draft;
    });
    if (selectedId === sectionId) setSelectedId(null);
  };

  const handleRenameSection = (sectionId: string, label: string) => {
    updateLayout((draft) => {
      for (const tab of draft.tabs) {
        const section = tab.sections.find((s: BuilderSection) => s.id === sectionId);
        if (section) section.label = label;
      }
      return draft;
    });
  };

  // Components
  const handleRemoveComponent = (sectionId: string, componentId: string) => {
    updateLayout((draft) => {
      const loc = findSection(draft, sectionId);
      if (loc) {
        draft.tabs[loc.tabIndex].sections[loc.sectionIndex].components =
          draft.tabs[loc.tabIndex].sections[loc.sectionIndex].components.filter(
            (c: BuilderComponent) => c.id !== componentId,
          );
      }
      return draft;
    });
    if (selectedId === componentId) setSelectedId(null);
  };

  const handleSelectComponent = (componentId: string) => {
    setSelectedId(componentId);
  };

  const handleSelectSection = (sectionId: string) => {
    setSelectedId(sectionId);
  };

  // Properties panel
  const handleComponentChange = (
    sectionId: string,
    componentId: string,
    config: Record<string, unknown>,
  ) => {
    updateLayout((draft) => {
      const loc = findSection(draft, sectionId);
      if (loc) {
        const comp = draft.tabs[loc.tabIndex].sections[loc.sectionIndex].components.find(
          (c: BuilderComponent) => c.id === componentId,
        );
        if (comp) comp.config = config;
      }
      return draft;
    });
  };

  const handleComponentVisibilityChange = (
    sectionId: string,
    componentId: string,
    rule: VisibilityRule | null,
  ) => {
    updateLayout((draft) => {
      const loc = findSection(draft, sectionId);
      if (loc) {
        const comp = draft.tabs[loc.tabIndex].sections[loc.sectionIndex].components.find(
          (c: BuilderComponent) => c.id === componentId,
        );
        if (comp) comp.visibility = rule;
      }
      return draft;
    });
  };

  const handleSectionChange = (
    sectionId: string,
    patch: { label?: string; columns?: number },
  ) => {
    updateLayout((draft) => {
      for (const tab of draft.tabs) {
        const section = tab.sections.find((s: BuilderSection) => s.id === sectionId);
        if (section) {
          if (patch.label !== undefined) section.label = patch.label;
          if (patch.columns !== undefined) section.columns = patch.columns;
        }
      }
      return draft;
    });
  };

  const handleSectionVisibilityChange = (sectionId: string, rule: VisibilityRule | null) => {
    updateLayout((draft) => {
      for (const tab of draft.tabs) {
        const section = tab.sections.find((s: BuilderSection) => s.id === sectionId);
        if (section) section.visibility = rule;
      }
      return draft;
    });
  };

  // ── DnD handlers ────────────────────────────────────────────

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over || !layout) return;

    const activeData = active.data.current;
    if (!activeData) return;

    // Palette → section drop
    if (activeData.origin === 'palette') {
      const paletteData = activeData as unknown as PaletteDragData;
      const overData = over.data.current;

      // Find target section
      let targetSectionId: string | null = null;
      if (overData && 'sectionId' in overData) {
        targetSectionId = overData.sectionId as string;
      }

      if (!targetSectionId) return;

      const newComp: BuilderComponent = {
        id: uid(),
        type: paletteData.componentType,
        config: { ...paletteData.defaultConfig },
      };

      updateLayout((draft) => {
        const loc = findSection(draft, targetSectionId!);
        if (loc) {
          draft.tabs[loc.tabIndex].sections[loc.sectionIndex].components.push(newComp);
        }
        return draft;
      });

      return;
    }

    // Canvas component reorder (within or between sections)
    if (activeData.origin === 'canvas') {
      const canvasData = activeData as unknown as CanvasComponentDragData;
      const overData = over.data.current;

      // Determine target section and position
      let targetSectionId: string | null = null;
      let targetComponentId: string | null = null;

      if (overData && 'sectionId' in overData && 'componentId' in overData) {
        // Dropped on another component
        targetSectionId = overData.sectionId as string;
        targetComponentId = overData.componentId as string;
      } else if (overData && 'sectionId' in overData) {
        // Dropped on a section drop zone
        targetSectionId = overData.sectionId as string;
      }

      if (!targetSectionId) return;

      updateLayout((draft) => {
        // Remove from source section
        const sourceLoc = findSection(draft, canvasData.sectionId);
        if (!sourceLoc) return draft;

        const sourceSection = draft.tabs[sourceLoc.tabIndex].sections[sourceLoc.sectionIndex];
        const compIdx = sourceSection.components.findIndex(
          (c: BuilderComponent) => c.id === canvasData.componentId,
        );
        if (compIdx < 0) return draft;

        const [movedComp] = sourceSection.components.splice(compIdx, 1);

        // Insert into target section
        const targetLoc = findSection(draft, targetSectionId!);
        if (!targetLoc) return draft;

        const targetSection = draft.tabs[targetLoc.tabIndex].sections[targetLoc.sectionIndex];

        if (targetComponentId) {
          const targetIdx = targetSection.components.findIndex(
            (c: BuilderComponent) => c.id === targetComponentId,
          );
          if (targetIdx >= 0) {
            targetSection.components.splice(targetIdx, 0, movedComp);
          } else {
            targetSection.components.push(movedComp);
          }
        } else {
          targetSection.components.push(movedComp);
        }

        return draft;
      });

      return;
    }

    // Section reorder (within same tab or across tabs)
    if (activeData.origin === 'canvas-section') {
      const sectionData = activeData as unknown as CanvasSectionDragData;
      const overData = over.data.current;

      if (!overData) return;

      // Dropped on a tab target — move section to that tab
      if (overData.origin === 'tab-drop-target') {
        const targetTabId = overData.tabId as string;
        updateLayout((draft) => {
          // Find and remove section from its current tab
          let movedSection: BuilderSection | null = null;
          for (const tab of draft.tabs) {
            const idx = tab.sections.findIndex(
              (s: BuilderSection) => s.id === sectionData.sectionId,
            );
            if (idx >= 0) {
              // Don't move if already in the target tab
              if (tab.id === targetTabId) return draft;
              [movedSection] = tab.sections.splice(idx, 1);
              break;
            }
          }
          if (!movedSection) return draft;

          // Append to the target tab
          const targetTab = draft.tabs.find((t: BuilderTab) => t.id === targetTabId);
          if (targetTab) {
            targetTab.sections.push(movedSection);
          }
          return draft;
        });
        return;
      }

      // Dropped on another section — reorder within or across tabs
      if (overData.origin !== 'canvas-section') return;
      const overSectionData = overData as unknown as CanvasSectionDragData;
      if (sectionData.sectionId === overSectionData.sectionId) return;

      updateLayout((draft) => {
        // Find source section and remove it
        let sourceTabIndex = -1;
        let sourceIdx = -1;
        for (let ti = 0; ti < draft.tabs.length; ti++) {
          const idx = draft.tabs[ti].sections.findIndex(
            (s: BuilderSection) => s.id === sectionData.sectionId,
          );
          if (idx >= 0) {
            sourceTabIndex = ti;
            sourceIdx = idx;
            break;
          }
        }
        if (sourceTabIndex < 0 || sourceIdx < 0) return draft;

        const [moved] = draft.tabs[sourceTabIndex].sections.splice(sourceIdx, 1);

        // Find target section and insert before it
        for (let ti = 0; ti < draft.tabs.length; ti++) {
          const toIdx = draft.tabs[ti].sections.findIndex(
            (s: BuilderSection) => s.id === overSectionData.sectionId,
          );
          if (toIdx >= 0) {
            draft.tabs[ti].sections.splice(toIdx, 0, moved);
            break;
          }
        }
        return draft;
      });
    }
  };

  // ── Save / publish ──────────────────────────────────────────

  const handleSaveDraft = async () => {
    if (!sessionToken || !objectId || !layout) return;

    setSaving(true);
    setSaveError(null);
    try {
      if (selectedLayoutId) {
        // Update existing
        const res = await api.request(
          `/api/admin/objects/${objectId}/page-layouts/${selectedLayoutId}`,
          {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ layout }),
          },
        );
        if (res.ok) {
          setDirty(false);
        } else {
          const body = await res.json().catch(() => null) as { error?: string } | null;
          setSaveError(body?.error ?? 'Failed to save layout.');
        }
      } else {
        // Create new
        const res = await api.request(
          `/api/admin/objects/${objectId}/page-layouts`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              name: layout.name,
              is_default: true,
              layout,
            }),
          },
        );
        if (res.ok) {
          const data = (await res.json()) as PageLayoutListItem;
          setSelectedLayoutId(data.id);
          setDirty(false);
        } else {
          const body = await res.json().catch(() => null) as { error?: string } | null;
          setSaveError(body?.error ?? 'Failed to create layout.');
        }
      }
    } catch {
      setSaveError('Failed to connect to the server. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!sessionToken || !objectId || !selectedLayoutId) return;

    // Save first if dirty
    if (dirty) {
      await handleSaveDraft();
    }

    setPublishing(true);
    setSaveError(null);
    try {
      const res = await api.request(
        `/api/admin/objects/${objectId}/page-layouts/${selectedLayoutId}/publish`,
        {
          method: 'POST',
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null;
        setSaveError(body?.error ?? 'Failed to publish layout.');
      }
    } catch {
      setSaveError('Failed to connect to the server. Please try again.');
    } finally {
      setPublishing(false);
    }
  };

  // ── Role-based layout handlers ──────────────────────────────

  const handleRoleChange = async (layoutId: string | null, role: string | null) => {
    if (!sessionToken || !objectId) return;

    if (layoutId) {
      // Layout exists for this role — load it
      setSelectedLayoutId(layoutId);
      setUsingDefault(false);
      await loadLayoutDetail(layoutId);
    } else if (role !== null) {
      // No layout for this role — create one
      try {
        const res = await api.request(
          `/api/admin/objects/${objectId}/page-layouts`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              name: `${objectDef?.label ?? 'Object'} - ${role}`,
              role,
              is_default: false,
              layout: layout ?? createDefaultLayout(objectId, `${objectDef?.label ?? 'Object'} - ${role}`),
            }),
          },
        );

        if (res.ok) {
          const data = (await res.json()) as PageLayoutListItem;
          setSelectedLayoutId(data.id);
          setAllLayouts((prev) => [...prev, data]);
          setUsingDefault(true);
          await loadLayoutDetail(data.id);
        }
      } catch {
        // silently fail
      }
    } else {
      // Switched to default (null role)
      const defaultLayout = allLayouts.find((l) => l.role === null);
      if (defaultLayout) {
        setSelectedLayoutId(defaultLayout.id);
        setUsingDefault(false);
        await loadLayoutDetail(defaultLayout.id);
      }
    }
  };

  const handleCopyFrom = async (sourceLayoutId: string) => {
    if (!sessionToken || !objectId || !selectedLayoutId) return;

    try {
      const res = await api.request(
        `/api/admin/objects/${objectId}/page-layouts/${selectedLayoutId}/copy`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ sourceLayoutId }),
        },
      );

      if (res.ok) {
        await loadLayoutDetail(selectedLayoutId);
        setUsingDefault(false);
      }
    } catch {
      // silently fail
    }

    setShowCopyModal(false);
  };

  const handleResetToDefault = async () => {
    if (!sessionToken || !objectId || !selectedLayoutId) return;

    const currentLayout = allLayouts.find((l) => l.id === selectedLayoutId);
    if (!currentLayout || currentLayout.role === null) return;

    const confirmed = window.confirm(
      `Reset the "${currentLayout.role}" layout? This will delete the role-specific layout and fall back to the default.`,
    );
    if (!confirmed) return;

    try {
      const res = await fetch(
        `/api/admin/objects/${objectId}/page-layouts/${selectedLayoutId}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${sessionToken}` },
        },
      );

      if (res.ok || res.status === 204) {
        // Remove from allLayouts and switch to default
        setAllLayouts((prev) => prev.filter((l) => l.id !== selectedLayoutId));
        const defaultLayout = allLayouts.find((l) => l.role === null);
        if (defaultLayout) {
          setSelectedLayoutId(defaultLayout.id);
          setUsingDefault(false);
          await loadLayoutDetail(defaultLayout.id);
        }
      }
    } catch {
      // silently fail
    }
  };

  const handleShowHistory = async () => {
    if (!sessionToken || !objectId || !selectedLayoutId) return;

    try {
      const res = await fetch(
        `/api/admin/objects/${objectId}/page-layouts/${selectedLayoutId}/versions`,
        { headers: { Authorization: `Bearer ${sessionToken}` } },
      );

      if (res.ok) {
        const data = (await res.json()) as VersionEntry[];
        setVersions(data);
      }
    } catch {
      // silently fail
    }

    setShowHistory(true);
  };

  const handleRevert = async (version: number) => {
    if (!sessionToken || !objectId || !selectedLayoutId) return;

    setReverting(true);
    try {
      const res = await fetch(
        `/api/admin/objects/${objectId}/page-layouts/${selectedLayoutId}/revert`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${sessionToken}`,
          },
          body: JSON.stringify({ version }),
        },
      );

      if (res.ok) {
        await loadLayoutDetail(selectedLayoutId);
        setShowHistory(false);
      }
    } catch {
      // silently fail
    } finally {
      setReverting(false);
    }
  };

  // ── Derive selected item for properties panel ──────────────

  const getSelectedItem = (): SelectedItem | null => {
    if (!selectedId || !layout) return null;

    // Check if it's a section
    for (const tab of layout.tabs) {
      const section = tab.sections.find((s) => s.id === selectedId);
      if (section) return { kind: 'section', section };
    }

    // Check if it's a component
    for (const tab of layout.tabs) {
      for (const section of tab.sections) {
        const component = section.components.find((c) => c.id === selectedId);
        if (component) return { kind: 'component', component, sectionId: section.id };
      }
    }

    return null;
  };

  // ── Render ──────────────────────────────────────────────────

  if (loading) {
    return <div className={styles.page} data-testid="page-builder-loading">Loading…</div>;
  }

  if (error || !objectDef) {
    return (
      <div className={styles.page}>
        <p role="alert" className={styles.errorAlert}>
          {error ?? 'Object not found.'}
        </p>
      </div>
    );
  }

  if (!layout) {
    return (
      <div className={styles.page}>
        <p>No layout data available.</p>
      </div>
    );
  }

  const allLayoutsForToolbar: RoleLayout[] = allLayouts.map((l) => ({
    id: l.id,
    name: l.name,
    role: l.role,
  }));

  const currentLayoutVersion = allLayouts.find((l) => l.id === selectedLayoutId)?.version ?? 1;

  return (
    <div className={styles.page} data-testid="page-builder">
      <BuilderToolbar
        objectId={objectId!}
        layoutName={layout.name}
        dirty={dirty}
        saving={saving}
        publishing={publishing}
        onSaveDraft={() => void handleSaveDraft()}
        onPublish={() => void handlePublish()}
        onPreview={() => setShowPreview(true)}
        allLayouts={allLayoutsForToolbar}
        selectedLayoutId={selectedLayoutId}
        onRoleChange={(layoutId, role) => void handleRoleChange(layoutId, role)}
        onCopyFrom={() => setShowCopyModal(true)}
        onResetToDefault={() => void handleResetToDefault()}
        onShowHistory={() => void handleShowHistory()}
        usingDefault={usingDefault}
      />

      {saveError && (
        <div className={styles.saveErrorBanner} role="alert" data-testid="save-error-banner">
          <span>{saveError}</span>
          <button
            type="button"
            className={styles.saveErrorDismiss}
            onClick={() => setSaveError(null)}
            aria-label="Dismiss error"
          >
            ×
          </button>
        </div>
      )}

      <div className={styles.builderBody}>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <ComponentPalette
            registry={registry}
            fields={fields}
            relationships={relationships}
            relatedFields={relatedFields}
            tabs={layout.tabs}
          />

          <BuilderCanvas
            layout={layout}
            fields={fields}
            registry={registry}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onHeaderChange={handleHeaderChange}
            onAddTab={handleAddTab}
            onRenameTab={handleRenameTab}
            onRemoveTab={handleRemoveTab}
            onAddSection={handleAddSection}
            onRemoveSection={handleRemoveSection}
            onRenameSection={handleRenameSection}
            onRemoveComponent={handleRemoveComponent}
            onSelectComponent={handleSelectComponent}
            onSelectSection={handleSelectSection}
          />

          <DragOverlay>
            {activeDragId ? (
              <div className={styles.dragOverlay}>Dragging…</div>
            ) : null}
          </DragOverlay>
        </DndContext>

        <PropertiesPanel
          selectedItem={getSelectedItem()}
          registry={registry}
          fields={fields}
          onComponentChange={handleComponentChange}
          onComponentVisibilityChange={handleComponentVisibilityChange}
          onSectionChange={handleSectionChange}
          onSectionVisibilityChange={handleSectionVisibilityChange}
        />
      </div>

      {/* Preview modal */}
      {showPreview && (
        <div
          className={styles.overlay}
          onClick={() => setShowPreview(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Layout preview"
          data-testid="preview-modal"
        >
          <div className={styles.previewModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.previewHeader}>
              <h2 className={styles.previewTitle}>Layout Preview</h2>
              <button
                type="button"
                className={styles.previewClose}
                onClick={() => setShowPreview(false)}
                aria-label="Close preview"
              >
                ×
              </button>
            </div>
            <div className={styles.previewBody}>
              <PageLayoutRenderer
                layout={{
                  id: layout.id || 'preview',
                  objectId: layout.objectId,
                  name: layout.name,
                  header: layout.header,
                  tabs: layout.tabs,
                }}
                record={{
                  id: 'preview-record',
                  objectId: layout.objectId,
                  name: 'Sample Record',
                  fieldValues: Object.fromEntries(
                    fields.map((f) => [f.apiName, `Sample ${f.label}`]),
                  ),
                  ownerId: 'preview-user',
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                  fields: fields.map((f) => ({
                    apiName: f.apiName,
                    label: f.label,
                    fieldType: f.fieldType,
                  })),
                  relationships: [],
                }}
                fields={fields.map((f) => ({
                  apiName: f.apiName,
                  label: f.label,
                  fieldType: f.fieldType,
                }))}
                objectDef={objectDef ? {
                  id: objectDef.id,
                  apiName: objectDef.apiName,
                  label: objectDef.label,
                  pluralLabel: objectDef.pluralLabel,
                  isSystem: objectDef.isSystem,
                } : null}
              />
            </div>
          </div>
        </div>
      )}

      {/* Version history panel */}
      {showHistory && (
        <VersionHistoryPanel
          versions={versions}
          currentVersion={currentLayoutVersion}
          reverting={reverting}
          onRevert={(version) => void handleRevert(version)}
          onClose={() => setShowHistory(false)}
        />
      )}

      {/* Copy layout modal */}
      {showCopyModal && (
        <CopyLayoutModal
          layouts={allLayoutsForToolbar.map((l) => ({
            id: l.id,
            name: l.name,
            role: l.role,
          }))}
          currentLayoutId={selectedLayoutId ?? ''}
          currentRoleLabel={
            allLayouts.find((l) => l.id === selectedLayoutId)?.role ?? 'Default'
          }
          onCopy={(sourceId) => void handleCopyFrom(sourceId)}
          onClose={() => setShowCopyModal(false)}
        />
      )}
    </div>
  );
}
