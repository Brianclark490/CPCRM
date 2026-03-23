import type {
  PageLayout,
  RecordData,
  ObjectDefinitionRef,
  FieldDefinitionRef,
} from './layoutTypes.js';
import { FieldRenderer } from './FieldRenderer.js';
import styles from './RecordHeader.module.css';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RecordHeaderProps {
  layout: PageLayout;
  record: RecordData;
  objectDef: ObjectDefinitionRef | null;
  fields: FieldDefinitionRef[];
  actions?: React.ReactNode;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (parts[0][0] ?? '?').toUpperCase();
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Always-visible record header with primary field, secondary field badges,
 * owner chip, and action buttons.
 */
export function RecordHeader({
  layout,
  record,
  objectDef,
  fields,
  actions,
}: RecordHeaderProps) {
  const { header } = layout;

  const primaryValue =
    record.fieldValues[header.primaryField] ?? record.name;

  const secondaryFields = header.secondaryFields
    .map((apiName) => {
      const field = fields.find((f) => f.apiName === apiName);
      if (!field) return null;
      return { field, value: record.fieldValues[apiName] };
    })
    .filter(
      (item): item is { field: FieldDefinitionRef; value: unknown } =>
        item !== null,
    );

  return (
    <div className={styles.header} data-testid="record-header">
      <div className={styles.headerContent}>
        <div className={styles.headerLeft}>
          {objectDef && (
            <span className={styles.objectLabel}>{objectDef.label}</span>
          )}
          <h1 className={styles.primaryField}>{String(primaryValue)}</h1>

          {secondaryFields.length > 0 && (
            <div className={styles.secondaryFields}>
              {secondaryFields.map(({ field, value }) => (
                <span key={field.apiName} className={styles.secondaryBadge}>
                  <span className={styles.secondaryLabel}>{field.label}</span>
                  <span className={styles.secondaryValue}>
                    <FieldRenderer fieldType={field.fieldType} value={value} />
                  </span>
                </span>
              ))}
            </div>
          )}

          {record.ownerName && (
            <div className={styles.ownerChip}>
              <span className={styles.ownerInitials}>
                {getInitials(record.ownerName)}
              </span>
              <span className={styles.ownerName}>{record.ownerName}</span>
            </div>
          )}
        </div>

        {actions && <div className={styles.headerActions}>{actions}</div>}
      </div>
    </div>
  );
}
