import { PrimaryButton } from '../../../components/PrimaryButton.js';
import type { FieldDefinition } from '../types.js';
import { PlusIcon, TrashIcon, LockIcon, EditIcon, ChevronUpIcon, ChevronDownIcon } from './Icons.js';
import styles from '../FieldBuilderPage.module.css';

interface FieldListProps {
  fields: FieldDefinition[];
  reordering: boolean;
  onAddField: () => void;
  onEditField: (field: FieldDefinition) => void;
  onDeleteField: (field: FieldDefinition) => void;
  onMoveField: (index: number, direction: 'up' | 'down') => void;
}

export function FieldList({
  fields,
  reordering,
  onAddField,
  onEditField,
  onDeleteField,
  onMoveField,
}: FieldListProps) {
  return (
    <>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>
          Fields
          <span className={styles.fieldCount}>({fields.length})</span>
        </h2>
        <PrimaryButton size="sm" onClick={onAddField}>
          <PlusIcon />
          Add field
        </PrimaryButton>
      </div>

      {fields.length === 0 && (
        <div className={styles.emptyState}>
          <h3 className={styles.emptyTitle}>No fields yet</h3>
          <p className={styles.emptyText}>
            Add your first field to define the data structure for this object.
          </p>
        </div>
      )}

      {fields.length > 0 && (
        <div className={styles.tableCard}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Label</th>
                <th className={styles.th}>API Name</th>
                <th className={styles.th}>Type</th>
                <th className={styles.th}>Required</th>
                <th className={styles.th}>Status</th>
                <th className={`${styles.th} ${styles.thActions}`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {fields.map((field, index) => (
                <tr
                  key={field.id}
                  className={styles.tr}
                  onClick={() => {
                    onEditField(field);
                  }}
                >
                  <td className={styles.td}>
                    <span className={styles.fieldLabel}>{field.label}</span>
                  </td>
                  <td className={styles.td}>
                    <code className={styles.apiName}>{field.apiName}</code>
                  </td>
                  <td className={styles.td}>
                    <span className={styles.typeBadge}>{field.fieldType}</span>
                  </td>
                  <td className={styles.td}>
                    {field.required && (
                      <span className={styles.requiredBadge}>Required</span>
                    )}
                  </td>
                  <td className={styles.td}>
                    {field.isSystem && (
                      <span className={styles.systemBadge}>
                        <LockIcon />
                        System
                      </span>
                    )}
                  </td>
                  <td className={styles.td} onClick={(e) => e.stopPropagation()}>
                    <div className={styles.actionCell}>
                      <div className={styles.reorderButtons}>
                        <button
                          type="button"
                          className={styles.reorderButton}
                          aria-label={`Move ${field.label} up`}
                          disabled={index === 0 || reordering}
                          onClick={() => void onMoveField(index, 'up')}
                        >
                          <ChevronUpIcon />
                        </button>
                        <button
                          type="button"
                          className={styles.reorderButton}
                          aria-label={`Move ${field.label} down`}
                          disabled={index === fields.length - 1 || reordering}
                          onClick={() => void onMoveField(index, 'down')}
                        >
                          <ChevronDownIcon />
                        </button>
                      </div>
                      {field.isSystem && (
                        <button
                          type="button"
                          className={styles.editButton}
                          aria-label={`Edit ${field.label}`}
                          onClick={() => onEditField(field)}
                        >
                          <EditIcon />
                        </button>
                      )}
                      {!field.isSystem && (
                        <button
                          type="button"
                          className={styles.deleteButton}
                          aria-label={`Delete ${field.label}`}
                          onClick={() => onDeleteField(field)}
                        >
                          <TrashIcon />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
