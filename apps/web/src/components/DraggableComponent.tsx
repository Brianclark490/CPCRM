import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { BuilderComponent, FieldRef, ComponentDefinition } from './builderTypes.js';
import { resolveIcon } from './iconMap.js';
import styles from './DraggableComponent.module.css';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DraggableComponentProps {
  component: BuilderComponent;
  sectionId: string;
  fields: FieldRef[];
  registry: ComponentDefinition[];
  isSelected: boolean;
  onSelect: () => void;
  onRemove: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getComponentLabel(
  component: BuilderComponent,
  fields: FieldRef[],
  registry: ComponentDefinition[],
): string {
  if (component.type === 'field') {
    const field = fields.find((f) => f.apiName === component.config.fieldApiName);
    return field ? field.label : String(component.config.fieldApiName ?? 'Unknown field');
  }

  const def = registry.find((r) => r.type === component.type);
  return def?.label ?? component.type;
}

function getComponentIcon(
  component: BuilderComponent,
  registry: ComponentDefinition[],
): string {
  const def = registry.find((r) => r.type === component.type);
  return resolveIcon(def?.icon ?? '');
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DraggableComponent({
  component,
  sectionId,
  fields,
  registry,
  isSelected,
  onSelect,
  onRemove,
}: DraggableComponentProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: component.id,
    data: {
      origin: 'canvas',
      sectionId,
      componentId: component.id,
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const label = getComponentLabel(component, fields, registry);
  const icon = getComponentIcon(component, registry);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${styles.component} ${isSelected ? styles.selected : ''}`}
      data-testid={`canvas-component-${component.id}`}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      <div className={styles.dragHandle} {...attributes} {...listeners}>
        <span className={styles.gripIcon} aria-hidden="true">⠿</span>
      </div>
      <span className={styles.icon} aria-hidden="true">{icon}</span>
      <span className={styles.label}>{label}</span>
      <span className={styles.typeBadge}>{component.type}</span>
      <button
        type="button"
        className={styles.removeBtn}
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        aria-label={`Remove ${label}`}
      >
        ×
      </button>
    </div>
  );
}
