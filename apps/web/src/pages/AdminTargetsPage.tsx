import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSession } from '@descope/react-sdk';
import styles from './AdminTargetsPage.module.css';

/* ── Types ────────────────────────────────────────────────── */

interface SalesTarget {
  id: string;
  tenant_id: string;
  target_type: 'business' | 'team' | 'user';
  target_entity_id: string | null;
  period_type: 'monthly' | 'quarterly' | 'annual';
  period_start: string;
  period_end: string;
  target_value: number;
  currency: string;
  created_at: string;
  updated_at: string;
}

interface ApiError {
  error: string;
}

/** Local editable row for a target (before saving). */
interface TargetDraft {
  id: string | null;
  target_type: 'business' | 'team' | 'user';
  target_entity_id: string | null;
  target_value: string; // kept as string for controlled input
  /** Human-readable label if we can derive one (e.g. team/user name). */
  label: string;
  /** For user targets — which team they belong to (entity id). */
  parent_team_id: string | null;
}

type PeriodType = 'monthly' | 'quarterly' | 'annual';

interface PeriodOption {
  label: string;
  periodType: PeriodType;
  periodStart: string; // ISO date
  periodEnd: string;   // ISO date
}

/* ── Constants ────────────────────────────────────────────── */

const PERIOD_TYPES: { value: PeriodType; label: string }[] = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'annual', label: 'Annual' },
];

const DEFAULT_CURRENCY = 'GBP';

/* ── SVG icons ────────────────────────────────────────────── */

const WarningIcon = () => (
  <svg className={styles.warningIcon} viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path
      d="M8 1.5l6.5 12H1.5L8 1.5z"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinejoin="round"
    />
    <path d="M8 6.5v3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    <circle cx="8" cy="11.5" r="0.5" fill="currentColor" />
  </svg>
);

const ChevronIcon = ({ expanded }: { expanded: boolean }) => (
  <svg
    className={expanded ? styles.chevronExpanded : styles.chevron}
    viewBox="0 0 16 16"
    fill="none"
    aria-hidden="true"
  >
    <path
      d="M6 4l4 4-4 4"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const TrashIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path
      d="M2.5 4h9M5.5 4V3a1 1 0 011-1h1a1 1 0 011 1v1M10 4v7a1 1 0 01-1 1H5a1 1 0 01-1-1V4"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const TargetIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="12" cy="12" r="6" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="12" cy="12" r="2" fill="currentColor" />
  </svg>
);

/* ── Helpers ──────────────────────────────────────────────── */

function buildPeriodOptions(periodType: PeriodType): PeriodOption[] {
  const now = new Date();
  const currentYear = now.getFullYear();
  const years = [currentYear - 1, currentYear, currentYear + 1];
  const options: PeriodOption[] = [];

  for (const year of years) {
    if (periodType === 'annual') {
      options.push({
        label: `${year}`,
        periodType: 'annual',
        periodStart: `${year}-01-01`,
        periodEnd: `${year + 1}-01-01`,
      });
    } else if (periodType === 'quarterly') {
      for (let q = 1; q <= 4; q++) {
        const startMonth = (q - 1) * 3 + 1;
        const endMonth = startMonth + 3;
        const endYear = endMonth > 12 ? year + 1 : year;
        const endMonthNorm = endMonth > 12 ? endMonth - 12 : endMonth;
        options.push({
          label: `Q${q} ${year}`,
          periodType: 'quarterly',
          periodStart: `${year}-${String(startMonth).padStart(2, '0')}-01`,
          periodEnd: `${endYear}-${String(endMonthNorm).padStart(2, '0')}-01`,
        });
      }
    } else {
      const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December',
      ];
      for (let m = 1; m <= 12; m++) {
        const endMonth = m + 1;
        const endYear = endMonth > 12 ? year + 1 : year;
        const endMonthNorm = endMonth > 12 ? 1 : endMonth;
        options.push({
          label: `${monthNames[m - 1]} ${year}`,
          periodType: 'monthly',
          periodStart: `${year}-${String(m).padStart(2, '0')}-01`,
          periodEnd: `${endYear}-${String(endMonthNorm).padStart(2, '0')}-01`,
        });
      }
    }
  }

  return options;
}

function formatCurrency(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${currency} ${value.toLocaleString()}`;
  }
}

function getCurrencySymbol(currency: string): string {
  try {
    const parts = new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
    }).formatToParts(0);
    const sym = parts.find((p) => p.type === 'currency');
    return sym?.value ?? currency;
  } catch {
    return currency;
  }
}

function parseTargetValue(raw: string): number {
  const cleaned = raw.replace(/[^0-9.]/g, '');
  const val = parseFloat(cleaned);
  return Number.isFinite(val) ? val : 0;
}

/**
 * Find the "current" period option that best matches the current date.
 */
function findCurrentPeriodIndex(options: PeriodOption[]): number {
  const today = new Date().toISOString().slice(0, 10);
  const idx = options.findIndex(
    (opt) => opt.periodStart <= today && opt.periodEnd > today,
  );
  return idx >= 0 ? idx : 0;
}

/* ── Component ────────────────────────────────────────────── */

export function AdminTargetsPage() {
  const { sessionToken } = useSession();

  // Period selection
  const [periodType, setPeriodType] = useState<PeriodType>('quarterly');
  const periodOptions = useMemo(() => buildPeriodOptions(periodType), [periodType]);
  const [selectedPeriodIdx, setSelectedPeriodIdx] = useState<number>(() =>
    findCurrentPeriodIndex(buildPeriodOptions('quarterly')),
  );

  const selectedPeriod = periodOptions[selectedPeriodIdx] ?? periodOptions[0];

  // Target drafts
  const [businessTarget, setBusinessTarget] = useState<TargetDraft>({
    id: null,
    target_type: 'business',
    target_entity_id: null,
    target_value: '',
    label: 'Business target',
    parent_team_id: null,
  });
  const [teamTargets, setTeamTargets] = useState<TargetDraft[]>([]);
  const [userTargets, setUserTargets] = useState<TargetDraft[]>([]);

  // Expanded teams
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());

  // UI state
  const [loading, setLoading] = useState(true);
  const [initialFetchDone, setInitialFetchDone] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Recalculate period index when period type changes
  useEffect(() => {
    const opts = buildPeriodOptions(periodType);
    setSelectedPeriodIdx(findCurrentPeriodIndex(opts));
  }, [periodType]);

  // ── Fetch targets for the selected period ─────────────────

  const fetchTargets = useCallback(async () => {
    if (!sessionToken || !selectedPeriod) return;

    setLoading(true);
    setLoadError(null);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      const params = new URLSearchParams({
        period_start: selectedPeriod.periodStart,
        period_end: selectedPeriod.periodEnd,
      });

      const response = await fetch(`/api/admin/targets?${params.toString()}`, {
        headers: { Authorization: `Bearer ${sessionToken}` },
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as ApiError;
        setLoadError(data.error ?? 'Failed to load targets');
        return;
      }

      const targets = (await response.json()) as SalesTarget[];

      // Group by type
      const biz = targets.find((t) => t.target_type === 'business');
      const teams = targets.filter((t) => t.target_type === 'team');
      const users = targets.filter((t) => t.target_type === 'user');

      setBusinessTarget({
        id: biz?.id ?? null,
        target_type: 'business',
        target_entity_id: biz?.target_entity_id ?? null,
        target_value: biz ? String(biz.target_value) : '',
        label: 'Business target',
        parent_team_id: null,
      });

      setTeamTargets(
        teams.map((t) => ({
          id: t.id,
          target_type: 'team' as const,
          target_entity_id: t.target_entity_id,
          target_value: String(t.target_value),
          label: t.target_entity_id ? `Team ${t.target_entity_id}` : 'Unknown team',
          parent_team_id: null,
        })),
      );

      setUserTargets(
        users.map((t) => ({
          id: t.id,
          target_type: 'user' as const,
          target_entity_id: t.target_entity_id,
          target_value: String(t.target_value),
          label: t.target_entity_id ? `User ${t.target_entity_id}` : 'Unknown user',
          parent_team_id: null, // API doesn't provide this directly; grouped at display
        })),
      );
    } catch {
      setLoadError('Failed to connect to the server. Please try again.');
    } finally {
      setLoading(false);
      setInitialFetchDone(true);
    }
  }, [sessionToken, selectedPeriod]);

  useEffect(() => {
    void fetchTargets();
  }, [fetchTargets]);

  // ── Validation warnings ───────────────────────────────────

  const businessVal = parseTargetValue(businessTarget.target_value);
  const teamSum = teamTargets.reduce(
    (sum, t) => sum + parseTargetValue(t.target_value),
    0,
  );
  const showTeamBusinessMismatch =
    businessVal > 0 && teamTargets.length > 0 && Math.abs(teamSum - businessVal) > 0.01;

  /** Compute per-team user sum warnings. */
  const teamUserWarnings = useMemo(() => {
    const warnings: Map<string, { teamVal: number; userSum: number }> = new Map();

    for (const team of teamTargets) {
      if (!team.target_entity_id) continue;
      const teamVal = parseTargetValue(team.target_value);
      if (teamVal <= 0) continue;

      const usersInTeam = userTargets.filter(
        (u) => u.parent_team_id === team.target_entity_id,
      );
      if (usersInTeam.length === 0) continue;

      const userSum = usersInTeam.reduce(
        (s, u) => s + parseTargetValue(u.target_value),
        0,
      );

      if (Math.abs(userSum - teamVal) > 0.01) {
        warnings.set(team.target_entity_id, { teamVal, userSum });
      }
    }

    return warnings;
  }, [teamTargets, userTargets]);

  // ── Event handlers ────────────────────────────────────────

  const handleBusinessChange = (value: string) => {
    setBusinessTarget((prev) => ({ ...prev, target_value: value }));
    setSaveError(null);
    setSaveSuccess(false);
  };

  const handleTeamChange = (index: number, value: string) => {
    setTeamTargets((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], target_value: value };
      return next;
    });
    setSaveError(null);
    setSaveSuccess(false);
  };

  const handleUserChange = (index: number, value: string) => {
    setUserTargets((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], target_value: value };
      return next;
    });
    setSaveError(null);
    setSaveSuccess(false);
  };

  const removeTeamTarget = (index: number) => {
    setTeamTargets((prev) => prev.filter((_, i) => i !== index));
    setSaveError(null);
    setSaveSuccess(false);
  };

  const removeUserTarget = (index: number) => {
    setUserTargets((prev) => prev.filter((_, i) => i !== index));
    setSaveError(null);
    setSaveSuccess(false);
  };

  const toggleTeam = (entityId: string) => {
    setExpandedTeams((prev) => {
      const next = new Set(prev);
      if (next.has(entityId)) {
        next.delete(entityId);
      } else {
        next.add(entityId);
      }
      return next;
    });
  };

  // ── Save targets ──────────────────────────────────────────

  const handleSave = async () => {
    if (!sessionToken || !selectedPeriod) return;

    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    const allDrafts = [businessTarget, ...teamTargets, ...userTargets];
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sessionToken}`,
    };

    try {
      // Save each target via POST (upsert)
      for (const draft of allDrafts) {
        const value = parseTargetValue(draft.target_value);

        // Skip empty targets that don't have an existing id
        if (value === 0 && !draft.id) continue;

        // If value is 0 but we have an existing id, delete it
        if (value === 0 && draft.id) {
          const deleteRes = await fetch(`/api/admin/targets/${draft.id}`, {
            method: 'DELETE',
            headers,
          });
          if (!deleteRes.ok) {
            const data = (await deleteRes.json().catch(() => ({}))) as ApiError;
            throw new Error(data.error ?? 'Failed to delete target');
          }
          continue;
        }

        const body = {
          target_type: draft.target_type,
          target_entity_id: draft.target_entity_id,
          period_type: selectedPeriod.periodType,
          period_start: selectedPeriod.periodStart,
          period_end: selectedPeriod.periodEnd,
          target_value: value,
          currency: DEFAULT_CURRENCY,
        };

        const res = await fetch('/api/admin/targets', {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as ApiError;
          throw new Error(data.error ?? 'Failed to save target');
        }
      }

      setSaveSuccess(true);
      // Reload to pick up any generated IDs
      await fetchTargets();
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : 'An unexpected error occurred',
      );
    } finally {
      setSaving(false);
    }
  };

  // ── Render helpers ────────────────────────────────────────

  const currencySymbol = getCurrencySymbol(DEFAULT_CURRENCY);

  const usersForTeam = (teamEntityId: string) =>
    userTargets
      .map((u, idx) => ({ ...u, _idx: idx }))
      .filter((u) => u.parent_team_id === teamEntityId);

  // ── Loading state ─────────────────────────────────────────

  if (loading && !initialFetchDone) {
    return (
      <div className={styles.page}>
        <div className={styles.pageHeader}>
          <div className={styles.pageHeaderLeft}>
            <h1 className={styles.pageTitle}>Sales targets</h1>
          </div>
        </div>
        <p className={styles.loadingText}>Loading…</p>
      </div>
    );
  }

  // ── Error state ───────────────────────────────────────────

  if (loadError && teamTargets.length === 0) {
    return (
      <div className={styles.page}>
        <div className={styles.pageHeader}>
          <div className={styles.pageHeaderLeft}>
            <h1 className={styles.pageTitle}>Sales targets</h1>
          </div>
        </div>
        <p role="alert" className={styles.errorAlert}>
          {loadError}
        </p>
      </div>
    );
  }

  // ── Main render ───────────────────────────────────────────

  return (
    <div className={styles.page}>
      {/* ── Header ──────────────────────────────────────────── */}
      <div className={styles.pageHeader}>
        <div className={styles.pageHeaderLeft}>
          <h1 className={styles.pageTitle}>Sales targets</h1>
          <p className={styles.pageSubtitle}>
            Set revenue targets for your business, teams, and users
          </p>
        </div>
      </div>

      {/* ── Period selector ─────────────────────────────────── */}
      <div className={styles.card}>
        <div className={styles.periodBar}>
          <div className={styles.periodField}>
            <span className={styles.periodLabel}>Period type</span>
            <select
              className={styles.select}
              value={periodType}
              onChange={(e) => setPeriodType(e.target.value as PeriodType)}
              disabled={saving}
            >
              {PERIOD_TYPES.map((pt) => (
                <option key={pt.value} value={pt.value}>
                  {pt.label}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.periodField}>
            <span className={styles.periodLabel}>Period</span>
            <select
              className={styles.select}
              value={selectedPeriodIdx}
              onChange={(e) => setSelectedPeriodIdx(Number(e.target.value))}
              disabled={saving}
            >
              {periodOptions.map((opt, idx) => (
                <option key={`${opt.periodStart}-${opt.periodEnd}`} value={idx}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ── Business target ─────────────────────────────────── */}
      <div className={styles.card}>
        <h2 className={styles.sectionTitle}>Business target</h2>
        <p className={styles.sectionSubtitle}>
          The overall revenue target for {selectedPeriod?.label ?? 'this period'}
        </p>

        <div className={styles.targetRow}>
          <span className={styles.targetLabel}>Total business target</span>
          <span className={styles.currencyPrefix}>{currencySymbol}</span>
          <input
            type="text"
            inputMode="numeric"
            className={styles.targetInput}
            value={businessTarget.target_value}
            onChange={(e) => handleBusinessChange(e.target.value)}
            placeholder="0"
            disabled={saving}
            aria-label="Business target value"
          />
        </div>

        {businessVal > 0 && (
          <div className={styles.summaryRow}>
            <span className={styles.summaryLabel}>Target</span>
            <span className={styles.summaryValue}>
              {formatCurrency(businessVal, DEFAULT_CURRENCY)}
            </span>
          </div>
        )}
      </div>

      {/* ── Team targets ────────────────────────────────────── */}
      <div className={styles.card}>
        <h2 className={styles.sectionTitle}>Team targets</h2>
        <p className={styles.sectionSubtitle}>
          Break the business target down by team. Expand a team to set individual user targets.
        </p>

        {teamTargets.length === 0 && (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>
              <TargetIcon />
            </div>
            <h3 className={styles.emptyTitle}>No team targets</h3>
            <p className={styles.emptyText}>
              Team targets will appear here once loaded from the API for this period.
            </p>
          </div>
        )}

        {teamTargets.map((team, teamIdx) => {
          const entityId = team.target_entity_id ?? `idx-${teamIdx}`;
          const isExpanded = expandedTeams.has(entityId);
          const teamUsers = usersForTeam(entityId);
          const warning = team.target_entity_id
            ? teamUserWarnings.get(team.target_entity_id)
            : undefined;

          return (
            <div key={entityId} className={styles.teamSection}>
              <div
                className={styles.teamHeader}
                onClick={() => toggleTeam(entityId)}
                role="button"
                tabIndex={0}
                aria-expanded={isExpanded}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleTeam(entityId);
                  }
                }}
              >
                <ChevronIcon expanded={isExpanded} />
                <span className={styles.teamName}>{team.label}</span>
                <span className={styles.currencyPrefix}>{currencySymbol}</span>
                <input
                  type="text"
                  inputMode="numeric"
                  className={styles.teamTargetInput}
                  value={team.target_value}
                  onChange={(e) => {
                    e.stopPropagation();
                    handleTeamChange(teamIdx, e.target.value);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                  placeholder="0"
                  disabled={saving}
                  aria-label={`${team.label} target value`}
                />
                <button
                  type="button"
                  className={styles.removeButton}
                  onClick={(e) => {
                    e.stopPropagation();
                    removeTeamTarget(teamIdx);
                  }}
                  title="Remove team target"
                  aria-label={`Remove ${team.label} target`}
                  disabled={saving}
                >
                  <TrashIcon />
                </button>
              </div>

              {isExpanded && (
                <div className={styles.teamBody}>
                  {teamUsers.length === 0 && (
                    <p className={styles.emptyText}>
                      No user targets for this team in the selected period.
                    </p>
                  )}

                  {teamUsers.map((user) => (
                    <div key={user.target_entity_id ?? user._idx} className={styles.userRow}>
                      <span className={styles.userName}>{user.label}</span>
                      <span className={styles.currencyPrefix}>{currencySymbol}</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        className={styles.userTargetInput}
                        value={user.target_value}
                        onChange={(e) => handleUserChange(user._idx, e.target.value)}
                        placeholder="0"
                        disabled={saving}
                        aria-label={`${user.label} target value`}
                      />
                      <button
                        type="button"
                        className={styles.removeButton}
                        onClick={() => removeUserTarget(user._idx)}
                        title="Remove user target"
                        aria-label={`Remove ${user.label} target`}
                        disabled={saving}
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  ))}

                  {warning && (
                    <div className={styles.warningBanner}>
                      <WarningIcon />
                      <span className={styles.warningText}>
                        User targets sum to{' '}
                        <span className={styles.warningValues}>
                          {formatCurrency(warning.userSum, DEFAULT_CURRENCY)}
                        </span>{' '}
                        but team target is{' '}
                        <span className={styles.warningValues}>
                          {formatCurrency(warning.teamVal, DEFAULT_CURRENCY)}
                        </span>
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {showTeamBusinessMismatch && (
          <div className={styles.warningBanner}>
            <WarningIcon />
            <span className={styles.warningText}>
              Team targets sum to{' '}
              <span className={styles.warningValues}>
                {formatCurrency(teamSum, DEFAULT_CURRENCY)}
              </span>{' '}
              but business target is{' '}
              <span className={styles.warningValues}>
                {formatCurrency(businessVal, DEFAULT_CURRENCY)}
              </span>
            </span>
          </div>
        )}

        {teamTargets.length > 0 && (
          <div className={styles.summaryRowSpaced}>
            <span className={styles.summaryLabel}>Total team targets</span>
            <span className={styles.summaryValue}>
              {formatCurrency(teamSum, DEFAULT_CURRENCY)}
            </span>
          </div>
        )}
      </div>

      {/* ── Unassigned user targets (not linked to any team) ── */}
      {userTargets.filter((u) => !u.parent_team_id).length > 0 && (
        <div className={styles.card}>
          <h2 className={styles.sectionTitle}>User targets (unassigned)</h2>
          <p className={styles.sectionSubtitle}>
            User targets not linked to a specific team
          </p>

          {userTargets
            .map((u, idx) => ({ ...u, _idx: idx }))
            .filter((u) => !u.parent_team_id)
            .map((user) => (
              <div key={user.target_entity_id ?? user._idx} className={styles.targetRow}>
                <span className={styles.targetLabelMuted}>{user.label}</span>
                <span className={styles.currencyPrefix}>{currencySymbol}</span>
                <input
                  type="text"
                  inputMode="numeric"
                  className={styles.targetInput}
                  value={user.target_value}
                  onChange={(e) => handleUserChange(user._idx, e.target.value)}
                  placeholder="0"
                  disabled={saving}
                  aria-label={`${user.label} target value`}
                />
                <button
                  type="button"
                  className={styles.removeButton}
                  onClick={() => removeUserTarget(user._idx)}
                  title="Remove user target"
                  aria-label={`Remove ${user.label} target`}
                  disabled={saving}
                >
                  <TrashIcon />
                </button>
              </div>
            ))}
        </div>
      )}

      {/* ── Footer / Save ───────────────────────────────────── */}
      <div className={styles.footerCard}>
        {saveError && (
          <p role="alert" className={styles.errorAlert}>
            {saveError}
          </p>
        )}

        {saveSuccess && (
          <p role="status" className={styles.successAlert}>
            Targets saved successfully.
          </p>
        )}

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.submitButton}
            onClick={() => void handleSave()}
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Save targets'}
          </button>
        </div>
      </div>
    </div>
  );
}
