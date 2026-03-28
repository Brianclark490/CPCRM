import { useState, useEffect } from 'react';
import { FieldInput } from './FieldInput.js';
import styles from './InlineRecordForm.module.css';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FieldDefinition {
  id: string;
  objectId: string;
  apiName: string;
  label: string;
  fieldType: string;
  required: boolean;
  options: Record<string, unknown>;
  sortOrder: number;
}

interface InlineRecordFormProps {
  /** API name of the object type to create (e.g. "activity") */
  relatedObjectApiName: string;
  /** Display label for the related object (e.g. "Activity") */
  relatedObjectLabel: string;
  /** The parent record ID to link back to */
  parentRecordId: string;
  /** The parent record name for display context */
  parentRecordName: string;
  /** The relationship definition ID for the link */
  relationshipId: string;
  /** Auth session token */
  sessionToken: string;
  /** Called after a record is successfully created */
  onCreated: () => void;
  /** Called when the user cancels the form */
  onCancel: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * A compact inline form for creating a related record within a related list section.
 * Fetches the field definitions for the target object and renders essential fields.
 * On submit, creates the record and links it to the parent record in one API call.
 */
export function InlineRecordForm({
  relatedObjectApiName,
  relatedObjectLabel,
  parentRecordId,
  parentRecordName,
  relationshipId,
  sessionToken,
  onCreated,
  onCancel,
}: InlineRecordFormProps) {
  const [fields, setFields] = useState<FieldDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [formValues, setFormValues] = useState<Record<string, unknown>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Load field definitions ────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    const loadFields = async () => {
      setLoading(true);
      try {
        // Get the object definition to find the ID
        const objRes = await fetch('/api/admin/objects', {
          headers: { Authorization: `Bearer ${sessionToken}` },
        });
        if (cancelled || !objRes.ok) {
          setLoading(false);
          return;
        }

        const allObjects = (await objRes.json()) as Array<{
          id: string;
          apiName: string;
        }>;
        const obj = allObjects.find((o) => o.apiName === relatedObjectApiName);
        if (!obj || cancelled) {
          setLoading(false);
          return;
        }

        // Fetch field definitions
        const fieldsRes = await fetch(
          `/api/admin/objects/${obj.id}/fields`,
          { headers: { Authorization: `Bearer ${sessionToken}` } },
        );
        if (cancelled || !fieldsRes.ok) {
          setLoading(false);
          return;
        }

        const fieldDefs = (await fieldsRes.json()) as FieldDefinition[];

        // Show only essential fields: required fields and first few fields
        // Exclude formula fields (computed, not user-provided)
        const editableFields = fieldDefs
          .filter((f) => f.fieldType !== 'formula')
          .sort((a, b) => {
            // Required fields first, then by sort_order
            if (a.required !== b.required) return a.required ? -1 : 1;
            return a.sortOrder - b.sortOrder;
          })
          .slice(0, 5); // Show at most 5 fields for compact form

        if (!cancelled) {
          setFields(editableFields);
        }
      } catch {
        // Silently fail — the form will show with no fields
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadFields();

    return () => {
      cancelled = true;
    };
  }, [sessionToken, relatedObjectApiName]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleFieldChange = (fieldApiName: string, value: unknown) => {
    setFormValues((prev) => ({ ...prev, [fieldApiName]: value }));
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    // Basic required field validation
    for (const field of fields) {
      if (field.required) {
        const val = formValues[field.apiName];
        if (val === undefined || val === null || val === '') {
          setError(`${field.label} is required`);
          setSubmitting(false);
          return;
        }
      }
    }

    try {
      const response = await fetch(
        `/api/objects/${relatedObjectApiName}/records`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${sessionToken}`,
          },
          body: JSON.stringify({
            fieldValues: formValues,
            linkTo: {
              recordId: parentRecordId,
              relationshipId,
            },
          }),
        },
      );

      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        setError(data.error ?? 'Failed to create record');
        setSubmitting(false);
        return;
      }

      onCreated();
    } catch {
      setError('Failed to connect to the server. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className={styles.inlineForm} data-testid="inline-form-loading">
        <p className={styles.loadingText}>Loading form…</p>
      </div>
    );
  }

  return (
    <div className={styles.inlineForm} data-testid="inline-record-form">
      <div className={styles.formContext}>
        New {relatedObjectLabel.toLowerCase()} for{' '}
        <strong>{parentRecordName}</strong>
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} noValidate>
        <div className={styles.formGrid}>
          {fields.map((field) => (
            <div key={field.apiName} className={styles.formField}>
              <label
                className={styles.label}
                htmlFor={`inline-${field.apiName}`}
              >
                {field.label}
                {field.required && <span className={styles.required}>*</span>}
              </label>
              <FieldInput
                fieldType={field.fieldType}
                value={formValues[field.apiName] ?? null}
                onChange={(v) => handleFieldChange(field.apiName, v)}
                disabled={submitting}
                required={field.required}
                options={field.options}
                id={`inline-${field.apiName}`}
                name={field.apiName}
                label={field.label}
              />
            </div>
          ))}
        </div>

        {error && (
          <p role="alert" className={styles.errorText}>
            {error}
          </p>
        )}

        <div className={styles.formActions}>
          <button
            className={styles.btnSecondary}
            type="button"
            onClick={onCancel}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            className={styles.btnPrimary}
            type="submit"
            disabled={submitting}
          >
            {submitting ? 'Creating…' : `Create`}
          </button>
        </div>
      </form>
    </div>
  );
}
