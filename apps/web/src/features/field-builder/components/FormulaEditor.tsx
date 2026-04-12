import type { FieldDefinition, FieldForm } from '../types.js';
import styles from '../FieldBuilderPage.module.css';

interface FormulaEditorProps {
  fieldForm: FieldForm;
  fields: FieldDefinition[];
  saving: boolean;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
}

export function FormulaEditor({ fieldForm, fields, saving, onChange }: FormulaEditorProps) {
  return (
    <>
      <div className={styles.field}>
        <label
          className={`${styles.label} ${styles.labelRequired}`}
          htmlFor="field-expression"
        >
          Expression
        </label>
        <input
          id="field-expression"
          name="expression"
          type="text"
          className={styles.input}
          value={fieldForm.expression}
          onChange={onChange}
          placeholder="e.g. ({amount_won} / {total_value}) * 100"
          disabled={saving}
        />
        <span className={styles.fieldHint}>
          Reference other fields using {'{'}<em>field_api_name</em>{'}'}.
          Supports +, -, *, / and parentheses.
        </span>
        {fields.length > 0 && (
          <div className={styles.fieldHint}>
            Available fields:{' '}
            {fields
              .filter((f) => f.fieldType !== 'formula')
              .map((f) => (
                <code key={f.apiName} className={styles.apiName} style={{ marginRight: 4 }}>
                  {`{${f.apiName}}`}
                </code>
              ))}
          </div>
        )}
      </div>
      <div className={styles.optionsRow}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="field-outputType">
            Output type
          </label>
          <select
            id="field-outputType"
            name="outputType"
            className={styles.select}
            value={fieldForm.outputType}
            onChange={onChange}
            disabled={saving}
          >
            <option value="number">Number</option>
            <option value="currency">Currency</option>
            <option value="text">Text</option>
          </select>
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="field-formula-precision">
            Decimal places
          </label>
          <input
            id="field-formula-precision"
            name="precision"
            type="number"
            className={styles.input}
            value={fieldForm.precision}
            onChange={onChange}
            placeholder="e.g. 2"
            disabled={saving}
            min="0"
            max="10"
          />
        </div>
      </div>
    </>
  );
}
