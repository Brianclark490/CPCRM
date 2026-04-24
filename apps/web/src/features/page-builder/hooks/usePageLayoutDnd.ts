import { useState, useCallback } from 'react';
import type { DragStartEvent, DragEndEvent } from '@dnd-kit/core';
import type {
  BuilderLayout,
  BuilderComponent,
  BuilderSection,
  BuilderTab,
  ComponentDefinition,
  PaletteDragData,
  CanvasComponentDragData,
  CanvasSectionDragData,
  LayoutZone,
} from '../../../components/builderTypes.js';
import { uid, findSection, findAnySection } from '../helpers.js';

// Returns the array of sections in whichever scope `sectionId` lives.
// Used by reorder paths so they work uniformly across tabs, leftRail,
// and rightRail. Returning the parent array plus the index lets callers
// splice in place without branching on scope.
function resolveSectionScope(
  layout: BuilderLayout,
  sectionId: string,
):
  | { sections: BuilderSection[]; index: number; zone: LayoutZone }
  | null {
  const loc = findAnySection(layout, sectionId);
  if (!loc) return null;
  if (loc.scope === 'tab') {
    return {
      sections: layout.tabs[loc.tabIndex].sections,
      index: loc.sectionIndex,
      zone: 'main',
    };
  }
  return {
    sections: layout.zones[loc.scope],
    index: loc.sectionIndex,
    zone: loc.scope,
  };
}

interface UsePageLayoutDndOptions {
  layout: BuilderLayout | null;
  updateLayout: (mutator: (draft: BuilderLayout) => BuilderLayout) => void;
  registry?: ComponentDefinition[];
  onRejectZoneDrop?: (componentType: string, zone: LayoutZone) => void;
}

// Client-side mirror of the server's isComponentAllowedInZone. Unknown
// component types are rejected when a registry is supplied, matching
// the server (so a client with a stale registry can't ship a layout the
// server will refuse on save). When no registry is provided at all —
// only happens during transient load states before `fetchData` resolves
// — we fall back to "allow" so early drops aren't silently swallowed.
// Missing `allowedZones` on a known type stays permissive for
// back-compat with older API responses.
function isAllowedInZone(
  registry: ComponentDefinition[] | undefined,
  componentType: string,
  zone: LayoutZone,
): boolean {
  if (!registry) return true;
  const def = registry.find((r) => r.type === componentType);
  if (!def) return false;
  if (!def.allowedZones) return true;
  return def.allowedZones.includes(zone);
}

export function usePageLayoutDnd({
  layout,
  updateLayout,
  registry,
  onRejectZoneDrop,
}: UsePageLayoutDndOptions) {
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over || !layout) return;

    const activeData = active.data.current;
    if (!activeData) return;

    // Palette → section drop
    if (activeData.origin === 'palette') {
      const paletteData = activeData as unknown as PaletteDragData;
      const overData = over.data.current;

      const newComp: BuilderComponent = {
        id: uid(),
        type: paletteData.componentType,
        config: { ...paletteData.defaultConfig },
      };

      // Palette → zone drop (KPI strip or a rail).
      if (overData && overData.origin === 'zone') {
        const zone = overData.zone as LayoutZone;
        if (!isAllowedInZone(registry, paletteData.componentType, zone)) {
          onRejectZoneDrop?.(paletteData.componentType, zone);
          return;
        }
        if (zone === 'kpi') {
          updateLayout((draft) => {
            draft.zones.kpi.push(newComp);
            return draft;
          });
          return;
        }
        if (zone === 'leftRail' || zone === 'rightRail') {
          // Rails are stacks of sections, each with a single column. Drops
          // onto the rail zone itself create a new one-column section.
          updateLayout((draft) => {
            draft.zones[zone].push({
              id: uid(),
              type: 'field_section',
              label: `Section ${draft.zones[zone].length + 1}`,
              columns: 1,
              components: [newComp],
            });
            return draft;
          });
          return;
        }
      }

      // Palette → new-section drop: create a section and place the component in it.
      if (overData && overData.origin === 'new-section') {
        if (!isAllowedInZone(registry, paletteData.componentType, 'main')) {
          onRejectZoneDrop?.(paletteData.componentType, 'main');
          return;
        }
        const targetTabId = overData.tabId as string;
        const columns = (overData.columns as number) ?? 1;
        updateLayout((draft) => {
          const tab = draft.tabs.find((t: BuilderTab) => t.id === targetTabId);
          if (!tab) return draft;
          tab.sections.push({
            id: uid(),
            type: 'field_section',
            label: `Section ${tab.sections.length + 1}`,
            columns,
            components: [newComp],
          });
          return draft;
        });
        return;
      }

      let targetSectionId: string | null = null;
      if (overData && 'sectionId' in overData) {
        targetSectionId = overData.sectionId as string;
      }

      if (!targetSectionId) return;

      // Infer the target zone from where this section lives, so the palette
      // → existing-section path enforces the same whitelist as zone drops.
      const targetZone: LayoutZone = layout.zones.leftRail.some((s) => s.id === targetSectionId)
        ? 'leftRail'
        : layout.zones.rightRail.some((s) => s.id === targetSectionId)
          ? 'rightRail'
          : 'main';
      if (!isAllowedInZone(registry, paletteData.componentType, targetZone)) {
        onRejectZoneDrop?.(paletteData.componentType, targetZone);
        return;
      }

      updateLayout((draft) => {
        const loc = findSection(draft, targetSectionId!);
        if (loc) {
          draft.tabs[loc.tabIndex].sections[loc.sectionIndex].components.push(newComp);
          return draft;
        }
        for (const rail of ['leftRail', 'rightRail'] as const) {
          const idx = draft.zones[rail].findIndex(
            (s: BuilderSection) => s.id === targetSectionId,
          );
          if (idx >= 0) {
            draft.zones[rail][idx].components.push(newComp);
            return draft;
          }
        }
        return draft;
      });

      return;
    }

    // Canvas component reorder (within or between sections)
    if (activeData.origin === 'canvas') {
      const canvasData = activeData as unknown as CanvasComponentDragData;
      const overData = over.data.current;

      let targetSectionId: string | null = null;
      let targetComponentId: string | null = null;

      if (overData && 'sectionId' in overData && 'componentId' in overData) {
        targetSectionId = overData.sectionId as string;
        targetComponentId = overData.componentId as string;
      } else if (overData && 'sectionId' in overData) {
        targetSectionId = overData.sectionId as string;
      }

      if (!targetSectionId) return;

      // Canvas components may now live in tab sections OR rail sections
      // (the KPI strip has no section wrapper, so it isn't a target here).
      // Resolve source + target before mutating: if either is missing, or
      // if the move would violate a zone whitelist, bail without touching
      // the layout. The previous implementation spliced the source first
      // and then dropped the component on the floor when the target
      // wasn't a tab section — silent data loss for any main→rail drag.
      updateLayout((draft) => {
        const sourceScope = resolveSectionScope(draft, canvasData.sectionId);
        if (!sourceScope) return draft;

        const sourceSection = sourceScope.sections[sourceScope.index];
        const compIdx = sourceSection.components.findIndex(
          (c: BuilderComponent) => c.id === canvasData.componentId,
        );
        if (compIdx < 0) return draft;

        const targetScope = resolveSectionScope(draft, targetSectionId!);
        if (!targetScope) return draft;

        const movingComponent = sourceSection.components[compIdx];
        if (
          sourceScope.zone !== targetScope.zone &&
          !isAllowedInZone(registry, movingComponent.type, targetScope.zone)
        ) {
          onRejectZoneDrop?.(movingComponent.type, targetScope.zone);
          return draft;
        }

        const [movedComp] = sourceSection.components.splice(compIdx, 1);
        const targetSection = targetScope.sections[targetScope.index];

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

    // Section reorder (within same tab / across tabs, or within a rail)
    if (activeData.origin === 'canvas-section') {
      const sectionData = activeData as unknown as CanvasSectionDragData;
      const overData = over.data.current;

      if (!overData) return;

      // Dropped on a tab target — move section to that tab. Only allowed
      // for sections that already live in a tab (main zone); rail
      // sections dragged onto a tab would cross zones silently, so we
      // bail instead of lossily moving. Resolve source before splicing.
      if (overData.origin === 'tab-drop-target') {
        const targetTabId = overData.tabId as string;
        updateLayout((draft) => {
          const sourceLoc = findSection(draft, sectionData.sectionId);
          if (!sourceLoc) return draft;
          const sourceTab = draft.tabs[sourceLoc.tabIndex];
          if (sourceTab.id === targetTabId) return draft;
          const targetTab = draft.tabs.find((t: BuilderTab) => t.id === targetTabId);
          if (!targetTab) return draft;
          const [movedSection] = sourceTab.sections.splice(sourceLoc.sectionIndex, 1);
          targetTab.sections.push(movedSection);
          return draft;
        });
        return;
      }

      // Dropped on another section — reorder. Only support moves within
      // the same scope (tabs ↔ tabs, leftRail ↔ leftRail, rightRail ↔
      // rightRail). Cross-zone reordering isn't a supported interaction
      // yet, and silently moving the section would surprise users.
      if (overData.origin !== 'canvas-section') return;
      const overSectionData = overData as unknown as CanvasSectionDragData;
      if (sectionData.sectionId === overSectionData.sectionId) return;

      updateLayout((draft) => {
        const source = resolveSectionScope(draft, sectionData.sectionId);
        const target = resolveSectionScope(draft, overSectionData.sectionId);
        if (!source || !target) return draft;
        if (source.zone !== target.zone && source.zone !== 'main') {
          // Rail → main / rail → rail is disallowed; bail to avoid loss.
          return draft;
        }
        if (source.zone === 'main' && target.zone !== 'main') {
          return draft;
        }
        const [moved] = source.sections.splice(source.index, 1);
        // Recompute target index — the source splice may have shifted it
        // when source and target live in the same array.
        const targetIdx = target.sections.findIndex(
          (s: BuilderSection) => s.id === overSectionData.sectionId,
        );
        if (targetIdx < 0) {
          // Target disappeared (shouldn't happen): put the section back.
          source.sections.splice(source.index, 0, moved);
          return draft;
        }
        target.sections.splice(targetIdx, 0, moved);
        return draft;
      });
    }
  }, [layout, updateLayout, registry, onRejectZoneDrop]);

  return {
    activeDragId,
    handleDragStart,
    handleDragEnd,
  };
}
