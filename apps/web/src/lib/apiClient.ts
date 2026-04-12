import { useCallback, useMemo } from 'react';
import { logger } from './logger.js';

/**
 * Reads a cookie value by name from `document.cookie`.
 */
function getCookie(name: string): string | undefined {
  const match = document.cookie
    .split(';')
    .map((c) => c.trim())
    .find((row) => row.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split('=')[1]) : undefined;
}

const CSRF_COOKIE = 'cpcrm_csrf';

/** HTTP methods that require CSRF protection. */
const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// ─── ApiError ─────────────────────────────────────────────────────────────────

/**
 * Normalised shape for field-level validation errors coming from the API.
 *
 * The backend does not yet consistently return field errors, but we reserve
 * this shape so future migrations can populate it without changing callers.
 */
export type FieldErrors = Record<string, string[]>;

/**
 * A single, typed error surface for every HTTP failure emitted by
 * {@link ApiClient}.  Callers only ever need to catch `ApiError`.
 */
export class ApiError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly fieldErrors: FieldErrors;
  public readonly body: unknown;

  constructor(init: {
    status: number;
    code?: string;
    message: string;
    fieldErrors?: FieldErrors;
    body?: unknown;
  }) {
    super(init.message);
    this.name = 'ApiError';
    this.status = init.status;
    this.code = init.code ?? fallbackCodeFromStatus(init.status);
    this.fieldErrors = init.fieldErrors ?? {};
    this.body = init.body;
  }

  /** True for transient failures worth retrying (5xx + 0 for network). */
  get isTransient(): boolean {
    return this.status === 0 || this.status >= 500;
  }

  /** True when the error originated from a network-level failure. */
  get isNetwork(): boolean {
    return this.status === 0;
  }
}

function fallbackCodeFromStatus(status: number): string {
  if (status === 0) return 'NETWORK_ERROR';
  if (status === 401) return 'UNAUTHENTICATED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 409) return 'CONFLICT';
  if (status === 422) return 'VALIDATION_ERROR';
  if (status >= 500) return 'SERVER_ERROR';
  if (status >= 400) return 'CLIENT_ERROR';
  return 'UNKNOWN';
}

/**
 * Attempt to parse a response body as JSON, falling back to text, and finally
 * to `undefined`.  Callers use the result as a best-effort inspection target.
 */
async function safeReadBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    // fall through to text
  }
  try {
    return await response.text();
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function extractFieldErrors(body: unknown): FieldErrors | undefined {
  if (!isRecord(body)) return undefined;
  const raw = body.fieldErrors ?? body.field_errors ?? body.errors;
  if (!isRecord(raw)) return undefined;
  const out: FieldErrors = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string') {
      out[key] = [value];
    } else if (Array.isArray(value)) {
      out[key] = value.filter((v): v is string => typeof v === 'string');
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Build an {@link ApiError} from a failed HTTP response.
 */
export async function apiErrorFromResponse(
  response: Response,
): Promise<ApiError> {
  const body = await safeReadBody(response);
  let message: string | undefined;
  let code: string | undefined;

  if (isRecord(body)) {
    const errVal = body.error ?? body.message;
    if (typeof errVal === 'string') message = errVal;
    const codeVal = body.code;
    if (typeof codeVal === 'string') code = codeVal;
  }

  return new ApiError({
    status: response.status,
    code,
    message: message ?? response.statusText ?? `HTTP ${response.status}`,
    fieldErrors: extractFieldErrors(body),
    body,
  });
}

// ─── Retry config ─────────────────────────────────────────────────────────────

/**
 * Idempotent GETs are retried once on transient failures.  A jittered backoff
 * of 150–300 ms keeps the added latency tight while still letting a brief
 * server blip recover.
 */
const RETRYABLE_METHODS = new Set(['GET', 'HEAD']);
const RETRY_BASE_MS = 150;
const RETRY_JITTER_MS = 150;

function nextRetryDelay(): number {
  return RETRY_BASE_MS + Math.floor(Math.random() * RETRY_JITTER_MS);
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Core request pipeline ────────────────────────────────────────────────────

interface RequestContext {
  url: string;
  method: string;
}

/**
 * Performs a single fetch with CSRF injection and cookie credentials.
 *
 * Network failures are normalised to an {@link ApiError} with status `0`.
 */
async function doFetch(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
): Promise<Response> {
  const headers = new Headers(init?.headers);
  const method = (init?.method ?? 'GET').toUpperCase();
  if (MUTATION_METHODS.has(method) && !headers.has('X-CSRF-Token')) {
    const csrfToken = getCookie(CSRF_COOKIE);
    if (csrfToken) {
      headers.set('X-CSRF-Token', csrfToken);
    }
  }
  return fetch(input, { ...init, headers, credentials: 'include' });
}

/**
 * Internal request entrypoint used by every public method.  Handles retries,
 * error normalisation, and logging.
 */
async function requestWithRetry(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
): Promise<Response> {
  const method = (init?.method ?? 'GET').toUpperCase();
  const ctx: RequestContext = {
    url: typeof input === 'string' ? input : input.toString(),
    method,
  };
  const retryable = RETRYABLE_METHODS.has(method);

  let attempt = 0;
  // Retry at most once on transient 5xx / network errors for idempotent
  // methods.  Non-idempotent methods always attempt exactly once.
  while (true) {
    try {
      const response = await doFetch(input, init);
      if (response.ok) {
        return response;
      }
      if (retryable && response.status >= 500 && attempt === 0) {
        attempt++;
        logger.warn('apiClient: retrying transient failure', {
          ...ctx,
          status: response.status,
        });
        await sleep(nextRetryDelay());
        continue;
      }
      if (response.status >= 400) {
        logger.error('apiClient: HTTP error', {
          ...ctx,
          status: response.status,
        });
      }
      return response;
    } catch (err) {
      // Network-level failure.
      if (retryable && attempt === 0) {
        attempt++;
        logger.warn('apiClient: retrying network failure', {
          ...ctx,
          error: (err as Error).message,
        });
        await sleep(nextRetryDelay());
        continue;
      }
      logger.error('apiClient: network failure', {
        ...ctx,
        error: (err as Error).message,
      });
      throw new ApiError({
        status: 0,
        code: 'NETWORK_ERROR',
        message: (err as Error).message || 'Network request failed',
      });
    }
  }
}

/**
 * Run a typed request and throw {@link ApiError} on non-2xx responses.
 * Returns the parsed JSON body typed as `T`, or `undefined` for 204 responses.
 */
async function runTyped<T>(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
): Promise<T> {
  const response = await requestWithRetry(input, init);
  if (!response.ok) {
    throw await apiErrorFromResponse(response);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  try {
    return (await response.json()) as T;
  } catch {
    // Endpoints that return an empty or non-JSON body — hand back `undefined`
    // rather than forcing callers to pick a type they don't care about.
    return undefined as T;
  }
}

// ─── Typed method surface ─────────────────────────────────────────────────────

/** Options accepted by every typed method on {@link ApiClient}. */
export interface ApiRequestOptions {
  /** Extra headers to merge onto the request. */
  headers?: HeadersInit;
  /** `AbortSignal` for cancellation. */
  signal?: AbortSignal;
}

interface BodyOptions extends ApiRequestOptions {
  /** JSON body — will be serialised automatically. */
  body?: unknown;
}

function buildInit(
  method: string,
  options: BodyOptions | undefined,
): RequestInit {
  const headers = new Headers(options?.headers);
  const init: RequestInit = { method, headers, signal: options?.signal };
  if (options && 'body' in options && options.body !== undefined) {
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    init.body = JSON.stringify(options.body);
  }
  return init;
}

/**
 * Centralised API client for the web app.
 *
 * - `request()` is the low-level escape hatch, kept for backwards
 *   compatibility with callers that want the raw `Response`.
 * - `get`, `post`, `put`, `patch`, `del` are typed helpers that parse JSON,
 *   retry idempotent GETs on transient failures, and throw {@link ApiError}
 *   on any non-2xx response.
 *
 * All requests are sent with `credentials: 'include'` so the HttpOnly
 * `cpcrm_session` cookie is attached automatically by the browser.  State-
 * changing requests (POST/PUT/PATCH/DELETE) include the CSRF token from the
 * `cpcrm_csrf` cookie as an `X-CSRF-Token` header.
 */
export interface ApiClient {
  /**
   * Low-level request API returning the raw {@link Response}.  Retries and
   * logging still apply, but the caller is responsible for interpreting the
   * response (including `response.ok`).
   */
  request: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

  /** GET a resource and parse the JSON body as `T`. */
  get: <T>(path: string, options?: ApiRequestOptions) => Promise<T>;
  /** POST JSON and parse the response body as `T`. */
  post: <T = unknown>(path: string, options?: BodyOptions) => Promise<T>;
  /** PUT JSON and parse the response body as `T`. */
  put: <T = unknown>(path: string, options?: BodyOptions) => Promise<T>;
  /** PATCH JSON and parse the response body as `T`. */
  patch: <T = unknown>(path: string, options?: BodyOptions) => Promise<T>;
  /** DELETE a resource and parse the response body as `T` (or `undefined`). */
  del: <T = unknown>(path: string, options?: BodyOptions) => Promise<T>;
}

/**
 * React hook that returns a stable {@link ApiClient}.
 *
 * Session sync (posting the Descope token to the server to establish the
 * HttpOnly cookie) is handled by the `<SessionSync />` component, not here.
 */
export function useApiClient(): ApiClient {
  const request = useCallback(
    (input: RequestInfo | URL, init?: RequestInit): Promise<Response> =>
      requestWithRetry(input, init),
    [],
  );

  const get = useCallback(
    <T,>(path: string, options?: ApiRequestOptions): Promise<T> =>
      runTyped<T>(path, buildInit('GET', options)),
    [],
  );

  const post = useCallback(
    <T = unknown,>(path: string, options?: BodyOptions): Promise<T> =>
      runTyped<T>(path, buildInit('POST', options)),
    [],
  );

  const put = useCallback(
    <T = unknown,>(path: string, options?: BodyOptions): Promise<T> =>
      runTyped<T>(path, buildInit('PUT', options)),
    [],
  );

  const patch = useCallback(
    <T = unknown,>(path: string, options?: BodyOptions): Promise<T> =>
      runTyped<T>(path, buildInit('PATCH', options)),
    [],
  );

  const del = useCallback(
    <T = unknown,>(path: string, options?: BodyOptions): Promise<T> =>
      runTyped<T>(path, buildInit('DELETE', options)),
    [],
  );

  return useMemo(
    () => ({ request, get, post, put, patch, del }),
    [request, get, post, put, patch, del],
  );
}

// ─── Session helpers ──────────────────────────────────────────────────────────

/**
 * Syncs the Descope session token to a server-side HttpOnly cookie by
 * calling POST /api/auth/session.  Called by `<SessionSync />` on login
 * and whenever the Descope SDK refreshes the token.
 */
export async function syncSessionCookie(sessionToken: string): Promise<void> {
  try {
    await fetch('/api/auth/session', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: sessionToken }),
    });
  } catch {
    // Best-effort — the existing cookie (if any) will continue to work
    // until it expires, and the next sync attempt will try again.
  }
}

/**
 * Clears the server-side session cookie by calling DELETE /api/auth/session.
 * Should be called during the logout flow.
 */
export async function clearServerSession(): Promise<void> {
  try {
    await fetch('/api/auth/session', {
      method: 'DELETE',
      credentials: 'include',
    });
  } catch {
    // Best-effort — Descope logout will still clear the client-side session.
  }
}
