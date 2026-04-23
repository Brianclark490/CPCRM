import type {
  BuilderComponent,
  BuilderSection,
  FieldRef,
  ComponentDefinition,
  ConfigSchemaEntry,
} from './builderTypes.js';
import { VisibilityRuleEditor } from './VisibilityRuleEditor.js';
import type { VisibilityRule } from './layoutTypes.js';
import styles from './PropertiesPanel.module.css';

// ─── Types ────────────────────────────────────────────────────────────────────

type SelectedItem =
  | { kind: 'component'; component: BuilderComponent; sectionId: string }
  | { kind: 'section'; section: BuilderSection };

interface PropertiesPanelProps {
  selectedItem: SelectedItem | null;
  registry: ComponentDefinition[];
  fields: FieldRef[];
  onComponentChange: (sectionId: string, componentId: string, config: Record<string, unknown>) => void;
  onComponentVisibilityChange: (sectionId: string, componentId: string, rule: VisibilityRule | null) => void;
  onSectionChange: (sectionId: string, patch: { label?: string; columns?: number }) => void;
  onSectionVisibilityChange: (sectionId: string, rule: VisibilityRule | null) => void;
}

// ─── Config field renderer ────────────────────────────────────────────────────

function ConfigField({
  name,
  schema,
  value,
  onChange,
}: {
  name: string;
  schema: ConfigSchemaEntry;
  value: unknown;
  onChange: (name: string, value: unknown) => void;
}) {
  const { type, description } = schema;

  if (type === 'boolean') {
    return (
      <div className={styles.field}>
        <label className={styles.fieldLabel}>
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(name, e.target.checked)}
          />
          <span>{name}</span>
        </label>
        {description && <span className={styles.hint}>{description}</span>}
      </div>
    );
  }

  if (type === 'number') {
    return (
      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor={`prop-${name}`}>
          {name}
        </label>
        <input
          id={`prop-${name}`}
          type="number"
          className={styles.input}
          value={value !== undefined && value !== null ? String(value) : ''}
          onChange={(e) => onChange(name, e.target.value === '' ? undefined : Number(e.target.value))}
        />
        {description && <span className={styles.hint}>{description}</span>}
      </div>
    );
  }

  if (type === 'array') {
    const arr = Array.isArray(value) ? (value as string[]) : [];
    return (
      <div className={styles.field}>
        <label className={styles.fieldLabel}>{name}</label>
        <textarea
          className={styles.textarea}
          value={arr.join('\n')}
          onChange={(e) =>
            onChange(
              name,
              e.target.value
                .split('\n')
                .map((s) => s.trim())
                .filter(Boolean),
            )
          }
          placeholder="One item per line"
          rows={3}
        />
        {description && <span className={styles.hint}>{description}</span>}
      </div>
    );
  }

  // Object-typed fields (e.g. `source`/`target` on metric cards) need a
  // structured editor. Until one ships, render a read-only JSON preview so
  // the text input fallback doesn't silently overwrite a nested object with
  // a string value.
  if (type === 'object') {
    const json =
      value === undefined || value === null
        ? ''
        : (() => {
            try {
              return JSON.stringify(value, null, 2);
            } catch {
              return String(value);
            }
          })();
    return (
      <div className={styles.field} data-testid={`prop-object-${name}`}>
        <label className={styles.fieldLabel}>{name}</label>
        <textarea
          className={styles.textarea}
          value={json}
          readOnly
          rows={Math.min(6, Math.max(2, json.split('\n').length))}
        />
        <span className={styles.hint}>
          {description
            ? `${description} (read-only — editor coming soon)`
            : 'Read-only — a structured editor for this field is coming soon.'}
        </span>
      </div>
    );
  }

  // Default: string
  return (
    <div className={styles.field}>
      <label className={styles.fieldLabel} htmlFor={`prop-${name}`}>
        {name}
      </label>
      <input
        id={`prop-${name}`}
        type="text"
        className={styles.input}
        value={String(value ?? '')}
        onChange={(e) => onChange(name, e.target.value)}
      />
      {description && <span className={styles.hint}>{description}</span>}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PropertiesPanel({
  selectedItem,
  registry,
  fields,
  onComponentChange,
  onComponentVisibilityChange,
  onSectionChange,
  onSectionVisibilityChange,
}: PropertiesPanelProps) {
  if (!selectedItem) {
    return (
      <div className={styles.panel} data-testid="properties-panel">
        <p className={styles.emptyText}>Select a component or section to edit its properties.</p>
      </div>
    );
  }

  // Section properties
  if (selectedItem.kind === 'section') {
    const { section } = selectedItem;
    return (
      <div className={styles.panel} data-testid="properties-panel">
        <h3 className={styles.panelTitle}>Section Properties</h3>

        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="section-label">
            Label
          </label>
          <input
            id="section-label"
            type="text"
            className={styles.input}
            value={section.label}
            onChange={(e) => onSectionChange(section.id, { label: e.target.value })}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="section-columns">
            Columns
          </label>
          <select
            id="section-columns"
            className={styles.select}
            value={section.columns}
            onChange={(e) => onSectionChange(section.id, { columns: Number(e.target.value) })}
          >
            <option value={1}>1 column</option>
            <option value={2}>2 columns</option>
          </select>
        </div>

        <VisibilityRuleEditor
          rule={section.visibility ?? null}
          fields={fields}
          onChange={(rule) => onSectionVisibilityChange(section.id, rule)}
        />
      </div>
    );
  }

  // Component properties
  const { component, sectionId } = selectedItem;
  const def = registry.find((r) => r.type === component.type);

  return (
    <div className={styles.panel} data-testid="properties-panel">
      <h3 className={styles.panelTitle}>
        {def?.label ?? component.type} Properties
      </h3>

      {def &&
        Object.entries(def.configSchema).map(([key, schema]) => (
          <ConfigField
            key={key}
            name={key}
            schema={schema as ConfigSchemaEntry}
            value={component.config[key]}
            onChange={(name, value) => {
              onComponentChange(sectionId, component.id, {
                ...component.config,
                [name]: value,
              });
            }}
          />
        ))}

      {!def && (
        <p className={styles.emptyText}>
          Unknown component type: {component.type}
        </p>
      )}

      <VisibilityRuleEditor
        rule={component.visibility ?? null}
        fields={fields}
        onChange={(rule) => onComponentVisibilityChange(sectionId, component.id, rule)}
      />
    </div>
  );
}

export type { SelectedItem };
