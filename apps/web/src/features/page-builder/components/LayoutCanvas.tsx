import {
  DndContext,
  DragOverlay,
  closestCorners,
} from '@dnd-kit/core';
import type { DragStartEvent, DragEndEvent, SensorDescriptor, SensorOptions } from '@dnd-kit/core';
import { ComponentPalette } from '../../../components/ComponentPalette.js';
import { BuilderCanvas } from '../../../components/BuilderCanvas.js';
import { PropertiesPanel } from '../../../components/PropertiesPanel.js';
import type { SelectedItem } from '../../../components/PropertiesPanel.js';
import type {
  ComponentDefinition,
  FieldRef,
  RelationshipRef,
  RelatedFieldRef,
  BuilderLayout,
} from '../../../components/builderTypes.js';
import type { HeaderConfig, VisibilityRule } from '../../../components/layoutTypes.js';
import styles from '../PageBuilderPage.module.css';

interface LayoutCanvasProps {
  layout: BuilderLayout;
  fields: FieldRef[];
  relationships: RelationshipRef[];
  relatedFields: RelatedFieldRef[];
  registry: ComponentDefinition[];
  selectedId: string | null;
  selectedItem: SelectedItem | null;
  activeDragId: string | null;
  sensors: SensorDescriptor<SensorOptions>[];
  onSelect: (id: string | null) => void;
  onHeaderChange: (header: HeaderConfig) => void;
  onAddTab: () => void;
  onRenameTab: (tabId: string, label: string) => void;
  onRemoveTab: (tabId: string) => void;
  onAddSection: (tabId: string, columns: number) => void;
  onRemoveSection: (sectionId: string) => void;
  onRenameSection: (sectionId: string, label: string) => void;
  onRemoveComponent: (sectionId: string, componentId: string) => void;
  onSelectComponent: (componentId: string) => void;
  onSelectSection: (sectionId: string) => void;
  onComponentChange: (sectionId: string, componentId: string, config: Record<string, unknown>) => void;
  onComponentVisibilityChange: (sectionId: string, componentId: string, rule: VisibilityRule | null) => void;
  onSectionChange: (sectionId: string, patch: { label?: string; columns?: number }) => void;
  onSectionVisibilityChange: (sectionId: string, rule: VisibilityRule | null) => void;
  onDragStart: (event: DragStartEvent) => void;
  onDragEnd: (event: DragEndEvent) => void;
}

export function LayoutCanvas({
  layout,
  fields,
  relationships,
  relatedFields,
  registry,
  selectedId,
  selectedItem,
  activeDragId,
  sensors,
  onSelect,
  onHeaderChange,
  onAddTab,
  onRenameTab,
  onRemoveTab,
  onAddSection,
  onRemoveSection,
  onRenameSection,
  onRemoveComponent,
  onSelectComponent,
  onSelectSection,
  onComponentChange,
  onComponentVisibilityChange,
  onSectionChange,
  onSectionVisibilityChange,
  onDragStart,
  onDragEnd,
}: LayoutCanvasProps) {
  return (
    <div className={styles.builderBody}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
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
          relationships={relationships}
          registry={registry}
          selectedId={selectedId}
          onSelect={onSelect}
          onHeaderChange={onHeaderChange}
          onAddTab={onAddTab}
          onRenameTab={onRenameTab}
          onRemoveTab={onRemoveTab}
          onAddSection={onAddSection}
          onRemoveSection={onRemoveSection}
          onRenameSection={onRenameSection}
          onRemoveComponent={onRemoveComponent}
          onSelectComponent={onSelectComponent}
          onSelectSection={onSelectSection}
        />

        <DragOverlay>
          {activeDragId ? (
            <div className={styles.dragOverlay}>Dragging&hellip;</div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <PropertiesPanel
        selectedItem={selectedItem}
        registry={registry}
        fields={fields}
        onComponentChange={onComponentChange}
        onComponentVisibilityChange={onComponentVisibilityChange}
        onSectionChange={onSectionChange}
        onSectionVisibilityChange={onSectionVisibilityChange}
      />
    </div>
  );
}
