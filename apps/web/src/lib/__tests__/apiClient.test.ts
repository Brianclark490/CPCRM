import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  useApiClient,
  clearServerSession,
  ApiError,
  apiErrorFromResponse,
} from '../apiClient.js';

function jsonResponse(
  body: unknown,
  init: { status?: number; ok?: boolean } = {},
): Response {
  const status = init.status ?? 200;
  return {
    ok: init.ok ?? status < 400,
    status,
    statusText: '',
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function emptyResponse(status = 204): Response {
  return {
    ok: status < 400,
    status,
    statusText: '',
    headers: new Headers(),
    json: async () => undefined,
    text: async () => '',
  } as unknown as Response;
}

describe('useApiClient', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ ok: true })),
    );
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

    await result.current.request('/api/v1/accounts');

    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(init?.credentials).toBe('include');
  });

  it('does not set an Authorization header (uses cookies instead)', async () => {
    const { result } = renderHook(() => useApiClient());

    await result.current.request('/api/v1/accounts');

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

    await result.current.request('/api/v1/accounts', {
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
      await result.current.request('/api/v1/test', { method });

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

    await result.current.request('/api/v1/accounts');

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

    await result.current.request('/api/v1/accounts', {
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

    await result.current.request('/api/v1/accounts', {
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

describe('useApiClient typed methods', () => {
  beforeEach(() => {
    Object.defineProperty(document, 'cookie', {
      writable: true,
      value: '',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('get<T> parses JSON and returns typed data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ id: '1', name: 'Acme' })),
    );

    const { result } = renderHook(() => useApiClient());
    const data = await result.current.get<{ id: string; name: string }>(
      '/api/v1/accounts/1',
    );

    expect(data).toEqual({ id: '1', name: 'Acme' });
  });

  it('post<T> serialises JSON body and sets Content-Type', async () => {
    Object.defineProperty(document, 'cookie', {
      writable: true,
      value: 'cpcrm_csrf=csrf-token',
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ id: 'new' }, { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useApiClient());
    const data = await result.current.post<{ id: string }>('/api/v1/accounts', {
      body: { name: 'Acme' },
    });

    expect(data).toEqual({ id: 'new' });
    const [, init] = fetchMock.mock.calls[0]!;
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"name":"Acme"}');
    const headers = new Headers(init.headers);
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.get('X-CSRF-Token')).toBe('csrf-token');
  });

  it('del<T> handles 204 No Content responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(emptyResponse(204)));

    const { result } = renderHook(() => useApiClient());
    const data = await result.current.del('/api/v1/accounts/1');

    expect(data).toBeUndefined();
  });

  it('throws ApiError on 4xx with code and message from body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          { error: 'Name is required', code: 'VALIDATION_ERROR' },
          { status: 400 },
        ),
      ),
    );

    const { result } = renderHook(() => useApiClient());

    await expect(
      result.current.post('/api/v1/accounts', { body: {} }),
    ).rejects.toMatchObject({
      name: 'ApiError',
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Name is required',
    });
  });

  it('extracts fieldErrors from error responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            error: 'Validation failed',
            code: 'VALIDATION_ERROR',
            fieldErrors: { name: ['Required'], email: 'Invalid' },
          },
          { status: 422 },
        ),
      ),
    );

    const { result } = renderHook(() => useApiClient());
    let caught: ApiError | undefined;
    try {
      await result.current.post('/api/v1/accounts', { body: {} });
    } catch (err) {
      caught = err as ApiError;
    }

    expect(caught).toBeInstanceOf(ApiError);
    expect(caught!.fieldErrors).toEqual({
      name: ['Required'],
      email: ['Invalid'],
    });
  });

  it('retries GET once on 5xx and returns the successful response', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'boom' }, { status: 503 }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useApiClient());
    const data = await result.current.get<{ ok: boolean }>('/api/v1/accounts');

    expect(data).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does NOT retry POST on 5xx', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: 'boom' }, { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useApiClient());
    await expect(
      result.current.post('/api/v1/accounts', { body: { name: 'x' } }),
    ).rejects.toBeInstanceOf(ApiError);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries GET on network failure and throws ApiError if both attempts fail', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('network down'));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useApiClient());
    let caught: ApiError | undefined;
    try {
      await result.current.get('/api/v1/accounts');
    } catch (err) {
      caught = err as ApiError;
    }

    expect(caught).toBeInstanceOf(ApiError);
    expect(caught!.status).toBe(0);
    expect(caught!.code).toBe('NETWORK_ERROR');
    expect(caught!.isNetwork).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('gives up after a single retry on repeated 5xx and throws ApiError', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: 'boom' }, { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useApiClient());
    await expect(result.current.get('/api/v1/accounts')).rejects.toMatchObject({
      name: 'ApiError',
      status: 500,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('ApiError', () => {
  it('derives a default code from the status', () => {
    expect(new ApiError({ status: 401, message: 'x' }).code).toBe(
      'UNAUTHENTICATED',
    );
    expect(new ApiError({ status: 403, message: 'x' }).code).toBe('FORBIDDEN');
    expect(new ApiError({ status: 404, message: 'x' }).code).toBe('NOT_FOUND');
    expect(new ApiError({ status: 500, message: 'x' }).code).toBe(
      'SERVER_ERROR',
    );
    expect(new ApiError({ status: 0, message: 'x' }).code).toBe(
      'NETWORK_ERROR',
    );
  });

  it('isTransient is true for network and 5xx', () => {
    expect(new ApiError({ status: 0, message: 'x' }).isTransient).toBe(true);
    expect(new ApiError({ status: 500, message: 'x' }).isTransient).toBe(true);
    expect(new ApiError({ status: 404, message: 'x' }).isTransient).toBe(false);
  });
});

describe('apiErrorFromResponse', () => {
  it('prefers body.error over statusText for the message', async () => {
    const response = jsonResponse(
      { error: 'Too many requests', code: 'RATE_LIMIT' },
      { status: 429 },
    );
    const err = await apiErrorFromResponse(response);
    expect(err.message).toBe('Too many requests');
    expect(err.code).toBe('RATE_LIMIT');
    expect(err.status).toBe(429);
  });

  it('falls back to statusText when body has no error', async () => {
    const response = {
      ok: false,
      status: 500,
      statusText: 'Server Error',
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({}),
      text: async () => '{}',
    } as unknown as Response;
    const err = await apiErrorFromResponse(response);
    expect(err.message).toBe('Server Error');
    expect(err.code).toBe('SERVER_ERROR');
  });

  it('parses the canonical error shape (error.code / error.message / error.requestId)', async () => {
    const response = jsonResponse(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: { fieldErrors: { email: 'invalid format' } },
          requestId: 'req-uuid-123',
        },
      },
      { status: 400 },
    );
    const err = await apiErrorFromResponse(response);
    expect(err.status).toBe(400);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.message).toBe('Request validation failed');
    expect(err.fieldErrors).toEqual({ email: ['invalid format'] });
    expect(err.requestId).toBe('req-uuid-123');
  });

  it('reads requestId from the X-Request-Id header when not in the body', async () => {
    const response = {
      ok: false,
      status: 500,
      statusText: 'Server Error',
      headers: new Headers({
        'content-type': 'application/json',
        'x-request-id': 'header-req-id',
      }),
      json: async () => ({}),
      text: async () => '{}',
    } as unknown as Response;
    const err = await apiErrorFromResponse(response);
    expect(err.requestId).toBe('header-req-id');
  });
});

describe('clearServerSession', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true } as Response));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls DELETE /api/v1/auth/session with credentials: include', async () => {
    await clearServerSession();

    expect(fetch).toHaveBeenCalledWith('/api/v1/auth/session', {
      method: 'DELETE',
      credentials: 'include',
    });
  });

  it('does not throw when fetch fails', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'));

    await expect(clearServerSession()).resolves.toBeUndefined();
  });
});
