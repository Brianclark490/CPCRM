import {
  DndContext,
  DragOverlay,
  closestCorners,
  pointerWithin,
} from '@dnd-kit/core';
import type {
  CollisionDetection,
  DragStartEvent,
  DragEndEvent,
  SensorDescriptor,
  SensorOptions,
} from '@dnd-kit/core';
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
  LayoutZone,
} from '../../../components/builderTypes.js';
import type { HeaderConfig, VisibilityRule } from '../../../components/layoutTypes.js';
import styles from '../PageBuilderPage.module.css';

// The DragOverlay is wider than the "+ N-column section" buttons, so
// `closestCorners` often ranks an adjacent section ahead of the button
// the pointer is actually over. Short-circuit to the new-section
// droppable whenever the pointer is within one; fall back to
// `closestCorners` for every other case so existing-section drops and
// sortable reordering keep their original behaviour.
const collisionDetection: CollisionDetection = (args) => {
  for (const collision of pointerWithin(args)) {
    const container = args.droppableContainers.find((c) => c.id === collision.id);
    if (container?.data.current?.origin === 'new-section') {
      return [collision];
    }
  }
  return closestCorners(args);
};

interface LayoutCanvasProps {
  layout: BuilderLayout;
  fields: FieldRef[];
  relationships: RelationshipRef[];
  relatedFields: RelatedFieldRef[];
  registry: ComponentDefinition[];
  selectedId: string | null;
  selectedItem: SelectedItem | null;
  activeDragId: string | null;
  activeZone: LayoutZone;
  sensors: SensorDescriptor<SensorOptions>[];
  onSelect: (id: string | null) => void;
  onSelectZone: (zone: LayoutZone) => void;
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
  activeZone,
  sensors,
  onSelect,
  onSelectZone,
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
        collisionDetection={collisionDetection}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <ComponentPalette
          registry={registry}
          fields={fields}
          relationships={relationships}
          relatedFields={relatedFields}
          tabs={layout.tabs}
          zones={layout.zones}
          activeZone={activeZone}
        />

        <BuilderCanvas
          layout={layout}
          fields={fields}
          relationships={relationships}
          registry={registry}
          selectedId={selectedId}
          activeZone={activeZone}
          onSelect={onSelect}
          onSelectZone={onSelectZone}
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
