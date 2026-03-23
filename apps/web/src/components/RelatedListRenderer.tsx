import { Link } from 'react-router-dom';
import type { ComponentRendererProps } from './layoutTypes.js';
import styles from './RelatedListRenderer.module.css';

/**
 * Renders a related records table within a page layout.
 * Looks up the relationship by ID from the record data.
 */
export function RelatedListRenderer({
  component,
  record,
}: ComponentRendererProps) {
  const relationshipId = component.config.relationshipId;
  if (!relationshipId) return null;

  const relationship = record.relationships.find(
    (r) => r.relationshipId === relationshipId,
  );

  if (!relationship) return null;

  return (
    <div className={styles.relatedCard} data-testid={`related-list-${relationshipId}`}>
      <div className={styles.relatedHeader}>
        <span className={styles.relatedTitle}>{relationship.label}</span>
      </div>

      {relationship.records.length === 0 ? (
        <div className={styles.relatedEmpty}>No related records</div>
      ) : (
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
      )}
    </div>
  );
}
