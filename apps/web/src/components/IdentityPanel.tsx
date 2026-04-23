import type { ComponentRendererProps } from './layoutTypes.js';
import { FieldRenderer } from './FieldRenderer.js';
import styles from './IdentityPanel.module.css';

/**
 * Compact vertical list of field name/value pairs.
 * Intended for the side rails (leftRail / rightRail) in the zoned record detail shell.
 * Config: { fields: string[] } — array of field api_names to display.
 */
export function IdentityPanel({ component, record, fields }: ComponentRendererProps) {
  const rawFields = component.config.fields;
  const fieldNames = Array.isArray(rawFields)
    ? (rawFields.filter((n) => typeof n === 'string') as string[])
    : [];

  if (fieldNames.length === 0) {
    return (
      <div className={styles.empty} data-testid="identity-panel-empty">
        No fields configured
      </div>
    );
  }

  const rows = fieldNames
    .map((apiName) => {
      const def = fields.find((f) => f.apiName === apiName);
      if (!def) return null;
      const value = record.fieldValues[apiName] ?? null;
      const isEmpty = value === null || value === undefined || value === '';
      return { apiName, def, value, isEmpty };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  return (
    <dl className={styles.list} data-testid="identity-panel">
      {rows.map(({ apiName, def, value, isEmpty }) => (
        <div key={apiName} className={styles.row}>
          <dt className={styles.label}>{def.label}</dt>
          <dd className={styles.value}>
            {isEmpty ? (
              <span className={styles.empty}>—</span>
            ) : (
              <FieldRenderer fieldType={def.fieldType} value={value} />
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
