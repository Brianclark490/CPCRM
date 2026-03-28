import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { ComponentRendererProps } from './layoutTypes.js';
import { InlineRecordForm } from './InlineRecordForm.js';
import styles from './RelatedListRenderer.module.css';

/**
 * Renders a related records table within a page layout.
 * Looks up the relationship by ID from the record data.
 * Includes a "+ New" button to create a related record inline.
 */
export function RelatedListRenderer({
  component,
  record,
  onRecordCreated,
  sessionToken,
}: ComponentRendererProps) {
  const [showInlineForm, setShowInlineForm] = useState(false);

  const relationshipId = component.config.relationshipId;
  if (!relationshipId) return null;

  const relationship = record.relationships.find(
    (r) => r.relationshipId === relationshipId,
  );

  if (!relationship) return null;

  const handleCreated = () => {
    setShowInlineForm(false);
    onRecordCreated?.();
  };

  return (
    <div className={styles.relatedCard} data-testid={`related-list-${relationshipId}`}>
      <div className={styles.relatedHeader}>
        <span className={styles.relatedTitle}>{relationship.label}</span>
        {sessionToken && (
          <button
            className={styles.btnNew}
            type="button"
            onClick={() => setShowInlineForm(!showInlineForm)}
            data-testid={`new-related-${relationship.relatedObjectApiName}`}
          >
            + New
          </button>
        )}
      </div>

      {showInlineForm && sessionToken && (
        <InlineRecordForm
          relatedObjectApiName={relationship.relatedObjectApiName}
          relatedObjectLabel={relationship.label}
          parentRecordId={record.id}
          parentRecordName={record.name}
          relationshipId={relationshipId}
          sessionToken={sessionToken}
          onCreated={handleCreated}
          onCancel={() => setShowInlineForm(false)}
        />
      )}

      {relationship.records.length === 0 && !showInlineForm ? (
        <div className={styles.relatedEmpty}>No related records</div>
      ) : relationship.records.length > 0 ? (
        <table className={styles.relatedTable}>
          <thead>
            <tr>
              <th className={styles.relatedTh}>Name</th>
            </tr>
          </thead>
          <tbody>
            {relationship.records.map((relRecord) => (
              <tr key={relRecord.id} className={styles.relatedTr}>
                <td className={styles.relatedTd}>
                  <Link
                    to={`/objects/${relationship.relatedObjectApiName}/${relRecord.id}`}
                    className={styles.relatedLink}
                  >
                    {relRecord.name}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}
