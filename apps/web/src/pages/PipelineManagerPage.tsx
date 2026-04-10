import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '@descope/react-sdk';
import { useApiClient } from '../lib/apiClient.js';
import { PrimaryButton } from '../components/PrimaryButton.js';
import { slugify } from '../utils.js';
import styles from './PipelineManagerPage.module.css';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PipelineListItem {
  id: string;
  name: string;
  apiName: string;
  objectId: string;
  description?: string;
  isDefault: boolean;
  isSystem: boolean;
  stageCount?: number;
  recordCount?: number;
  objectLabel?: string;
}

interface ObjectOption {
  id: string;
  label: string;
  pluralLabel: string;
}

interface CreatePipelineForm {
  name: string;
  apiName: string;
  objectId: string;
  description: string;
}

interface ApiError {
  error: string;
}

// ─── Icons ────────────────────────────────────────────────────────────────────

const PlusIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
    <path d="M3 6h6M6 3v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
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

export function PipelineManagerPage() {
  const { sessionToken } = useSession();
  const api = useApiClient();
  const navigate = useNavigate();

  // List state
  const [pipelines, setPipelines] = useState<PipelineListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Object options for create form
  const [objects, setObjects] = useState<ObjectOption[]>([]);

  // Create modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState<CreatePipelineForm>({
    name: '',
    apiName: '',
    objectId: '',
    description: '',
  });
  const [apiNameEdited, setApiNameEdited] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // ── Fetch pipelines ────────────────────────────────────────

  const fetchPipelines = useCallback(async () => {
    if (!sessionToken) return;

    setLoading(true);
    setError(null);

    try {
      const response = await api.request('/api/admin/pipelines');

      if (response.ok) {
        const data = (await response.json()) as PipelineListItem[];
        setPipelines(data);
      } else {
        setError('Failed to load pipelines.');
      }
    } catch {
      setError('Failed to connect to the server. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [sessionToken, api]);

  // ── Fetch objects for create form ──────────────────────────

  const fetchObjects = useCallback(async () => {
    if (!sessionToken) return;

    try {
      const response = await api.request('/api/admin/objects');

      if (response.ok) {
        const data = (await response.json()) as ObjectOption[];
        setObjects(data);
      }
    } catch {
      // Object fetch is best-effort
    }
  }, [sessionToken, api]);

  useEffect(() => {
    void fetchPipelines();
    void fetchObjects();
  }, [fetchPipelines, fetchObjects]);

  // ── Create modal handlers ─────────────────────────────────

  const openCreateModal = () => {
    setCreateForm({ name: '', apiName: '', objectId: '', description: '' });
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

      if (name === 'name' && !apiNameEdited) {
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

    const trimmedName = createForm.name.trim();
    if (!trimmedName) {
      setCreateError('Name is required');
      return;
    }

    const trimmedApiName = createForm.apiName.trim();
    if (!trimmedApiName) {
      setCreateError('API name is required');
      return;
    }

    if (!createForm.objectId) {
      setCreateError('Object is required');
      return;
    }

    setCreating(true);

    try {
      const response = await api.request('/api/admin/pipelines', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: trimmedName,
          api_name: trimmedApiName,
          object_id: createForm.objectId,
          description: createForm.description.trim() || undefined,
        }),
      });

      if (response.ok) {
        setShowCreateModal(false);
        await fetchPipelines();
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

  // ── Render ────────────────────────────────────────────────

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Pipeline Manager</h1>
          <p className={styles.pageSubtitle}>
            Manage pipelines, stages, and qualification gates
          </p>
        </div>
        <PrimaryButton size="sm" onClick={openCreateModal}>
          <PlusIcon />
          Create pipeline
        </PrimaryButton>
      </div>

      {error && (
        <p role="alert" className={styles.errorAlert}>
          {error}
        </p>
      )}

      {!loading && !error && pipelines.length === 0 && (
        <div className={styles.emptyState}>
          <div className={styles.iconWrap} aria-hidden="true">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path
                d="M3 12h4l3-9 4 18 3-9h4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h2 className={styles.emptyTitle}>No pipelines yet</h2>
          <p className={styles.emptyText}>
            Create your first pipeline to define stages for tracking records through your workflow.
          </p>
        </div>
      )}

      {!loading && !error && pipelines.length > 0 && (
        <div className={styles.cardGrid}>
          {pipelines.map((pipeline) => (
            <div
              key={pipeline.id}
              className={styles.card}
              onClick={() => void navigate(`/admin/pipelines/${pipeline.id}`)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  void navigate(`/admin/pipelines/${pipeline.id}`);
                }
              }}
            >
              <div className={styles.cardHeader}>
                <span className={styles.cardName}>{pipeline.name}</span>
                {pipeline.isSystem && (
                  <span className={styles.systemBadge}>
                    <LockIcon />
                    System
                  </span>
                )}
              </div>
              <div className={styles.cardApiName}>{pipeline.apiName}</div>
              {pipeline.description && (
                <div className={styles.cardDescription}>{pipeline.description}</div>
              )}
              <div className={styles.cardStats}>
                {pipeline.objectLabel && (
                  <span className={styles.cardStat}>
                    Object: <span className={styles.cardStatValue}>{pipeline.objectLabel}</span>
                  </span>
                )}
                {pipeline.stageCount !== undefined && (
                  <span className={styles.cardStat}>
                    Stages: <span className={styles.cardStatValue}>{pipeline.stageCount}</span>
                  </span>
                )}
                {pipeline.recordCount !== undefined && (
                  <span className={styles.cardStat}>
                    Records: <span className={styles.cardStatValue}>{pipeline.recordCount}</span>
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Create Pipeline Modal ────────────────────────────── */}

      {showCreateModal && (
        <div
          className={styles.overlay}
          onClick={closeCreateModal}
          role="dialog"
          aria-modal="true"
          aria-label="Create pipeline"
        >
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Create pipeline</h2>

            <form
              className={styles.form}
              noValidate
              onSubmit={(e) => void handleCreateSubmit(e)}
            >
              <div className={styles.field}>
                <label
                  className={`${styles.label} ${styles.labelRequired}`}
                  htmlFor="create-name"
                >
                  Name
                </label>
                <input
                  id="create-name"
                  name="name"
                  type="text"
                  className={styles.input}
                  value={createForm.name}
                  onChange={handleCreateFieldChange}
                  placeholder="e.g. Sales Pipeline"
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
                  placeholder="e.g. sales_pipeline"
                  maxLength={100}
                  disabled={creating}
                />
                <span className={styles.fieldHint}>
                  Auto-generated from name. Must be lowercase snake_case.
                </span>
              </div>

              <div className={styles.field}>
                <label
                  className={`${styles.label} ${styles.labelRequired}`}
                  htmlFor="create-objectId"
                >
                  Object
                </label>
                <select
                  id="create-objectId"
                  name="objectId"
                  className={styles.select}
                  value={createForm.objectId}
                  onChange={handleCreateFieldChange}
                  disabled={creating}
                >
                  <option value="">Select an object…</option>
                  {objects.map((obj) => (
                    <option key={obj.id} value={obj.id}>
                      {obj.label}
                    </option>
                  ))}
                </select>
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
                  placeholder="What is this pipeline used for?"
                  disabled={creating}
                />
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
                  {creating ? 'Creating…' : 'Create pipeline'}
                </PrimaryButton>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
