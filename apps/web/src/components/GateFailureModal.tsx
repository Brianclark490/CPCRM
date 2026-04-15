import { useState, useEffect, useRef, useCallback } from 'react';
import { FieldInput } from './FieldInput.js';
import styles from './GateFailureModal.module.css';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GateFailure {
  field: string;
  label: string;
  gate: string;
  message: string;
  fieldType?: string;
  currentValue?: unknown;
  options?: Record<string, unknown>;
}

interface FieldError {
  field: string;
  message: string;
}

interface GateFailureModalProps {
  stageName: string;
  failures: GateFailure[];
  onFillAndMove: (fieldValues: Record<string, unknown>) => void;
  onCancel: () => void;
  loading?: boolean;
  /**
   * Surface a server-side error inside the modal (e.g. when the fill-and-move
   * update fails for a non-gate reason). Shown above the field list so users
   * can correct and retry without losing the values they have already entered.
   */
  error?: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildInitialValues(failures: GateFailure[]): Record<string, unknown> {
  const initial: Record<string, unknown> = {};
  for (const failure of failures) {
    initial[failure.field] = failure.currentValue ?? '';
  }
  return initial;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function GateFailureModal({
  stageName,
  failures,
  onFillAndMove,
  onCancel,
  loading = false,
  error = null,
}: GateFailureModalProps) {
  const [values, setValues] = useState<Record<string, unknown>>(() => buildInitialValues(failures));
  const [fieldErrors, setFieldErrors] = useState<FieldError[]>([]);

  // Reset values when failures change (e.g. still-failing gates after retry)
  const [prevFailures, setPrevFailures] = useState(failures);
  if (failures !== prevFailures) {
    setPrevFailures(failures);
    setValues(buildInitialValues(failures));
    setFieldErrors([]);
  }

  const modalRef = useRef<HTMLDivElement>(null);

  // Focus trap: keep focus within the modal
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
        return;
      }

      if (e.key === 'Tab' && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'input, select, textarea, button, [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    },
    [onCancel],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Auto-focus the modal on mount
  useEffect(() => {
    modalRef.current?.focus();
  }, []);

  const handleFieldChange = (field: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    // Clear error for this field when it changes
    setFieldErrors((prev) => prev.filter((e) => e.field !== field));
  };

  const validate = (): boolean => {
    const errors: FieldError[] = [];
    for (const failure of failures) {
      const val = values[failure.field];
      if (val === undefined || val === null || val === '') {
        errors.push({ field: failure.field, message: `${failure.label} is required` });
      }
    }
    setFieldErrors(errors);
    return errors.length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    onFillAndMove(values);
  };

  const getFieldError = (field: string): string | undefined =>
    fieldErrors.find((e) => e.field === field)?.message;

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
      <div className={styles.modal} ref={modalRef} tabIndex={-1}>
        <h2 className={styles.title}>
          Complete these fields to move to {stageName}
        </h2>

        {error && (
          <p className={styles.serverError} role="alert">
            {error}
          </p>
        )}

        <form onSubmit={handleSubmit}>
          <div className={styles.fieldList}>
            {failures.map((failure) => {
              const error = getFieldError(failure.field);
              return (
                <div key={failure.field} className={styles.fieldGroup}>
                  <label className={styles.fieldLabel} htmlFor={`gate-${failure.field}`}>
                    {failure.label}
                  </label>
                  <span className={styles.fieldMessage}>{failure.message}</span>
                  <FieldInput
                    fieldType={failure.fieldType ?? 'text'}
                    value={values[failure.field] ?? ''}
                    onChange={(v) => handleFieldChange(failure.field, v)}
                    id={`gate-${failure.field}`}
                    name={failure.field}
                    label={failure.label}
                    options={failure.options}
                    required
                  />
                  {error && <span className={styles.fieldError}>{error}</span>}
                </div>
              );
            })}
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
              className={styles.saveButton}
              disabled={loading}
            >
              {loading ? 'Saving…' : 'Save and move'}
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
