import { useState, useEffect, useCallback } from 'react';
import { useSession } from '@descope/react-sdk';
import type { ComponentRendererProps } from './layoutTypes.js';
import styles from './SalesTargetsRenderer.module.css';

// ─── API response types ───────────────────────────────────────────────────────

interface UserTargetSummary {
  name: string;
  target: number;
  actual: number;
  percentage: number;
}

interface TeamTargetSummary {
  name: string;
  target: number;
  actual: number;
  percentage: number;
  users: UserTargetSummary[];
}

interface TargetSummaryResponse {
  period: string;
  business: {
    target: number;
    actual: number;
    percentage: number;
    currency: string;
  };
  teams: TeamTargetSummary[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

type StatusColor = 'green' | 'amber' | 'red';

function getStatusColor(percentage: number): StatusColor {
  if (percentage >= 75) return 'green';
  if (percentage >= 50) return 'amber';
  return 'red';
}

function getBarColorClass(color: StatusColor): string {
  if (color === 'green') return styles.colorGreen;
  if (color === 'amber') return styles.colorAmber;
  return styles.colorRed;
}

function getTextColorClass(color: StatusColor): string {
  if (color === 'green') return styles.textGreen;
  if (color === 'amber') return styles.textAmber;
  return styles.textRed;
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

/** Clamp percentage to 0-100 for bar width display. */
function clampPct(pct: number): number {
  return Math.min(100, Math.max(0, pct));
}

// ─── SVG icons ────────────────────────────────────────────────────────────────

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`}
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
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface ProgressBarProps {
  percentage: number;
  size: 'large' | 'small';
}

function ProgressBar({ percentage, size }: ProgressBarProps) {
  const color = getStatusColor(percentage);
  const trackClass = size === 'large' ? styles.barTrackLarge : styles.barTrackSmall;

  return (
    <div
      className={`${styles.barTrack} ${trackClass}`}
      role="progressbar"
      aria-valuenow={Math.round(percentage)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`${Math.round(percentage)}% of target`}
    >
      <div
        className={`${styles.barFill} ${getBarColorClass(color)}`}
        style={{ width: `${clampPct(percentage)}%` }}
      />
    </div>
  );
}

interface UserRowProps {
  user: UserTargetSummary;
  currency: string;
}

function UserRow({ user, currency }: UserRowProps) {
  const color = getStatusColor(user.percentage);

  return (
    <li className={styles.userRow}>
      <div className={styles.userTopRow}>
        <span className={styles.userName}>{user.name}</span>
        <span className={styles.userValues}>
          {formatCurrency(user.actual, currency)} / {formatCurrency(user.target, currency)}
          <span className={`${styles.userPercentage} ${getTextColorClass(color)}`}>
            {Math.round(user.percentage)}%
          </span>
        </span>
      </div>
      <ProgressBar percentage={user.percentage} size="small" />
    </li>
  );
}

interface TeamBlockProps {
  team: TeamTargetSummary;
  currency: string;
  expanded: boolean;
  onToggle: () => void;
}

function TeamBlock({ team, currency, expanded, onToggle }: TeamBlockProps) {
  const color = getStatusColor(team.percentage);

  return (
    <div className={styles.teamBlock}>
      <div
        className={styles.teamHeader}
        onClick={onToggle}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle();
          }
        }}
      >
        <ChevronIcon open={expanded} />
        <div className={styles.teamInfo}>
          <div className={styles.teamTopRow}>
            <span className={styles.teamName}>{team.name}</span>
            <span className={styles.teamValues}>
              {formatCurrency(team.actual, currency)} / {formatCurrency(team.target, currency)}
              <span className={`${styles.teamPercentage} ${getTextColorClass(color)}`}>
                {Math.round(team.percentage)}%
              </span>
            </span>
          </div>
          <ProgressBar percentage={team.percentage} size="small" />
        </div>
      </div>

      {expanded && team.users.length > 0 && (
        <ul className={styles.usersList}>
          {team.users.map((user) => (
            <UserRow key={user.name} user={user} currency={currency} />
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function SalesTargetsRenderer({ component }: ComponentRendererProps) {
  const { sessionToken } = useSession();

  const [data, setData] = useState<TargetSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());

  const periodStart =
    (component.config.period_start as string | undefined) ?? undefined;
  const periodEnd =
    (component.config.period_end as string | undefined) ?? undefined;

  const fetchSummary = useCallback(async () => {
    if (!sessionToken) return;

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (periodStart) params.set('period_start', periodStart);
      if (periodEnd) params.set('period_end', periodEnd);

      const qs = params.toString();
      const url = `/api/targets/summary${qs ? `?${qs}` : ''}`;

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${sessionToken}` },
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string };
        setError(body.error ?? `Failed to load targets (${response.status})`);
        return;
      }

      const result = (await response.json()) as TargetSummaryResponse;
      setData(result);
    } catch {
      setError('Failed to connect to the server. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [sessionToken, periodStart, periodEnd]);

  useEffect(() => {
    void fetchSummary();
  }, [fetchSummary]);

  const toggleTeam = useCallback((teamName: string) => {
    setExpandedTeams((prev) => {
      const next = new Set(prev);
      if (next.has(teamName)) {
        next.delete(teamName);
      } else {
        next.add(teamName);
      }
      return next;
    });
  }, []);

  // ── Loading state ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className={styles.loading} data-testid="widget-sales_targets">
        <div className={styles.spinner} />
        <span className={styles.loadingText}>Loading targets…</span>
      </div>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className={styles.error} data-testid="widget-sales_targets">
        <svg className={styles.errorIcon} viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M8 1.5l6.5 12H1.5L8 1.5z"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeLinejoin="round"
          />
          <path d="M8 6.5v3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
          <circle cx="8" cy="11.5" r="0.5" fill="currentColor" />
        </svg>
        <span className={styles.errorText}>{error}</span>
        <button className={styles.retryButton} onClick={() => void fetchSummary()}>
          Retry
        </button>
      </div>
    );
  }

  // ── Empty state ───────────────────────────────────────────────────────────

  if (!data || (data.business.target === 0 && data.teams.length === 0)) {
    return (
      <div className={styles.empty} data-testid="widget-sales_targets">
        <svg className={styles.emptyIcon} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="12" cy="12" r="6" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="12" cy="12" r="2" fill="currentColor" />
        </svg>
        <span className={styles.emptyTitle}>No targets configured</span>
        <span className={styles.emptyText}>
          Set up sales targets in Admin → Targets to track progress here.
        </span>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const { business, teams } = data;
  const businessColor = getStatusColor(business.percentage);

  return (
    <div className={styles.container} data-testid="widget-sales_targets">
      {/* Period label */}
      <span className={styles.periodLabel}>{data.period}</span>

      {/* Business target hero bar */}
      <div className={styles.businessSection}>
        <div className={styles.businessHeader}>
          <span className={styles.businessLabel}>Business Target</span>
          <span className={styles.businessValues}>
            {formatCurrency(business.actual, business.currency)}
            {' / '}
            {formatCurrency(business.target, business.currency)}
            <span
              className={`${styles.businessPercentage} ${getTextColorClass(businessColor)}`}
            >
              {Math.round(business.percentage)}%
            </span>
          </span>
        </div>
        <ProgressBar percentage={business.percentage} size="large" />
      </div>

      {/* Teams breakdown */}
      {teams.length > 0 && (
        <div className={styles.teamsSection}>
          <span className={styles.teamsSectionLabel}>Team Breakdown</span>
          {teams.map((team) => (
            <TeamBlock
              key={team.name}
              team={team}
              currency={business.currency}
              expanded={expandedTeams.has(team.name)}
              onToggle={() => toggleTeam(team.name)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
