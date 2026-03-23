import type { ComponentRendererProps } from './LayoutComponent.js';
import { FieldRenderer } from './FieldRenderer.js';
import styles from './LayoutFieldRenderer.module.css';

/**
 * Renders a single field within a page layout.
 * Looks up the field definition by api_name and delegates to FieldRenderer.
 */
export function LayoutFieldRenderer({
  component,
  record,
  fields,
}: ComponentRendererProps) {
  const fieldApiName = component.config.fieldApiName;
  if (!fieldApiName) return null;

  const field = fields.find((f) => f.apiName === fieldApiName);
  if (!field) return null;

  const value = record.fieldValues[fieldApiName] ?? null;
  const isEmpty = value === null || value === undefined || value === '';

  return (
    <div className={styles.fieldGroup}>
      <span className={styles.fieldLabel}>{field.label}</span>
      {isEmpty ? (
        <span className={styles.fieldEmpty}>—</span>
      ) : (
        <span className={styles.fieldValue}>
          <FieldRenderer fieldType={field.fieldType} value={value} />
        </span>
      )}
    </div>
  );
}
