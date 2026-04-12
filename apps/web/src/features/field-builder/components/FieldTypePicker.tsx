import { FIELD_TYPE_OPTIONS } from '../constants.js';
import type { FieldDefinition, FieldForm } from '../types.js';
import { PlusIcon } from './Icons.js';
import styles from '../FieldBuilderPage.module.css';

interface FieldTypePickerProps {
  fieldForm: FieldForm;
  editingField: FieldDefinition | null;
  saving: boolean;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
  onChoiceChange: (index: number, value: string) => void;
  onAddChoice: () => void;
  onRemoveChoice: (index: number) => void;
}

export function FieldTypePicker({
  fieldForm,
  editingField,
  saving,
  onChange,
  onChoiceChange,
  onAddChoice,
  onRemoveChoice,
}: FieldTypePickerProps) {
  const showChoicesEditor =
    fieldForm.fieldType === 'dropdown' || fieldForm.fieldType === 'multi_select';
  const showNumberOptions =
    fieldForm.fieldType === 'number' || fieldForm.fieldType === 'currency';
  const showTextOptions = fieldForm.fieldType === 'text';

  return (
    <>
      {/* Field Type */}
      <div className={styles.field}>
        <label
          className={`${styles.label} ${styles.labelRequired}`}
          htmlFor="field-fieldType"
        >
          Field type
        </label>
        <select
          id="field-fieldType"
          name="fieldType"
          className={styles.select}
          value={fieldForm.fieldType}
          onChange={onChange}
          disabled={saving || (!!editingField && editingField.isSystem)}
        >
          {FIELD_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {editingField?.isSystem && (
          <span className={styles.fieldHint}>
            Field type cannot be changed on system fields.
          </span>
        )}
      </div>

      {/* Conditional: Choices editor */}
      {showChoicesEditor && (
        <div className={styles.field}>
          <label className={`${styles.label} ${styles.labelRequired}`}>
            Choices
          </label>
          <div className={styles.choicesList}>
            {fieldForm.choices.map((choice, index) => (
              <div key={index} className={styles.choiceRow}>
                <input
                  type="text"
                  className={styles.choiceInput}
                  value={choice}
                  onChange={(e) => onChoiceChange(index, e.target.value)}
                  placeholder={`Choice ${index + 1}`}
                  disabled={saving}
                />
                <button
                  type="button"
                  className={styles.removeChoiceButton}
                  aria-label={`Remove choice ${index + 1}`}
                  onClick={() => onRemoveChoice(index)}
                  disabled={saving}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            className={styles.addChoiceButton}
            onClick={onAddChoice}
            disabled={saving}
          >
            <PlusIcon />
            Add choice
          </button>
        </div>
      )}

      {/* Conditional: Number/Currency options */}
      {showNumberOptions && (
        <div className={styles.optionsRow}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="field-min">
              Min
            </label>
            <input
              id="field-min"
              name="min"
              type="number"
              className={styles.input}
              value={fieldForm.min}
              onChange={onChange}
              disabled={saving}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="field-max">
              Max
            </label>
            <input
              id="field-max"
              name="max"
              type="number"
              className={styles.input}
              value={fieldForm.max}
              onChange={onChange}
              disabled={saving}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="field-precision">
              Precision
            </label>
            <input
              id="field-precision"
              name="precision"
              type="number"
              className={styles.input}
              value={fieldForm.precision}
              onChange={onChange}
              disabled={saving}
            />
          </div>
        </div>
      )}

      {/* Conditional: Text max_length */}
      {showTextOptions && (
        <div className={styles.field}>
          <label className={styles.label} htmlFor="field-maxLength">
            Max length
          </label>
          <input
            id="field-maxLength"
            name="maxLength"
            type="number"
            className={styles.input}
            value={fieldForm.maxLength}
            onChange={onChange}
            placeholder="e.g. 255"
            disabled={saving}
          />
        </div>
      )}
    </>
  );
}
