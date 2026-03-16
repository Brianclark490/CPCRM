import { useState, useEffect, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useSession } from '@descope/react-sdk';
import { PrimaryButton } from '../components/PrimaryButton.js';
import { slugify } from '../utils.js';
import styles from './FieldBuilderPage.module.css';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FieldDefinition {
  id: string;
  objectId: string;
  apiName: string;
  label: string;
  fieldType: string;
  description?: string;
  required: boolean;
  defaultValue?: string;
  options: Record<string, unknown>;
  sortOrder: number;
  isSystem: boolean;
}

interface ObjectDefinitionDetail {
  id: string;
  apiName: string;
  label: string;
  pluralLabel: string;
  description?: string;
  icon?: string;
  isSystem: boolean;
  fields: FieldDefinition[];
  relationships: unknown[];
  layouts: unknown[];
}

interface FieldForm {
  label: string;
  apiName: string;
  fieldType: string;
  description: string;
  required: boolean;
  defaultValue: string;
  choices: string[];
  min: string;
  max: string;
  precision: string;
  maxLength: string;
}

interface ApiError {
  error: string;
}

type TabName = 'fields' | 'relationships' | 'layouts';

// ─── Constants ────────────────────────────────────────────────────────────────

const FIELD_TYPE_OPTIONS = [
  { value: 'text', label: 'Text' },
  { value: 'textarea', label: 'Textarea' },
  { value: 'number', label: 'Number' },
  { value: 'currency', label: 'Currency' },
  { value: 'date', label: 'Date' },
  { value: 'datetime', label: 'Datetime' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'url', label: 'URL' },
  { value: 'boolean', label: 'Boolean' },
  { value: 'dropdown', label: 'Dropdown' },
  { value: 'multi_select', label: 'Multi-select' },
];

const EMPTY_FORM: FieldForm = {
  label: '',
  apiName: '',
  fieldType: 'text',
  description: '',
  required: false,
  defaultValue: '',
  choices: [''],
  min: '',
  max: '',
  precision: '',
  maxLength: '',
};

// ─── Icons ────────────────────────────────────────────────────────────────────

const PlusIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
    <path d="M3 6h6M6 3v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const TrashIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path
      d="M3 4h8M5.5 4V3a1 1 0 011-1h1a1 1 0 011 1v1M4.5 4v7a1 1 0 001 1h3a1 1 0 001-1V4"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const LockIcon = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
    <rect x="2" y="4.5" width="6" height="4" rx="1" stroke="currentColor" strokeWidth="1" />
    <path
      d="M3.5 4.5V3.5a1.5 1.5 0 013 0V4.5"
      stroke="currentColor"
      strokeWidth="1"
      strokeLinecap="round"
    />
  </svg>
);

const ChevronUpIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
    <path d="M3 8l3-3 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ChevronDownIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
    <path d="M3 4l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildOptionsPayload(form: FieldForm): Record<string, unknown> | undefined {
  const { fieldType } = form;

  if (fieldType === 'dropdown' || fieldType === 'multi_select') {
    const choices = form.choices.map((c) => c.trim()).filter(Boolean);
    return choices.length > 0 ? { choices } : undefined;
  }

  if (fieldType === 'number' || fieldType === 'currency') {
    const opts: Record<string, number> = {};
    if (form.min !== '') opts.min = Number(form.min);
    if (form.max !== '') opts.max = Number(form.max);
    if (form.precision !== '') opts.precision = Number(form.precision);
    return Object.keys(opts).length > 0 ? opts : undefined;
  }

  if (fieldType === 'text') {
    if (form.maxLength !== '') {
      return { max_length: Number(form.maxLength) };
    }
  }

  return undefined;
}

function formFromField(field: FieldDefinition): FieldForm {
  const opts = field.options ?? {};
  return {
    label: field.label,
    apiName: field.apiName,
    fieldType: field.fieldType,
    description: field.description ?? '',
    required: field.required,
    defaultValue: field.defaultValue ?? '',
    choices: Array.isArray(opts.choices) ? (opts.choices as string[]) : [''],
    min: typeof opts.min === 'number' ? String(opts.min) : '',
    max: typeof opts.max === 'number' ? String(opts.max) : '',
    precision: typeof opts.precision === 'number' ? String(opts.precision) : '',
    maxLength: typeof opts.max_length === 'number' ? String(opts.max_length) : '',
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export function FieldBuilderPage() {
  const { id: objectId } = useParams<{ id: string }>();
  const { sessionToken } = useSession();

  // Object + fields state
  const [objectDef, setObjectDef] = useState<ObjectDefinitionDetail | null>(null);
  const [fields, setFields] = useState<FieldDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Tab state
  const [activeTab, setActiveTab] = useState<TabName>('fields');

  // Add/edit modal state
  const [showFieldModal, setShowFieldModal] = useState(false);
  const [editingField, setEditingField] = useState<FieldDefinition | null>(null);
  const [fieldForm, setFieldForm] = useState<FieldForm>({ ...EMPTY_FORM });
  const [apiNameEdited, setApiNameEdited] = useState(false);
  const [fieldModalError, setFieldModalError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<FieldDefinition | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Reorder in-progress
  const [reordering, setReordering] = useState(false);

  // ── Fetch object definition ──────────────────────────────

  const fetchObject = useCallback(async () => {
    if (!sessionToken || !objectId) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/objects/${objectId}`, {
        headers: { Authorization: `Bearer ${sessionToken}` },
      });

      if (response.ok) {
        const data = (await response.json()) as ObjectDefinitionDetail;
        setObjectDef(data);
        setFields(data.fields ?? []);
      } else {
        setError('Failed to load object definition.');
      }
    } catch {
      setError('Failed to connect to the server. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [sessionToken, objectId]);

  useEffect(() => {
    void fetchObject();
  }, [fetchObject]);

  // ── Reorder handlers ─────────────────────────────────────

  const handleMoveField = async (index: number, direction: 'up' | 'down') => {
    if (!sessionToken || !objectId) return;

    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= fields.length) return;

    const newFields = [...fields];
    [newFields[index], newFields[swapIndex]] = [newFields[swapIndex], newFields[index]];
    setFields(newFields);

    setReordering(true);
    try {
      const response = await fetch(`/api/admin/objects/${objectId}/fields/reorder`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({ fieldIds: newFields.map((f) => f.id) }),
      });

      if (response.ok) {
        const updated = (await response.json()) as FieldDefinition[];
        setFields(updated);
      }
    } catch {
      // Revert on failure
      setFields(fields);
    } finally {
      setReordering(false);
    }
  };

  // ── Add field modal handlers ─────────────────────────────

  const openAddFieldModal = () => {
    setEditingField(null);
    setFieldForm({ ...EMPTY_FORM });
    setApiNameEdited(false);
    setFieldModalError(null);
    setShowFieldModal(true);
  };

  const openEditFieldModal = (field: FieldDefinition) => {
    setEditingField(field);
    setFieldForm(formFromField(field));
    setApiNameEdited(true);
    setFieldModalError(null);
    setShowFieldModal(true);
  };

  const closeFieldModal = () => {
    setShowFieldModal(false);
    setFieldModalError(null);
  };

  const handleFieldFormChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;

    setFieldForm((prev) => {
      const next = { ...prev, [name]: value };

      if (name === 'label' && !apiNameEdited) {
        next.apiName = slugify(value);
      }

      // Reset type-specific options when field_type changes
      if (name === 'fieldType') {
        next.choices = [''];
        next.min = '';
        next.max = '';
        next.precision = '';
        next.maxLength = '';
      }

      return next;
    });

    if (name === 'apiName') {
      setApiNameEdited(true);
    }

    setFieldModalError(null);
  };

  const handleToggleRequired = () => {
    setFieldForm((prev) => ({ ...prev, required: !prev.required }));
  };

  // ── Choices handlers ─────────────────────────────────────

  const handleChoiceChange = (index: number, value: string) => {
    setFieldForm((prev) => {
      const choices = [...prev.choices];
      choices[index] = value;
      return { ...prev, choices };
    });
  };

  const handleAddChoice = () => {
    setFieldForm((prev) => ({ ...prev, choices: [...prev.choices, ''] }));
  };

  const handleRemoveChoice = (index: number) => {
    setFieldForm((prev) => {
      const choices = prev.choices.filter((_, i) => i !== index);
      return { ...prev, choices: choices.length === 0 ? [''] : choices };
    });
  };

  // ── Submit field form ────────────────────────────────────

  const handleFieldSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldModalError(null);

    if (!sessionToken || !objectId) {
      setFieldModalError('Session unavailable. Please refresh and try again.');
      return;
    }

    const trimmedLabel = fieldForm.label.trim();
    if (!trimmedLabel) {
      setFieldModalError('Label is required');
      return;
    }

    const trimmedApiName = fieldForm.apiName.trim();
    if (!trimmedApiName) {
      setFieldModalError('API name is required');
      return;
    }

    if (!fieldForm.fieldType) {
      setFieldModalError('Field type is required');
      return;
    }

    // Validate choices for dropdown/multi_select
    if (fieldForm.fieldType === 'dropdown' || fieldForm.fieldType === 'multi_select') {
      const validChoices = fieldForm.choices.map((c) => c.trim()).filter(Boolean);
      if (validChoices.length === 0) {
        setFieldModalError('At least one choice is required for this field type');
        return;
      }
    }

    setSaving(true);

    const options = buildOptionsPayload(fieldForm);

    const payload: Record<string, unknown> = {
      label: trimmedLabel,
      fieldType: fieldForm.fieldType,
      description: fieldForm.description.trim() || undefined,
      required: fieldForm.required,
      defaultValue: fieldForm.defaultValue.trim() || undefined,
    };

    if (options) {
      payload.options = options;
    }

    try {
      if (editingField) {
        // Update existing field
        const response = await fetch(
          `/api/admin/objects/${objectId}/fields/${editingField.id}`,
          {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${sessionToken}`,
            },
            body: JSON.stringify(payload),
          },
        );

        if (response.ok) {
          setShowFieldModal(false);
          await fetchObject();
        } else {
          const data = (await response.json()) as ApiError;
          setFieldModalError(data.error ?? 'An unexpected error occurred');
        }
      } else {
        // Create new field
        payload.apiName = trimmedApiName;

        const response = await fetch(`/api/admin/objects/${objectId}/fields`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${sessionToken}`,
          },
          body: JSON.stringify(payload),
        });

        if (response.ok) {
          setShowFieldModal(false);
          await fetchObject();
        } else {
          const data = (await response.json()) as ApiError;
          setFieldModalError(data.error ?? 'An unexpected error occurred');
        }
      }
    } catch {
      setFieldModalError('Failed to connect to the server. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // ── Delete handlers ──────────────────────────────────────

  const openDeleteConfirm = (field: FieldDefinition) => {
    setDeleteTarget(field);
    setDeleteError(null);
  };

  const closeDeleteConfirm = () => {
    setDeleteTarget(null);
    setDeleteError(null);
  };

  const handleDelete = async () => {
    if (!deleteTarget || !sessionToken || !objectId) return;

    setDeleting(true);
    setDeleteError(null);

    try {
      const response = await fetch(
        `/api/admin/objects/${objectId}/fields/${deleteTarget.id}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${sessionToken}` },
        },
      );

      if (response.ok || response.status === 204) {
        setDeleteTarget(null);
        await fetchObject();
      } else {
        const data = (await response.json()) as ApiError;
        setDeleteError(data.error ?? 'Failed to delete field');
      }
    } catch {
      setDeleteError('Failed to connect to the server. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  // ── Render helpers ───────────────────────────────────────

  const showChoicesEditor =
    fieldForm.fieldType === 'dropdown' || fieldForm.fieldType === 'multi_select';
  const showNumberOptions =
    fieldForm.fieldType === 'number' || fieldForm.fieldType === 'currency';
  const showTextOptions = fieldForm.fieldType === 'text';

  if (loading) {
    return <div className={styles.page}>Loading…</div>;
  }

  if (error) {
    return (
      <div className={styles.page}>
        <p role="alert" className={styles.errorAlert}>
          {error}
        </p>
      </div>
    );
  }

  if (!objectDef) {
    return (
      <div className={styles.page}>
        <p role="alert" className={styles.errorAlert}>
          Object not found.
        </p>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────

  return (
    <div className={styles.page}>
      {/* Breadcrumb */}
      <nav className={styles.breadcrumb} aria-label="Breadcrumb">
        <Link to="/admin/objects" className={styles.breadcrumbLink}>
          Object Manager
        </Link>
        <span className={styles.breadcrumbSep} aria-hidden="true">
          /
        </span>
        <span className={styles.breadcrumbCurrent}>{objectDef.label}</span>
      </nav>

      {/* Object header */}
      <div className={styles.objectHeader}>
        <span className={styles.objectIcon}>{objectDef.icon ?? '📦'}</span>
        <div className={styles.objectMeta}>
          <h1 className={styles.objectLabel}>{objectDef.label}</h1>
          <code className={styles.objectApiName}>{objectDef.apiName}</code>
          {objectDef.description && (
            <p className={styles.objectDescription}>{objectDef.description}</p>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className={styles.tabs} role="tablist" aria-label="Object sections">
        <button
          role="tab"
          aria-selected={activeTab === 'fields'}
          className={`${styles.tab} ${activeTab === 'fields' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('fields')}
        >
          Fields
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'relationships'}
          className={`${styles.tab} ${activeTab === 'relationships' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('relationships')}
        >
          Relationships
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'layouts'}
          className={`${styles.tab} ${activeTab === 'layouts' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('layouts')}
        >
          Layouts
        </button>
      </div>

      {/* Fields tab */}
      {activeTab === 'fields' && (
        <>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>
              Fields
              <span className={styles.fieldCount}>({fields.length})</span>
            </h2>
            <PrimaryButton size="sm" onClick={openAddFieldModal}>
              <PlusIcon />
              Add field
            </PrimaryButton>
          </div>

          {fields.length === 0 && (
            <div className={styles.emptyState}>
              <h3 className={styles.emptyTitle}>No fields yet</h3>
              <p className={styles.emptyText}>
                Add your first field to define the data structure for this object.
              </p>
            </div>
          )}

          {fields.length > 0 && (
            <div className={styles.tableCard}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.th}>Label</th>
                    <th className={styles.th}>API Name</th>
                    <th className={styles.th}>Type</th>
                    <th className={styles.th}>Required</th>
                    <th className={styles.th}>Status</th>
                    <th className={`${styles.th} ${styles.thActions}`}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {fields.map((field, index) => (
                    <tr
                      key={field.id}
                      className={styles.tr}
                      onClick={() => {
                        if (!field.isSystem) {
                          openEditFieldModal(field);
                        }
                      }}
                    >
                      <td className={styles.td}>
                        <span className={styles.fieldLabel}>{field.label}</span>
                      </td>
                      <td className={styles.td}>
                        <code className={styles.apiName}>{field.apiName}</code>
                      </td>
                      <td className={styles.td}>
                        <span className={styles.typeBadge}>{field.fieldType}</span>
                      </td>
                      <td className={styles.td}>
                        {field.required && (
                          <span className={styles.requiredBadge}>Required</span>
                        )}
                      </td>
                      <td className={styles.td}>
                        {field.isSystem && (
                          <span className={styles.systemBadge}>
                            <LockIcon />
                            System
                          </span>
                        )}
                      </td>
                      <td className={styles.td} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.actionCell}>
                          <div className={styles.reorderButtons}>
                            <button
                              type="button"
                              className={styles.reorderButton}
                              aria-label={`Move ${field.label} up`}
                              disabled={index === 0 || reordering}
                              onClick={() => void handleMoveField(index, 'up')}
                            >
                              <ChevronUpIcon />
                            </button>
                            <button
                              type="button"
                              className={styles.reorderButton}
                              aria-label={`Move ${field.label} down`}
                              disabled={index === fields.length - 1 || reordering}
                              onClick={() => void handleMoveField(index, 'down')}
                            >
                              <ChevronDownIcon />
                            </button>
                          </div>
                          {!field.isSystem && (
                            <button
                              type="button"
                              className={styles.deleteButton}
                              aria-label={`Delete ${field.label}`}
                              onClick={() => openDeleteConfirm(field)}
                            >
                              <TrashIcon />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Relationships tab */}
      {activeTab === 'relationships' && (
        <div className={styles.placeholderCard}>
          <p className={styles.placeholderText}>
            Relationship management coming soon.
          </p>
        </div>
      )}

      {/* Layouts tab */}
      {activeTab === 'layouts' && (
        <div className={styles.placeholderCard}>
          <p className={styles.placeholderText}>
            Layout builder coming soon.
          </p>
        </div>
      )}

      {/* ── Add/Edit Field Modal ─────────────────────────────── */}

      {showFieldModal && (
        <div
          className={styles.overlay}
          onClick={closeFieldModal}
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
              onSubmit={(e) => void handleFieldSubmit(e)}
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
                  onChange={handleFieldFormChange}
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
                  onChange={handleFieldFormChange}
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
                  onChange={handleFieldFormChange}
                  disabled={saving}
                >
                  {FIELD_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
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
                          onChange={(e) => handleChoiceChange(index, e.target.value)}
                          placeholder={`Choice ${index + 1}`}
                          disabled={saving}
                        />
                        <button
                          type="button"
                          className={styles.removeChoiceButton}
                          aria-label={`Remove choice ${index + 1}`}
                          onClick={() => handleRemoveChoice(index)}
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
                    onClick={handleAddChoice}
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
                      onChange={handleFieldFormChange}
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
                      onChange={handleFieldFormChange}
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
                      onChange={handleFieldFormChange}
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
                    onChange={handleFieldFormChange}
                    placeholder="e.g. 255"
                    disabled={saving}
                  />
                </div>
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
                  onChange={handleFieldFormChange}
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
                    onClick={handleToggleRequired}
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
                  onChange={handleFieldFormChange}
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
                  onClick={closeFieldModal}
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
      )}

      {/* ── Delete Confirmation Modal ────────────────────────── */}

      {deleteTarget && (
        <div
          className={styles.overlay}
          onClick={closeDeleteConfirm}
          role="dialog"
          aria-modal="true"
          aria-label="Confirm delete"
        >
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Delete field</h2>
            <p className={styles.confirmText}>
              Are you sure you want to delete{' '}
              <span className={styles.confirmName}>{deleteTarget.label}</span>? This will
              remove the field from all layouts.
            </p>

            {deleteError && (
              <p className={styles.errorAlert} role="alert">
                {deleteError}
              </p>
            )}

            <div className={styles.actions}>
              <PrimaryButton
                type="button"
                variant="outline"
                onClick={closeDeleteConfirm}
                disabled={deleting}
              >
                Cancel
              </PrimaryButton>
              <PrimaryButton
                type="button"
                onClick={() => void handleDelete()}
                disabled={deleting}
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </PrimaryButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
