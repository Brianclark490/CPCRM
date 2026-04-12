import { describe, it, expect } from 'vitest';
import express from 'express';
import { createServer } from 'node:http';
import { securityHeaders } from '../security.js';

/**
 * Starts a minimal Express app with the security middleware and returns
 * a function to make requests against it. The server is closed after
 * the callback runs.
 */
async function requestWithHeaders(): Promise<Record<string, string>> {
  const app = express();
  app.use(securityHeaders);
  app.get('/', (_req, res) => res.json({ ok: true }));

  const server = createServer(app);

  return new Promise((resolve, reject) => {
    server.listen(0, () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Failed to bind server'));
        return;
      }

      const port = address.port;
      fetch(`http://127.0.0.1:${port}/`)
        .then((res) => {
          const headers: Record<string, string> = {};
          res.headers.forEach((value, key) => {
            headers[key] = value;
          });
          server.close();
          resolve(headers);
        })
        .catch((err) => {
          server.close();
          reject(err);
        });
    });
  });
}

describe('security middleware (helmet + CSP)', () => {
  it('sets the Content-Security-Policy header', async () => {
    const headers = await requestWithHeaders();
    expect(headers['content-security-policy']).toBeDefined();
  });

  it('includes self as default-src', async () => {
    const headers = await requestWithHeaders();
    const csp = headers['content-security-policy'];
    expect(csp).toContain("default-src 'self'");
  });

  it('allows Descope domains in script-src', async () => {
    const headers = await requestWithHeaders();
    const csp = headers['content-security-policy'];
    expect(csp).toContain("script-src 'self' https://descope.com https://*.descope.com");
  });

  it('allows unsafe-inline and Google Fonts in style-src', async () => {
    const headers = await requestWithHeaders();
    const csp = headers['content-security-policy'];
    expect(csp).toContain("style-src 'self' 'unsafe-inline' https://fonts.googleapis.com");
  });

  it('allows data URIs and HTTPS images in img-src', async () => {
    const headers = await requestWithHeaders();
    const csp = headers['content-security-policy'];
    expect(csp).toContain("img-src 'self' data: https:");
  });

  it('allows Descope API domains in connect-src', async () => {
    const headers = await requestWithHeaders();
    const csp = headers['content-security-policy'];
    expect(csp).toContain("connect-src 'self' https://*.descope.com https://api.descope.com");
  });

  it('allows Descope iframes in frame-src', async () => {
    const headers = await requestWithHeaders();
    const csp = headers['content-security-policy'];
    expect(csp).toContain('frame-src https://*.descope.com');
  });

  it('allows Google Fonts in font-src', async () => {
    const headers = await requestWithHeaders();
    const csp = headers['content-security-policy'];
    expect(csp).toContain("font-src 'self' https://fonts.gstatic.com");
  });

  it('sets X-Content-Type-Options to nosniff', async () => {
    const headers = await requestWithHeaders();
    expect(headers['x-content-type-options']).toBe('nosniff');
  });

  it('sets X-Frame-Options header', async () => {
    const headers = await requestWithHeaders();
    expect(headers['x-frame-options']).toBeDefined();
  });

  it('removes X-Powered-By header', async () => {
    const headers = await requestWithHeaders();
    expect(headers['x-powered-by']).toBeUndefined();
  });
});
