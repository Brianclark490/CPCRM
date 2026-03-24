import { useDraggable } from '@dnd-kit/core';
import type {
  ComponentDefinition,
  ComponentCategory,
  FieldRef,
  RelationshipRef,
  PaletteDragData,
  BuilderTab,
} from './builderTypes.js';
import styles from './ComponentPalette.module.css';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ComponentPaletteProps {
  registry: ComponentDefinition[];
  fields: FieldRef[];
  relationships: RelationshipRef[];
  tabs: BuilderTab[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<ComponentCategory, string> = {
  fields: 'Fields',
  related: 'Related Data',
  widgets: 'Widgets',
  layout: 'Layout',
};

const CATEGORY_ORDER: ComponentCategory[] = ['fields', 'related', 'widgets', 'layout'];

function getPlacedFieldIds(tabs: BuilderTab[]): Set<string> {
  const ids = new Set<string>();
  for (const tab of tabs) {
    for (const section of tab.sections) {
      for (const comp of section.components) {
        if (comp.type === 'field' && comp.config.fieldApiName) {
          ids.add(String(comp.config.fieldApiName));
        }
      }
    }
  }
  return ids;
}

function getPlacedRelationshipIds(tabs: BuilderTab[]): Set<string> {
  const ids = new Set<string>();
  for (const tab of tabs) {
    for (const section of tab.sections) {
      for (const comp of section.components) {
        if (comp.type === 'related_list' && comp.config.relationshipId) {
          ids.add(String(comp.config.relationshipId));
        }
      }
    }
  }
  return ids;
}

// ─── Palette item (draggable) ─────────────────────────────────────────────────

interface PaletteItemProps {
  id: string;
  label: string;
  icon: string;
  dragData: PaletteDragData;
  isPlaced: boolean;
}

function PaletteItem({ id, label, icon, dragData, isPlaced }: PaletteItemProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id,
    data: dragData,
  });

  return (
    <div
      ref={setNodeRef}
      className={`${styles.paletteItem} ${isPlaced ? styles.placed : ''} ${isDragging ? styles.dragging : ''}`}
      data-testid={`palette-item-${id}`}
      {...listeners}
      {...attributes}
    >
      <span className={styles.itemIcon} aria-hidden="true">{icon}</span>
      <span className={styles.itemLabel}>{label}</span>
      {isPlaced && <span className={styles.placedBadge}>✓</span>}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ComponentPalette({
  registry,
  fields,
  relationships,
  tabs,
}: ComponentPaletteProps) {
  const placedFields = getPlacedFieldIds(tabs);
  const placedRelationships = getPlacedRelationshipIds(tabs);

  const grouped = CATEGORY_ORDER
    .map((cat) => ({
      category: cat,
      items: registry.filter((r) => r.category === cat),
    }))
    .filter((g) => g.items.length > 0);

  return (
    <div className={styles.palette} data-testid="component-palette">
      <h3 className={styles.paletteTitle}>Components</h3>

      {/* Field instances */}
      {fields.length > 0 && (
        <div className={styles.group}>
          <h4 className={styles.groupLabel}>Fields</h4>
          {fields.map((field) => (
            <PaletteItem
              key={`field-${field.id}`}
              id={`palette-field-${field.id}`}
              label={field.label}
              icon="📝"
              isPlaced={placedFields.has(field.apiName)}
              dragData={{
                origin: 'palette',
                componentType: 'field',
                defaultConfig: { fieldApiName: field.apiName, span: 1, readOnly: false },
              }}
            />
          ))}
        </div>
      )}

      {/* Relationship instances */}
      {relationships.length > 0 && (
        <div className={styles.group}>
          <h4 className={styles.groupLabel}>Related Lists</h4>
          {relationships.map((rel) => (
            <PaletteItem
              key={`rel-${rel.id}`}
              id={`palette-rel-${rel.id}`}
              label={rel.targetObjectLabel}
              icon="📋"
              isPlaced={placedRelationships.has(rel.id)}
              dragData={{
                origin: 'palette',
                componentType: 'related_list',
                defaultConfig: {
                  relationshipId: rel.id,
                  displayFields: [],
                  limit: 5,
                  allowCreate: true,
                },
              }}
            />
          ))}
        </div>
      )}

      {/* Registry-based components (widgets, layout, etc.) */}
      {grouped
        .filter((g) => g.category !== 'fields' && g.category !== 'related')
        .map((group) => (
          <div key={group.category} className={styles.group}>
            <h4 className={styles.groupLabel}>
              {CATEGORY_LABELS[group.category]}
            </h4>
            {group.items.map((def) => (
              <PaletteItem
                key={`widget-${def.type}`}
                id={`palette-widget-${def.type}`}
                label={def.label}
                icon={def.icon}
                isPlaced={false}
                dragData={{
                  origin: 'palette',
                  componentType: def.type,
                  defaultConfig: { ...def.defaultConfig },
                }}
              />
            ))}
          </div>
        ))}
    </div>
  );
}
