import { useState } from 'react';
import type {
  LayoutSectionDef,
  RecordData,
  FieldDefinitionRef,
  ObjectDefinitionRef,
} from './layoutTypes.js';
import { evaluateVisibility } from './evaluateVisibility.js';
import { LayoutComponent } from './LayoutComponent.js';
import styles from './LayoutSection.module.css';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LayoutSectionProps {
  section: LayoutSectionDef;
  record: RecordData;
  fields: FieldDefinitionRef[];
  objectDef: ObjectDefinitionRef | null;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Renders a collapsible section within a layout tab.
 * Sections are hidden when their visibility rule evaluates to false.
 */
export function LayoutSection({
  section,
  record,
  fields,
  objectDef,
}: LayoutSectionProps) {
  const [collapsed, setCollapsed] = useState(section.collapsed ?? false);

  if (!evaluateVisibility(section.visibility, record.fieldValues)) {
    return null;
  }

  return (
    <div className={styles.section} data-testid={`layout-section-${section.id}`}>
      <button
        className={styles.sectionHeader}
        onClick={() => setCollapsed(!collapsed)}
        type="button"
        aria-expanded={!collapsed}
      >
        <span className={styles.sectionLabel}>{section.label}</span>
        <span className={styles.chevron} aria-hidden="true">
          {collapsed ? '▸' : '▾'}
        </span>
      </button>

      {!collapsed && (
        <div
          className={`${styles.sectionGrid} ${styles[`cols${section.columns}`] ?? styles.cols2}`}
        >
          {section.components.map((comp) => (
            <div
              key={comp.id}
              className={`${styles.gridItem} ${(comp.config?.span ?? 1) >= section.columns ? styles.spanFull : ''}`}
            >
              <LayoutComponent
                component={comp}
                record={record}
                fields={fields}
                objectDef={objectDef}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
