import { describe, it, expect, afterEach } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import {
  createLegacyApiAlias,
  installApiTerminal404,
} from '../apiVersioning.js';
import { errorHandler, normalizeErrorResponses } from '../../middleware/errorHandler.js';
import { requestId } from '../../middleware/requestId.js';

/**
 * Builds a minimal Express app that mirrors the `/api/v1` + legacy `/api`
 * mount pattern used by `src/index.ts`, wired against a tiny stub router
 * that only exposes `GET /health`. The goal is to exercise the mount
 * semantics (header stamping, fallthrough, terminal 404, error formatting)
 * in isolation — without booting the real app, hitting the database, or
 * stubbing Descope.
 */
function buildApp(): Promise<{ server: Server; url: string }> {
  const app = express();
  app.use(express.json());
  app.use(requestId);
  app.use(normalizeErrorResponses);

  const apiRouter = express.Router();
  apiRouter.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  installApiTerminal404(apiRouter);

  // Versioned mount must be registered first so /api/v1 traffic is never
  // touched by the legacy alias middleware.
  app.use('/api/v1', apiRouter);
  app.use('/api', createLegacyApiAlias(apiRouter));

  // Production-style SPA fallback — returns index.html for any unmatched
  // path. The /api/v1 terminal 404 must prevent versioned API misses from
  // reaching this handler.
  app.use((_req, res) => {
    res.type('html').send('<html>spa index</html>');
  });

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

describe('API versioning mount pattern', () => {
  let server: Server | undefined;

  afterEach(async () => {
    if (server) {
      await closeServer(server);
      server = undefined;
    }
  });

  describe('/api/v1 (versioned)', () => {
    it('serves matched routes without Deprecation headers', async () => {
      const built = await buildApp();
      server = built.server;

      const res = await fetch(`${built.url}/api/v1/health`);

      expect(res.status).toBe(200);
      expect(res.headers.get('Deprecation')).toBeNull();
      expect(res.headers.get('Link')).toBeNull();
      await expect(res.json()).resolves.toEqual({ status: 'ok' });
    });

    it('returns the canonical 404 payload for unknown routes', async () => {
      const built = await buildApp();
      server = built.server;

      const res = await fetch(`${built.url}/api/v1/does-not-exist`);

      expect(res.status).toBe(404);
      expect(res.headers.get('Deprecation')).toBeNull();
      expect(res.headers.get('Link')).toBeNull();
      expect(res.headers.get('content-type')).toMatch(/application\/json/);

      const body = (await res.json()) as {
        error: { code: string; message: string; requestId?: string };
      };
      expect(body.error.code).toBe('NOT_FOUND');
      expect(body.error.message).toContain('/api/v1/does-not-exist');
      expect(body.error.requestId).toBeTypeOf('string');
    });

    it('does not fall through to the SPA index.html for missed routes', async () => {
      const built = await buildApp();
      server = built.server;

      const res = await fetch(`${built.url}/api/v1/does-not-exist`);

      expect(res.status).toBe(404);
      expect(res.headers.get('content-type')).not.toMatch(/text\/html/);
    });
  });

  describe('/api (legacy alias)', () => {
    it('serves matched routes and stamps deprecation headers', async () => {
      const built = await buildApp();
      server = built.server;

      const res = await fetch(`${built.url}/api/health`);

      expect(res.status).toBe(200);
      expect(res.headers.get('Deprecation')).toBe('true');
      expect(res.headers.get('Link')).toBe(
        '</api/v1/health>; rel="successor-version"',
      );
      await expect(res.json()).resolves.toEqual({ status: 'ok' });
    });

    it('preserves query strings in the successor-version Link header', async () => {
      const built = await buildApp();
      server = built.server;

      const res = await fetch(`${built.url}/api/health?limit=1`);

      expect(res.status).toBe(200);
      expect(res.headers.get('Link')).toBe(
        '</api/v1/health?limit=1>; rel="successor-version"',
      );
    });

    it('returns a canonical 404 (with deprecation headers) for unknown legacy routes', async () => {
      const built = await buildApp();
      server = built.server;

      const res = await fetch(`${built.url}/api/nope`);

      expect(res.status).toBe(404);
      expect(res.headers.get('Deprecation')).toBe('true');
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('/api/v1 fallthrough guard', () => {
    it('never stamps /api/v1 requests with deprecation headers, even on 404', async () => {
      const built = await buildApp();
      server = built.server;

      // Several variations that previously could have leaked through:
      const cases = [
        '/api/v1/unknown',
        '/api/v1/health/nested',
        '/api/v1/health?foo=bar',
      ];
      for (const path of cases) {
        const res = await fetch(`${built.url}${path}`);
        expect(
          res.headers.get('Deprecation'),
          `Deprecation header leaked on ${path}`,
        ).toBeNull();
        const link = res.headers.get('Link');
        expect(link, `Link header leaked on ${path}`).toBeNull();
      }
    });

    it('never emits a malformed /api/v1/v1/... successor Link on /api/v1 misses', async () => {
      const built = await buildApp();
      server = built.server;

      const res = await fetch(`${built.url}/api/v1/does-not-exist`);

      expect(res.headers.get('Link')).toBeNull();
    });
  });
});
