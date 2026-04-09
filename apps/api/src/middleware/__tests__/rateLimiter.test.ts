import { describe, it, expect } from 'vitest';
import { globalLimiter, writeMethodLimiter, authLimiter } from '../rateLimiter.js';

describe('rateLimiter middleware exports', () => {
  it('exports globalLimiter as a function', () => {
    expect(typeof globalLimiter).toBe('function');
  });

  it('exports writeMethodLimiter as a function', () => {
    expect(typeof writeMethodLimiter).toBe('function');
  });

  it('exports authLimiter as a function', () => {
    expect(typeof authLimiter).toBe('function');
  });
});

describe('writeMethodLimiter', () => {
  it('calls next() directly for GET requests without invoking the write limiter', () => {
    let nextCalled = false;
    const req = { method: 'GET' } as Parameters<typeof writeMethodLimiter>[0];
    const res = {} as Parameters<typeof writeMethodLimiter>[1];
    const next = () => { nextCalled = true; };

    writeMethodLimiter(req, res, next);

    expect(nextCalled).toBe(true);
  });

  it('calls next() directly for HEAD requests without invoking the write limiter', () => {
    let nextCalled = false;
    const req = { method: 'HEAD' } as Parameters<typeof writeMethodLimiter>[0];
    const res = {} as Parameters<typeof writeMethodLimiter>[1];
    const next = () => { nextCalled = true; };

    writeMethodLimiter(req, res, next);

    expect(nextCalled).toBe(true);
  });

  it('delegates POST requests to the underlying write limiter', async () => {
    let nextCalled = false;
    const req = { method: 'POST', ip: '127.0.0.1', app: { get: () => false } } as unknown as Parameters<typeof writeMethodLimiter>[0];
    const res = {
      setHeader: () => res,
      status: () => res,
      json: () => res,
      send: () => res,
    } as unknown as Parameters<typeof writeMethodLimiter>[1];
    const next = () => { nextCalled = true; };

    writeMethodLimiter(req, res, next);

    // Allow async execution to complete
    await new Promise(resolve => setTimeout(resolve, 10));

    // The underlying limiter should have been invoked and called next()
    expect(nextCalled).toBe(true);
  });

  it('delegates PUT requests to the underlying write limiter', async () => {
    let nextCalled = false;
    const req = { method: 'PUT', ip: '127.0.0.1', app: { get: () => false } } as unknown as Parameters<typeof writeMethodLimiter>[0];
    const res = {
      setHeader: () => res,
      status: () => res,
      json: () => res,
      send: () => res,
    } as unknown as Parameters<typeof writeMethodLimiter>[1];

    writeMethodLimiter(req, res, () => { nextCalled = true; });

    await new Promise(resolve => setTimeout(resolve, 10));

    expect(nextCalled).toBe(true);
  });

  it('delegates DELETE requests to the underlying write limiter', async () => {
    let nextCalled = false;
    const req = { method: 'DELETE', ip: '127.0.0.1', app: { get: () => false } } as unknown as Parameters<typeof writeMethodLimiter>[0];
    const res = {
      setHeader: () => res,
      status: () => res,
      json: () => res,
      send: () => res,
    } as unknown as Parameters<typeof writeMethodLimiter>[1];

    writeMethodLimiter(req, res, () => { nextCalled = true; });

    await new Promise(resolve => setTimeout(resolve, 10));

    expect(nextCalled).toBe(true);
  });

  it('delegates PATCH requests to the underlying write limiter', async () => {
    let nextCalled = false;
    const req = { method: 'PATCH', ip: '127.0.0.1', app: { get: () => false } } as unknown as Parameters<typeof writeMethodLimiter>[0];
    const res = {
      setHeader: () => res,
      status: () => res,
      json: () => res,
      send: () => res,
    } as unknown as Parameters<typeof writeMethodLimiter>[1];

    writeMethodLimiter(req, res, () => { nextCalled = true; });

    await new Promise(resolve => setTimeout(resolve, 10));

    expect(nextCalled).toBe(true);
  });
});
