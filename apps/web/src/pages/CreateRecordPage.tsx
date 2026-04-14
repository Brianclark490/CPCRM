import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSession } from '@descope/react-sdk';
import { useApiClient } from '../lib/apiClient.js';
import { FieldInput } from '../components/FieldInput.js';
import { StageFieldRenderer } from '../components/StageFieldRenderer.js';
import styles from './CreateRecordPage.module.css';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ObjectDefinition {
  id: string;
  apiName: string;
  label: string;
  pluralLabel: string;
  isSystem: boolean;
}

interface FieldDefinition {
  id: string;
  apiName: string;
  label: string;
  fieldType: string;
  required: boolean;
  options: Record<string, unknown>;
  sortOrder: number;
}

interface LayoutFieldWithMetadata {
  fieldId: string;
  fieldApiName: string;
  fieldLabel: string;
  fieldType: string;
  fieldRequired: boolean;
  fieldOptions: Record<string, unknown>;
  sortOrder: number;
  section: number;
  sectionLabel?: string;
  width: string;
}

interface LayoutDefinition {
  id: string;
  objectId: string;
  name: string;
  layoutType: string;
  isDefault: boolean;
  fields: LayoutFieldWithMetadata[];
}

interface LayoutListItem {
  id: string;
  objectId: string;
  name: string;
  layoutType: string;
  isDefault: boolean;
}

interface LayoutSection {
  label: string;
  fields: LayoutFieldWithMetadata[];
}

interface ApiError {
  error: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function groupFieldsBySection(
  layoutFields: LayoutFieldWithMetadata[],
): LayoutSection[] {
  const sectionMap = new Map<number, LayoutSection>();

  for (const field of layoutFields) {
    let section = sectionMap.get(field.section);
    if (!section) {
      section = {
        label: field.sectionLabel ?? `Section ${field.section + 1}`,
        fields: [],
      };
      sectionMap.set(field.section, section);
    }
    section.fields.push(field);
  }

  return Array.from(sectionMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([, section]) => ({
      ...section,
      fields: [...section.fields].sort((a, b) => a.sortOrder - b.sortOrder),
    }));
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CreateRecordPage() {
  const { apiName } = useParams<{ apiName: string }>();
  const { sessionToken } = useSession();
  const api = useApiClient();
  const navigate = useNavigate();

  const [objectDef, setObjectDef] = useState<ObjectDefinition | null>(null);
  const [sections, setSections] = useState<LayoutSection[] | null>(null);
  const [formValues, setFormValues] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // ── Load object definition, fields, and form layout ─────────────────────────

  useEffect(() => {
    if (!sessionToken || !apiName) return;

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setLoadError(null);

      try {
        // Fetch all object definitions to find our object
        const objResponse = await api.request('/api/v1/admin/objects');

        if (cancelled) return;

        if (!objResponse.ok) {
          setLoadError('Failed to load object definition.');
          setLoading(false);
          return;
        }

        const allObjects = (await objResponse.json()) as ObjectDefinition[];
        const obj = allObjects.find((o) => o.apiName === apiName);

        if (!obj) {
          if (!cancelled) setLoadError('Object type not found.');
          setLoading(false);
          return;
        }

        if (!cancelled) setObjectDef(obj);

        // Fetch field definitions
        const fieldsResponse = await api.request(
          `/api/v1/admin/objects/${obj.id}/fields`,
        );

        if (cancelled) return;

        let fieldDefs: FieldDefinition[] = [];
        if (fieldsResponse.ok) {
          fieldDefs = (await fieldsResponse.json()) as FieldDefinition[];
        }

        // Fetch layouts
        const layoutsResponse = await api.request(
          `/api/v1/admin/objects/${obj.id}/layouts`,
        );

        if (cancelled) return;

        let layoutSections: LayoutSection[] | null = null;

        if (layoutsResponse.ok) {
          const layouts = (await layoutsResponse.json()) as LayoutListItem[];
          const formLayout =
            layouts.find((l) => l.layoutType === 'form' && l.isDefault) ??
            layouts.find((l) => l.layoutType === 'form');

          if (formLayout) {
            const layoutDetailResponse = await api.request(
              `/api/v1/admin/objects/${obj.id}/layouts/${formLayout.id}`,
            );

            if (!cancelled && layoutDetailResponse.ok) {
              const layoutDetail =
                (await layoutDetailResponse.json()) as LayoutDefinition;
              if (layoutDetail.fields.length > 0) {
                layoutSections = groupFieldsBySection(layoutDetail.fields);
              }
            }
          }
        }

        // Fall back to field definitions if no layout is available
        if (!layoutSections && fieldDefs.length > 0) {
          layoutSections = [
            {
              label: 'Details',
              fields: fieldDefs
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((fd) => ({
                  fieldId: fd.id,
                  fieldApiName: fd.apiName,
                  fieldLabel: fd.label,
                  fieldType: fd.fieldType,
                  fieldRequired: fd.required,
                  fieldOptions: fd.options,
                  sortOrder: fd.sortOrder,
                  section: 0,
                  width: fd.fieldType === 'textarea' ? 'full' : 'half',
                })),
            },
          ];
        }

        if (!cancelled) {
          setSections(layoutSections);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setLoadError('Failed to connect to the server. Please try again.');
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [sessionToken, api, apiName]);

  // ── Form handlers ───────────────────────────────────────────────────────────

  const handleFieldChange = (fieldApiName: string, value: unknown) => {
    setFormValues((prev) => ({ ...prev, [fieldApiName]: value }));
    setErrorMessage(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!sessionToken) {
      setErrorMessage('Session unavailable. Please refresh and try again.');
      return;
    }

    // Client-side required field validation
    if (sections) {
      for (const section of sections) {
        for (const field of section.fields) {
          if (field.fieldRequired) {
            const val = formValues[field.fieldApiName];
            if (val === undefined || val === null || val === '') {
              setErrorMessage(`Field '${field.fieldLabel}' is required`);
              return;
            }
          }
        }
      }
    }

    setSubmitting(true);

    try {
      const response = await api.request(`/api/v1/objects/${apiName}/records`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fieldValues: formValues }),
      });

      if (response.ok) {
        const record = (await response.json()) as { id: string };
        void navigate(`/objects/${apiName}/${record.id}`);
      } else {
        const data = (await response.json()) as ApiError;
        setErrorMessage(data.error ?? 'An unexpected error occurred');
      }
    } catch {
      setErrorMessage('Failed to connect to the server. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render helpers ──────────────────────────────────────────────────────────

  const pluralLabel = objectDef?.pluralLabel ?? apiName ?? 'Records';
  const singularLabel = objectDef?.label ?? apiName ?? 'Record';

  if (loading) {
    return (
      <div className={styles.page}>
        <p>Loading…</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className={styles.page}>
        <nav className={styles.breadcrumb} aria-label="Breadcrumb">
          <button
            className={styles.breadcrumbLink}
            onClick={() => void navigate(`/objects/${apiName}`)}
            type="button"
          >
            {pluralLabel}
          </button>
          <span className={styles.breadcrumbSeparator} aria-hidden="true">›</span>
          <span className={styles.breadcrumbCurrent}>Create</span>
        </nav>
        <p role="alert" className={styles.errorAlert}>
          {loadError}
        </p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <nav className={styles.breadcrumb} aria-label="Breadcrumb">
        <button
          className={styles.breadcrumbLink}
          onClick={() => void navigate(`/objects/${apiName}`)}
          type="button"
        >
          {pluralLabel}
        </button>
        <span className={styles.breadcrumbSeparator} aria-hidden="true">›</span>
        <span className={styles.breadcrumbCurrent}>Create</span>
      </nav>

      <h1 className={styles.pageTitle}>Create {singularLabel.toLowerCase()}</h1>
      <p className={styles.pageSubtitle}>
        Add a new {singularLabel.toLowerCase()} to your CRM.
      </p>

      <form
        className={styles.form}
        noValidate
        onSubmit={(e) => void handleSubmit(e)}
      >
        {sections?.map((section, sIdx) => (
          <div key={sIdx} className={styles.card}>
            <div className={styles.cardHeader}>{section.label}</div>
            <div className={styles.formGrid}>
              {section.fields.map((field) => {
                const isPipelineManaged = field.fieldOptions?.pipeline_managed === true;

                return (
                  <div
                    key={field.fieldApiName}
                    className={`${styles.formField} ${field.width === 'full' ? styles.formFieldFull : ''}`}
                  >
                    <label
                      className={styles.label}
                      htmlFor={`field-${field.fieldApiName}`}
                    >
                      {field.fieldLabel}
                      {field.fieldRequired && (
                        <span className={styles.required}>*</span>
                      )}
                    </label>
                    {isPipelineManaged && objectDef ? (
                      <StageFieldRenderer
                        objectApiName={apiName!}
                        objectId={objectDef.id}
                        recordId={null}
                        currentStageId={null}
                        value={formValues[field.fieldApiName] ?? null}
                        editing={true}
                        disabled={submitting}
                        onChange={(v) => handleFieldChange(field.fieldApiName, v)}
                      />
                    ) : (
                      <FieldInput
                        fieldType={field.fieldType}
                        value={formValues[field.fieldApiName] ?? null}
                        onChange={(v) => handleFieldChange(field.fieldApiName, v)}
                        disabled={submitting}
                        required={field.fieldRequired}
                        options={field.fieldOptions}
                        id={`field-${field.fieldApiName}`}
                        name={field.fieldApiName}
                        label={field.fieldLabel}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {errorMessage && (
          <p className={styles.errorAlert} role="alert">
            {errorMessage}
          </p>
        )}

        <div className={styles.actions}>
          <button
            className={styles.btnSecondary}
            type="button"
            onClick={() => void navigate(`/objects/${apiName}`)}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            className={styles.btnPrimary}
            type="submit"
            disabled={submitting}
          >
            {submitting ? 'Creating…' : `Create ${singularLabel.toLowerCase()}`}
          </button>
        </div>
      </form>
    </div>
  );
}
