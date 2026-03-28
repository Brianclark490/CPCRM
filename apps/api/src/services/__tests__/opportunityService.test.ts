/**
 * @deprecated The legacy opportunity CRUD functions (createOpportunity,
 * listOpportunities, getOpportunity, updateOpportunity) have been retired.
 * All opportunity CRUD now goes through the dynamic records engine
 * (recordService). Only the validation helpers are tested here.
 */
import { describe, it, expect } from 'vitest';
import {
  validateTitle,
  validateAccountId,
  validateValue,
  validateExpectedCloseDate,
} from '../opportunityService.js';

describe('validateTitle', () => {
  it('returns null for a valid title', () => {
    expect(validateTitle('New Partnership Deal')).toBeNull();
  });

  it('returns an error for an empty string', () => {
    expect(validateTitle('')).toBe('Opportunity title is required');
  });

  it('returns an error for a whitespace-only string', () => {
    expect(validateTitle('   ')).toBe('Opportunity title is required');
  });

  it('returns an error for a non-string value', () => {
    expect(validateTitle(undefined)).toBe('Opportunity title is required');
    expect(validateTitle(null)).toBe('Opportunity title is required');
    expect(validateTitle(42)).toBe('Opportunity title is required');
  });

  it('returns an error when title exceeds 200 characters', () => {
    expect(validateTitle('a'.repeat(201))).toBe(
      'Opportunity title must be 200 characters or fewer',
    );
  });

  it('returns null for a title of exactly 200 characters', () => {
    expect(validateTitle('a'.repeat(200))).toBeNull();
  });
});

describe('validateAccountId', () => {
  it('returns null for a valid accountId', () => {
    expect(validateAccountId('account-uuid-123')).toBeNull();
  });

  it('returns null for undefined (optional)', () => {
    expect(validateAccountId(undefined)).toBeNull();
  });

  it('returns null for null (unlinking)', () => {
    expect(validateAccountId(null)).toBeNull();
  });

  it('returns an error for an empty string', () => {
    expect(validateAccountId('')).toBe('Account ID must be a non-empty string');
  });

  it('returns an error for a whitespace-only string', () => {
    expect(validateAccountId('   ')).toBe('Account ID must be a non-empty string');
  });
});

describe('validateValue', () => {
  it('returns null when value is undefined', () => {
    expect(validateValue(undefined)).toBeNull();
  });

  it('returns null when value is null', () => {
    expect(validateValue(null)).toBeNull();
  });

  it('returns null for a valid positive number', () => {
    expect(validateValue(50000)).toBeNull();
  });

  it('returns null for zero', () => {
    expect(validateValue(0)).toBeNull();
  });

  it('returns an error for NaN', () => {
    expect(validateValue(NaN)).toBe('Estimated value must be a valid number');
  });

  it('returns an error for a non-numeric string', () => {
    expect(validateValue('abc')).toBe('Estimated value must be a valid number');
  });

  it('returns null for a numeric string', () => {
    expect(validateValue('50000')).toBeNull();
  });
});

describe('validateExpectedCloseDate', () => {
  it('returns null when date is undefined', () => {
    expect(validateExpectedCloseDate(undefined)).toBeNull();
  });

  it('returns null when date is null', () => {
    expect(validateExpectedCloseDate(null)).toBeNull();
  });

  it('returns null when date is an empty string', () => {
    expect(validateExpectedCloseDate('')).toBeNull();
  });

  it('returns null for a valid ISO 8601 date string', () => {
    expect(validateExpectedCloseDate('2025-12-31')).toBeNull();
  });

  it('returns an error for an invalid date string', () => {
    expect(validateExpectedCloseDate('not-a-date')).toBe('Close date must be a valid date');
  });
});
