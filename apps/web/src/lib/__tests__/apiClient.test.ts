import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useApiClient } from '../apiClient.js';

vi.mock('@descope/react-sdk', () => ({
  useSession: vi.fn(),
}));

const { useSession } = await import('@descope/react-sdk');

function mockSession(sessionToken: string) {
  vi.mocked(useSession).mockReturnValue({
    isAuthenticated: sessionToken !== '',
    isSessionLoading: false,
    sessionToken,
    claims: {},
  });
}

describe('useApiClient', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true } as Response));
  });

  it('attaches Authorization: Bearer <token> when a session token is present', async () => {
    mockSession('test-token');
    const { result } = renderHook(() => useApiClient());

    await result.current.request('/api/accounts');

    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    const headers = new Headers(init?.headers);
    expect(headers.get('Authorization')).toBe('Bearer test-token');
  });

  it('does not set an Authorization header when no session token is present', async () => {
    mockSession('');
    const { result } = renderHook(() => useApiClient());

    await result.current.request('/api/accounts');

    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    const headers = new Headers(init?.headers);
    expect(headers.has('Authorization')).toBe(false);
  });

  it('preserves caller-supplied headers alongside the injected Authorization header', async () => {
    mockSession('test-token');
    const { result } = renderHook(() => useApiClient());

    await result.current.request('/api/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Custom': 'value' },
      body: JSON.stringify({ name: 'Acme' }),
    });

    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    const headers = new Headers(init?.headers);
    expect(headers.get('Authorization')).toBe('Bearer test-token');
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.get('X-Custom')).toBe('value');
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe(JSON.stringify({ name: 'Acme' }));
  });

  it('does not override a caller-supplied Authorization header', async () => {
    mockSession('session-token');
    const { result } = renderHook(() => useApiClient());

    await result.current.request('/api/accounts', {
      headers: { Authorization: 'Bearer caller-override' },
    });

    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    const headers = new Headers(init?.headers);
    expect(headers.get('Authorization')).toBe('Bearer caller-override');
  });

  it('returns a stable request function across renders when the token is unchanged', () => {
    mockSession('test-token');
    const { result, rerender } = renderHook(() => useApiClient());

    const first = result.current.request;
    rerender();
    const second = result.current.request;

    expect(first).toBe(second);
  });

  it('returns a new request function when the session token changes', () => {
    mockSession('token-a');
    const { result, rerender } = renderHook(() => useApiClient());

    const first = result.current.request;

    mockSession('token-b');
    rerender();
    const second = result.current.request;

    expect(first).not.toBe(second);
  });
});
