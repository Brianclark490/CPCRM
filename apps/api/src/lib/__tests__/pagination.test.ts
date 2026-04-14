import { describe, it, expect } from 'vitest';
import {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  parsePaginationQuery,
  paginateInMemory,
  paginatedResponse,
} from '../pagination.js';
import { AppError, isAppError } from '../appError.js';

describe('parsePaginationQuery', () => {
  it('returns defaults when no query params are supplied', () => {
    expect(parsePaginationQuery({})).toEqual({
      limit: DEFAULT_LIMIT,
      offset: 0,
    });
  });

  it('coerces string values from Express query parsing', () => {
    expect(parsePaginationQuery({ limit: '25', offset: '100' })).toEqual({
      limit: 25,
      offset: 100,
    });
  });

  it('accepts numeric values directly', () => {
    expect(parsePaginationQuery({ limit: 10, offset: 20 })).toEqual({
      limit: 10,
      offset: 20,
    });
  });

  it('treats empty strings as missing (default applied)', () => {
    expect(parsePaginationQuery({ limit: '', offset: '' })).toEqual({
      limit: DEFAULT_LIMIT,
      offset: 0,
    });
  });

  it('accepts limit at exactly MAX_LIMIT', () => {
    expect(parsePaginationQuery({ limit: String(MAX_LIMIT) })).toEqual({
      limit: MAX_LIMIT,
      offset: 0,
    });
  });

  it('accepts limit at exactly 1', () => {
    expect(parsePaginationQuery({ limit: '1' })).toEqual({
      limit: 1,
      offset: 0,
    });
  });

  it('accepts offset at exactly 0', () => {
    expect(parsePaginationQuery({ offset: '0' })).toEqual({
      limit: DEFAULT_LIMIT,
      offset: 0,
    });
  });

  it('rejects limit > MAX_LIMIT with validation error', () => {
    try {
      parsePaginationQuery({ limit: String(MAX_LIMIT + 1) });
      throw new Error('should have thrown');
    } catch (err) {
      expect(isAppError(err)).toBe(true);
      const appErr = err as AppError;
      expect(appErr.statusCode).toBe(400);
      expect(appErr.code).toBe('VALIDATION_ERROR');
      expect(appErr.details).toBeDefined();
      const details = appErr.details as { fieldErrors: Record<string, string> };
      expect(details.fieldErrors.limit).toMatch(/limit must be <=/);
    }
  });

  it('rejects limit = 0 as below minimum', () => {
    expect(() => parsePaginationQuery({ limit: '0' })).toThrow(AppError);
  });

  it('rejects negative limit', () => {
    expect(() => parsePaginationQuery({ limit: '-1' })).toThrow(AppError);
  });

  it('rejects negative offset', () => {
    expect(() => parsePaginationQuery({ offset: '-1' })).toThrow(AppError);
  });

  it('rejects non-numeric limit', () => {
    expect(() => parsePaginationQuery({ limit: 'abc' })).toThrow(AppError);
  });

  it('rejects non-numeric offset', () => {
    expect(() => parsePaginationQuery({ offset: 'abc' })).toThrow(AppError);
  });

  it('rejects non-integer (fractional) limit', () => {
    expect(() => parsePaginationQuery({ limit: '5.5' })).toThrow(AppError);
  });

  it('rejects non-integer (fractional) offset', () => {
    expect(() => parsePaginationQuery({ offset: '2.5' })).toThrow(AppError);
  });

  it('collects field errors for both limit and offset when both invalid', () => {
    try {
      parsePaginationQuery({ limit: '-5', offset: 'bogus' });
      throw new Error('should have thrown');
    } catch (err) {
      expect(isAppError(err)).toBe(true);
      const details = (err as AppError).details as {
        fieldErrors: Record<string, string>;
      };
      expect(details.fieldErrors.limit).toBeDefined();
      expect(details.fieldErrors.offset).toBeDefined();
    }
  });
});

describe('paginatedResponse', () => {
  it('wraps data with correct pagination metadata (first page)', () => {
    expect(paginatedResponse(['a', 'b'], 10, { limit: 2, offset: 0 })).toEqual({
      data: ['a', 'b'],
      pagination: { total: 10, limit: 2, offset: 0, hasMore: true },
    });
  });

  it('reports hasMore=false on the last full page', () => {
    expect(paginatedResponse(['i', 'j'], 10, { limit: 2, offset: 8 })).toEqual({
      data: ['i', 'j'],
      pagination: { total: 10, limit: 2, offset: 8, hasMore: false },
    });
  });

  it('reports hasMore=false for a partial tail page', () => {
    expect(paginatedResponse(['last'], 5, { limit: 2, offset: 4 })).toEqual({
      data: ['last'],
      pagination: { total: 5, limit: 2, offset: 4, hasMore: false },
    });
  });

  it('handles an empty page past the end of the data set', () => {
    expect(paginatedResponse([], 3, { limit: 10, offset: 100 })).toEqual({
      data: [],
      pagination: { total: 3, limit: 10, offset: 100, hasMore: false },
    });
  });

  it('handles an empty data set', () => {
    expect(paginatedResponse([], 0, { limit: 50, offset: 0 })).toEqual({
      data: [],
      pagination: { total: 0, limit: 50, offset: 0, hasMore: false },
    });
  });
});

describe('paginateInMemory', () => {
  const items = ['a', 'b', 'c', 'd', 'e'];

  it('returns the full list when limit exceeds size', () => {
    expect(paginateInMemory(items, { limit: 50, offset: 0 })).toEqual({
      data: ['a', 'b', 'c', 'd', 'e'],
      pagination: { total: 5, limit: 50, offset: 0, hasMore: false },
    });
  });

  it('slices the first page correctly', () => {
    expect(paginateInMemory(items, { limit: 2, offset: 0 })).toEqual({
      data: ['a', 'b'],
      pagination: { total: 5, limit: 2, offset: 0, hasMore: true },
    });
  });

  it('slices the middle page correctly', () => {
    expect(paginateInMemory(items, { limit: 2, offset: 2 })).toEqual({
      data: ['c', 'd'],
      pagination: { total: 5, limit: 2, offset: 2, hasMore: true },
    });
  });

  it('slices the partial tail page correctly', () => {
    expect(paginateInMemory(items, { limit: 2, offset: 4 })).toEqual({
      data: ['e'],
      pagination: { total: 5, limit: 2, offset: 4, hasMore: false },
    });
  });

  it('returns an empty page when offset is past the end', () => {
    expect(paginateInMemory(items, { limit: 10, offset: 100 })).toEqual({
      data: [],
      pagination: { total: 5, limit: 10, offset: 100, hasMore: false },
    });
  });

  it('handles an empty input', () => {
    expect(paginateInMemory([], { limit: 10, offset: 0 })).toEqual({
      data: [],
      pagination: { total: 0, limit: 10, offset: 0, hasMore: false },
    });
  });
});
