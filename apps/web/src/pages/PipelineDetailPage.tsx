import { useState, useEffect, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useSession } from '@descope/react-sdk';
import { useApiClient } from '../lib/apiClient.js';
import { PrimaryButton } from '../components/PrimaryButton.js';
import { slugify } from '../utils.js';
import styles from './PipelineDetailPage.module.css';

// ─── Types ────────────────────────────────────────────────────────────────────

interface StageGate {
  id: string;
  stageId: string;
  field: {
    id: string;
    label: string;
    fieldType: string;
  };
  gateType: string;
  gateValue: string | null;
  errorMessage: string | null;
}

interface StageDefinition {
  id: string;
  pipelineId: string;
  name: string;
  apiName: string;
  sortOrder: number;
  stageType: string;
  colour: string;
  defaultProbability?: number;
  expectedDays?: number;
  description?: string;
  gates: Array<{
    id: string;
    stageId: string;
    fieldId: string;
    gateType: string;
    gateValue?: string;
    errorMessage?: string;
  }>;
}

interface PipelineDetail {
  id: string;
  objectId: string;
  name: string;
  apiName: string;
  description?: string;
  isDefault: boolean;
  isSystem: boolean;
  stages: StageDefinition[];
}

interface FieldOption {
  id: string;
  label: string;
  fieldType: string;
}

interface ApiError {
  error: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const COLOUR_OPTIONS: { name: string; bg: string }[] = [
  { name: 'blue', bg: 'rgba(59, 130, 246, 0.25)' },
  { name: 'green', bg: 'rgba(16, 185, 129, 0.25)' },
  { name: 'yellow', bg: 'rgba(245, 158, 11, 0.25)' },
  { name: 'orange', bg: 'rgba(249, 115, 22, 0.25)' },
  { name: 'red', bg: 'rgba(239, 68, 68, 0.25)' },
  { name: 'purple', bg: 'rgba(139, 92, 246, 0.25)' },
  { name: 'pink', bg: 'rgba(236, 72, 153, 0.25)' },
  { name: 'teal', bg: 'rgba(20, 184, 166, 0.25)' },
  { name: 'indigo', bg: 'rgba(99, 102, 241, 0.25)' },
  { name: 'gray', bg: 'rgba(107, 114, 128, 0.25)' },
];

const GATE_TYPE_OPTIONS = [
  { value: 'required', label: 'Required' },
  { value: 'min_value', label: 'Minimum value' },
  { value: 'specific_value', label: 'Specific value' },
];

function colourToBg(colour: string): string {
  const found = COLOUR_OPTIONS.find((c) => c.name === colour);
  return found?.bg ?? 'rgba(107, 114, 128, 0.25)';
}

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

const ChevronLeftIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path d="M9 3L5 7l4 4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ChevronRightIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const XIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
    <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
  </svg>
);

// ─── Component ────────────────────────────────────────────────────────────────

export function PipelineDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { sessionToken } = useSession();
  const api = useApiClient();

  // Pipeline state
  const [pipeline, setPipeline] = useState<PipelineDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Selected stage
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);

  // Stage edit form
  const [stageEditName, setStageEditName] = useState('');
  const [stageEditColour, setStageEditColour] = useState('');
  const [stageEditProbability, setStageEditProbability] = useState('');
  const [stageEditDays, setStageEditDays] = useState('');
  const [stageEditDescription, setStageEditDescription] = useState('');
  const [stageEditType, setStageEditType] = useState('');
  const [stageSaving, setStageSaving] = useState(false);
  const [stageError, setStageError] = useState<string | null>(null);

  // Add stage modal
  const [showAddStageModal, setShowAddStageModal] = useState(false);
  const [newStageName, setNewStageName] = useState('');
  const [newStageApiName, setNewStageApiName] = useState('');
  const [newStageApiNameEdited, setNewStageApiNameEdited] = useState(false);
  const [newStageColour, setNewStageColour] = useState('blue');
  const [newStageProbability, setNewStageProbability] = useState('');
  const [newStageDays, setNewStageDays] = useState('');
  const [addingStage, setAddingStage] = useState(false);
  const [addStageError, setAddStageError] = useState<string | null>(null);

  // Delete stage confirmation
  const [deleteStageTarget, setDeleteStageTarget] = useState<StageDefinition | null>(null);
  const [deletingStage, setDeletingStage] = useState(false);
  const [deleteStageError, setDeleteStageError] = useState<string | null>(null);

  // Gate state
  const [gates, setGates] = useState<StageGate[]>([]);
  const [gatesLoading, setGatesLoading] = useState(false);
  const [fields, setFields] = useState<FieldOption[]>([]);

  // Add gate form
  const [gateFieldId, setGateFieldId] = useState('');
  const [gateType, setGateType] = useState('');
  const [gateValue, setGateValue] = useState('');
  const [gateErrorMessage, setGateErrorMessage] = useState('');
  const [addingGate, setAddingGate] = useState(false);
  const [gateError, setGateError] = useState<string | null>(null);

  // ── Fetch pipeline detail ──────────────────────────────────

  const fetchPipeline = useCallback(async () => {
    if (!sessionToken || !id) return;

    setLoading(true);
    setError(null);

    try {
      const response = await api.request(`/api/admin/pipelines/${id}`);

      if (response.ok) {
        const data = (await response.json()) as PipelineDetail;
        setPipeline(data);
      } else if (response.status === 404) {
        setError('Pipeline not found.');
      } else {
        setError('Failed to load pipeline.');
      }
    } catch {
      setError('Failed to connect to the server. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [sessionToken, api, id]);

  useEffect(() => {
    void fetchPipeline();
  }, [fetchPipeline]);

  // ── Fetch fields for the pipeline's object (for gates) ─────

  const fetchFields = useCallback(async () => {
    if (!sessionToken || !pipeline?.objectId) return;

    try {
      const response = await api.request(`/api/admin/objects/${pipeline.objectId}/fields`);

      if (response.ok) {
        const data = (await response.json()) as FieldOption[];
        setFields(data);
      }
    } catch {
      // Best-effort
    }
  }, [sessionToken, api, pipeline?.objectId]);

  useEffect(() => {
    void fetchFields();
  }, [fetchFields]);

  // ── Fetch gates for selected stage ─────────────────────────

  const fetchGates = useCallback(async (stageId: string) => {
    if (!sessionToken) return;

    setGatesLoading(true);

    try {
      const response = await api.request(`/api/admin/stages/${stageId}/gates`);

      if (response.ok) {
        const data = (await response.json()) as StageGate[];
        setGates(data);
      }
    } catch {
      // Best-effort
    } finally {
      setGatesLoading(false);
    }
  }, [sessionToken, api]);

  // ── Select a stage ─────────────────────────────────────────

  const selectStage = (stage: StageDefinition) => {
    setSelectedStageId(stage.id);
    setStageEditName(stage.name);
    setStageEditColour(stage.colour);
    setStageEditProbability(stage.defaultProbability?.toString() ?? '');
    setStageEditDays(stage.expectedDays?.toString() ?? '');
    setStageEditDescription(stage.description ?? '');
    setStageEditType(stage.stageType);
    setStageError(null);
    setGateError(null);
    resetGateForm();
    void fetchGates(stage.id);
  };

  const selectedStage = pipeline?.stages.find((s) => s.id === selectedStageId) ?? null;

  // ── Update stage ───────────────────────────────────────────

  const handleSaveStage = async () => {
    if (!sessionToken || !pipeline || !selectedStageId) return;

    setStageSaving(true);
    setStageError(null);

    try {
      const response = await api.request(
        `/api/admin/pipelines/${pipeline.id}/stages/${selectedStageId}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: stageEditName.trim(),
            colour: stageEditColour,
            default_probability: stageEditProbability ? Number(stageEditProbability) : null,
            expected_days: stageEditDays ? Number(stageEditDays) : null,
            description: stageEditDescription.trim() || null,
            stage_type: stageEditType,
          }),
        },
      );

      if (response.ok) {
        await fetchPipeline();
      } else {
        const data = (await response.json()) as ApiError;
        setStageError(data.error ?? 'Failed to update stage');
      }
    } catch {
      setStageError('Failed to connect to the server.');
    } finally {
      setStageSaving(false);
    }
  };

  // ── Add stage ──────────────────────────────────────────────

  const openAddStageModal = () => {
    setNewStageName('');
    setNewStageApiName('');
    setNewStageApiNameEdited(false);
    setNewStageColour('blue');
    setNewStageProbability('');
    setNewStageDays('');
    setAddStageError(null);
    setShowAddStageModal(true);
  };

  const handleAddStageSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionToken || !pipeline) return;

    const trimmedName = newStageName.trim();
    if (!trimmedName) {
      setAddStageError('Name is required');
      return;
    }

    const trimmedApiName = newStageApiName.trim();
    if (!trimmedApiName) {
      setAddStageError('API name is required');
      return;
    }

    setAddingStage(true);
    setAddStageError(null);

    try {
      const response = await api.request(`/api/admin/pipelines/${pipeline.id}/stages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: trimmedName,
          api_name: trimmedApiName,
          stage_type: 'open',
          colour: newStageColour,
          default_probability: newStageProbability ? Number(newStageProbability) : undefined,
          expected_days: newStageDays ? Number(newStageDays) : undefined,
        }),
      });

      if (response.ok) {
        setShowAddStageModal(false);
        await fetchPipeline();
      } else {
        const data = (await response.json()) as ApiError;
        setAddStageError(data.error ?? 'Failed to add stage');
      }
    } catch {
      setAddStageError('Failed to connect to the server.');
    } finally {
      setAddingStage(false);
    }
  };

  // ── Delete stage ───────────────────────────────────────────

  const handleDeleteStage = async () => {
    if (!sessionToken || !pipeline || !deleteStageTarget) return;

    setDeletingStage(true);
    setDeleteStageError(null);

    try {
      const response = await api.request(
        `/api/admin/pipelines/${pipeline.id}/stages/${deleteStageTarget.id}`,
        {
          method: 'DELETE',
        },
      );

      if (response.ok || response.status === 204) {
        setDeleteStageTarget(null);
        if (selectedStageId === deleteStageTarget.id) {
          setSelectedStageId(null);
        }
        await fetchPipeline();
      } else {
        const data = (await response.json()) as ApiError;
        setDeleteStageError(data.error ?? 'Failed to delete stage');
      }
    } catch {
      setDeleteStageError('Failed to connect to the server.');
    } finally {
      setDeletingStage(false);
    }
  };

  // ── Reorder stages ─────────────────────────────────────────

  const handleReorder = async (stageId: string, direction: 'left' | 'right') => {
    if (!sessionToken || !pipeline) return;

    const stages = [...pipeline.stages].sort((a, b) => a.sortOrder - b.sortOrder);
    const openStages = stages.filter((s) => s.stageType === 'open');
    const terminalStages = stages.filter((s) => s.stageType !== 'open');

    const idx = openStages.findIndex((s) => s.id === stageId);
    if (idx < 0) return;

    if (direction === 'left' && idx > 0) {
      [openStages[idx - 1], openStages[idx]] = [openStages[idx], openStages[idx - 1]];
    } else if (direction === 'right' && idx < openStages.length - 1) {
      [openStages[idx], openStages[idx + 1]] = [openStages[idx + 1], openStages[idx]];
    } else {
      return;
    }

    const reorderedIds = [...openStages.map((s) => s.id), ...terminalStages.map((s) => s.id)];

    try {
      await api.request(`/api/admin/pipelines/${pipeline.id}/stages/reorder`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ stage_ids: reorderedIds }),
      });

      await fetchPipeline();
    } catch {
      // Best-effort
    }
  };

  // ── Gate management ────────────────────────────────────────

  const resetGateForm = () => {
    setGateFieldId('');
    setGateType('');
    setGateValue('');
    setGateErrorMessage('');
    setGateError(null);
  };

  const handleAddGate = async () => {
    if (!sessionToken || !selectedStageId) return;

    if (!gateFieldId) {
      setGateError('Field is required');
      return;
    }
    if (!gateType) {
      setGateError('Gate type is required');
      return;
    }

    setAddingGate(true);
    setGateError(null);

    try {
      const response = await api.request(`/api/admin/stages/${selectedStageId}/gates`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          field_id: gateFieldId,
          gate_type: gateType,
          gate_value: gateValue || null,
          error_message: gateErrorMessage.trim() || null,
        }),
      });

      if (response.ok) {
        resetGateForm();
        void fetchGates(selectedStageId);
      } else {
        const data = (await response.json()) as ApiError;
        setGateError(data.error ?? 'Failed to add gate');
      }
    } catch {
      setGateError('Failed to connect to the server.');
    } finally {
      setAddingGate(false);
    }
  };

  const handleRemoveGate = async (gateId: string) => {
    if (!sessionToken || !selectedStageId) return;

    try {
      await api.request(`/api/admin/stages/${selectedStageId}/gates/${gateId}`, {
        method: 'DELETE',
      });

      void fetchGates(selectedStageId);
    } catch {
      // Best-effort
    }
  };

  // ── Derived data ───────────────────────────────────────────

  const sortedStages = pipeline?.stages
    ? [...pipeline.stages].sort((a, b) => a.sortOrder - b.sortOrder)
    : [];

  const openStages = sortedStages.filter((s) => s.stageType === 'open');
  const terminalStages = sortedStages.filter((s) => s.stageType !== 'open');

  // ── Loading & error states ─────────────────────────────────

  if (loading) {
    return (
      <div className={styles.page}>
        <p className={styles.loadingText}>Loading pipeline…</p>
      </div>
    );
  }

  if (error || !pipeline) {
    return (
      <div className={styles.page}>
        <p role="alert" className={styles.errorAlert}>
          {error ?? 'Pipeline not found.'}
        </p>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────

  return (
    <div className={styles.page}>
      {/* Breadcrumb */}
      <div className={styles.breadcrumb}>
        <Link to="/admin" className={styles.breadcrumbLink}>
          Admin
        </Link>
        <span className={styles.breadcrumbSep}>›</span>
        <Link to="/admin/pipelines" className={styles.breadcrumbLink}>
          Pipelines
        </Link>
        <span className={styles.breadcrumbSep}>›</span>
        <span className={styles.breadcrumbCurrent}>{pipeline.name}</span>
      </div>

      {/* Pipeline header */}
      <div className={styles.pipelineHeader}>
        <div className={styles.pipelineMeta}>
          <h1 className={styles.pipelineName}>{pipeline.name}</h1>
          <div className={styles.pipelineApiName}>{pipeline.apiName}</div>
          {pipeline.description && (
            <div className={styles.pipelineDescription}>{pipeline.description}</div>
          )}
        </div>
        {pipeline.isSystem && (
          <span className={styles.systemBadge}>System</span>
        )}
      </div>

      {/* Section: Stages */}
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>Stages</h2>
        <PrimaryButton size="sm" onClick={openAddStageModal}>
          <PlusIcon />
          Add stage
        </PrimaryButton>
      </div>

      {/* Visual stage bar */}
      <div className={styles.stageBar} role="list" aria-label="Pipeline stages">
        {openStages.map((stage, idx) => (
          <div key={stage.id} className={styles.stageBarItem}>
            {idx > 0 && <span className={styles.stageBarSeparator}>→</span>}
            <div
              className={`${styles.stagePill} ${selectedStageId === stage.id ? styles.stagePillSelected : ''}`}
              style={{ backgroundColor: colourToBg(stage.colour) }}
              onClick={() => selectStage(stage)}
              role="listitem"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  selectStage(stage);
                }
              }}
            >
              <span className={styles.stagePillName}>{stage.name}</span>
              {stage.defaultProbability !== undefined && (
                <span className={styles.stagePillProbability}>
                  {stage.defaultProbability}%
                </span>
              )}
              {stage.expectedDays !== undefined && (
                <span className={styles.stagePillDays}>{stage.expectedDays} days</span>
              )}
              {/* Reorder buttons for open stages */}
              <div className={styles.stageReorderButtons}>
                <button
                  type="button"
                  className={styles.reorderButton}
                  aria-label={`Move ${stage.name} left`}
                  disabled={idx === 0}
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleReorder(stage.id, 'left');
                  }}
                >
                  <ChevronLeftIcon />
                </button>
                <button
                  type="button"
                  className={styles.reorderButton}
                  aria-label={`Move ${stage.name} right`}
                  disabled={idx === openStages.length - 1}
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleReorder(stage.id, 'right');
                  }}
                >
                  <ChevronRightIcon />
                </button>
              </div>
            </div>
          </div>
        ))}

        {terminalStages.length > 0 && (
          <span className={styles.stageBarTerminalSep}>|</span>
        )}

        {terminalStages.map((stage) => (
          <div
            key={stage.id}
            className={`${styles.stagePill} ${selectedStageId === stage.id ? styles.stagePillSelected : ''}`}
            style={{ backgroundColor: colourToBg(stage.colour) }}
            onClick={() => selectStage(stage)}
            role="listitem"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                selectStage(stage);
              }
            }}
          >
            <span className={styles.stagePillName}>{stage.name}</span>
            {stage.defaultProbability !== undefined && (
              <span className={styles.stagePillProbability}>
                {stage.defaultProbability}%
              </span>
            )}
          </div>
        ))}
      </div>

      {/* ── Stage edit panel ──────────────────────────────────── */}
      {selectedStage && (
        <div className={styles.stageEditPanel}>
          <div className={styles.stageEditHeader}>
            <h3 className={styles.stageEditTitle}>Edit Stage: {selectedStage.name}</h3>
            <div className={styles.stageEditActions}>
              <button
                type="button"
                className={styles.deleteButton}
                aria-label={`Delete ${selectedStage.name}`}
                onClick={() => setDeleteStageTarget(selectedStage)}
              >
                <TrashIcon />
              </button>
            </div>
          </div>

          {stageError && (
            <p role="alert" className={styles.errorAlert}>
              {stageError}
            </p>
          )}

          <div className={styles.stageEditForm}>
            <div className={styles.field}>
              <label className={`${styles.label} ${styles.labelRequired}`} htmlFor="stage-name">
                Name
              </label>
              <input
                id="stage-name"
                type="text"
                className={styles.input}
                value={stageEditName}
                onChange={(e) => setStageEditName(e.target.value)}
                disabled={stageSaving}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="stage-type">
                Stage type
              </label>
              <select
                id="stage-type"
                className={styles.select}
                value={stageEditType}
                onChange={(e) => setStageEditType(e.target.value)}
                disabled={stageSaving || selectedStage.stageType === 'won' || selectedStage.stageType === 'lost'}
              >
                <option value="open">Open</option>
                <option value="won">Won</option>
                <option value="lost">Lost</option>
              </select>
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="stage-probability">
                Probability %
              </label>
              <input
                id="stage-probability"
                type="number"
                className={styles.input}
                value={stageEditProbability}
                onChange={(e) => setStageEditProbability(e.target.value)}
                min={0}
                max={100}
                disabled={stageSaving}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="stage-days">
                Expected days
              </label>
              <input
                id="stage-days"
                type="number"
                className={styles.input}
                value={stageEditDays}
                onChange={(e) => setStageEditDays(e.target.value)}
                min={0}
                disabled={stageSaving}
              />
            </div>

            <div className={`${styles.field} ${styles.stageEditFormFull}`}>
              <label className={styles.label}>Colour</label>
              <div className={styles.colourOptions}>
                {COLOUR_OPTIONS.map((c) => (
                  <button
                    key={c.name}
                    type="button"
                    className={`${styles.colourSwatch} ${stageEditColour === c.name ? styles.colourSwatchSelected : ''}`}
                    style={{ backgroundColor: c.bg }}
                    onClick={() => setStageEditColour(c.name)}
                    aria-label={c.name}
                    disabled={stageSaving}
                  />
                ))}
              </div>
            </div>

            <div className={`${styles.field} ${styles.stageEditFormFull}`}>
              <label className={styles.label} htmlFor="stage-description">
                Description
              </label>
              <textarea
                id="stage-description"
                className={styles.textarea}
                value={stageEditDescription}
                onChange={(e) => setStageEditDescription(e.target.value)}
                disabled={stageSaving}
              />
            </div>
          </div>

          <div className={styles.actions}>
            <PrimaryButton
              size="sm"
              onClick={() => void handleSaveStage()}
              disabled={stageSaving}
            >
              {stageSaving ? 'Saving…' : 'Save stage'}
            </PrimaryButton>
          </div>

          {/* ── Qualification gates ────────────────────────────── */}
          <div className={styles.gateSection}>
            <div className={styles.gateSectionHeader}>
              <h4 className={styles.gateSectionTitle}>Qualification Gates</h4>
            </div>

            {gatesLoading ? (
              <p className={styles.emptyGates}>Loading gates…</p>
            ) : gates.length === 0 ? (
              <p className={styles.emptyGates}>No qualification gates configured for this stage.</p>
            ) : (
              <div className={styles.gateList}>
                {gates.map((gate) => (
                  <div key={gate.id} className={styles.gateItem}>
                    <span className={styles.gateFieldName}>{gate.field.label}</span>
                    <span className={styles.gateType}>{gate.gateType}</span>
                    {gate.gateValue && (
                      <span className={styles.gateValue}>{gate.gateValue}</span>
                    )}
                    <button
                      type="button"
                      className={styles.gateRemoveButton}
                      aria-label={`Remove gate for ${gate.field.label}`}
                      onClick={() => void handleRemoveGate(gate.id)}
                    >
                      <XIcon />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {gateError && (
              <p role="alert" className={styles.errorAlert}>
                {gateError}
              </p>
            )}

            {/* Add gate form */}
            <div className={styles.addGateForm}>
              <div className={styles.addGateFormField}>
                <label className={styles.addGateLabel} htmlFor="gate-field">
                  Field
                </label>
                <select
                  id="gate-field"
                  className={styles.select}
                  value={gateFieldId}
                  onChange={(e) => setGateFieldId(e.target.value)}
                  disabled={addingGate}
                >
                  <option value="">Select field…</option>
                  {fields.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.addGateFormField}>
                <label className={styles.addGateLabel} htmlFor="gate-type">
                  Gate type
                </label>
                <select
                  id="gate-type"
                  className={styles.select}
                  value={gateType}
                  onChange={(e) => setGateType(e.target.value)}
                  disabled={addingGate}
                >
                  <option value="">Select type…</option>
                  {GATE_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.addGateFormField}>
                <label className={styles.addGateLabel} htmlFor="gate-value">
                  Value
                </label>
                <input
                  id="gate-value"
                  type="text"
                  className={styles.input}
                  value={gateValue}
                  onChange={(e) => setGateValue(e.target.value)}
                  placeholder={gateType === 'required' ? 'N/A' : 'Enter value'}
                  disabled={addingGate || gateType === 'required'}
                />
              </div>

              <PrimaryButton
                size="sm"
                onClick={() => void handleAddGate()}
                disabled={addingGate}
              >
                <PlusIcon />
                Add gate
              </PrimaryButton>
            </div>

            {/* Optional error message field */}
            <div className={styles.gateErrorMessageField}>
              <div className={styles.addGateFormField}>
                <label className={styles.addGateLabel} htmlFor="gate-error-message">
                  Custom error message (optional)
                </label>
                <input
                  id="gate-error-message"
                  type="text"
                  className={styles.input}
                  value={gateErrorMessage}
                  onChange={(e) => setGateErrorMessage(e.target.value)}
                  placeholder="e.g. Amount must be filled in"
                  disabled={addingGate}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Stage Modal ───────────────────────────────────── */}
      {showAddStageModal && (
        <div
          className={styles.overlay}
          onClick={() => setShowAddStageModal(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Add stage"
        >
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Add stage</h2>

            <form
              className={styles.form}
              noValidate
              onSubmit={(e) => void handleAddStageSubmit(e)}
            >
              <div className={styles.field}>
                <label
                  className={`${styles.label} ${styles.labelRequired}`}
                  htmlFor="new-stage-name"
                >
                  Name
                </label>
                <input
                  id="new-stage-name"
                  type="text"
                  className={styles.input}
                  value={newStageName}
                  onChange={(e) => {
                    setNewStageName(e.target.value);
                    if (!newStageApiNameEdited) {
                      setNewStageApiName(slugify(e.target.value));
                    }
                  }}
                  placeholder="e.g. Prospecting"
                  maxLength={255}
                  disabled={addingStage}
                />
              </div>

              <div className={styles.field}>
                <label
                  className={`${styles.label} ${styles.labelRequired}`}
                  htmlFor="new-stage-apiName"
                >
                  API name
                </label>
                <input
                  id="new-stage-apiName"
                  type="text"
                  className={styles.input}
                  value={newStageApiName}
                  onChange={(e) => {
                    setNewStageApiName(e.target.value);
                    setNewStageApiNameEdited(true);
                  }}
                  placeholder="e.g. prospecting"
                  maxLength={100}
                  disabled={addingStage}
                />
                <span className={styles.fieldHint}>
                  Auto-generated from name. Must be lowercase snake_case.
                </span>
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Colour</label>
                <div className={styles.colourOptions}>
                  {COLOUR_OPTIONS.map((c) => (
                    <button
                      key={c.name}
                      type="button"
                      className={`${styles.colourSwatch} ${newStageColour === c.name ? styles.colourSwatchSelected : ''}`}
                      style={{ backgroundColor: c.bg }}
                      onClick={() => setNewStageColour(c.name)}
                      aria-label={c.name}
                      disabled={addingStage}
                    />
                  ))}
                </div>
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="new-stage-probability">
                  Probability %
                </label>
                <input
                  id="new-stage-probability"
                  type="number"
                  className={styles.input}
                  value={newStageProbability}
                  onChange={(e) => setNewStageProbability(e.target.value)}
                  min={0}
                  max={100}
                  disabled={addingStage}
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="new-stage-days">
                  Expected days
                </label>
                <input
                  id="new-stage-days"
                  type="number"
                  className={styles.input}
                  value={newStageDays}
                  onChange={(e) => setNewStageDays(e.target.value)}
                  min={0}
                  disabled={addingStage}
                />
              </div>

              {addStageError && (
                <p className={styles.errorAlert} role="alert">
                  {addStageError}
                </p>
              )}

              <hr className={styles.divider} />

              <div className={styles.actions}>
                <PrimaryButton
                  type="button"
                  variant="outline"
                  onClick={() => setShowAddStageModal(false)}
                  disabled={addingStage}
                >
                  Cancel
                </PrimaryButton>
                <PrimaryButton type="submit" disabled={addingStage}>
                  {addingStage ? 'Adding…' : 'Add stage'}
                </PrimaryButton>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete Stage Confirmation Modal ───────────────────── */}
      {deleteStageTarget && (
        <div
          className={styles.overlay}
          onClick={() => setDeleteStageTarget(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Confirm delete stage"
        >
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Delete stage</h2>
            <p className={styles.confirmText}>
              Are you sure you want to delete{' '}
              <span className={styles.confirmName}>{deleteStageTarget.name}</span>? This action
              cannot be undone.
            </p>

            {deleteStageError && (
              <p className={styles.errorAlert} role="alert">
                {deleteStageError}
              </p>
            )}

            <div className={styles.actions}>
              <PrimaryButton
                type="button"
                variant="outline"
                onClick={() => setDeleteStageTarget(null)}
                disabled={deletingStage}
              >
                Cancel
              </PrimaryButton>
              <PrimaryButton
                type="button"
                onClick={() => void handleDeleteStage()}
                disabled={deletingStage}
              >
                {deletingStage ? 'Deleting…' : 'Delete'}
              </PrimaryButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
