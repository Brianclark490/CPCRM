import { PrimaryButton } from '../../../components/PrimaryButton.js';
import type { FieldDefinition, FieldForm } from '../types.js';
import { FieldTypePicker } from './FieldTypePicker.js';
import { FormulaEditor } from './FormulaEditor.js';
import styles from '../FieldBuilderPage.module.css';

interface FieldEditorProps {
  editingField: FieldDefinition | null;
  fieldForm: FieldForm;
  fields: FieldDefinition[];
  fieldModalError: string | null;
  saving: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
  onToggleRequired: () => void;
  onChoiceChange: (index: number, value: string) => void;
  onAddChoice: () => void;
  onRemoveChoice: (index: number) => void;
}

export function FieldEditor({
  editingField,
  fieldForm,
  fields,
  fieldModalError,
  saving,
  onClose,
  onSubmit,
  onChange,
  onToggleRequired,
  onChoiceChange,
  onAddChoice,
  onRemoveChoice,
}: FieldEditorProps) {
  const showFormulaOptions = fieldForm.fieldType === 'formula';

  return (
    <div
      className={styles.overlay}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={editingField ? 'Edit field' : 'Add field'}
    >
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.modalTitle}>
          {editingField ? 'Edit field' : 'Add field'}
        </h2>

        <form
          className={styles.form}
          noValidate
          onSubmit={(e) => void onSubmit(e)}
        >
          {/* Label */}
          <div className={styles.field}>
            <label
              className={`${styles.label} ${styles.labelRequired}`}
              htmlFor="field-label"
            >
              Label
            </label>
            <input
              id="field-label"
              name="label"
              type="text"
              className={styles.input}
              value={fieldForm.label}
              onChange={onChange}
              placeholder="e.g. Company Name"
              maxLength={255}
              disabled={saving}
            />
          </div>

          {/* API Name */}
          <div className={styles.field}>
            <label
              className={`${styles.label} ${styles.labelRequired}`}
              htmlFor="field-apiName"
            >
              API name
            </label>
            <input
              id="field-apiName"
              name="apiName"
              type="text"
              className={styles.input}
              value={fieldForm.apiName}
              onChange={onChange}
              placeholder="e.g. company_name"
              maxLength={100}
              disabled={saving || !!editingField}
            />
            <span className={styles.fieldHint}>
              {editingField
                ? 'API name cannot be changed after creation.'
                : 'Auto-generated from label. Must be lowercase snake_case.'}
            </span>
          </div>

          {/* Field Type + type-specific options */}
          <FieldTypePicker
            fieldForm={fieldForm}
            editingField={editingField}
            saving={saving}
            onChange={onChange}
            onChoiceChange={onChoiceChange}
            onAddChoice={onAddChoice}
            onRemoveChoice={onRemoveChoice}
          />

          {/* Conditional: Formula expression editor */}
          {showFormulaOptions && (
            <FormulaEditor
              fieldForm={fieldForm}
              fields={fields}
              saving={saving}
              onChange={onChange}
            />
          )}

          {/* Description */}
          <div className={styles.field}>
            <label className={styles.label} htmlFor="field-description">
              Description
            </label>
            <textarea
              id="field-description"
              name="description"
              className={styles.textarea}
              value={fieldForm.description}
              onChange={onChange}
              placeholder="Describe this field"
              disabled={saving}
            />
          </div>

          {/* Required toggle */}
          <div className={styles.field}>
            <div className={styles.toggleRow}>
              <label className={styles.label}>Required</label>
              <button
                type="button"
                className={`${styles.toggle} ${fieldForm.required ? styles.toggleActive : ''}`}
                role="switch"
                aria-checked={fieldForm.required}
                aria-label="Required"
                onClick={onToggleRequired}
                disabled={saving}
              >
                <span className={styles.toggleKnob} />
              </button>
            </div>
          </div>

          {/* Default value */}
          <div className={styles.field}>
            <label className={styles.label} htmlFor="field-defaultValue">
              Default value
            </label>
            <input
              id="field-defaultValue"
              name="defaultValue"
              type="text"
              className={styles.input}
              value={fieldForm.defaultValue}
              onChange={onChange}
              placeholder="Optional default value"
              disabled={saving}
            />
          </div>

          {fieldModalError && (
            <p className={styles.errorAlert} role="alert">
              {fieldModalError}
            </p>
          )}

          <hr className={styles.divider} />

          <div className={styles.actions}>
            <PrimaryButton
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </PrimaryButton>
            <PrimaryButton type="submit" disabled={saving}>
              {saving
                ? editingField
                  ? 'Saving…'
                  : 'Adding…'
                : editingField
                  ? 'Save changes'
                  : 'Add field'}
            </PrimaryButton>
          </div>
        </form>
      </div>
    </div>
  );
}
