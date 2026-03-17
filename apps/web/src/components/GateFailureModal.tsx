import { useState } from 'react';
import { FieldInput } from './FieldInput.js';
import styles from './GateFailureModal.module.css';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GateFailure {
  field: string;
  label: string;
  gate: string;
  message: string;
}

interface GateFailureModalProps {
  stageName: string;
  failures: GateFailure[];
  onFillAndMove: (fieldValues: Record<string, unknown>) => void;
  onCancel: () => void;
  loading?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function GateFailureModal({
  stageName,
  failures,
  onFillAndMove,
  onCancel,
  loading = false,
}: GateFailureModalProps) {
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const initial: Record<string, unknown> = {};
    for (const failure of failures) {
      initial[failure.field] = '';
    }
    return initial;
  });

  const handleFieldChange = (field: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onFillAndMove(values);
  };

  return (
    <div
      className={styles.overlay}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={`Complete fields to move to ${stageName}`}
      data-testid="gate-failure-modal"
    >
      <div className={styles.modal}>
        <h2 className={styles.title}>
          Cannot move to {stageName}
        </h2>
        <p className={styles.description}>
          The following fields must be completed before moving to this stage.
          Fill in the values below and try again.
        </p>

        <form onSubmit={handleSubmit}>
          <div className={styles.fieldList}>
            {failures.map((failure) => (
              <div key={failure.field} className={styles.fieldGroup}>
                <label className={styles.fieldLabel} htmlFor={`gate-${failure.field}`}>
                  {failure.label}
                </label>
                <span className={styles.fieldMessage}>{failure.message}</span>
                <FieldInput
                  fieldType="text"
                  value={values[failure.field] ?? ''}
                  onChange={(v) => handleFieldChange(failure.field, v)}
                  id={`gate-${failure.field}`}
                  name={failure.field}
                  label={failure.label}
                  required
                />
              </div>
            ))}
          </div>

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.cancelButton}
              onClick={onCancel}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={styles.fillButton}
              disabled={loading}
            >
              {loading ? 'Moving…' : 'Fill and move'}
            </button>
          </div>
        </form>

        {loading && (
          <div className={styles.loading}>Updating record and moving stage…</div>
        )}
      </div>
    </div>
  );
}
