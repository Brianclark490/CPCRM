import { useTenantLocale } from '../useTenantLocale.js';
import { StatCard } from './StatCard.js';
import styles from './PipelineSummaryBar.module.css';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PipelineTotals {
  openDeals: number;
  totalOpenValue: number;
  totalWeightedValue: number;
  avgDealSize: number;
  wonThisMonth: number;
  wonValueThisMonth: number;
  lostThisMonth: number;
}

export interface PipelineSummaryData {
  totals: PipelineTotals;
  avgDaysToClose: number;
}

interface PipelineSummaryBarProps {
  data: PipelineSummaryData;
}

// ─── Icons ────────────────────────────────────────────────────────────────────

const DollarIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <defs>
      <linearGradient id="icon-dollar" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#D946EF" />
        <stop offset="100%" stopColor="#6366F1" />
      </linearGradient>
    </defs>
    <path d="M12 2v20M17 5H9.5a3.5 3.5 0 100 7h5a3.5 3.5 0 110 7H6" stroke="url(#icon-dollar)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ScaleIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <defs>
      <linearGradient id="icon-scale" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#F97316" />
        <stop offset="100%" stopColor="#D946EF" />
      </linearGradient>
    </defs>
    <path d="M12 3v18M3 7l9-4 9 4M5 7v4c0 2 3 4 7 4s7-2 7-4V7" stroke="url(#icon-scale)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const CountIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <defs>
      <linearGradient id="icon-count" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#6366F1" />
        <stop offset="100%" stopColor="#F97316" />
      </linearGradient>
    </defs>
    <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="url(#icon-count)" strokeWidth="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="url(#icon-count)" strokeWidth="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="url(#icon-count)" strokeWidth="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="url(#icon-count)" strokeWidth="1.5" />
  </svg>
);

const AvgIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <defs>
      <linearGradient id="icon-avg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#D946EF" />
        <stop offset="100%" stopColor="#F97316" />
      </linearGradient>
    </defs>
    <path d="M3 3v18h18" stroke="url(#icon-avg)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M7 16l4-6 4 4 5-8" stroke="url(#icon-avg)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const TrophyIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <defs>
      <linearGradient id="icon-trophy" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#10B981" />
        <stop offset="100%" stopColor="#6366F1" />
      </linearGradient>
    </defs>
    <path d="M6 9H3a1 1 0 01-1-1V5a1 1 0 011-1h3M18 9h3a1 1 0 001-1V5a1 1 0 00-1-1h-3M6 4h12v6a6 6 0 11-12 0V4zM12 16v3M8 22h8M10 19h4" stroke="url(#icon-trophy)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ClockIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <defs>
      <linearGradient id="icon-clock" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#F97316" />
        <stop offset="100%" stopColor="#6366F1" />
      </linearGradient>
    </defs>
    <circle cx="12" cy="12" r="9" stroke="url(#icon-clock)" strokeWidth="1.5" />
    <path d="M12 7v5l3 3" stroke="url(#icon-clock)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// ─── Component ────────────────────────────────────────────────────────────────

export function PipelineSummaryBar({ data }: PipelineSummaryBarProps) {
  const { totals, avgDaysToClose } = data;
  const { formatCurrencyCompact } = useTenantLocale();

  return (
    <div className={styles.bar} data-testid="pipeline-summary-bar">
      <StatCard
        label="Total Open Value"
        value={formatCurrencyCompact(totals.totalOpenValue)}
        icon={<DollarIcon />}
      />
      <StatCard
        label="Weighted Pipeline"
        value={formatCurrencyCompact(totals.totalWeightedValue)}
        icon={<ScaleIcon />}
      />
      <StatCard
        label="Open Deals"
        value={String(totals.openDeals)}
        meta={`Avg ${formatCurrencyCompact(totals.avgDealSize)}`}
        icon={<CountIcon />}
      />
      <StatCard
        label="Avg Deal Size"
        value={formatCurrencyCompact(totals.avgDealSize)}
        icon={<AvgIcon />}
      />
      <StatCard
        label="Won This Month"
        value={String(totals.wonThisMonth)}
        meta={formatCurrencyCompact(totals.wonValueThisMonth)}
        icon={<TrophyIcon />}
      />
      <StatCard
        label="Avg Days to Close"
        value={`${avgDaysToClose}d`}
        icon={<ClockIcon />}
      />
    </div>
  );
}
