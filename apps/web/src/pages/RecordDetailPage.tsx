import { useState, useEffect, useCallback } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useSession } from '@descope/react-sdk';
import { FieldRenderer } from '../components/FieldRenderer.js';
import { FieldInput } from '../components/FieldInput.js';
import { ConvertLeadModal } from '../components/ConvertLeadModal.js';
import { StageSelector } from '../components/StageSelector.js';
import { PageLayoutRenderer } from '../components/PageLayoutRenderer.js';
import { usePageLayout } from '../usePageLayout.js';
import { useTenantLocale } from '../useTenantLocale.js';
import styles from './RecordDetailPage.module.css';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ObjectDefinition {
  id: string;
  apiName: string;
  label: string;
  pluralLabel: string;
  isSystem: boolean;
}

interface RecordField {
  apiName: string;
  label: string;
  fieldType: string;
  value: unknown;
}

interface RelatedRecord {
  id: string;
  name: string;
  fieldValues: Record<string, unknown>;
}

interface Relationship {
  relationshipId: string;
  label: string;
  reverseLabel?: string;
  relationshipType: string;
  direction: 'source' | 'target';
  relatedObjectApiName: string;
  records: RelatedRecord[];
}

interface RecordDetail {
  id: string;
  objectId: string;
  name: string;
  fieldValues: Record<string, unknown>;
  ownerId: string;
  ownerName?: string;
  ownerRecordId?: string;
  updatedBy?: string;
  updatedByName?: string;
  updatedByRecordId?: string;
  pipelineId?: string;
  currentStageId?: string;
  createdAt: string;
  updatedAt: string;
  fields: RecordField[];
  relationships: Relationship[];
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (parts[0][0] ?? '?').toUpperCase();
}

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

  // Sort sections by section number, and fields within by sortOrder
  const sections = Array.from(sectionMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([, section]) => ({
      ...section,
      fields: [...section.fields].sort((a, b) => a.sortOrder - b.sortOrder),
    }));

  return sections;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function RecordDetailPage() {
  const { apiName, id } = useParams<{ apiName: string; id: string }>();
  const navigate = useNavigate();
  const { sessionToken } = useSession();
  const { formatDate, formatRelativeTime } = useTenantLocale();

  // Data state
  const [record, setRecord] = useState<RecordDetail | null>(null);
  const [objectDef, setObjectDef] = useState<ObjectDefinition | null>(null);
  const [layoutSections, setLayoutSections] = useState<LayoutSection[] | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Edit state
  const [editing, setEditing] = useState(false);
  const [formValues, setFormValues] = useState<Record<string, unknown>>({});
  const [submitting, setSubmitting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Delete state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Lead conversion state
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [converting, setConverting] = useState(false);
  const [convertError, setConvertError] = useState<string | null>(null);

  // Pipeline state — tracks whether this object type has a pipeline
  const [hasPipeline, setHasPipeline] = useState(false);

  // Page layout (new metadata-driven renderer; null = use legacy form)
  const { layout: pageLayout } = usePageLayout(apiName);

  // ── Load record ─────────────────────────────────────────────────────────────

  const loadRecord = useCallback(async () => {
    if (!sessionToken || !apiName || !id) return;

    setLoading(true);
    setLoadError(null);

    try {
      const response = await fetch(
        `/api/objects/${apiName}/records/${id}`,
        { headers: { Authorization: `Bearer ${sessionToken}` } },
      );

      if (response.ok) {
        const data = (await response.json()) as RecordDetail;
        setRecord(data);

        // Extract the object definition from admin API for full metadata
        const objResponse = await fetch('/api/admin/objects', {
          headers: { Authorization: `Bearer ${sessionToken}` },
        });
        if (objResponse.ok) {
          const allObjects = (await objResponse.json()) as ObjectDefinition[];
          const obj = allObjects.find((o) => o.apiName === apiName);
          if (obj) setObjectDef(obj);
        }
      } else if (response.status === 404) {
        setLoadError('Record not found.');
      } else {
        setLoadError('Failed to load record.');
      }
    } catch {
      setLoadError('Failed to connect to the server. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [sessionToken, apiName, id]);

  useEffect(() => {
    void loadRecord();
  }, [loadRecord]);

  // ── Load form layout ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!sessionToken || !apiName) return;

    let cancelled = false;

    const loadLayout = async () => {
      try {
        // Find the object ID
        const objResponse = await fetch('/api/admin/objects', {
          headers: { Authorization: `Bearer ${sessionToken}` },
        });
        if (cancelled || !objResponse.ok) return;

        const allObjects = (await objResponse.json()) as Array<{
          id: string;
          apiName: string;
        }>;
        const obj = allObjects.find((o) => o.apiName === apiName);
        if (!obj || cancelled) return;

        // Fetch layouts for this object
        const layoutsResponse = await fetch(
          `/api/admin/objects/${obj.id}/layouts`,
          { headers: { Authorization: `Bearer ${sessionToken}` } },
        );
        if (cancelled || !layoutsResponse.ok) return;

        const layouts = (await layoutsResponse.json()) as LayoutListItem[];
        const formLayout =
          layouts.find((l) => l.layoutType === 'form' && l.isDefault) ??
          layouts.find((l) => l.layoutType === 'form');

        if (!formLayout || cancelled) return;

        // Fetch the layout detail with fields
        const layoutDetailResponse = await fetch(
          `/api/admin/objects/${obj.id}/layouts/${formLayout.id}`,
          { headers: { Authorization: `Bearer ${sessionToken}` } },
        );
        if (cancelled || !layoutDetailResponse.ok) return;

        const layoutDetail =
          (await layoutDetailResponse.json()) as LayoutDefinition;
        if (!cancelled && layoutDetail.fields.length > 0) {
          setLayoutSections(groupFieldsBySection(layoutDetail.fields));
        }
      } catch {
        // Layout fetch is best-effort — fall back to record fields
      }
    };

    void loadLayout();

    return () => {
      cancelled = true;
    };
  }, [sessionToken, apiName]);

  // ── Check for pipeline stages ──────────────────────────────────────────────

  useEffect(() => {
    if (!sessionToken || !apiName) return;

    let cancelled = false;

    const checkPipeline = async () => {
      try {
        const response = await fetch(
          `/api/objects/${apiName}/records/pipeline-stages`,
          { headers: { Authorization: `Bearer ${sessionToken}` } },
        );
        if (cancelled || !response.ok) return;

        const data = (await response.json()) as { pipelineId: string | null; stages: unknown[] };
        if (!cancelled) {
          setHasPipeline(
            data.pipelineId !== null &&
            data.pipelineId !== undefined &&
            Array.isArray(data.stages) &&
            data.stages.length > 0,
          );
        }
      } catch {
        // Best-effort — default to no pipeline
      }
    };

    void checkPipeline();

    return () => {
      cancelled = true;
    };
  }, [sessionToken, apiName]);

  // ── Edit handlers ───────────────────────────────────────────────────────────

  const handleEditClick = () => {
    if (!record) return;
    setFormValues({ ...record.fieldValues });
    setSaveError(null);
    setSaveSuccess(false);
    setEditing(true);
  };

  const handleCancelClick = () => {
    setEditing(false);
    setSaveError(null);
    setSaveSuccess(false);
    setFormValues({});
  };

  const handleFieldChange = (fieldApiName: string, value: unknown) => {
    setFormValues((prev) => ({ ...prev, [fieldApiName]: value }));
    setSaveError(null);
    setSaveSuccess(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!record || !sessionToken) return;

    // Client-side required field validation
    if (layoutSections) {
      for (const section of layoutSections) {
        for (const field of section.fields) {
          // Skip formula fields — they are computed, not user-provided
          // Skip stage field when pipeline is active — stage is managed via move-stage API
          if (field.fieldRequired && field.fieldType !== 'formula') {
            if (field.fieldApiName === 'stage' && hasPipeline) continue;
            const val = formValues[field.fieldApiName];
            if (val === undefined || val === null || val === '') {
              setSaveError(`Field '${field.fieldLabel}' is required`);
              return;
            }
          }
        }
      }
    }

    setSubmitting(true);
    setSaveError(null);
    setSaveSuccess(false);

    // Exclude the stage field from the update when pipeline is active
    // (stage changes go through the move-stage API)
    let valuesToSave = formValues;
    if (hasPipeline && 'stage' in formValues) {
      const { stage: _stage, ...rest } = formValues;
      valuesToSave = rest;
    }

    try {
      const response = await fetch(
        `/api/objects/${apiName}/records/${record.id}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${sessionToken}`,
          },
          body: JSON.stringify({ fieldValues: valuesToSave }),
        },
      );

      if (response.ok) {
        // Reload the record to get updated data with relationships
        setEditing(false);
        setFormValues({});
        setSaveSuccess(true);
        void loadRecord();
      } else {
        const data = (await response.json()) as { error?: string };
        setSaveError(data.error ?? 'An unexpected error occurred');
      }
    } catch {
      setSaveError('Failed to connect to the server. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Delete handlers ─────────────────────────────────────────────────────────

  const handleDeleteClick = () => {
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = async () => {
    if (!record || !sessionToken) return;

    setDeleting(true);

    try {
      const response = await fetch(
        `/api/objects/${apiName}/records/${record.id}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${sessionToken}` },
        },
      );

      if (response.ok || response.status === 204) {
        void navigate(`/objects/${apiName}`);
      } else {
        setSaveError('Failed to delete record.');
        setShowDeleteConfirm(false);
      }
    } catch {
      setSaveError('Failed to connect to the server. Please try again.');
      setShowDeleteConfirm(false);
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteCancel = () => {
    setShowDeleteConfirm(false);
  };

  // ── Lead conversion handlers ────────────────────────────────────────────────

  const isLead = apiName === 'lead';
  const isConverted = isLead && record?.fieldValues['status'] === 'Converted';

  const handleConvert = async (options: {
    create_account: boolean;
    account_id: string | null;
    create_opportunity: boolean;
  }) => {
    if (!record || !sessionToken) return;

    setConverting(true);
    setConvertError(null);

    try {
      const response = await fetch(
        `/api/objects/lead/records/${record.id}/convert`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${sessionToken}`,
          },
          body: JSON.stringify(options),
        },
      );

      if (response.ok) {
        const result = (await response.json()) as {
          account: { id: string; name: string };
          contact: { id: string; name: string };
          opportunity: { id: string; name: string } | null;
        };
        setShowConvertModal(false);
        void navigate(`/objects/account/${result.account.id}`);
      } else {
        const data = (await response.json()) as { error?: string };
        setConvertError(data.error ?? 'An unexpected error occurred');
      }
    } catch {
      setConvertError('Failed to connect to the server. Please try again.');
    } finally {
      setConverting(false);
    }
  };

  // ── Render helpers ──────────────────────────────────────────────────────────

  const pluralLabel = objectDef?.pluralLabel ?? apiName ?? 'Records';
  const singularLabel = objectDef?.label ?? apiName ?? 'Record';

  const renderViewField = (
    fieldApiName: string,
    fieldLabel: string,
    fieldType: string,
    width: string,
  ) => {
    // Replace the standalone stage field with the pipeline-aware stage selector
    if (fieldApiName === 'stage' && hasPipeline && record) {
      return (
        <div
          key={fieldApiName}
          className={`${styles.fieldGroup} ${width === 'full' ? styles.fieldFull : ''}`}
        >
          <span className={styles.fieldLabel}>{fieldLabel}</span>
          <StageSelector
            apiName={apiName!}
            recordId={record.id}
            currentStageId={record.currentStageId}
            currentStageName={record.fieldValues['stage'] as string | undefined}
            onStageChanged={() => void loadRecord()}
          />
        </div>
      );
    }

    const field = record?.fields.find((f) => f.apiName === fieldApiName);
    const value = field?.value ?? record?.fieldValues[fieldApiName] ?? null;
    const isEmpty =
      value === null || value === undefined || value === '';

    return (
      <div
        key={fieldApiName}
        className={`${styles.fieldGroup} ${width === 'full' ? styles.fieldFull : ''}`}
      >
        <span className={styles.fieldLabel}>{fieldLabel}</span>
        {isEmpty ? (
          <span className={styles.fieldEmpty}>—</span>
        ) : (
          <span className={styles.fieldValue}>
            <FieldRenderer fieldType={fieldType} value={value} />
          </span>
        )}
      </div>
    );
  };

  const renderEditField = (
    field: LayoutFieldWithMetadata,
  ) => {
    // Replace the standalone stage field with the pipeline-aware stage selector
    // Stage changes go through the move-stage API, not the regular form save
    if (field.fieldApiName === 'stage' && hasPipeline && record) {
      return (
        <div
          key={field.fieldApiName}
          className={`${styles.formField} ${field.width === 'full' ? styles.formFieldFull : ''}`}
        >
          <label className={styles.label} htmlFor={`field-${field.fieldApiName}`}>
            {field.fieldLabel}
          </label>
          <StageSelector
            apiName={apiName!}
            recordId={record.id}
            currentStageId={record.currentStageId}
            currentStageName={record.fieldValues['stage'] as string | undefined}
            onStageChanged={() => void loadRecord()}
          />
        </div>
      );
    }

    // Formula fields show the computed value from the record, not from formValues
    const value = field.fieldType === 'formula'
      ? (record?.fields.find((f) => f.apiName === field.fieldApiName)?.value ?? null)
      : (formValues[field.fieldApiName] ?? null);

    return (
      <div
        key={field.fieldApiName}
        className={`${styles.formField} ${field.width === 'full' ? styles.formFieldFull : ''}`}
      >
        <label className={styles.label} htmlFor={`field-${field.fieldApiName}`}>
          {field.fieldLabel}
          {field.fieldRequired && field.fieldType !== 'formula' && <span className={styles.required}>*</span>}
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
      </div>
    );
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className={styles.page}>
        <p>Loading…</p>
      </div>
    );
  }

  if (loadError || !record) {
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
          <span className={styles.breadcrumbCurrent}>Detail</span>
        </nav>
        <p role="alert">{loadError ?? 'Record not found.'}</p>
      </div>
    );
  }

  // Decide field layout: use layout sections if available, otherwise fall back
  // to record fields in a single section.
  const sections: LayoutSection[] = layoutSections ?? [
    {
      label: `${singularLabel} details`,
      fields: record.fields.map((f, i) => ({
        fieldId: '',
        fieldApiName: f.apiName,
        fieldLabel: f.label,
        fieldType: f.fieldType,
        fieldRequired: false,
        fieldOptions: {},
        sortOrder: i,
        section: 0,
        width: f.fieldType === 'textarea' ? 'full' : 'half',
      })),
    },
  ];

  // ── Page Layout Renderer (metadata-driven) ──────────────────────────────────
  // When a page layout exists and we're not editing, use the new renderer.
  // Falls back to the legacy form below when no page layout is configured.

  if (pageLayout && !editing) {
    const layoutActions = (
      <>
        {isLead && !isConverted && (
          <button
            className={styles.btnConvert}
            type="button"
            onClick={() => {
              setConvertError(null);
              setShowConvertModal(true);
            }}
          >
            Convert Lead
          </button>
        )}
        {!isConverted && (
          <>
            <button
              className={styles.btnPrimary}
              type="button"
              onClick={handleEditClick}
            >
              Edit
            </button>
            <button
              className={styles.btnDanger}
              type="button"
              onClick={handleDeleteClick}
            >
              Delete
            </button>
          </>
        )}
      </>
    );

    return (
      <div className={styles.page}>
        {isConverted && (
          <div className={styles.convertedBanner}>
            <span className={styles.convertedBadge}>Converted</span>
            <div className={styles.convertedLinks}>
              {typeof record.fieldValues['converted_account_id'] === 'string' && (
                <Link
                  to={`/objects/account/${record.fieldValues['converted_account_id']}`}
                  className={styles.convertedLink}
                >
                  View Account
                </Link>
              )}
              {typeof record.fieldValues['converted_contact_id'] === 'string' && (
                <Link
                  to={`/objects/contact/${record.fieldValues['converted_contact_id']}`}
                  className={styles.convertedLink}
                >
                  View Contact
                </Link>
              )}
              {typeof record.fieldValues['converted_opportunity_id'] === 'string' && (
                <Link
                  to={`/objects/opportunity/${record.fieldValues['converted_opportunity_id']}`}
                  className={styles.convertedLink}
                >
                  View Opportunity
                </Link>
              )}
            </div>
          </div>
        )}

        {saveSuccess && (
          <p role="status" className={styles.successAlert}>
            {singularLabel} updated successfully.
          </p>
        )}

        <PageLayoutRenderer
          layout={pageLayout}
          record={record}
          fields={record.fields}
          objectDef={objectDef}
          actions={layoutActions}
        />

        {showDeleteConfirm && (
          <div className={styles.deleteOverlay}>
            <div className={styles.deleteModal} role="dialog" aria-label="Confirm deletion">
              <h2 className={styles.deleteModalTitle}>Delete {singularLabel}?</h2>
              <p className={styles.deleteModalText}>
                Are you sure you want to delete &ldquo;{record.name}&rdquo;? This
                action cannot be undone.
              </p>
              <div className={styles.deleteModalActions}>
                <button
                  className={styles.btnSecondary}
                  type="button"
                  onClick={handleDeleteCancel}
                  disabled={deleting}
                >
                  Cancel
                </button>
                <button
                  className={styles.btnDanger}
                  type="button"
                  onClick={() => void handleDeleteConfirm()}
                  disabled={deleting}
                >
                  {deleting ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        )}

        {showConvertModal && sessionToken && (
          <ConvertLeadModal
            leadName={record.name}
            fieldValues={record.fieldValues}
            sessionToken={sessionToken}
            onConvert={handleConvert}
            onClose={() => setShowConvertModal(false)}
            converting={converting}
            error={convertError}
          />
        )}
      </div>
    );
  }

  // ── Legacy form (fallback when no page layout exists) ───────────────────────

  return (
    <div className={styles.page}>
      {/* Page header */}
      <div className={styles.pageHeader}>
        <div className={styles.headerLeft}>
          <nav className={styles.breadcrumb} aria-label="Breadcrumb">
            <button
              className={styles.breadcrumbLink}
              onClick={() => void navigate(`/objects/${apiName}`)}
              type="button"
            >
              {pluralLabel}
            </button>
            <span className={styles.breadcrumbSeparator} aria-hidden="true">›</span>
            <span className={styles.breadcrumbCurrent}>{record.name}</span>
          </nav>
          <h1 className={styles.pageTitle}>{record.name}</h1>
          <p className={styles.pageSubtitle}>
            Last updated {formatDate(record.updatedAt)}
          </p>
        </div>

        {!editing && (
          <div className={styles.headerActions}>
            {isLead && !isConverted && (
              <button
                className={styles.btnConvert}
                type="button"
                onClick={() => {
                  setConvertError(null);
                  setShowConvertModal(true);
                }}
              >
                Convert Lead
              </button>
            )}
            {!isConverted && (
              <>
                <button
                  className={styles.btnPrimary}
                  type="button"
                  onClick={handleEditClick}
                >
                  Edit
                </button>
                <button
                  className={styles.btnDanger}
                  type="button"
                  onClick={handleDeleteClick}
                >
                  Delete
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Converted lead banner */}
      {isConverted && (
        <div className={styles.convertedBanner}>
          <span className={styles.convertedBadge}>Converted</span>
          <div className={styles.convertedLinks}>
            {typeof record.fieldValues['converted_account_id'] === 'string' && (
              <Link
                to={`/objects/account/${record.fieldValues['converted_account_id']}`}
                className={styles.convertedLink}
              >
                View Account
              </Link>
            )}
            {typeof record.fieldValues['converted_contact_id'] === 'string' && (
              <Link
                to={`/objects/contact/${record.fieldValues['converted_contact_id']}`}
                className={styles.convertedLink}
              >
                View Contact
              </Link>
            )}
            {typeof record.fieldValues['converted_opportunity_id'] === 'string' && (
              <Link
                to={`/objects/opportunity/${record.fieldValues['converted_opportunity_id']}`}
                className={styles.convertedLink}
              >
                View Opportunity
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Success banner */}
      {saveSuccess && (
        <p role="status" className={styles.successAlert}>
          {singularLabel} updated successfully.
        </p>
      )}

      {/* Detail / Edit sections */}
      {editing ? (
        <form onSubmit={(e) => void handleSave(e)} noValidate>
          {sections.map((section, sIdx) => (
            <div key={sIdx} className={styles.card}>
              <div className={styles.cardHeader}>
                <span className={styles.cardTitle}>{section.label}</span>
              </div>
              <div className={styles.cardBody}>
                <div className={styles.formGrid}>
                  {section.fields.map((field) => renderEditField(field))}
                </div>
              </div>
            </div>
          ))}

          {saveError && (
            <p role="alert" className={styles.errorAlert}>
              {saveError}
            </p>
          )}

          <div className={styles.formActions}>
            <button
              className={styles.btnPrimary}
              type="submit"
              disabled={submitting}
            >
              {submitting ? 'Saving…' : 'Save'}
            </button>
            <button
              className={styles.btnSecondary}
              type="button"
              onClick={handleCancelClick}
              disabled={submitting}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <>
          {sections.map((section, sIdx) => (
            <div key={sIdx} className={styles.card}>
              <div className={styles.cardHeader}>
                <span className={styles.cardTitle}>{section.label}</span>
              </div>
              <div className={styles.cardBody}>
                <div className={styles.fieldsGrid}>
                  {section.fields.map((field) =>
                    renderViewField(
                      field.fieldApiName,
                      field.fieldLabel,
                      field.fieldType,
                      field.width,
                    ),
                  )}
                </div>
              </div>

              {/* Metadata footer on first section */}
              {sIdx === 0 && (
                <div className={styles.metaRow}>
                  <div className={styles.metaItem}>
                    <span className={styles.metaLabel}>Owner</span>
                    <span className={styles.metaValue}>
                      {record.ownerName ? (
                        record.ownerRecordId ? (
                          <Link to={`/objects/user/${record.ownerRecordId}`} className={styles.avatarChipLink}>
                            <span className={styles.avatarInitials}>{getInitials(record.ownerName)}</span>
                            {record.ownerName}
                          </Link>
                        ) : (
                          <span className={styles.avatarChip}>
                            <span className={styles.avatarInitials}>{getInitials(record.ownerName)}</span>
                            {record.ownerName}
                          </span>
                        )
                      ) : '—'}
                    </span>
                  </div>
                  <div className={styles.metaItem}>
                    <span className={styles.metaLabel}>Last modified</span>
                    <span className={styles.metaValue}>
                      {record.updatedByName ? (
                        record.updatedByRecordId ? (
                          <Link to={`/objects/user/${record.updatedByRecordId}`} className={styles.avatarChipLink}>
                            <span className={styles.avatarInitials}>{getInitials(record.updatedByName)}</span>
                            {record.updatedByName}
                          </Link>
                        ) : (
                          <span className={styles.avatarChip}>
                            <span className={styles.avatarInitials}>{getInitials(record.updatedByName)}</span>
                            {record.updatedByName}
                          </span>
                        )
                      ) : null}
                      {record.updatedByName ? ' · ' : ''}{formatRelativeTime(record.updatedAt)}
                    </span>
                  </div>
                  <div className={styles.metaItem}>
                    <span className={styles.metaLabel}>Created</span>
                    <span className={styles.metaValue}>
                      {formatDate(record.createdAt)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </>
      )}

      {/* Related records sections */}
      {!editing &&
        record.relationships.map((rel) => (
          <div key={rel.relationshipId} className={styles.relatedCard}>
            <div className={styles.relatedHeader}>
              <span className={styles.relatedTitle}>{rel.label}</span>
            </div>
            {rel.records.length === 0 ? (
              <div className={styles.relatedEmpty}>
                No related records
              </div>
            ) : (
              <table className={styles.relatedTable}>
                <thead>
                  <tr>
                    <th className={styles.relatedTh}>Name</th>
                  </tr>
                </thead>
                <tbody>
                  {rel.records.map((relRecord) => (
                    <tr key={relRecord.id} className={styles.relatedTr}>
                      <td className={styles.relatedTd}>
                        <Link
                          to={`/objects/${rel.relatedObjectApiName}/${relRecord.id}`}
                          className={styles.relatedLink}
                        >
                          {relRecord.name}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ))}

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div className={styles.deleteOverlay}>
          <div className={styles.deleteModal} role="dialog" aria-label="Confirm deletion">
            <h2 className={styles.deleteModalTitle}>Delete {singularLabel}?</h2>
            <p className={styles.deleteModalText}>
              Are you sure you want to delete &ldquo;{record.name}&rdquo;? This
              action cannot be undone.
            </p>
            <div className={styles.deleteModalActions}>
              <button
                className={styles.btnSecondary}
                type="button"
                onClick={handleDeleteCancel}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                className={styles.btnDanger}
                type="button"
                onClick={() => void handleDeleteConfirm()}
                disabled={deleting}
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lead conversion modal */}
      {showConvertModal && sessionToken && (
        <ConvertLeadModal
          leadName={record.name}
          fieldValues={record.fieldValues}
          sessionToken={sessionToken}
          onConvert={handleConvert}
          onClose={() => setShowConvertModal(false)}
          converting={converting}
          error={convertError}
        />
      )}
    </div>
  );
}
