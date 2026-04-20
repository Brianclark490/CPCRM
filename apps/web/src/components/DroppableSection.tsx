import { useDroppable } from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type {
  BuilderSection,
  BuilderComponent,
  FieldRef,
  RelationshipRef,
  ComponentDefinition,
} from './builderTypes.js';
import { DraggableComponent } from './DraggableComponent.js';
import styles from './DroppableSection.module.css';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DroppableSectionProps {
  section: BuilderSection;
  fields: FieldRef[];
  relationships: RelationshipRef[];
  registry: ComponentDefinition[];
  selectedId: string | null;
  onSelectComponent: (componentId: string) => void;
  onSelectSection: (sectionId: string) => void;
  onRemoveComponent: (sectionId: string, componentId: string) => void;
  onRemoveSection: (sectionId: string) => void;
  onRenameSection: (sectionId: string, label: string) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DroppableSection({
  section,
  fields,
  relationships,
  registry,
  selectedId,
  onSelectComponent,
  onSelectSection,
  onRemoveComponent,
  onRemoveSection,
  onRenameSection,
}: DroppableSectionProps) {
  const {
    attributes,
    listeners,
    setNodeRef: setSortableRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `section-${section.id}`,
    data: {
      origin: 'canvas-section',
      sectionId: section.id,
    },
  });

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `droppable-${section.id}`,
    data: { sectionId: section.id },
  });

  const sortableStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const isSectionSelected = selectedId === section.id;
  const componentIds = section.components.map((c) => c.id);

  return (
    <div
      ref={setSortableRef}
      style={sortableStyle}
      className={`${styles.section} ${isSectionSelected ? styles.selected : ''}`}
      data-testid={`builder-section-${section.id}`}
      onClick={(e) => {
        e.stopPropagation();
        onSelectSection(section.id);
      }}
    >
      <div className={styles.sectionHeader}>
        <div className={styles.dragHandle} {...attributes} {...listeners}>
          <span className={styles.gripIcon} aria-hidden="true">⠿</span>
        </div>
        <input
          className={styles.sectionLabel}
          type="text"
          value={section.label}
          onChange={(e) => onRenameSection(section.id, e.target.value)}
          onClick={(e) => e.stopPropagation()}
          aria-label="Section label"
        />
        <span className={styles.colBadge}>{section.columns}-col</span>
        <button
          type="button"
          className={styles.removeBtn}
          onClick={(e) => {
            e.stopPropagation();
            onRemoveSection(section.id);
          }}
          aria-label={`Remove section ${section.label}`}
        >
          ×
        </button>
      </div>

      <div
        ref={setDropRef}
        className={`${styles.dropZone} ${section.columns === 2 ? styles.dropZoneTwoCol : ''} ${isOver ? styles.dropZoneOver : ''}`}
      >
        <SortableContext items={componentIds} strategy={verticalListSortingStrategy}>
          {section.components.map((comp: BuilderComponent) => (
            <DraggableComponent
              key={comp.id}
              component={comp}
              sectionId={section.id}
              fields={fields}
              relationships={relationships}
              registry={registry}
              isSelected={selectedId === comp.id}
              onSelect={() => onSelectComponent(comp.id)}
              onRemove={() => onRemoveComponent(section.id, comp.id)}
            />
          ))}
        </SortableContext>

        {section.components.length === 0 && (
          <div className={styles.emptyState}>
            Drop components here
          </div>
        )}
      </div>
    </div>
  );
}
