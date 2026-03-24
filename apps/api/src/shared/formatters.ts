// ─── Tenant Locale Formatting Utilities ───────────────────────────────────────
//
// All formatters use standard Intl APIs.  They accept a locale config object
// that mirrors the tenant `settings.locale` shape so callers can pass the
// tenant's saved preferences directly.
//
// When a locale field is omitted, sensible defaults are used (GBP / en-GB /
// DD/MM/YYYY / Europe/London).

// ─── Types ────────────────────────────────────────────────────────────────────

/** Locale configuration stored on the tenant settings object. */
export interface TenantLocale {
  currency?: string;   // ISO 4217 code, e.g. "GBP"
  dateFormat?: string; // "DD/MM/YYYY" | "MM/DD/YYYY" | "YYYY-MM-DD"
  timezone?: string;   // IANA timezone, e.g. "Europe/London"
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Maps our date-format tokens to a BCP 47 locale hint. */
function dateFormatToLocale(dateFormat: string): string {
  switch (dateFormat) {
    case 'MM/DD/YYYY':
      return 'en-US';
    case 'YYYY-MM-DD':
      return 'sv-SE';   // Swedish locale produces ISO-style dates
    case 'DD/MM/YYYY':
    default:
      return 'en-GB';
  }
}

// ─── Currency ─────────────────────────────────────────────────────────────────

/**
 * Formats a numeric value as a full currency string.
 *
 * ```
 * formatCurrency(125000, { currency: 'GBP' }) → "£125,000.00"
 * ```
 */
export function formatCurrency(value: number, locale: TenantLocale = {}): string {
  const currency = locale.currency ?? 'GBP';
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Formats a numeric value as a compact currency string (e.g. £125k, £1.3m).
 *
 * Uses `Intl.NumberFormat` compact notation and then replaces the
 * long-form suffixes with short lowercase equivalents.
 *
 * ```
 * formatCurrencyCompact(125000, { currency: 'GBP' })  → "£125k"
 * formatCurrencyCompact(1300000, { currency: 'GBP' }) → "£1.3m"
 * ```
 */
export function formatCurrencyCompact(value: number, locale: TenantLocale = {}): string {
  const currency = locale.currency ?? 'GBP';

  const formatted = new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
    notation: 'compact',
    compactDisplay: 'short',
    maximumFractionDigits: 1,
  }).format(value);

  // Intl compact notation may produce uppercase suffixes like "K", "M", "B"
  // or locale-specific forms. Normalise to lowercase k / m / b / t.
  return formatted
    .replace(/K/g, 'k')
    .replace(/M/g, 'm')
    .replace(/B/g, 'b')
    .replace(/T/g, 't');
}

// ─── Number ───────────────────────────────────────────────────────────────────

/**
 * Formats a number with thousands separators.
 *
 * ```
 * formatNumber(1234567) → "1,234,567"
 * ```
 */
export function formatNumber(value: number, _locale: TenantLocale = {}): string {
  return new Intl.NumberFormat('en-GB').format(value);
}

// ─── Date / DateTime ──────────────────────────────────────────────────────────

/**
 * Formats a date value respecting the tenant's configured date format.
 *
 * ```
 * formatDate('2025-06-15', { dateFormat: 'DD/MM/YYYY' }) → "15/06/2025"
 * formatDate('2025-06-15', { dateFormat: 'MM/DD/YYYY' }) → "06/15/2025"
 * ```
 */
export function formatDate(value: string | Date, locale: TenantLocale = {}): string {
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return '—';

  const fmt = locale.dateFormat ?? 'DD/MM/YYYY';
  const bcp47 = dateFormatToLocale(fmt);

  return new Intl.DateTimeFormat(bcp47, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: locale.timezone ?? 'Europe/London',
  }).format(d);
}

/**
 * Formats a date + time value respecting the tenant's configured locale.
 *
 * ```
 * formatDateTime('2025-06-15T14:30:00Z', { dateFormat: 'DD/MM/YYYY', timezone: 'Europe/London' })
 *   → "15/06/2025, 15:30"
 * ```
 */
export function formatDateTime(value: string | Date, locale: TenantLocale = {}): string {
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return '—';

  const fmt = locale.dateFormat ?? 'DD/MM/YYYY';
  const bcp47 = dateFormatToLocale(fmt);

  return new Intl.DateTimeFormat(bcp47, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: locale.timezone ?? 'Europe/London',
  }).format(d);
}

// ─── Relative time ────────────────────────────────────────────────────────────

/**
 * Returns a human-readable relative time string ("2 hours ago", "just now").
 *
 * Uses `Intl.RelativeTimeFormat` for the formatted string.
 */
export function formatRelativeTime(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return '—';

  const now = Date.now();
  const diffMs = now - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return rtf.format(-diffMin, 'minute');
  if (diffHr < 24) return rtf.format(-diffHr, 'hour');
  if (diffDay < 30) return rtf.format(-diffDay, 'day');

  const diffMonth = Math.floor(diffDay / 30);
  if (diffMonth < 12) return rtf.format(-diffMonth, 'month');

  const diffYear = Math.floor(diffDay / 365);
  return rtf.format(-diffYear, 'year');
}

// ─── Phone ────────────────────────────────────────────────────────────────────

/**
 * Basic phone number formatter.
 *
 * Strips non-digit characters (except leading +), then groups digits into a
 * readable pattern.
 *
 * ```
 * formatPhone('02012345678')  → '020 1234 5678'
 * formatPhone('+442012345678') → '+44 20 1234 5678'
 * ```
 */
export function formatPhone(value: string): string {
  if (!value) return '—';

  const hasPlus = value.startsWith('+');
  const digits = value.replace(/\D/g, '');

  if (digits.length === 0) return '—';

  // International format: +CC remaining grouped in 2-4 digit blocks
  if (hasPlus && digits.length > 10) {
    const countryCode = digits.slice(0, digits.length - 10);
    const remaining = digits.slice(digits.length - 10);
    const local = remaining.replace(/(\d{2})(\d{4})(\d{4})/, '$1 $2 $3');
    return `+${countryCode} ${local}`;
  }

  // UK-style 11-digit numbers: 0XX XXXX XXXX
  if (digits.length === 11 && digits.startsWith('0')) {
    return digits.replace(/(\d{3})(\d{4})(\d{4})/, '$1 $2 $3');
  }

  // US-style 10-digit numbers: (XXX) XXX-XXXX
  if (digits.length === 10) {
    return digits.replace(/(\d{3})(\d{3})(\d{4})/, '($1) $2-$3');
  }

  // Fallback: return with leading + if present, digits as-is
  return hasPlus ? `+${digits}` : digits;
}
