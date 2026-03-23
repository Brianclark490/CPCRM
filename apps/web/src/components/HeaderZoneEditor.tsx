import type { HeaderConfig } from './layoutTypes.js';
import type { FieldRef } from './builderTypes.js';
import styles from './HeaderZoneEditor.module.css';

// ─── Types ────────────────────────────────────────────────────────────────────

interface HeaderZoneEditorProps {
  header: HeaderConfig;
  fields: FieldRef[];
  onChange: (header: HeaderConfig) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function HeaderZoneEditor({ header, fields, onChange }: HeaderZoneEditorProps) {
  const handlePrimaryChange = (value: string) => {
    onChange({ ...header, primaryField: value });
  };

  const handleToggleSecondary = (apiName: string) => {
    const current = header.secondaryFields ?? [];
    const next = current.includes(apiName)
      ? current.filter((f) => f !== apiName)
      : [...current, apiName];
    onChange({ ...header, secondaryFields: next });
  };

  return (
    <div className={styles.headerZone} data-testid="header-zone-editor">
      <h4 className={styles.title}>Header</h4>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="header-primary-field">
          Primary field
        </label>
        <select
          id="header-primary-field"
          className={styles.select}
          value={header.primaryField}
          onChange={(e) => handlePrimaryChange(e.target.value)}
        >
          <option value="">Select…</option>
          {fields.map((f) => (
            <option key={f.apiName} value={f.apiName}>
              {f.label}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Secondary fields</label>
        <div className={styles.checkboxList}>
          {fields.map((f) => (
            <label key={f.apiName} className={styles.checkboxItem}>
              <input
                type="checkbox"
                checked={(header.secondaryFields ?? []).includes(f.apiName)}
                onChange={() => handleToggleSecondary(f.apiName)}
              />
              <span>{f.label}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
