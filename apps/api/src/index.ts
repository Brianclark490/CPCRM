import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import type { Options, HttpLogger } from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config } from './lib/config.js';
import { logger } from './lib/logger.js';
import { runMigrations } from './db/runMigrations.js';
import { backfillSeedObjects } from './db/backfillSeedObjects.js';
import { healthRouter } from './routes/health.js';
import { authSessionRouter } from './routes/authSession.js';
import { meRouter } from './routes/me.js';
import { organisationsRouter } from './routes/organisations.js';
import { accountsRouter } from './routes/accounts.js';
import { profileRouter } from './routes/profile.js';
import { adminObjectsRouter } from './routes/adminObjects.js';
import { adminRelationshipsRouter } from './routes/adminRelationships.js';
import { adminPipelinesRouter } from './routes/adminPipelines.js';
import { recordsRouter } from './routes/records.js';
import { recordRelationshipsRouter } from './routes/recordRelationships.js';
import { adminStageGatesRouter } from './routes/adminStageGates.js';
import { pipelineAnalyticsRouter } from './routes/pipelineAnalytics.js';
import { adminUsersRouter } from './routes/adminUsers.js';
import { platformTenantsRouter } from './routes/platformTenants.js';
import { adminTenantSettingsRouter } from './routes/adminTenantSettings.js';
import { componentRegistryRouter } from './routes/adminPageLayouts.js';
import { pageLayoutsRouter } from './routes/pageLayouts.js';
import { adminTargetsRouter } from './routes/adminTargets.js';
import { targetsRouter } from './routes/targets.js';
import { securityHeaders } from './middleware/security.js';
import { globalLimiter, writeMethodLimiter, authLimiter } from './middleware/rateLimiter.js';
import { requireCsrf } from './middleware/csrf.js';
import { requestId } from './middleware/requestId.js';
import { errorHandler, normalizeErrorResponses } from './middleware/errorHandler.js';
import { createLegacyApiAlias, installApiTerminal404 } from './lib/apiVersioning.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

// Trust proxy headers when behind Azure's load balancer so rate limiters
// can identify individual clients instead of seeing the proxy's IP
app.set('trust proxy', config.trustProxy);

// pino-http is a CommonJS module; NodeNext moduleResolution requires an explicit
// cast to resolve the CJS/ESM interop type mismatch at compile time.
type PinoHttpFactory = (opts: Options) => HttpLogger;
const httpLogger = pinoHttp as unknown as PinoHttpFactory;

app.use(securityHeaders);
app.use(cors({ origin: config.corsOrigin, credentials: true }));
app.use(cookieParser());
app.use(express.json());
// Assign a UUID to every incoming request BEFORE pino-http so the logger
// picks it up via `req.id`. The same id is echoed as `X-Request-Id` and
// surfaced in the canonical error response shape for log correlation.
app.use(requestId);
app.use(
  httpLogger({
    logger,
    // pino-http reads `req.id` from the request — the `requestId` middleware
    // above always assigns one, so log lines are correlated with the same
    // UUID we echo back to clients in the `X-Request-Id` header.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    genReqId: (req: any) => req.id ?? '',
  }),
);

// Silence /favicon.ico requests with 204 No Content.  Without this, requests
// that don't match a static file in production fall through to the SPA
// catch-all, which would return index.html with an image content-type — a
// broken favicon.  This handler must stay before the static middleware.
app.get('/favicon.ico', (_req, res) => {
  res.status(204).end();
});

// ─── API router (mounted under /api/v1 and legacy /api) ─────────────────────
//
// Every API route is registered on a single Express router that is mounted
// twice:
//   - `/api/v1` — the canonical versioned prefix (issue #375).
//   - `/api`    — a legacy alias that emits a `Deprecation: true` header and
//                 a `Link: </api/v1/...>; rel="successor-version"` header on
//                 every response so clients can discover the new prefix.
//
// The versioning policy (including the minimum six-month deprecation window
// for breaking changes) is documented in `docs/architecture/adr-005-api-versioning.md`.

const apiRouter = express.Router({ mergeParams: true });

// Normalise any legacy `{error: 'string'}` response bodies emitted by
// routes that haven't been migrated to throw AppError yet so every API
// error response conforms to the canonical shape.
apiRouter.use(normalizeErrorResponses);

// Rate limiting applies to every API request.
apiRouter.use(globalLimiter);
apiRouter.use(writeMethodLimiter);

// Auth session routes handle cookie-based session establishment and CSRF token
// provisioning.  They must be mounted *before* the CSRF middleware because:
//   - POST /auth/session is what *creates* the CSRF cookie
//   - GET  /auth/csrf-token is what *refreshes* it
//   - DELETE /auth/session tears down the session (no CSRF needed)
apiRouter.use('/auth', authSessionRouter);

// Serve OpenAPI documentation in dev/staging (not production)
if (config.env !== 'production') {
  try {
    const openapiPath = join(__dirname, '../openapi.json');
    const openapiDoc = JSON.parse(readFileSync(openapiPath, 'utf-8'));

    // Serve the raw OpenAPI spec as JSON
    apiRouter.get('/openapi.json', (_req, res) => {
      res.json(openapiDoc);
    });

    // Serve Swagger UI
    apiRouter.use(
      '/docs',
      swaggerUi.serve,
      swaggerUi.setup(openapiDoc, {
        customSiteTitle: 'CPCRM API Documentation',
        customCss: '.swagger-ui .topbar { display: none }',
      }),
    );

    logger.info('OpenAPI documentation available at /api/v1/docs');
  } catch (err) {
    logger.warn({ err }, 'OpenAPI spec not found - run build to generate it');
  }
}

// CSRF protection for all other state-changing API requests.
apiRouter.use(requireCsrf);

apiRouter.use('/me', authLimiter);
apiRouter.use('/health', healthRouter);
apiRouter.use('/me', meRouter);
apiRouter.use('/organisations', organisationsRouter);
apiRouter.use('/accounts', accountsRouter);
apiRouter.use('/profile', profileRouter);
apiRouter.use('/admin/objects', adminObjectsRouter);
apiRouter.use('/admin/relationships', adminRelationshipsRouter);
apiRouter.use('/admin/pipelines', adminPipelinesRouter);
apiRouter.use('/objects/:apiName/records', recordsRouter);
apiRouter.use('/objects/:apiName/page-layout', pageLayoutsRouter);
apiRouter.use('/records', recordRelationshipsRouter);
apiRouter.use('/admin/stages/:stageId/gates', adminStageGatesRouter);
apiRouter.use('/pipelines', pipelineAnalyticsRouter);
apiRouter.use('/admin/users', adminUsersRouter);
apiRouter.use('/platform/tenants', platformTenantsRouter);
apiRouter.use('/admin/tenant-settings', adminTenantSettingsRouter);
apiRouter.use('/admin/component-registry', componentRegistryRouter);
apiRouter.use('/admin/targets', adminTargetsRouter);
apiRouter.use('/targets', targetsRouter);

// Terminal 404 for the shared API router — must be the LAST middleware
// registered on `apiRouter`. See `lib/apiVersioning.ts` for the rationale.
installApiTerminal404(apiRouter);

// Canonical v1 mount — registered first so `/api/v1/...` requests are
// dispatched through the versioned prefix without touching the legacy alias.
app.use('/api/v1', apiRouter);

// Legacy `/api` alias — kept until the deprecation window elapses. The
// middleware short-circuits any `/api/v1/...` request that somehow falls
// through the versioned mount, and stamps RFC 8594/8288 deprecation
// headers on responses served from the genuine legacy surface.
app.use('/api', createLegacyApiAlias(apiRouter));

if (config.env === 'production') {
  // In production the CI pipeline copies the built frontend to public/ alongside
  // the compiled API in dist/.  Serve it as static files and fall back to
  // index.html for any unmatched path so that React Router's client-side
  // navigation works when a user deep-links or refreshes the page.
  const frontendDist = join(__dirname, '../public');
  app.use(express.static(frontendDist));
  app.use((_req, res) => {
    res.sendFile(join(frontendDist, 'index.html'));
  });
} else {
  app.get('/', (_req, res) => {
    res.json({ name: 'cpcrm-api', status: 'ok' });
  });
}

// Global error-handling middleware — must be registered LAST so it catches
// errors thrown from any handler (including the SPA fallback) and converts
// them into the canonical `{ error: { code, message, details?, requestId } }`
// payload. Express 5 forwards both synchronous and async thrown errors here
// automatically.
app.use(errorHandler);

// Run database migrations, backfill seed data, then start the HTTP server.
runMigrations()
  .then(() => backfillSeedObjects())
  .then(() => {
    app.listen(config.port, () => {
      logger.info({ port: config.port, env: config.env, corsOrigin: config.corsOrigin }, 'API server started');
    });
  })
  .catch((err: unknown) => {
    logger.error({ err }, 'Failed to apply database migrations; aborting startup');
    process.exit(1);
  });

export { app };
