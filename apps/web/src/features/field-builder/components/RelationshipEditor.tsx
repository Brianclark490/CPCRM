import { PrimaryButton } from '../../../components/PrimaryButton.js';
import { RELATIONSHIP_TYPE_OPTIONS } from '../constants.js';
import type { RelationshipForm, ObjectDefinitionListItem } from '../types.js';
import styles from '../FieldBuilderPage.module.css';

interface RelationshipEditorProps {
  objectId: string;
  relForm: RelationshipForm;
  allObjects: ObjectDefinitionListItem[];
  relModalError: string | null;
  relSaving: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  onToggleRequired: () => void;
}

export function RelationshipEditor({
  objectId,
  relForm,
  allObjects,
  relModalError,
  relSaving,
  onClose,
  onSubmit,
  onChange,
  onToggleRequired,
}: RelationshipEditorProps) {
  return (
    <div
      className={styles.overlay}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Add relationship"
    >
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.modalTitle}>Add relationship</h2>

        <form
          className={styles.form}
          noValidate
          onSubmit={(e) => void onSubmit(e)}
        >
          {/* Target object */}
          <div className={styles.field}>
            <label
              className={`${styles.label} ${styles.labelRequired}`}
              htmlFor="rel-targetObjectId"
            >
              Target object
            </label>
            <select
              id="rel-targetObjectId"
              name="targetObjectId"
              className={styles.select}
              value={relForm.targetObjectId}
              onChange={onChange}
              disabled={relSaving}
            >
              <option value="">Select an object…</option>
              {allObjects
                .filter((o) => o.id !== objectId)
                .map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
            </select>
          </div>

          {/* Relationship type */}
          <div className={styles.field}>
            <label
              className={`${styles.label} ${styles.labelRequired}`}
              htmlFor="rel-relationshipType"
            >
              Relationship type
            </label>
            <select
              id="rel-relationshipType"
              name="relationshipType"
              className={styles.select}
              value={relForm.relationshipType}
              onChange={onChange}
              disabled={relSaving}
            >
              {RELATIONSHIP_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Label */}
          <div className={styles.field}>
            <label
              className={`${styles.label} ${styles.labelRequired}`}
              htmlFor="rel-label"
            >
              Label
            </label>
            <input
              id="rel-label"
              name="label"
              type="text"
              className={styles.input}
              value={relForm.label}
              onChange={onChange}
              placeholder="e.g. Account"
              maxLength={255}
              disabled={relSaving}
            />
          </div>

          {/* Reverse label */}
          <div className={styles.field}>
            <label className={styles.label} htmlFor="rel-reverseLabel">
              Reverse label
            </label>
            <input
              id="rel-reverseLabel"
              name="reverseLabel"
              type="text"
              className={styles.input}
              value={relForm.reverseLabel}
              onChange={onChange}
              placeholder="e.g. Opportunities"
              maxLength={255}
              disabled={relSaving}
            />
            <span className={styles.fieldHint}>
              How this relationship appears on the related object&rsquo;s page.
            </span>
          </div>

          {/* Required toggle */}
          <div className={styles.field}>
            <div className={styles.toggleRow}>
              <label className={styles.label}>Required</label>
              <button
                type="button"
                className={`${styles.toggle} ${relForm.required ? styles.toggleActive : ''}`}
                role="switch"
                aria-checked={relForm.required}
                aria-label="Required"
                onClick={onToggleRequired}
                disabled={relSaving}
              >
                <span className={styles.toggleKnob} />
              </button>
            </div>
          </div>

          {relModalError && (
            <p className={styles.errorAlert} role="alert">
              {relModalError}
            </p>
          )}

          <hr className={styles.divider} />

          <div className={styles.actions}>
            <PrimaryButton
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={relSaving}
            >
              Cancel
            </PrimaryButton>
            <PrimaryButton type="submit" disabled={relSaving}>
              {relSaving ? 'Adding…' : 'Add relationship'}
            </PrimaryButton>
          </div>
        </form>
      </div>
    </div>
  );
}
