import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSession } from '@descope/react-sdk';
import { FieldInput } from '../components/FieldInput.js';
import { RelationshipSearchDropdown } from '../components/RelationshipSearchDropdown.js';
import styles from './RecordCreatePage.module.css';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ObjectDefinition {
  id: string;
  apiName: string;
  label: string;
  pluralLabel: string;
  isSystem: boolean;
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

interface RelationshipDef {
  id: string;
  sourceObjectId: string;
  targetObjectId: string;
  relationshipType: string;
  apiName: string;
  label: string;
  reverseLabel?: string;
  required: boolean;
  targetObjectApiName?: string;
  targetObjectLabel?: string;
  sourceObjectApiName?: string;
  sourceObjectLabel?: string;
}

interface RelationshipSelection {
  relationshipId: string;
  recordId: string | null;
  recordName: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const EMAIL_REGEX = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

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

  const sections = Array.from(sectionMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([, section]) => ({
      ...section,
      fields: [...section.fields].sort((a, b) => a.sortOrder - b.sortOrder),
    }));

  return sections;
}

function validateField(
  field: LayoutFieldWithMetadata,
  value: unknown,
): string | null {
  const isEmpty =
    value === undefined || value === null || value === '';

  // Required check
  if (field.fieldRequired && isEmpty) {
    return `${field.fieldLabel} is required`;
  }

  // Skip type checks if empty and not required
  if (isEmpty) return null;

  const stringValue = String(value);

  switch (field.fieldType) {
    case 'email':
      if (!EMAIL_REGEX.test(stringValue)) {
        return `${field.fieldLabel} must be a valid email address`;
      }
      break;

    case 'number':
    case 'currency': {
      const num = Number(value);
      if (isNaN(num)) {
        return `${field.fieldLabel} must be a valid number`;
      }
      const min = field.fieldOptions.min as number | undefined;
      const max = field.fieldOptions.max as number | undefined;
      if (min !== undefined && num < min) {
        return `${field.fieldLabel} must be at least ${String(min)}`;
      }
      if (max !== undefined && num > max) {
        return `${field.fieldLabel} must be at most ${String(max)}`;
      }
      break;
    }

    case 'url':
      try {
        new URL(stringValue);
      } catch {
        return `${field.fieldLabel} must be a valid URL`;
      }
      break;

    case 'dropdown': {
      const choices = (field.fieldOptions.choices as string[]) ?? [];
      if (choices.length > 0 && !choices.includes(stringValue)) {
        return `${field.fieldLabel} must be one of the available choices`;
      }
      break;
    }

    case 'multi_select': {
      const msChoices = (field.fieldOptions.choices as string[]) ?? [];
      if (msChoices.length > 0 && Array.isArray(value)) {
        const invalid = (value as string[]).filter((v) => !msChoices.includes(v));
        if (invalid.length > 0) {
          return `${field.fieldLabel} contains invalid choices`;
        }
      }
      break;
    }
  }

  return null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function RecordCreatePage() {
  const { apiName } = useParams<{ apiName: string }>();
  const navigate = useNavigate();
  const { sessionToken } = useSession();

  // Metadata state
  const [objectDef, setObjectDef] = useState<ObjectDefinition | null>(null);
  const [layoutSections, setLayoutSections] = useState<LayoutSection[] | null>(null);
  const [relationships, setRelationships] = useState<RelationshipDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Form state
  const [formValues, setFormValues] = useState<Record<string, unknown>>({});
  const [relationshipSelections, setRelationshipSelections] = useState<
    RelationshipSelection[]
  >([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // ── Load metadata ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!sessionToken || !apiName) return;

    let cancelled = false;

    const loadMetadata = async () => {
      setLoading(true);
      setLoadError(null);

      try {
        // 1. Get object definitions to find the object ID
        const objResponse = await fetch('/api/admin/objects', {
          headers: { Authorization: `Bearer ${sessionToken}` },
        });

        if (cancelled) return;
        if (!objResponse.ok) {
          setLoadError('Failed to load object definitions.');
          setLoading(false);
          return;
        }

        const allObjects = (await objResponse.json()) as ObjectDefinition[];
        const obj = allObjects.find((o) => o.apiName === apiName);

        if (!obj) {
          setLoadError('Object type not found.');
          setLoading(false);
          return;
        }
        if (cancelled) return;
        setObjectDef(obj);

        // 2. Fetch layouts + relationships in parallel
        const [layoutsResponse, relsResponse] = await Promise.all([
          fetch(`/api/admin/objects/${obj.id}/layouts`, {
            headers: { Authorization: `Bearer ${sessionToken}` },
          }),
          fetch(`/api/admin/objects/${obj.id}/relationships`, {
            headers: { Authorization: `Bearer ${sessionToken}` },
          }),
        ]);

        if (cancelled) return;

        // Process layouts
        if (layoutsResponse.ok) {
          const layouts = (await layoutsResponse.json()) as LayoutListItem[];
          const formLayout =
            layouts.find((l) => l.layoutType === 'form' && l.isDefault) ??
            layouts.find((l) => l.layoutType === 'form');

          if (formLayout && !cancelled) {
            const layoutDetailResponse = await fetch(
              `/api/admin/objects/${obj.id}/layouts/${formLayout.id}`,
              { headers: { Authorization: `Bearer ${sessionToken}` } },
            );

            if (cancelled) return;

            if (layoutDetailResponse.ok) {
              const layoutDetail =
                (await layoutDetailResponse.json()) as LayoutDefinition;
              if (layoutDetail.fields.length > 0) {
                setLayoutSections(groupFieldsBySection(layoutDetail.fields));
              }
            }
          }
        }

        // Process relationships
        if (relsResponse.ok && !cancelled) {
          const rels = (await relsResponse.json()) as RelationshipDef[];
          // Only show relationships where this object is the source (lookup from this object)
          const sourceRels = rels.filter(
            (r) => r.sourceObjectId === obj.id,
          );
          setRelationships(sourceRels);
          setRelationshipSelections(
            sourceRels.map((r) => ({
              relationshipId: r.id,
              recordId: null,
              recordName: null,
            })),
          );
        }
      } catch {
        if (!cancelled) {
          setLoadError('Failed to connect to the server. Please try again.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadMetadata();

    return () => {
      cancelled = true;
    };
  }, [sessionToken, apiName]);

  // ── Form handlers ──────────────────────────────────────────────────────────

  const handleFieldChange = (fieldApiName: string, value: unknown) => {
    setFormValues((prev) => ({ ...prev, [fieldApiName]: value }));
    // Clear the field-specific error when the user changes the value
    setFieldErrors((prev) => {
      if (prev[fieldApiName]) {
        const next = { ...prev };
        delete next[fieldApiName];
        return next;
      }
      return prev;
    });
    setSubmitError(null);
  };

  const handleRelationshipChange = (
    relationshipId: string,
    recordId: string | null,
    recordName: string | null,
  ) => {
    setRelationshipSelections((prev) =>
      prev.map((sel) =>
        sel.relationshipId === relationshipId
          ? { ...sel, recordId, recordName }
          : sel,
      ),
    );
    // Clear the field-specific error
    setFieldErrors((prev) => {
      const key = `rel_${relationshipId}`;
      if (prev[key]) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return prev;
    });
    setSubmitError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionToken || !apiName) return;

    // ── Validate ──────────────────────────────────────────────────────────

    const errors: Record<string, string> = {};

    // Validate layout fields
    if (layoutSections) {
      for (const section of layoutSections) {
        for (const field of section.fields) {
          const val = formValues[field.fieldApiName];
          const error = validateField(field, val);
          if (error) {
            errors[field.fieldApiName] = error;
          }
        }
      }
    }

    // Validate required relationships
    for (const rel of relationships) {
      if (rel.required) {
        const selection = relationshipSelections.find(
          (s) => s.relationshipId === rel.id,
        );
        if (!selection?.recordId) {
          errors[`rel_${rel.id}`] = `${rel.label} is required`;
        }
      }
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    // ── Submit ────────────────────────────────────────────────────────────

    setSubmitting(true);
    setSubmitError(null);

    try {
      // Create the record
      const response = await fetch(`/api/objects/${apiName}/records`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({
          fieldValues: formValues,
        }),
      });

      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        setSubmitError(data.error ?? 'An unexpected error occurred');
        setSubmitting(false);
        return;
      }

      const created = (await response.json()) as { id: string };

      // Link relationships
      const relLinks = relationshipSelections.filter((s) => s.recordId);
      for (const link of relLinks) {
        await fetch(`/api/records/${created.id}/relationships`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${sessionToken}`,
          },
          body: JSON.stringify({
            relationship_id: link.relationshipId,
            target_record_id: link.recordId,
          }),
        });
      }

      // Redirect to the new record
      void navigate(`/objects/${apiName}/${created.id}`);
    } catch {
      setSubmitError('Failed to connect to the server. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render helpers ─────────────────────────────────────────────────────────

  const singularLabel = objectDef?.label ?? apiName ?? 'Record';
  const pluralLabel = objectDef?.pluralLabel ?? apiName ?? 'Records';

  const renderField = (field: LayoutFieldWithMetadata) => {
    const value = formValues[field.fieldApiName] ?? null;
    const error = fieldErrors[field.fieldApiName];

    return (
      <div
        key={field.fieldApiName}
        className={`${styles.formField} ${field.width === 'full' ? styles.formFieldFull : ''}`}
      >
        <label className={styles.label} htmlFor={`field-${field.fieldApiName}`}>
          {field.fieldLabel}
          {field.fieldRequired && <span className={styles.required}>*</span>}
        </label>
        <FieldInput
          fieldType={field.fieldType}
          value={value}
          onChange={(v) => handleFieldChange(field.fieldApiName, v)}
          disabled={submitting}
          required={field.fieldRequired}
          options={field.fieldOptions}
          id={`field-${field.fieldApiName}`}
          name={field.fieldApiName}
          label={field.fieldLabel}
        />
        {error && <span className={styles.fieldError}>{error}</span>}
      </div>
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────

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
        <p role="alert">{loadError}</p>
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

      <h1 className={styles.pageTitle}>
        Create {singularLabel.toLowerCase()}
      </h1>
      <p className={styles.pageSubtitle}>
        Add a new {singularLabel.toLowerCase()} to your CRM.
      </p>

      <form onSubmit={(e) => void handleSubmit(e)} noValidate>
        {/* Form sections from layout */}
        {layoutSections &&
          layoutSections.map((section, sIdx) => (
            <div key={sIdx} className={styles.card}>
              <div className={styles.cardHeader}>
                <span className={styles.cardTitle}>{section.label}</span>
              </div>
              <div className={styles.cardBody}>
                <div className={styles.formGrid}>
                  {section.fields.map((field) => renderField(field))}
                </div>
              </div>
            </div>
          ))}

        {/* Fallback when no layout sections */}
        {!layoutSections && (
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <span className={styles.cardTitle}>{singularLabel} details</span>
            </div>
            <div className={styles.cardBody}>
              <div className={styles.formGrid} />
            </div>
          </div>
        )}

        {/* Relationship fields */}
        {relationships.length > 0 && (
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <span className={styles.cardTitle}>Relationships</span>
            </div>
            <div className={styles.cardBody}>
              <div className={styles.formGrid}>
                {relationships.map((rel) => {
                  const selection = relationshipSelections.find(
                    (s) => s.relationshipId === rel.id,
                  );
                  const error = fieldErrors[`rel_${rel.id}`];
                  const targetApiName =
                    rel.targetObjectApiName ?? '';

                  return (
                    <div key={rel.id} className={styles.formField}>
                      <label
                        className={styles.label}
                        htmlFor={`rel-${rel.id}`}
                      >
                        {rel.label}
                        {rel.required && (
                          <span className={styles.required}>*</span>
                        )}
                      </label>
                      <RelationshipSearchDropdown
                        sessionToken={sessionToken ?? ''}
                        objectApiName={targetApiName}
                        value={selection?.recordId ?? null}
                        valueName={selection?.recordName ?? undefined}
                        onChange={(recordId, recordName) =>
                          handleRelationshipChange(rel.id, recordId, recordName)
                        }
                        disabled={submitting}
                        placeholder={`Search ${rel.targetObjectLabel?.toLowerCase() ?? 'records'}…`}
                        id={`rel-${rel.id}`}
                      />
                      {error && (
                        <span className={styles.fieldError}>{error}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Error message */}
        {submitError && (
          <p role="alert" className={styles.errorAlert}>
            {submitError}
          </p>
        )}

        {/* Actions */}
        <div className={styles.formActions}>
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
