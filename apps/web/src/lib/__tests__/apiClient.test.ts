import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useApiClient, clearServerSession } from '../apiClient.js';

describe('useApiClient', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true } as Response));
    // Clear cookies between tests
    Object.defineProperty(document, 'cookie', {
      writable: true,
      value: '',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends requests with credentials: include', async () => {
    const { result } = renderHook(() => useApiClient());

    await result.current.request('/api/accounts');

    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(init?.credentials).toBe('include');
  });

  it('does not set an Authorization header (uses cookies instead)', async () => {
    const { result } = renderHook(() => useApiClient());

    await result.current.request('/api/accounts');

    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    const headers = new Headers(init?.headers);
    expect(headers.has('Authorization')).toBe(false);
  });

  it('attaches X-CSRF-Token header on POST requests when CSRF cookie is present', async () => {
    Object.defineProperty(document, 'cookie', {
      writable: true,
      value: 'cpcrm_csrf=my-csrf-token',
    });

    const { result } = renderHook(() => useApiClient());

    await result.current.request('/api/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Acme' }),
    });

    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    const headers = new Headers(init?.headers);
    expect(headers.get('X-CSRF-Token')).toBe('my-csrf-token');
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(init?.method).toBe('POST');
  });

  it('attaches X-CSRF-Token on PUT, PATCH, and DELETE requests', async () => {
    Object.defineProperty(document, 'cookie', {
      writable: true,
      value: 'cpcrm_csrf=csrf123',
    });

    const { result } = renderHook(() => useApiClient());

    for (const method of ['PUT', 'PATCH', 'DELETE']) {
      vi.mocked(fetch).mockClear();
      await result.current.request('/api/test', { method });

      const [, init] = vi.mocked(fetch).mock.calls[0]!;
      const headers = new Headers(init?.headers);
      expect(headers.get('X-CSRF-Token')).toBe('csrf123');
    }
  });

  it('does not attach X-CSRF-Token on GET requests', async () => {
    Object.defineProperty(document, 'cookie', {
      writable: true,
      value: 'cpcrm_csrf=csrf123',
    });

    const { result } = renderHook(() => useApiClient());

    await result.current.request('/api/accounts');

    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    const headers = new Headers(init?.headers);
    expect(headers.has('X-CSRF-Token')).toBe(false);
  });

  it('does not override a caller-supplied X-CSRF-Token header', async () => {
    Object.defineProperty(document, 'cookie', {
      writable: true,
      value: 'cpcrm_csrf=cookie-csrf',
    });

    const { result } = renderHook(() => useApiClient());

    await result.current.request('/api/accounts', {
      method: 'POST',
      headers: { 'X-CSRF-Token': 'caller-override' },
    });

    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    const headers = new Headers(init?.headers);
    expect(headers.get('X-CSRF-Token')).toBe('caller-override');
  });

  it('returns a stable request function across renders', () => {
    const { result, rerender } = renderHook(() => useApiClient());

    const first = result.current.request;
    rerender();
    const second = result.current.request;

    expect(first).toBe(second);
  });

  it('preserves caller-supplied headers alongside injected CSRF header', async () => {
    Object.defineProperty(document, 'cookie', {
      writable: true,
      value: 'cpcrm_csrf=csrf123',
    });

    const { result } = renderHook(() => useApiClient());

    await result.current.request('/api/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Custom': 'value' },
      body: JSON.stringify({ name: 'Acme' }),
    });

    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    const headers = new Headers(init?.headers);
    expect(headers.get('X-CSRF-Token')).toBe('csrf123');
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.get('X-Custom')).toBe('value');
  });
});

describe('clearServerSession', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true } as Response));
  });

  it('calls DELETE /api/auth/session with credentials: include', async () => {
    await clearServerSession();

    expect(fetch).toHaveBeenCalledWith('/api/auth/session', {
      method: 'DELETE',
      credentials: 'include',
    });
  });

  it('does not throw when fetch fails', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'));

    await expect(clearServerSession()).resolves.toBeUndefined();
  });
});
