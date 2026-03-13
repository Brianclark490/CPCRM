import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSession } from '@descope/react-sdk';
import styles from './OpportunityDetailPage.module.css';

// ─── Types ────────────────────────────────────────────────────────────────────

type OpportunityStage =
  | 'prospecting'
  | 'qualification'
  | 'proposal'
  | 'negotiation'
  | 'closed_won'
  | 'closed_lost';

interface StageTransition {
  from: OpportunityStage | null;
  to: OpportunityStage;
  changedAt: string;
  changedBy: string;
}

interface Opportunity {
  id: string;
  tenantId: string;
  accountId: string;
  ownerId: string;
  title: string;
  stage: OpportunityStage;
  value?: number;
  currency?: string;
  expectedCloseDate?: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  stageHistory: StageTransition[];
}

interface FormState {
  title: string;
  accountId: string;
  ownerId: string;
  stage: OpportunityStage;
  value: string;
  currency: string;
  expectedCloseDate: string;
  description: string;
}

interface ApiError {
  error: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STAGE_LABELS: Record<OpportunityStage, string> = {
  prospecting: 'Prospecting',
  qualification: 'Qualification',
  proposal: 'Proposal',
  negotiation: 'Negotiation',
  closed_won: 'Closed Won',
  closed_lost: 'Closed Lost',
};

const ALLOWED_STAGE_TRANSITIONS: Record<OpportunityStage, readonly OpportunityStage[]> = {
  prospecting:   ['qualification', 'closed_lost'],
  qualification: ['proposal', 'prospecting', 'closed_lost'],
  proposal:      ['negotiation', 'qualification', 'closed_lost'],
  negotiation:   ['closed_won', 'closed_lost', 'proposal'],
  closed_won:    ['negotiation'],
  closed_lost:   ['prospecting'],
};

function formatDate(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function opportunityToForm(opp: Opportunity): FormState {
  return {
    title: opp.title,
    accountId: opp.accountId,
    ownerId: opp.ownerId,
    stage: opp.stage,
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
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // ── Load opportunity ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!id) return;

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setLoadError(null);

      try {
        const response = await fetch(`/api/opportunities/${id}`, {
          headers: { Authorization: `Bearer ${sessionToken}` },
        });

        if (cancelled) return;

        if (response.ok) {
          const data = (await response.json()) as Opportunity;
          if (!cancelled) setOpportunity(data);
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
    };
  }, [id, sessionToken]);

  // ── Edit handlers ─────────────────────────────────────────────────────────

  const handleEditClick = () => {
    if (!opportunity) return;
    setForm(opportunityToForm(opportunity));
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

    // Client-side validation
    const trimmedTitle = form.title.trim();
    if (!trimmedTitle) {
      setSaveError('Opportunity name is required');
      return;
    }

    const trimmedAccountId = form.accountId.trim();
    if (!trimmedAccountId) {
      setSaveError('Account is required');
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
          accountId: trimmedAccountId,
          ownerId: form.ownerId.trim() || undefined,
          stage: form.stage,
          value: validatedValue,
          currency: form.currency.trim() || null,
          expectedCloseDate: form.expectedCloseDate.trim() || null,
          description: form.description.trim() || null,
        }),
      });

      if (response.ok) {
        const updated = (await response.json()) as Opportunity;
        setOpportunity(updated);
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
          <span className={styles.stageBadge}>{STAGE_LABELS[opportunity.stage]}</span>
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
                    Account <span className={styles.required}>*</span>
                  </label>
                  <input
                    className={styles.input}
                    id="accountId"
                    name="accountId"
                    type="text"
                    value={form.accountId}
                    onChange={handleChange}
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

                {/* Stage */}
                <div className={styles.formField}>
                  <label className={styles.label} htmlFor="stage">
                    Stage
                  </label>
                  <select
                    className={styles.select}
                    id="stage"
                    name="stage"
                    value={form.stage}
                    onChange={handleChange}
                    disabled={submitting}
                  >
                    {/* Current stage is always selectable (no-op change) */}
                    <option value={form.stage}>{STAGE_LABELS[form.stage]}</option>
                    {ALLOWED_STAGE_TRANSITIONS[form.stage]
                      .filter((s) => s !== form.stage)
                      .map((s) => (
                        <option key={s} value={s}>
                          {STAGE_LABELS[s]}
                        </option>
                      ))}
                  </select>
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
                <span className={styles.fieldValue}>{opportunity.accountId}</span>
              </div>

              <div className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>Owner</span>
                <span className={styles.fieldValue}>{opportunity.ownerId}</span>
              </div>

              <div className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>Stage</span>
                <span className={styles.fieldValue}>{STAGE_LABELS[opportunity.stage]}</span>
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

              {opportunity.stageHistory.length > 0 && (
                <div className={`${styles.fieldGroup} ${styles.fieldFull}`}>
                  <span className={styles.fieldLabel}>Stage history</span>
                  <ol className={styles.stageHistory}>
                    {opportunity.stageHistory.map((t, i) => (
                      <li key={i} className={styles.stageHistoryItem}>
                        <span className={styles.stageHistoryBadge}>{STAGE_LABELS[t.to]}</span>
                        <span className={styles.stageHistoryMeta}>
                          {t.from ? `from ${STAGE_LABELS[t.from]} · ` : ''}
                          {formatDate(t.changedAt)}
                        </span>
                      </li>
                    ))}
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
    </div>
  );
}
