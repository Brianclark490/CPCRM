import { useMemo } from 'react';
import { useTenantSettings } from './store/tenantSettings.js';
import type { TenantLocaleSettings } from './store/tenantSettings.js';

/* ── Internal helpers ─────────────────────────────────────── */

/**
 * Maps a tenant date-format string to an Intl locale tag that
 * produces that date ordering.
 */
function getIntlLocale(dateFormat: string): string {
  switch (dateFormat) {
    case 'MM/DD/YYYY':
      return 'en-US';
    case 'YYYY-MM-DD':
      return 'sv-SE';
    default:
      return 'en-GB';
  }
}

/** Module-level cache for currency symbols. */
const symbolCache = new Map<string, string>();

/**
 * Extracts the currency symbol (e.g. "£", "$") for a given ISO 4217 code.
 * Results are cached so the Intl formatter is only created once per code.
 */
function getCurrencySymbol(currency: string): string {
  const cached = symbolCache.get(currency);
  if (cached !== undefined) return cached;

  try {
    const parts = new Intl.NumberFormat('en', {
      style: 'currency',
      currency,
    }).formatToParts(0);

    const symbol = parts.find((p) => p.type === 'currency')?.value ?? currency;
    symbolCache.set(currency, symbol);
    return symbol;
  } catch {
    symbolCache.set(currency, currency);
    return currency;
  }
}

/**
 * Formats a number as a full currency string (e.g. "£1,234.56").
 */
function fmtCurrency(value: number, settings: TenantLocaleSettings): string {
  try {
    return new Intl.NumberFormat(getIntlLocale(settings.dateFormat), {
      style: 'currency',
      currency: settings.currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return value.toFixed(2);
  }
}

/**
 * Formats a number as a compact currency string (e.g. "£1.2M", "£45K").
 * Falls back to full formatting for values below 1 000.
 */
function fmtCurrencyCompact(value: number, settings: TenantLocaleSettings): string {
  const symbol = getCurrencySymbol(settings.currency);

  if (value >= 1_000_000) {
    return `${symbol}${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${symbol}${Math.round(value / 1_000)}K`;
  }
  return fmtCurrency(value, settings);
}

/**
 * Formats a date value using the tenant's preferred locale.
 * Returns '—' for invalid dates.
 */
function fmtDate(value: string | Date, settings: TenantLocaleSettings): string {
  const date = value instanceof Date ? value : new Date(value);
  if (isNaN(date.getTime())) return '—';

  return date.toLocaleDateString(getIntlLocale(settings.dateFormat), {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Formats a date+time value using the tenant's preferred locale.
 * Returns '—' for invalid dates.
 */
function fmtDateTime(value: string | Date, settings: TenantLocaleSettings): string {
  const date = value instanceof Date ? value : new Date(value);
  if (isNaN(date.getTime())) return '—';

  return date.toLocaleString(getIntlLocale(settings.dateFormat), {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Formats a plain number using locale-appropriate grouping separators.
 */
function fmtNumber(value: number, settings: TenantLocaleSettings): string {
  return new Intl.NumberFormat(getIntlLocale(settings.dateFormat)).format(value);
}

/**
 * Returns a human-readable relative time string (e.g. "5 minutes ago").
 * Falls back to a formatted date for anything older than 7 days.
 */
function fmtRelativeTime(iso: string | undefined, settings: TenantLocaleSettings): string {
  if (!iso) return '—';

  const date = new Date(iso);
  if (isNaN(date.getTime())) return '—';

  const diffMs = Date.now() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1_000);
  const diffMinutes = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffSeconds < 60) return 'just now';
  if (diffMinutes < 60) {
    return `${diffMinutes} ${diffMinutes === 1 ? 'minute' : 'minutes'} ago`;
  }
  if (diffHours < 24) {
    return `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`;
  }
  if (diffDays < 7) {
    return `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`;
  }

  return fmtDate(iso, settings);
}

/* ── Public interface ─────────────────────────────────────── */

export interface TenantLocale {
  settings: TenantLocaleSettings;
  currencySymbol: string;
  formatCurrency: (value: number) => string;
  formatCurrencyCompact: (value: number) => string;
  formatDate: (value: string | Date) => string;
  formatDateTime: (value: string | Date) => string;
  formatNumber: (value: number) => string;
  formatRelativeTime: (iso: string | undefined) => string;
}

/* ── Hook ─────────────────────────────────────────────────── */

export function useTenantLocale(): TenantLocale {
  const settings = useTenantSettings();

  return useMemo(
    () => ({
      settings,
      currencySymbol: getCurrencySymbol(settings.currency),
      formatCurrency: (v: number) => fmtCurrency(v, settings),
      formatCurrencyCompact: (v: number) => fmtCurrencyCompact(v, settings),
      formatDate: (v: string | Date) => fmtDate(v, settings),
      formatDateTime: (v: string | Date) => fmtDateTime(v, settings),
      formatNumber: (v: number) => fmtNumber(v, settings),
      formatRelativeTime: (iso: string | undefined) => fmtRelativeTime(iso, settings),
    }),
    [settings],
  );
}
