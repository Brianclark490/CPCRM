import { describe, it, expect } from 'vitest';
import { AppError, isAppError } from '../appError.js';

describe('AppError', () => {
  it('constructs with code, statusCode, message, and optional details', () => {
    const err = new AppError('VALIDATION_ERROR', 400, 'Bad input', {
      fieldErrors: { email: 'invalid' },
    });
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.statusCode).toBe(400);
    expect(err.message).toBe('Bad input');
    expect(err.details).toEqual({ fieldErrors: { email: 'invalid' } });
    expect(err.name).toBe('AppError');
  });

  it('validation() helper produces a 400 VALIDATION_ERROR', () => {
    const err = AppError.validation('Bad input');
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.statusCode).toBe(400);
    expect(err.message).toBe('Bad input');
  });

  it('notFound() helper produces a 404 NOT_FOUND', () => {
    const err = AppError.notFound('Missing');
    expect(err.code).toBe('NOT_FOUND');
    expect(err.statusCode).toBe(404);
  });

  it('conflict() helper produces a 409 CONFLICT', () => {
    const err = AppError.conflict('Already exists');
    expect(err.code).toBe('CONFLICT');
    expect(err.statusCode).toBe(409);
  });

  it('unauthenticated() helper produces a 401 UNAUTHENTICATED', () => {
    const err = AppError.unauthenticated();
    expect(err.code).toBe('UNAUTHENTICATED');
    expect(err.statusCode).toBe(401);
    expect(err.message).toBe('Authentication required');
  });

  it('forbidden() helper produces a 403 FORBIDDEN', () => {
    const err = AppError.forbidden();
    expect(err.code).toBe('FORBIDDEN');
    expect(err.statusCode).toBe(403);
  });

  it('isAppError identifies AppError instances', () => {
    expect(isAppError(new AppError('X', 400, 'x'))).toBe(true);
    expect(isAppError(new Error('nope'))).toBe(false);
    expect(isAppError(null)).toBe(false);
    expect(isAppError({ code: 'X', statusCode: 400, message: 'x' })).toBe(
      false,
    );
  });
});
