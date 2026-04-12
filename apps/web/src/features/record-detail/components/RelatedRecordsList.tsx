import { useState } from 'react';
import { Link } from 'react-router-dom';
import { InlineRecordForm } from '../../../components/InlineRecordForm.js';
import type { RecordDetail } from '../types.js';
import styles from '../RecordDetailPage.module.css';

interface RelatedRecordsListProps {
  record: RecordDetail;
  onRecordCreated: () => void;
}

export function RelatedRecordsList({
  record,
  onRecordCreated,
}: RelatedRecordsListProps) {
  const [inlineFormRelId, setInlineFormRelId] = useState<string | null>(null);

  return (
    <>
      {record.relationships.map((rel) => (
        <div key={rel.relationshipId} className={styles.relatedCard}>
          <div className={styles.relatedHeader}>
            <span className={styles.relatedTitle}>{rel.label}</span>
            <button
              className={styles.btnNew}
              type="button"
              onClick={() =>
                setInlineFormRelId(
                  inlineFormRelId === rel.relationshipId
                    ? null
                    : rel.relationshipId,
                )
              }
              data-testid={`new-related-${rel.relatedObjectApiName}`}
            >
              + New
            </button>
          </div>

          {inlineFormRelId === rel.relationshipId && (
            <InlineRecordForm
              relatedObjectApiName={rel.relatedObjectApiName}
              relatedObjectLabel={rel.label}
              parentRecordId={record.id}
              parentRecordName={record.name}
              relationshipId={rel.relationshipId}
              parentDirection={rel.direction}
              onCreated={() => {
                setInlineFormRelId(null);
                onRecordCreated();
              }}
              onCancel={() => setInlineFormRelId(null)}
            />
          )}

          {rel.records.length === 0 && inlineFormRelId !== rel.relationshipId ? (
            <div className={styles.relatedEmpty}>
              No related records
            </div>
          ) : rel.records.length > 0 ? (
            <table className={styles.relatedTable}>
              <thead>
                <tr>
                  <th className={styles.relatedTh}>Name</th>
                </tr>
              </thead>
              <tbody>
                {rel.records.map((relRecord) => (
                  <tr key={relRecord.id} className={styles.relatedTr}>
                    <td className={styles.relatedTd}>
                      <Link
                        to={`/objects/${rel.relatedObjectApiName}/${relRecord.id}`}
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
      ))}
    </>
  );
}
