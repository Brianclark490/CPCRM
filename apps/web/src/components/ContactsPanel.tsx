import { Link } from 'react-router-dom';
import type { ComponentRendererProps, RelatedRecordRef } from './layoutTypes.js';
import styles from './ContactsPanel.module.css';

const ROLE_FIELD_CANDIDATES = ['role', 'title', 'contactRole', 'jobTitle'] as const;
const PRIMARY_FIELD_CANDIDATES = ['isPrimary', 'primary', 'is_primary'] as const;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (parts.length === 0) return '?';
  return parts.map((p) => p.charAt(0).toUpperCase()).join('');
}

function pickString(record: RelatedRecordRef, keys: readonly string[]): string | null {
  for (const key of keys) {
    const v = record.fieldValues[key];
    if (typeof v === 'string' && v.trim().length > 0) return v;
  }
  return null;
}

function pickBoolean(record: RelatedRecordRef, keys: readonly string[]): boolean {
  for (const key of keys) {
    const v = record.fieldValues[key];
    if (typeof v === 'boolean') return v;
    if (typeof v === 'string') return v.toLowerCase() === 'true';
  }
  return false;
}

/**
 * Lists related contact records via an existing relationship.
 * Each row: avatar initials · name · optional role · optional "PRIMARY" badge.
 * Intended for side rails; uses the same relationship fetch logic as RelatedListRenderer.
 */
export function ContactsPanel({ component, record }: ComponentRendererProps) {
  const relationshipId =
    typeof component.config.relationshipId === 'string'
      ? component.config.relationshipId
      : null;
  const limitCfg = component.config.limit;
  const limit = typeof limitCfg === 'number' && limitCfg > 0 ? limitCfg : undefined;

  if (!relationshipId) return null;

  const relationship = record.relationships.find(
    (r) => r.relationshipId === relationshipId,
  );
  if (!relationship) return null;

  const allRecords = relationship.records;
  const shown = limit !== undefined ? allRecords.slice(0, limit) : allRecords;

  if (shown.length === 0) {
    return (
      <div className={styles.empty} data-testid={`contacts-panel-empty-${relationshipId}`}>
        No {relationship.label.toLowerCase()}
      </div>
    );
  }

  return (
    <ul className={styles.list} data-testid={`contacts-panel-${relationshipId}`}>
      {shown.map((contact) => {
        const role = pickString(contact, ROLE_FIELD_CANDIDATES);
        const isPrimary = pickBoolean(contact, PRIMARY_FIELD_CANDIDATES);

        return (
          <li key={contact.id} className={styles.item}>
            <span className={styles.avatar} aria-hidden="true">
              {initials(contact.name)}
            </span>
            <div className={styles.content}>
              <Link
                to={`/objects/${relationship.relatedObjectApiName}/${contact.id}`}
                className={styles.name}
              >
                {contact.name}
              </Link>
              {role && <span className={styles.role}>{role}</span>}
            </div>
            {isPrimary && (
              <span className={styles.badge} data-testid="contacts-panel-primary-badge">
                PRIMARY
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
