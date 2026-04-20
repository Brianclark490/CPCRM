import { useState, useCallback } from 'react';
import type { DragStartEvent, DragEndEvent } from '@dnd-kit/core';
import type {
  BuilderLayout,
  BuilderComponent,
  BuilderSection,
  BuilderTab,
  PaletteDragData,
  CanvasComponentDragData,
  CanvasSectionDragData,
} from '../../../components/builderTypes.js';
import { uid, findSection } from '../helpers.js';

interface UsePageLayoutDndOptions {
  layout: BuilderLayout | null;
  updateLayout: (mutator: (draft: BuilderLayout) => BuilderLayout) => void;
}

export function usePageLayoutDnd({ layout, updateLayout }: UsePageLayoutDndOptions) {
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

      // Palette → new-section drop: create a section and place the component in it.
      if (overData && overData.origin === 'new-section') {
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

      let targetSectionId: string | null = null;
      let targetComponentId: string | null = null;

      if (overData && 'sectionId' in overData && 'componentId' in overData) {
        targetSectionId = overData.sectionId as string;
        targetComponentId = overData.componentId as string;
      } else if (overData && 'sectionId' in overData) {
        targetSectionId = overData.sectionId as string;
      }

      if (!targetSectionId) return;

      updateLayout((draft) => {
        const sourceLoc = findSection(draft, canvasData.sectionId);
        if (!sourceLoc) return draft;

        const sourceSection = draft.tabs[sourceLoc.tabIndex].sections[sourceLoc.sectionIndex];
        const compIdx = sourceSection.components.findIndex(
          (c: BuilderComponent) => c.id === canvasData.componentId,
        );
        if (compIdx < 0) return draft;

        const [movedComp] = sourceSection.components.splice(compIdx, 1);

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
          let movedSection: BuilderSection | null = null;
          for (const tab of draft.tabs) {
            const idx = tab.sections.findIndex(
              (s: BuilderSection) => s.id === sectionData.sectionId,
            );
            if (idx >= 0) {
              if (tab.id === targetTabId) return draft;
              [movedSection] = tab.sections.splice(idx, 1);
              break;
            }
          }
          if (!movedSection) return draft;

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
  }, [layout, updateLayout]);

  return {
    activeDragId,
    handleDragStart,
    handleDragEnd,
  };
}
