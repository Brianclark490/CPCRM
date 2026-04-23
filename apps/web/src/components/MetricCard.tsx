import type { ComponentRendererProps } from './layoutTypes.js';
import { useTenantLocale } from '../useTenantLocale.js';
import styles from './MetricCard.module.css';

export type MetricFormat = 'currency' | 'number' | 'percent' | 'duration';
export type MetricAccent = 'default' | 'success' | 'warning' | 'danger';

export type MetricSource =
  | { kind: 'field'; fieldApiName: string }
  | { kind: 'aggregate'; expr: string };

export type MetricTarget =
  | { kind: 'field'; fieldApiName: string }
  | { kind: 'literal'; value: number };

export interface MetricCardConfig {
  label: string;
  source: MetricSource;
  format?: MetricFormat;
  target?: MetricTarget;
  accent?: MetricAccent;
}

function isMetricSource(v: unknown): v is MetricSource {
  if (typeof v !== 'object' || v === null) return false;
  const s = v as Record<string, unknown>;
  if (s.kind === 'field') return typeof s.fieldApiName === 'string';
  if (s.kind === 'aggregate') return typeof s.expr === 'string';
  return false;
}

function isMetricTarget(v: unknown): v is MetricTarget {
  if (typeof v !== 'object' || v === null) return false;
  const t = v as Record<string, unknown>;
  if (t.kind === 'field') return typeof t.fieldApiName === 'string';
  if (t.kind === 'literal') return typeof t.value === 'number';
  return false;
}

function coerceNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function formatDuration(seconds: number): string {
  const abs = Math.abs(seconds);
  if (abs < 60) return `${Math.round(seconds)}s`;
  if (abs < 3_600) return `${Math.round(seconds / 60)}m`;
  if (abs < 86_400) return `${(seconds / 3_600).toFixed(1)}h`;
  return `${(seconds / 86_400).toFixed(1)}d`;
}

export function MetricCard({ component, record }: ComponentRendererProps) {
  const { formatCurrency, formatNumber } = useTenantLocale();
  const cfg = component.config as Partial<MetricCardConfig>;

  const label = typeof cfg.label === 'string' ? cfg.label : '';
  const accent: MetricAccent =
    cfg.accent === 'success' ||
    cfg.accent === 'warning' ||
    cfg.accent === 'danger'
      ? cfg.accent
      : 'default';
  const format: MetricFormat | undefined = cfg.format;

  if (!isMetricSource(cfg.source)) {
    return (
      <div
        className={`${styles.card} ${styles[`accent-${accent}`] ?? ''}`}
        data-testid="metric-card"
      >
        <div className={styles.label}>{label}</div>
        <div className={styles.valueInvalid} data-testid="metric-value">
          —
        </div>
      </div>
    );
  }

  // ── Aggregate source is a stub this round ────────────────────────────────
  if (cfg.source.kind === 'aggregate') {
    return (
      <div
        className={`${styles.card} ${styles[`accent-${accent}`] ?? ''}`}
        data-testid="metric-card"
        data-metric-source="aggregate"
      >
        <div className={styles.label}>{label}</div>
        <div
          className={styles.valuePlaceholder}
          data-testid="metric-value-placeholder"
          title={`Aggregate not yet implemented: ${cfg.source.expr}`}
        >
          —
        </div>
        <div className={styles.stubNote}>aggregate (pending)</div>
      </div>
    );
  }

  // ── Field source ─────────────────────────────────────────────────────────
  const raw = record.fieldValues[cfg.source.fieldApiName];
  const numeric = coerceNumber(raw);

  let display: string;
  if (numeric === null) {
    display = '—';
  } else if (format === 'currency') {
    display = formatCurrency(numeric);
  } else if (format === 'percent') {
    display = `${formatNumber(Math.round(numeric * 10) / 10)}%`;
  } else if (format === 'duration') {
    display = formatDuration(numeric);
  } else {
    display = formatNumber(numeric);
  }

  // ── Target / progress bar ────────────────────────────────────────────────
  let progressRatio: number | null = null;
  let targetNumeric: number | null = null;
  if (isMetricTarget(cfg.target) && numeric !== null) {
    if (cfg.target.kind === 'literal') {
      targetNumeric = cfg.target.value;
    } else {
      targetNumeric = coerceNumber(record.fieldValues[cfg.target.fieldApiName]);
    }
    if (targetNumeric !== null && targetNumeric > 0) {
      progressRatio = Math.max(0, Math.min(numeric / targetNumeric, 1));
    }
  }

  return (
    <div
      className={`${styles.card} ${styles[`accent-${accent}`] ?? ''}`}
      data-testid="metric-card"
      data-metric-source="field"
    >
      <div className={styles.label}>{label}</div>
      <div className={styles.value} data-testid="metric-value">
        {display}
      </div>
      {progressRatio !== null && (
        <div
          className={styles.progressTrack}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progressRatio * 100)}
          data-testid="metric-progress"
        >
          <div
            className={styles.progressFill}
            style={{ width: `${progressRatio * 100}%` }}
          />
        </div>
      )}
    </div>
  );
}
