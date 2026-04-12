import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { requireCsrf } from '../csrf.js';

function mockReq(overrides: Partial<Request> = {}): Request {
  return {
    method: 'GET',
    cookies: {},
    headers: {},
    ...overrides,
  } as Request;
}

function mockRes(): Response {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

describe('requireCsrf middleware', () => {
  it('passes through safe methods without CSRF validation', () => {
    for (const method of ['GET', 'HEAD', 'OPTIONS']) {
      const req = mockReq({ method });
      const res = mockRes();
      const next: NextFunction = vi.fn();

      requireCsrf(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    }
  });

  it('skips CSRF check when no session cookie is present (Bearer auth)', () => {
    const req = mockReq({
      method: 'POST',
      cookies: {},
      headers: { authorization: 'Bearer some-jwt' },
    });
    const res = mockRes();
    const next: NextFunction = vi.fn();

    requireCsrf(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 403 when CSRF header is missing but session cookie is present', () => {
    const req = mockReq({
      method: 'POST',
      cookies: { cpcrm_session: 'session-jwt', cpcrm_csrf: 'cookie-token' },
      headers: {},
    });
    const res = mockRes();
    const next: NextFunction = vi.fn();

    requireCsrf(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('returns 403 when CSRF cookie is missing but session cookie is present', () => {
    const req = mockReq({
      method: 'POST',
      cookies: { cpcrm_session: 'session-jwt' },
      headers: { 'x-csrf-token': 'some-token' },
    });
    const res = mockRes();
    const next: NextFunction = vi.fn();

    requireCsrf(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'CSRF token mismatch' });
  });

  it('returns 403 when CSRF cookie and header do not match', () => {
    const req = mockReq({
      method: 'PUT',
      cookies: { cpcrm_session: 'session-jwt', cpcrm_csrf: 'cookie-token' },
      headers: { 'x-csrf-token': 'different-token' },
    });
    const res = mockRes();
    const next: NextFunction = vi.fn();

    requireCsrf(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('passes through when CSRF cookie and header match on a POST', () => {
    const req = mockReq({
      method: 'POST',
      cookies: { cpcrm_session: 'session-jwt', cpcrm_csrf: 'valid-csrf-token' },
      headers: { 'x-csrf-token': 'valid-csrf-token' },
    });
    const res = mockRes();
    const next: NextFunction = vi.fn();

    requireCsrf(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('passes through when CSRF cookie and header match on PATCH', () => {
    const req = mockReq({
      method: 'PATCH',
      cookies: { cpcrm_session: 'session-jwt', cpcrm_csrf: 'my-token' },
      headers: { 'x-csrf-token': 'my-token' },
    });
    const res = mockRes();
    const next: NextFunction = vi.fn();

    requireCsrf(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('passes through when CSRF cookie and header match on DELETE', () => {
    const req = mockReq({
      method: 'DELETE',
      cookies: { cpcrm_session: 'session-jwt', cpcrm_csrf: 'del-token' },
      headers: { 'x-csrf-token': 'del-token' },
    });
    const res = mockRes();
    const next: NextFunction = vi.fn();

    requireCsrf(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});
