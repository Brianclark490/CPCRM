import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSession } from '@descope/react-sdk';
import { PrimaryButton } from '../components/PrimaryButton.js';
import { ObjectIcon } from '../components/ObjectIcon.js';
import { slugify } from '../utils.js';
import styles from './ObjectManagerPage.module.css';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ObjectDefinitionListItem {
  id: string;
  apiName: string;
  label: string;
  pluralLabel: string;
  description?: string;
  icon?: string;
  isSystem: boolean;
  fieldCount: number;
  recordCount: number;
}

interface CreateObjectForm {
  label: string;
  pluralLabel: string;
  apiName: string;
  description: string;
  icon: string;
}

interface ApiError {
  error: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ICON_OPTIONS = [
  { value: '', label: 'None' },
  { value: '📦', label: '📦 Package' },
  { value: '👤', label: '👤 Person' },
  { value: '🏢', label: '🏢 Building' },
  { value: '💼', label: '💼 Briefcase' },
  { value: '📋', label: '📋 Clipboard' },
  { value: '🎯', label: '🎯 Target' },
  { value: '💰', label: '💰 Money' },
  { value: '📊', label: '📊 Chart' },
  { value: '🔧', label: '🔧 Wrench' },
  { value: '⭐', label: '⭐ Star' },
  { value: '📝', label: '📝 Note' },
  { value: '🗂️', label: '🗂️ Folder' },
];

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

// ─── Component ────────────────────────────────────────────────────────────────

export function ObjectManagerPage() {
  const { sessionToken } = useSession();
  const navigate = useNavigate();

  // List state
  const [objects, setObjects] = useState<ObjectDefinitionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState<CreateObjectForm>({
    label: '',
    pluralLabel: '',
    apiName: '',
    description: '',
    icon: '',
  });
  const [apiNameEdited, setApiNameEdited] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<ObjectDefinitionListItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // ── Fetch objects ─────────────────────────────────────────

  const fetchObjects = useCallback(async () => {
    if (!sessionToken) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/objects', {
        headers: { Authorization: `Bearer ${sessionToken}` },
      });

      if (response.ok) {
        const data = (await response.json()) as ObjectDefinitionListItem[];
        setObjects(data);
      } else {
        setError('Failed to load object definitions.');
      }
    } catch {
      setError('Failed to connect to the server. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [sessionToken]);

  useEffect(() => {
    void fetchObjects();
  }, [fetchObjects]);

  // ── Create modal handlers ─────────────────────────────────

  const openCreateModal = () => {
    setCreateForm({ label: '', pluralLabel: '', apiName: '', description: '', icon: '' });
    setApiNameEdited(false);
    setCreateError(null);
    setShowCreateModal(true);
  };

  const closeCreateModal = () => {
    setShowCreateModal(false);
    setCreateError(null);
  };

  const handleCreateFieldChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;

    setCreateForm((prev) => {
      const next = { ...prev, [name]: value };

      // Auto-generate api_name from label unless user has edited it manually
      if (name === 'label' && !apiNameEdited) {
        next.apiName = slugify(value);
      }

      return next;
    });

    if (name === 'apiName') {
      setApiNameEdited(true);
    }

    setCreateError(null);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);

    if (!sessionToken) {
      setCreateError('Session unavailable. Please refresh and try again.');
      return;
    }

    const trimmedLabel = createForm.label.trim();
    if (!trimmedLabel) {
      setCreateError('Label is required');
      return;
    }

    const trimmedPluralLabel = createForm.pluralLabel.trim();
    if (!trimmedPluralLabel) {
      setCreateError('Plural label is required');
      return;
    }

    const trimmedApiName = createForm.apiName.trim();
    if (!trimmedApiName) {
      setCreateError('API name is required');
      return;
    }

    setCreating(true);

    try {
      const response = await fetch('/api/admin/objects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({
          label: trimmedLabel,
          pluralLabel: trimmedPluralLabel,
          apiName: trimmedApiName,
          description: createForm.description.trim() || undefined,
          icon: createForm.icon || undefined,
        }),
      });

      if (response.ok) {
        setShowCreateModal(false);
        await fetchObjects();
      } else {
        const data = (await response.json()) as ApiError;
        setCreateError(data.error ?? 'An unexpected error occurred');
      }
    } catch {
      setCreateError('Failed to connect to the server. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  // ── Delete handlers ───────────────────────────────────────

  const openDeleteConfirm = (obj: ObjectDefinitionListItem) => {
    setDeleteTarget(obj);
    setDeleteError(null);
  };

  const closeDeleteConfirm = () => {
    setDeleteTarget(null);
    setDeleteError(null);
  };

  const handleDelete = async () => {
    if (!deleteTarget || !sessionToken) return;

    setDeleting(true);
    setDeleteError(null);

    try {
      const response = await fetch(`/api/admin/objects/${deleteTarget.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${sessionToken}` },
      });

      if (response.ok || response.status === 204) {
        setDeleteTarget(null);
        await fetchObjects();
      } else {
        const data = (await response.json()) as ApiError;
        setDeleteError(data.error ?? 'Failed to delete object');
      }
    } catch {
      setDeleteError('Failed to connect to the server. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  // ── Render ────────────────────────────────────────────────

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Object Manager</h1>
          <p className={styles.pageSubtitle}>
            Manage object definitions, fields, and layouts
          </p>
        </div>
        <PrimaryButton size="sm" onClick={openCreateModal}>
          <PlusIcon />
          Create object
        </PrimaryButton>
      </div>

      {error && (
        <p role="alert" className={styles.errorAlert}>
          {error}
        </p>
      )}

      {!loading && !error && objects.length === 0 && (
        <div className={styles.emptyState}>
          <div className={styles.iconWrap} aria-hidden="true">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <rect
                x="3"
                y="3"
                width="18"
                height="18"
                rx="3"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <path
                d="M12 8v8M8 12h8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <h2 className={styles.emptyTitle}>No object definitions yet</h2>
          <p className={styles.emptyText}>
            Create your first custom object to start building your data model.
          </p>
        </div>
      )}

      {!loading && !error && objects.length > 0 && (
        <div className={styles.tableCard}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Icon</th>
                <th className={styles.th}>Label</th>
                <th className={styles.th}>API Name</th>
                <th className={styles.th}>Fields</th>
                <th className={styles.th}>Records</th>
                <th className={styles.th}>Type</th>
                <th className={`${styles.th} ${styles.thActions}`}></th>
              </tr>
            </thead>
            <tbody>
              {objects.map((obj) => (
                <tr
                  key={obj.id}
                  className={styles.tr}
                  onClick={() => void navigate(`/admin/objects/${obj.id}`)}
                >
                  <td className={styles.td}>
                    <ObjectIcon icon={obj.icon ?? ''} size={20} />
                  </td>
                  <td className={styles.td}>
                    <Link
                      to={`/admin/objects/${obj.id}`}
                      className={styles.nameLink}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {obj.label}
                    </Link>
                  </td>
                  <td className={styles.td}>
                    <code className={styles.apiName}>{obj.apiName}</code>
                  </td>
                  <td className={styles.td}>{obj.fieldCount}</td>
                  <td className={styles.td}>{obj.recordCount}</td>
                  <td className={styles.td}>
                    {obj.isSystem && (
                      <span className={styles.systemBadge}>
                        <LockIcon />
                        System
                      </span>
                    )}
                  </td>
                  <td className={styles.td}>
                    {!obj.isSystem && (
                      <button
                        type="button"
                        className={styles.deleteButton}
                        aria-label={`Delete ${obj.label}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          openDeleteConfirm(obj);
                        }}
                      >
                        <TrashIcon />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Create Object Modal ──────────────────────────────── */}

      {showCreateModal && (
        <div
          className={styles.overlay}
          onClick={closeCreateModal}
          role="dialog"
          aria-modal="true"
          aria-label="Create object"
        >
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Create object</h2>

            <form
              className={styles.form}
              noValidate
              onSubmit={(e) => void handleCreateSubmit(e)}
            >
              <div className={styles.field}>
                <label
                  className={`${styles.label} ${styles.labelRequired}`}
                  htmlFor="create-label"
                >
                  Label
                </label>
                <input
                  id="create-label"
                  name="label"
                  type="text"
                  className={styles.input}
                  value={createForm.label}
                  onChange={handleCreateFieldChange}
                  placeholder="e.g. Custom Project"
                  maxLength={255}
                  disabled={creating}
                />
              </div>

              <div className={styles.field}>
                <label
                  className={`${styles.label} ${styles.labelRequired}`}
                  htmlFor="create-pluralLabel"
                >
                  Plural label
                </label>
                <input
                  id="create-pluralLabel"
                  name="pluralLabel"
                  type="text"
                  className={styles.input}
                  value={createForm.pluralLabel}
                  onChange={handleCreateFieldChange}
                  placeholder="e.g. Custom Projects"
                  maxLength={255}
                  disabled={creating}
                />
              </div>

              <div className={styles.field}>
                <label
                  className={`${styles.label} ${styles.labelRequired}`}
                  htmlFor="create-apiName"
                >
                  API name
                </label>
                <input
                  id="create-apiName"
                  name="apiName"
                  type="text"
                  className={styles.input}
                  value={createForm.apiName}
                  onChange={handleCreateFieldChange}
                  placeholder="e.g. custom_project"
                  maxLength={50}
                  disabled={creating}
                />
                <span className={styles.fieldHint}>
                  Auto-generated from label. Must be lowercase snake_case.
                </span>
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="create-description">
                  Description
                </label>
                <textarea
                  id="create-description"
                  name="description"
                  className={styles.textarea}
                  value={createForm.description}
                  onChange={handleCreateFieldChange}
                  placeholder="What does this object represent?"
                  disabled={creating}
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="create-icon">
                  Icon
                </label>
                <select
                  id="create-icon"
                  name="icon"
                  className={styles.select}
                  value={createForm.icon}
                  onChange={handleCreateFieldChange}
                  disabled={creating}
                >
                  {ICON_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {createError && (
                <p className={styles.errorAlert} role="alert">
                  {createError}
                </p>
              )}

              <hr className={styles.divider} />

              <div className={styles.actions}>
                <PrimaryButton
                  type="button"
                  variant="outline"
                  onClick={closeCreateModal}
                  disabled={creating}
                >
                  Cancel
                </PrimaryButton>
                <PrimaryButton type="submit" disabled={creating}>
                  {creating ? 'Creating…' : 'Create object'}
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
            <h2 className={styles.modalTitle}>Delete object</h2>
            <p className={styles.confirmText}>
              Are you sure you want to delete{' '}
              <span className={styles.confirmName}>{deleteTarget.label}</span>? This action
              cannot be undone and will remove all associated fields and layouts.
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
