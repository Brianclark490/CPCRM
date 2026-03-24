import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  formatCurrency,
  formatCurrencyCompact,
  formatNumber,
  formatDate,
  formatDateTime,
  formatRelativeTime,
  formatPhone,
} from '../formatters.js';

// ─── formatCurrency ───────────────────────────────────────────────────────────

describe('formatCurrency', () => {
  it('formats GBP with two decimals', () => {
    expect(formatCurrency(125000, { currency: 'GBP' })).toBe('£125,000.00');
  });

  it('formats zero', () => {
    expect(formatCurrency(0, { currency: 'GBP' })).toBe('£0.00');
  });

  it('formats USD', () => {
    const result = formatCurrency(1234.5, { currency: 'USD' });
    expect(result).toContain('1,234.50');
    expect(result).toContain('US$');
  });

  it('formats EUR', () => {
    const result = formatCurrency(99.9, { currency: 'EUR' });
    expect(result).toContain('99.90');
  });

  it('defaults to GBP when currency is omitted', () => {
    expect(formatCurrency(500)).toBe('£500.00');
  });
});

// ─── formatCurrencyCompact ────────────────────────────────────────────────────

describe('formatCurrencyCompact', () => {
  it('formats 125000 as £125k', () => {
    expect(formatCurrencyCompact(125000, { currency: 'GBP' })).toBe('£125k');
  });

  it('formats 1300000 as £1.3m', () => {
    expect(formatCurrencyCompact(1300000, { currency: 'GBP' })).toBe('£1.3m');
  });

  it('formats small values without suffix', () => {
    const result = formatCurrencyCompact(500, { currency: 'GBP' });
    expect(result).toBe('£500');
  });

  it('defaults to GBP when currency is omitted', () => {
    expect(formatCurrencyCompact(1000000)).toBe('£1m');
  });
});

// ─── formatNumber ─────────────────────────────────────────────────────────────

describe('formatNumber', () => {
  it('formats with thousands separator', () => {
    expect(formatNumber(1234567)).toBe('1,234,567');
  });

  it('formats zero', () => {
    expect(formatNumber(0)).toBe('0');
  });

  it('formats decimal values', () => {
    expect(formatNumber(1234.56)).toBe('1,234.56');
  });
});

// ─── formatDate ───────────────────────────────────────────────────────────────

describe('formatDate', () => {
  it('respects DD/MM/YYYY format', () => {
    const result = formatDate('2025-06-15T00:00:00Z', { dateFormat: 'DD/MM/YYYY', timezone: 'UTC' });
    expect(result).toBe('15/06/2025');
  });

  it('respects MM/DD/YYYY format', () => {
    const result = formatDate('2025-06-15T00:00:00Z', { dateFormat: 'MM/DD/YYYY', timezone: 'UTC' });
    expect(result).toBe('06/15/2025');
  });

  it('respects YYYY-MM-DD format', () => {
    const result = formatDate('2025-06-15T00:00:00Z', { dateFormat: 'YYYY-MM-DD', timezone: 'UTC' });
    expect(result).toBe('2025-06-15');
  });

  it('defaults to DD/MM/YYYY', () => {
    const result = formatDate('2025-06-15T00:00:00Z', { timezone: 'UTC' });
    expect(result).toBe('15/06/2025');
  });

  it('returns dash for invalid date', () => {
    expect(formatDate('not-a-date')).toBe('—');
  });

  it('accepts a Date object', () => {
    const d = new Date('2025-01-02T00:00:00Z');
    const result = formatDate(d, { dateFormat: 'DD/MM/YYYY', timezone: 'UTC' });
    expect(result).toBe('02/01/2025');
  });
});

// ─── formatDateTime ───────────────────────────────────────────────────────────

describe('formatDateTime', () => {
  it('includes date and time', () => {
    const result = formatDateTime('2025-06-15T14:30:00Z', {
      dateFormat: 'DD/MM/YYYY',
      timezone: 'UTC',
    });
    expect(result).toContain('15/06/2025');
    expect(result).toContain('14:30');
  });

  it('returns dash for invalid date', () => {
    expect(formatDateTime('not-a-date')).toBe('—');
  });

  it('respects timezone', () => {
    // 14:00 UTC should be 15:00 in Europe/London during BST (June)
    const result = formatDateTime('2025-06-15T14:00:00Z', {
      dateFormat: 'DD/MM/YYYY',
      timezone: 'Europe/London',
    });
    expect(result).toContain('15:00');
  });
});

// ─── formatRelativeTime ───────────────────────────────────────────────────────

describe('formatRelativeTime', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "just now" for very recent times', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-15T12:00:30Z'));
    expect(formatRelativeTime('2025-06-15T12:00:00Z')).toBe('just now');
  });

  it('returns minutes ago', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-15T12:05:00Z'));
    const result = formatRelativeTime('2025-06-15T12:00:00Z');
    expect(result).toContain('5');
    expect(result).toContain('minute');
  });

  it('returns hours ago', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-15T14:00:00Z'));
    const result = formatRelativeTime('2025-06-15T12:00:00Z');
    expect(result).toContain('2');
    expect(result).toContain('hour');
  });

  it('returns days ago', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-18T12:00:00Z'));
    const result = formatRelativeTime('2025-06-15T12:00:00Z');
    expect(result).toContain('3');
    expect(result).toContain('day');
  });

  it('returns dash for invalid date', () => {
    expect(formatRelativeTime('not-a-date')).toBe('—');
  });
});

// ─── formatPhone ──────────────────────────────────────────────────────────────

describe('formatPhone', () => {
  it('formats UK 11-digit number', () => {
    expect(formatPhone('02012345678')).toBe('020 1234 5678');
  });

  it('formats international number with +', () => {
    expect(formatPhone('+442012345678')).toBe('+44 20 1234 5678');
  });

  it('formats US international number with +1', () => {
    expect(formatPhone('+12125551234')).toBe('+1 (212) 555-1234');
  });

  it('formats US 10-digit number', () => {
    expect(formatPhone('2125551234')).toBe('(212) 555-1234');
  });

  it('returns dash for empty string', () => {
    expect(formatPhone('')).toBe('—');
  });

  it('strips non-digit characters', () => {
    expect(formatPhone('020-1234-5678')).toBe('020 1234 5678');
  });

  it('returns dash when no digits present', () => {
    expect(formatPhone('abc')).toBe('—');
  });
});
