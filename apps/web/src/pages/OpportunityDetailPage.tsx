import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSession } from '@descope/react-sdk';
import { AccountSearchDropdown } from '../components/AccountSearchDropdown.js';
import { GateFailureModal } from '../components/GateFailureModal.js';
import styles from './OpportunityDetailPage.module.css';

// ─── Types ────────────────────────────────────────────────────────────────────

interface StageTransition {
  from: string | null;
  to: string;
  changedAt: string;
  changedBy: string;
}

interface Opportunity {
  id: string;
  tenantId: string;
  accountId?: string;
  ownerId: string;
  title: string;
  stage: string;
  value?: number;
  currency?: string;
  expectedCloseDate?: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  stageHistory?: StageTransition[];
}

interface PipelineStage {
  id: string;
  name: string;
  apiName: string;
  sortOrder: number;
  stageType: string;
  defaultProbability: number | null;
  colour: string | null;
}

interface GateFailure {
  field: string;
  label: string;
  gate: string;
  message: string;
  fieldType: string;
  currentValue: unknown;
  options: Record<string, unknown>;
}

interface FormState {
  title: string;
  accountId: string | null;
  accountName: string | null;
  ownerId: string;
  value: string;
  currency: string;
  expectedCloseDate: string;
  description: string;
}

interface ApiError {
  error: string;
  code?: string;
  failures?: GateFailure[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function opportunityToForm(opp: Opportunity): FormState {
  return {
    title: opp.title,
    accountId: opp.accountId ?? null,
    accountName: null,
    ownerId: opp.ownerId,
    value: opp.value !== undefined ? String(opp.value) : '',
    currency: opp.currency ?? '',
    expectedCloseDate: opp.expectedCloseDate
      ? opp.expectedCloseDate.slice(0, 10)
      : '',
    description: opp.description ?? '',
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export function OpportunityDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { sessionToken } = useSession();

  const [opportunity, setOpportunity] = useState<Opportunity | null>(null);
  const [accountName, setAccountName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Pipeline stage state
  const [pipelineStages, setPipelineStages] = useState<PipelineStage[]>([]);
  const [movingStage, setMovingStage] = useState(false);
  const [stageError, setStageError] = useState<string | null>(null);
  const [gateFailures, setGateFailures] = useState<GateFailure[]>([]);
  const [pendingTargetStageId, setPendingTargetStageId] = useState<string | null>(null);

  // ── Resolve account name ───────────────────────────────────────────────────

  const resolveAccountName = useCallback(
    async (accountId: string, signal?: AbortSignal) => {
      if (!sessionToken) return;
      try {
        const response = await fetch(`/api/accounts/${accountId}`, {
          headers: { Authorization: `Bearer ${sessionToken}` },
          signal,
        });
        if (response.ok) {
          const data = (await response.json()) as { name: string };
          setAccountName(data.name);
        }
      } catch {
        // silently fail — we'll show the ID as fallback
      }
    },
    [sessionToken],
  );

  // ── Load opportunity ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!id || !sessionToken) return;

    let cancelled = false;
    const abortController = new AbortController();

    const load = async () => {
      setLoading(true);
      setLoadError(null);
      setAccountName(null);

      try {
        const response = await fetch(`/api/opportunities/${id}`, {
          headers: { Authorization: `Bearer ${sessionToken}` },
          signal: abortController.signal,
        });

        if (cancelled) return;

        if (response.ok) {
          const data = (await response.json()) as Opportunity;
          if (!cancelled) {
            setOpportunity(data);
            if (data.accountId) {
              void resolveAccountName(data.accountId, abortController.signal);
            }
          }
        } else if (response.status === 404) {
          if (!cancelled) setLoadError('Opportunity not found.');
        } else {
          if (!cancelled) setLoadError('Failed to load opportunity.');
        }
      } catch {
        if (!cancelled) setLoadError('Failed to connect to the server. Please try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [id, sessionToken, resolveAccountName]);

  // ── Load pipeline stages ──────────────────────────────────────────────────

  useEffect(() => {
    if (!sessionToken) return;

    let cancelled = false;

    const loadStages = async () => {
      try {
        const response = await fetch('/api/admin/pipelines', {
          headers: { Authorization: `Bearer ${sessionToken}` },
        });
        if (cancelled || !response.ok) return;

        const pipelines = (await response.json()) as Array<{
          id: string;
          objectId: string;
          isDefault: boolean;
          stages?: PipelineStage[];
        }>;

        // Find the default opportunity pipeline — look for one where the object
        // is the "opportunity" object type. The list API doesn't nest stages,
        // so we need to fetch the detail endpoint.
        const oppPipeline = pipelines.find((p) => p.isDefault);
        if (!oppPipeline || cancelled) return;

        const detailResponse = await fetch(`/api/admin/pipelines/${oppPipeline.id}`, {
          headers: { Authorization: `Bearer ${sessionToken}` },
        });
        if (cancelled || !detailResponse.ok) return;

        interface RawStage {
          id: string;
          name: string;
          apiName?: string;
          api_name?: string;
          sortOrder?: number;
          sort_order?: number;
          stageType?: string;
          stage_type?: string;
          defaultProbability?: number | null;
          default_probability?: number | null;
          colour?: string | null;
        }

        const detail = (await detailResponse.json()) as {
          stages: RawStage[];
        };

        if (!cancelled) {
          setPipelineStages(
            detail.stages
              .map((s) => ({
                id: s.id,
                name: s.name,
                apiName: s.apiName ?? s.api_name ?? '',
                sortOrder: s.sortOrder ?? s.sort_order ?? 0,
                stageType: s.stageType ?? s.stage_type ?? 'open',
                defaultProbability: s.defaultProbability ?? s.default_probability ?? null,
                colour: s.colour ?? null,
              }))
              .sort((a, b) => a.sortOrder - b.sortOrder),
          );
        }
      } catch {
        // silently fail — stage dropdown will remain empty
      }
    };

    void loadStages();

    return () => {
      cancelled = true;
    };
  }, [sessionToken]);

  // ── Move stage handler ────────────────────────────────────────────────────

  const handleMoveStage = useCallback(
    async (targetStageId: string, extraFieldValues?: Record<string, unknown>) => {
      if (!opportunity || !sessionToken) return;

      setMovingStage(true);
      setStageError(null);

      try {
        // If we have extra field values to fill first (from gate failure modal),
        // update the record fields first
        if (extraFieldValues && Object.keys(extraFieldValues).length > 0) {
          const updateResponse = await fetch(
            `/api/objects/opportunity/records/${opportunity.id}`,
            {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${sessionToken}`,
              },
              body: JSON.stringify({ fieldValues: extraFieldValues }),
            },
          );
          if (!updateResponse.ok) {
            const data = (await updateResponse.json()) as ApiError;
            setStageError(data.error ?? 'Failed to update fields');
            return;
          }
        }

        const response = await fetch(
          `/api/objects/opportunity/records/${opportunity.id}/move-stage`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${sessionToken}`,
            },
            body: JSON.stringify({ target_stage_id: targetStageId }),
          },
        );

        if (response.ok) {
          // Reload the opportunity to pick up the new stage
          const reloadResponse = await fetch(`/api/opportunities/${opportunity.id}`, {
            headers: { Authorization: `Bearer ${sessionToken}` },
          });
          if (reloadResponse.ok) {
            const data = (await reloadResponse.json()) as Opportunity;
            setOpportunity(data);
          }
          setGateFailures([]);
        } else {
          const data = (await response.json()) as ApiError;
          if (data.code === 'GATE_VALIDATION_FAILED' && data.failures) {
            setGateFailures(data.failures);
            setPendingTargetStageId(targetStageId);
          } else {
            setStageError(data.error ?? 'Failed to move stage');
          }
        }
      } catch {
        setStageError('Failed to connect to the server. Please try again.');
      } finally {
        setMovingStage(false);
      }
    },
    [opportunity, sessionToken],
  );

  // ── Resolve current stage name from pipeline stages ────────────────────────

  const currentStageName =
    pipelineStages.find(
      (s) =>
        s.name.toLowerCase() === opportunity?.stage?.toLowerCase() ||
        s.apiName.toLowerCase() === opportunity?.stage?.toLowerCase(),
    )?.name ?? opportunity?.stage ?? '—';

  // ── Edit handlers ─────────────────────────────────────────────────────────

  const handleEditClick = () => {
    if (!opportunity) return;
    const formState = opportunityToForm(opportunity);
    formState.accountName = accountName;
    setForm(formState);
    setSaveError(null);
    setSaveSuccess(false);
    setEditing(true);
  };

  const handleCancelClick = () => {
    setEditing(false);
    setSaveError(null);
    setSaveSuccess(false);
    setForm(null);
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    setForm((prev) => (prev ? { ...prev, [e.target.name]: e.target.value } : prev));
    setSaveError(null);
    setSaveSuccess(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form || !opportunity) return;

    if (!sessionToken) {
      setSaveError('Session unavailable. Please refresh and try again.');
      return;
    }

    // Client-side validation
    const trimmedTitle = form.title.trim();
    if (!trimmedTitle) {
      setSaveError('Opportunity name is required');
      return;
    }

    let validatedValue: number | null | undefined;
    if (form.value.trim()) {
      validatedValue = Number(form.value.trim());
      if (isNaN(validatedValue)) {
        setSaveError('Estimated value must be a valid number');
        return;
      }
    }

    if (form.expectedCloseDate) {
      const d = new Date(form.expectedCloseDate);
      if (isNaN(d.getTime())) {
        setSaveError('Close date must be a valid date');
        return;
      }
    }

    setSubmitting(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      const response = await fetch(`/api/opportunities/${opportunity.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({
          title: trimmedTitle,
          accountId: form.accountId ?? null,
          ownerId: form.ownerId.trim() || undefined,
          value: validatedValue,
          currency: form.currency.trim() || null,
          expectedCloseDate: form.expectedCloseDate.trim() || null,
          description: form.description.trim() || null,
        }),
      });

      if (response.ok) {
        const updated = (await response.json()) as Opportunity;
        setOpportunity(updated);
        setAccountName(form.accountName);
        setEditing(false);
        setForm(null);
        setSaveSuccess(true);
      } else {
        const data = (await response.json()) as ApiError;
        setSaveError(data.error ?? 'An unexpected error occurred');
      }
    } catch {
      setSaveError('Failed to connect to the server. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className={styles.page}>
        <p>Loading…</p>
      </div>
    );
  }

  if (loadError || !opportunity) {
    return (
      <div className={styles.page}>
        <button className={styles.backLink} onClick={() => void navigate('/opportunities')}>
          ← Back to opportunities
        </button>
        <p role="alert">{loadError ?? 'Opportunity not found.'}</p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {/* Page header */}
      <div className={styles.pageHeader}>
        <div className={styles.headerLeft}>
          <button
            className={styles.backLink}
            onClick={() => void navigate('/opportunities')}
            type="button"
          >
            ← Back to opportunities
          </button>
          <h1 className={styles.pageTitle}>{opportunity.title}</h1>
          <span className={styles.stageBadge}>{currentStageName}</span>
        </div>

        {!editing && (
          <div className={styles.headerActions}>
            <button className={styles.btnPrimary} type="button" onClick={handleEditClick}>
              Edit
            </button>
          </div>
        )}
      </div>

      {/* Success banner (shown after a successful save) */}
      {saveSuccess && (
        <p role="status" className={styles.successAlert}>
          Opportunity updated successfully.
        </p>
      )}

      {/* Detail / Edit card */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <span className={styles.cardTitle}>
            {editing ? 'Edit opportunity' : 'Opportunity details'}
          </span>
        </div>

        <div className={styles.cardBody}>
          {editing && form ? (
            <form onSubmit={(e) => void handleSave(e)} noValidate>
              <div className={styles.formGrid}>
                {/* Title */}
                <div className={styles.formField}>
                  <label className={styles.label} htmlFor="title">
                    Opportunity name <span className={styles.required}>*</span>
                  </label>
                  <input
                    className={styles.input}
                    id="title"
                    name="title"
                    type="text"
                    value={form.title}
                    onChange={handleChange}
                    maxLength={200}
                    disabled={submitting}
                  />
                </div>

                {/* Account */}
                <div className={styles.formField}>
                  <label className={styles.label} htmlFor="accountId">
                    Account (optional)
                  </label>
                  <AccountSearchDropdown
                    id="accountId"
                    sessionToken={sessionToken ?? ''}
                    value={form.accountId}
                    valueName={form.accountName ?? undefined}
                    onChange={(accountId, accName) => {
                      setForm((prev) =>
                        prev ? { ...prev, accountId, accountName: accName } : prev,
                      );
                      setSaveError(null);
                      setSaveSuccess(false);
                    }}
                    disabled={submitting}
                  />
                </div>

                {/* Owner */}
                <div className={styles.formField}>
                  <label className={styles.label} htmlFor="ownerId">
                    Owner
                  </label>
                  <input
                    className={styles.input}
                    id="ownerId"
                    name="ownerId"
                    type="text"
                    value={form.ownerId}
                    onChange={handleChange}
                    disabled={submitting}
                  />
                </div>

                {/* Stage — read-only in edit mode; changes go through move-stage */}
                <div className={styles.formField}>
                  <label className={styles.label}>
                    Stage
                  </label>
                  <span className={styles.fieldValue}>
                    {currentStageName}
                  </span>
                  <span className={styles.fieldEmpty} style={{ fontSize: '0.75rem' }}>
                    Use the stage selector below the form to change stages.
                  </span>
                </div>

                {/* Estimated Value */}
                <div className={styles.formField}>
                  <label className={styles.label} htmlFor="value">
                    Estimated value (optional)
                  </label>
                  <input
                    className={styles.input}
                    id="value"
                    name="value"
                    type="number"
                    min="0"
                    value={form.value}
                    onChange={handleChange}
                    disabled={submitting}
                  />
                </div>

                {/* Currency */}
                <div className={styles.formField}>
                  <label className={styles.label} htmlFor="currency">
                    Currency (optional)
                  </label>
                  <input
                    className={styles.input}
                    id="currency"
                    name="currency"
                    type="text"
                    value={form.currency}
                    onChange={handleChange}
                    maxLength={3}
                    placeholder="e.g. GBP"
                    disabled={submitting}
                  />
                </div>

                {/* Close Date */}
                <div className={styles.formField}>
                  <label className={styles.label} htmlFor="expectedCloseDate">
                    Close date (optional)
                  </label>
                  <input
                    className={styles.input}
                    id="expectedCloseDate"
                    name="expectedCloseDate"
                    type="date"
                    value={form.expectedCloseDate}
                    onChange={handleChange}
                    disabled={submitting}
                  />
                </div>

                {/* Description */}
                <div className={`${styles.formField} ${styles.formFieldFull}`}>
                  <label className={styles.label} htmlFor="description">
                    Description (optional)
                  </label>
                  <textarea
                    className={styles.textarea}
                    id="description"
                    name="description"
                    value={form.description}
                    onChange={handleChange}
                    disabled={submitting}
                  />
                </div>
              </div>

              {saveError && (
                <p role="alert" className={styles.errorAlert} style={{ marginTop: '16px' }}>
                  {saveError}
                </p>
              )}

              <div className={styles.formActions}>
                <button className={styles.btnPrimary} type="submit" disabled={submitting}>
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
            <div className={styles.fieldsGrid}>
              <div className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>Opportunity name</span>
                <span className={styles.fieldValue}>{opportunity.title}</span>
              </div>

              <div className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>Account</span>
                {opportunity.accountId ? (
                  <span className={styles.fieldValue}>
                    {accountName ?? opportunity.accountId}
                  </span>
                ) : (
                  <span className={styles.fieldEmpty}>No account linked</span>
                )}
              </div>

              <div className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>Owner</span>
                <span className={styles.fieldValue}>{opportunity.ownerId}</span>
              </div>

              <div className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>Stage</span>
                <span className={styles.fieldValue}>{currentStageName}</span>
              </div>

              <div className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>Estimated value</span>
                {opportunity.value !== undefined ? (
                  <span className={styles.fieldValue}>
                    {opportunity.currency
                      ? `${opportunity.currency} ${opportunity.value.toLocaleString()}`
                      : opportunity.value.toLocaleString()}
                  </span>
                ) : (
                  <span className={styles.fieldEmpty}>Not set</span>
                )}
              </div>

              <div className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>Close date</span>
                {opportunity.expectedCloseDate ? (
                  <span className={styles.fieldValue}>
                    {formatDate(opportunity.expectedCloseDate)}
                  </span>
                ) : (
                  <span className={styles.fieldEmpty}>Not set</span>
                )}
              </div>

              <div className={`${styles.fieldGroup} ${styles.fieldFull}`}>
                <span className={styles.fieldLabel}>Description</span>
                {opportunity.description ? (
                  <span className={styles.fieldValue}>{opportunity.description}</span>
                ) : (
                  <span className={styles.fieldEmpty}>No description</span>
                )}
              </div>

              {(opportunity.stageHistory ?? []).length > 0 && (
                <div className={`${styles.fieldGroup} ${styles.fieldFull}`}>
                  <span className={styles.fieldLabel}>Stage history</span>
                  <ol className={styles.stageHistory}>
                    {opportunity.stageHistory!.map((t, i) => {
                      const toStage = pipelineStages.find(
                        (s) => s.name.toLowerCase() === t.to.toLowerCase() || s.apiName.toLowerCase() === t.to.toLowerCase(),
                      );
                      const fromStage = t.from
                        ? pipelineStages.find(
                            (s) => s.name.toLowerCase() === t.from!.toLowerCase() || s.apiName.toLowerCase() === t.from!.toLowerCase(),
                          )
                        : null;
                      return (
                        <li key={i} className={styles.stageHistoryItem}>
                          <span className={styles.stageHistoryBadge}>{toStage?.name ?? t.to}</span>
                          <span className={styles.stageHistoryMeta}>
                            {t.from ? `from ${fromStage?.name ?? t.from} · ` : ''}
                            {formatDate(t.changedAt)}
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Metadata footer */}
        {!editing && (
          <div className={styles.metaRow}>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Created</span>
              <span className={styles.metaValue}>{formatDate(opportunity.createdAt)}</span>
            </div>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Last modified</span>
              <span className={styles.metaValue}>{formatDate(opportunity.updatedAt)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Pipeline stage selector */}
      {pipelineStages.length > 0 && (
        <div className={styles.card} style={{ marginTop: '1rem' }}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>Pipeline stage</span>
          </div>
          <div className={styles.cardBody}>
            {stageError && (
              <p role="alert" className={styles.errorAlert} style={{ marginBottom: '12px' }}>
                {stageError}
              </p>
            )}
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {pipelineStages.map((stage) => {
                const isCurrent =
                  stage.name.toLowerCase() === opportunity.stage?.toLowerCase() ||
                  stage.apiName.toLowerCase() === opportunity.stage?.toLowerCase();
                return (
                  <button
                    key={stage.id}
                    type="button"
                    className={styles.btnSecondary}
                    style={{
                      fontWeight: isCurrent ? 700 : 400,
                      opacity: isCurrent ? 1 : 0.7,
                      border: isCurrent ? '2px solid var(--color-primary, #3b82f6)' : undefined,
                    }}
                    disabled={isCurrent || movingStage}
                    onClick={() => void handleMoveStage(stage.id)}
                  >
                    {stage.name}
                  </button>
                );
              })}
            </div>
            {movingStage && <p style={{ marginTop: '8px', color: 'var(--color-muted)' }}>Moving stage…</p>}
          </div>
        </div>
      )}

      {/* Gate failure modal */}
      {gateFailures.length > 0 && pendingTargetStageId && (
        <GateFailureModal
          stageName={
            pipelineStages.find((s) => s.id === pendingTargetStageId)?.name ?? 'target stage'
          }
          failures={gateFailures}
          onFillAndMove={(fieldValues) => {
            void handleMoveStage(pendingTargetStageId, fieldValues);
          }}
          onCancel={() => {
            setGateFailures([]);
            setPendingTargetStageId(null);
          }}
          loading={movingStage}
        />
      )}
    </div>
  );
}
