import { PrimaryButton } from '../../../components/PrimaryButton.js';
import type { RelationshipDefinition, ObjectDefinitionListItem } from '../types.js';
import { PlusIcon, TrashIcon, LockIcon } from './Icons.js';
import styles from '../FieldBuilderPage.module.css';

interface RelationshipListProps {
  objectId: string;
  relationships: RelationshipDefinition[];
  allObjects: ObjectDefinitionListItem[];
  relationshipsLoading: boolean;
  relationshipsError: string | null;
  onAddRelationship: () => void;
  onDeleteRelationship: (rel: RelationshipDefinition) => void;
}

function isSystemRelationship(
  rel: RelationshipDefinition,
  allObjects: ObjectDefinitionListItem[],
): boolean {
  const sourceObj = allObjects.find((o) => o.id === rel.sourceObjectId);
  const targetObj = allObjects.find((o) => o.id === rel.targetObjectId);
  return (sourceObj?.isSystem ?? false) && (targetObj?.isSystem ?? false);
}

function getRelatedObjectLabel(rel: RelationshipDefinition, objectId: string): string {
  if (rel.sourceObjectId === objectId) {
    return rel.targetObjectLabel;
  }
  return rel.sourceObjectLabel;
}

function getReverseContext(rel: RelationshipDefinition, objectId: string): string | null {
  if (!rel.reverseLabel) return null;
  if (rel.sourceObjectId === objectId) {
    return `Shows as '${rel.reverseLabel}' on the ${rel.targetObjectLabel} page`;
  }
  return `Shows as '${rel.reverseLabel}' on the ${rel.sourceObjectLabel} page`;
}

export function RelationshipList({
  objectId,
  relationships,
  allObjects,
  relationshipsLoading,
  relationshipsError,
  onAddRelationship,
  onDeleteRelationship,
}: RelationshipListProps) {
  return (
    <>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>
          Relationships
          <span className={styles.fieldCount}>({relationships.length})</span>
        </h2>
        <PrimaryButton size="sm" onClick={onAddRelationship}>
          <PlusIcon />
          Add relationship
        </PrimaryButton>
      </div>

      {relationshipsError && (
        <p role="alert" className={styles.errorAlert}>
          {relationshipsError}
        </p>
      )}

      {relationshipsLoading && <div className={styles.page}>Loading…</div>}

      {!relationshipsLoading && !relationshipsError && relationships.length === 0 && (
        <div className={styles.emptyState}>
          <h3 className={styles.emptyTitle}>No relationships yet</h3>
          <p className={styles.emptyText}>
            Add a relationship to connect this object to other objects.
          </p>
        </div>
      )}

      {!relationshipsLoading && relationships.length > 0 && (
        <div className={styles.tableCard}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Label</th>
                <th className={styles.th}>Related Object</th>
                <th className={styles.th}>Type</th>
                <th className={styles.th}>Required</th>
                <th className={styles.th}>Status</th>
                <th className={`${styles.th} ${styles.thActions}`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {relationships.map((rel) => {
                const system = isSystemRelationship(rel, allObjects);
                const reverseContext = getReverseContext(rel, objectId);
                return (
                  <tr key={rel.id} className={styles.tr}>
                    <td className={styles.td}>
                      <span className={styles.fieldLabel}>{rel.label}</span>
                      {reverseContext && (
                        <span className={styles.reverseContext}>{reverseContext}</span>
                      )}
                    </td>
                    <td className={styles.td}>{getRelatedObjectLabel(rel, objectId)}</td>
                    <td className={styles.td}>
                      <span className={styles.typeBadge}>
                        {rel.relationshipType === 'parent_child' ? 'Parent–Child' : 'Lookup'}
                      </span>
                    </td>
                    <td className={styles.td}>
                      {rel.required && (
                        <span className={styles.requiredBadge}>Required</span>
                      )}
                    </td>
                    <td className={styles.td}>
                      {system && (
                        <span className={styles.systemBadge}>
                          <LockIcon />
                          System
                        </span>
                      )}
                    </td>
                    <td className={styles.td}>
                      {!system && (
                        <button
                          type="button"
                          className={styles.deleteButton}
                          aria-label={`Delete ${rel.label}`}
                          onClick={() => onDeleteRelationship(rel)}
                        >
                          <TrashIcon />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
