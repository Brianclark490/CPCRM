import { describe, it, expect } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import { z } from 'zod';
import { AppError } from '../../lib/appError.js';
import { errorHandler, normalizeErrorResponses } from '../errorHandler.js';
import { requestId } from '../requestId.js';

/**
 * Build a minimal express app with the full error pipeline wired up so we
 * can exercise the middleware end-to-end over a real HTTP connection.
 */
function buildApp(
  register: (app: express.Express) => void,
): Promise<{ server: Server; url: string }> {
  const app = express();
  app.use(express.json());
  app.use(requestId);
  app.use(normalizeErrorResponses);
  register(app);
  app.use(errorHandler);

  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        server.close();
        reject(new Error('Failed to bind test server'));
        return;
      }
      resolve({ server, url: `http://127.0.0.1:${addr.port}` });
    });
  });
}

async function closeServer(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

describe('errorHandler middleware', () => {
  it('formats thrown AppError into the canonical shape with requestId', async () => {
    const { server, url } = await buildApp((app) => {
      app.get('/boom', (_req, _res, next) => {
        next(AppError.notFound('Widget not found'));
      });
    });

    try {
      const res = await fetch(`${url}/boom`);
      expect(res.status).toBe(404);
      expect(res.headers.get('X-Request-Id')).toBeTruthy();
      const body = (await res.json()) as {
        error: {
          code: string;
          message: string;
          requestId?: string;
          details?: unknown;
        };
      };
      expect(body.error.code).toBe('NOT_FOUND');
      expect(body.error.message).toBe('Widget not found');
      expect(body.error.requestId).toBe(res.headers.get('X-Request-Id'));
    } finally {
      await closeServer(server);
    }
  });

  it('formats a VALIDATION_ERROR with fieldErrors details', async () => {
    const { server, url } = await buildApp((app) => {
      app.get('/validate', (_req, _res, next) => {
        next(
          AppError.validation('Request validation failed', {
            fieldErrors: { email: 'invalid format' },
          }),
        );
      });
    });

    try {
      const res = await fetch(`${url}/validate`);
      expect(res.status).toBe(400);
      const body = (await res.json()) as {
        error: { code: string; details?: { fieldErrors?: unknown } };
      };
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.details?.fieldErrors).toEqual({
        email: 'invalid format',
      });
    } finally {
      await closeServer(server);
    }
  });

  it('converts thrown ZodError into a 400 VALIDATION_ERROR with fieldErrors', async () => {
    const schema = z.object({
      email: z.string().email(),
      age: z.number().int().min(18),
    });
    const { server, url } = await buildApp((app) => {
      app.post('/z', (req, _res, next) => {
        try {
          schema.parse(req.body);
        } catch (e) {
          next(e);
          return;
        }
      });
    });

    try {
      const res = await fetch(`${url}/z`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'not-an-email', age: 10 }),
      });
      expect(res.status).toBe(400);
      const body = (await res.json()) as {
        error: {
          code: string;
          message: string;
          details?: { fieldErrors?: Record<string, string> };
        };
      };
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.details?.fieldErrors).toBeDefined();
      expect(Object.keys(body.error.details!.fieldErrors!)).toEqual(
        expect.arrayContaining(['email', 'age']),
      );
    } finally {
      await closeServer(server);
    }
  });

  it('maps legacy service errors (Error with .code) to the correct status', async () => {
    const { server, url } = await buildApp((app) => {
      app.get('/legacy', (_req, _res, next) => {
        const err = new Error('Duplicate api name') as Error & {
          code?: string;
        };
        err.code = 'CONFLICT';
        next(err);
      });
    });

    try {
      const res = await fetch(`${url}/legacy`);
      expect(res.status).toBe(409);
      const body = (await res.json()) as {
        error: { code: string; message: string };
      };
      expect(body.error.code).toBe('CONFLICT');
      expect(body.error.message).toBe('Duplicate api name');
    } finally {
      await closeServer(server);
    }
  });

  it('returns 500 INTERNAL_ERROR for unknown errors without leaking internals', async () => {
    const { server, url } = await buildApp((app) => {
      app.get('/kaboom', (_req, _res, next) => {
        next(new Error('Internals leak: password=hunter2'));
      });
    });

    try {
      const res = await fetch(`${url}/kaboom`);
      expect(res.status).toBe(500);
      const body = (await res.json()) as {
        error: { code: string; message: string };
      };
      expect(body.error.code).toBe('INTERNAL_ERROR');
      expect(body.error.message).toBe('An unexpected error occurred');
      // Make absolutely sure no stack trace or secret leaked.
      expect(JSON.stringify(body)).not.toContain('hunter2');
    } finally {
      await closeServer(server);
    }
  });

  it('every response includes an X-Request-Id header (including success)', async () => {
    const { server, url } = await buildApp((app) => {
      app.get('/ok', (_req, res) => res.json({ ok: true }));
    });

    try {
      const res = await fetch(`${url}/ok`);
      expect(res.status).toBe(200);
      expect(res.headers.get('X-Request-Id')).toBeTruthy();
    } finally {
      await closeServer(server);
    }
  });

  it('honours an incoming X-Request-Id header from upstream proxies', async () => {
    const { server, url } = await buildApp((app) => {
      app.get('/ok', (_req, res) => res.json({ ok: true }));
    });

    try {
      const incoming = 'abc-123-deadbeef';
      const res = await fetch(`${url}/ok`, {
        headers: { 'X-Request-Id': incoming },
      });
      expect(res.headers.get('X-Request-Id')).toBe(incoming);
    } finally {
      await closeServer(server);
    }
  });
});

describe('normalizeErrorResponses middleware', () => {
  it('rewrites legacy {error: "string"} responses into the canonical shape', async () => {
    const { server, url } = await buildApp((app) => {
      app.get('/legacy', (_req, res) => {
        res.status(403).json({ error: 'CSRF token mismatch' });
      });
    });

    try {
      const res = await fetch(`${url}/legacy`);
      expect(res.status).toBe(403);
      const body = (await res.json()) as {
        error: { code: string; message: string; requestId?: string };
      };
      expect(body.error.code).toBe('FORBIDDEN');
      expect(body.error.message).toBe('CSRF token mismatch');
      expect(body.error.requestId).toBe(res.headers.get('X-Request-Id'));
    } finally {
      await closeServer(server);
    }
  });

  it('preserves top-level code on legacy responses', async () => {
    const { server, url } = await buildApp((app) => {
      app.get('/legacy', (_req, res) => {
        res.status(409).json({ error: 'Duplicate', code: 'CONFLICT' });
      });
    });

    try {
      const res = await fetch(`${url}/legacy`);
      const body = (await res.json()) as {
        error: { code: string; message: string };
      };
      expect(body.error.code).toBe('CONFLICT');
      expect(body.error.message).toBe('Duplicate');
    } finally {
      await closeServer(server);
    }
  });

  it('carries legacy fieldErrors into error.details.fieldErrors', async () => {
    const { server, url } = await buildApp((app) => {
      app.get('/legacy', (_req, res) => {
        res.status(422).json({
          error: 'Validation failed',
          fieldErrors: { email: 'invalid' },
        });
      });
    });

    try {
      const res = await fetch(`${url}/legacy`);
      const body = (await res.json()) as {
        error: { code: string; details?: { fieldErrors?: unknown } };
      };
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.details?.fieldErrors).toEqual({ email: 'invalid' });
    } finally {
      await closeServer(server);
    }
  });

  it('leaves 2xx responses untouched', async () => {
    const { server, url } = await buildApp((app) => {
      app.get('/ok', (_req, res) => res.json({ id: 1, name: 'alice' }));
    });

    try {
      const res = await fetch(`${url}/ok`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ id: 1, name: 'alice' });
    } finally {
      await closeServer(server);
    }
  });

  it('only rewrites legacy bodies once when already canonical', async () => {
    const { server, url } = await buildApp((app) => {
      app.get('/already', (_req, res) => {
        res.status(400).json({
          error: {
            code: 'CUSTOM',
            message: 'I formatted this myself',
          },
        });
      });
    });

    try {
      const res = await fetch(`${url}/already`);
      const body = (await res.json()) as {
        error: { code: string; message: string; requestId?: string };
      };
      expect(body.error.code).toBe('CUSTOM');
      expect(body.error.message).toBe('I formatted this myself');
      // requestId injected but nothing else touched.
      expect(body.error.requestId).toBe(res.headers.get('X-Request-Id'));
    } finally {
      await closeServer(server);
    }
  });
});

describe('requestId middleware', () => {
  it('assigns req.id and echoes it as X-Request-Id', async () => {
    const captured: Array<string | undefined> = [];
    const { server, url } = await buildApp((app) => {
      app.get('/', (req, res) => {
        captured.push(req.id as string | undefined);
        res.json({ id: req.id });
      });
    });

    try {
      const res = await fetch(`${url}/`);
      const header = res.headers.get('X-Request-Id');
      expect(header).toBeTruthy();
      const body = (await res.json()) as { id: string };
      expect(body.id).toBe(header);
      expect(captured[0]).toBe(header);
    } finally {
      await closeServer(server);
    }
  });
});

