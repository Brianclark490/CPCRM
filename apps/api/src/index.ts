import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import pinoHttp from 'pino-http';
import type { Options, HttpLogger } from 'pino-http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config } from './lib/config.js';
import { logger } from './lib/logger.js';
import { runMigrations } from './db/runMigrations.js';
import { healthRouter } from './routes/health.js';
import { meRouter } from './routes/me.js';
import { organisationsRouter } from './routes/organisations.js';
import { opportunitiesRouter } from './routes/opportunities.js';
import { accountsRouter } from './routes/accounts.js';
import { profileRouter } from './routes/profile.js';
import { adminObjectsRouter } from './routes/adminObjects.js';
import { adminRelationshipsRouter } from './routes/adminRelationships.js';
import { adminPipelinesRouter } from './routes/adminPipelines.js';
import { recordsRouter } from './routes/records.js';
import { recordRelationshipsRouter } from './routes/recordRelationships.js';
import { adminStageGatesRouter } from './routes/adminStageGates.js';
import { pipelineAnalyticsRouter } from './routes/pipelineAnalytics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

// pino-http is a CommonJS module; NodeNext moduleResolution requires an explicit
// cast to resolve the CJS/ESM interop type mismatch at compile time.
type PinoHttpFactory = (opts: Options) => HttpLogger;
const httpLogger = pinoHttp as unknown as PinoHttpFactory;

app.use(cors({ origin: config.corsOrigin }));
app.use(express.json());
app.use(httpLogger({ logger }));

// Silence /favicon.ico requests with 204 No Content.  Without this, requests
// that don't match a static file in production fall through to the SPA
// catch-all, which would return index.html with an image content-type — a
// broken favicon.  This handler must stay before the static middleware.
app.get('/favicon.ico', (_req, res) => {
  res.status(204).end();
});

// All API routes are mounted under /api so they co-exist with the frontend on
// the same origin without path conflicts.
app.use('/api/health', healthRouter);
app.use('/api/me', meRouter);
app.use('/api/organisations', organisationsRouter);
app.use('/api/opportunities', opportunitiesRouter);
app.use('/api/accounts', accountsRouter);
app.use('/api/profile', profileRouter);
app.use('/api/admin/objects', adminObjectsRouter);
app.use('/api/admin/relationships', adminRelationshipsRouter);
app.use('/api/admin/pipelines', adminPipelinesRouter);
app.use('/api/objects/:apiName/records', recordsRouter);
app.use('/api/records', recordRelationshipsRouter);
app.use('/api/admin/stages/:stageId/gates', adminStageGatesRouter);
app.use('/api/pipelines', pipelineAnalyticsRouter);

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

// Run database migrations then start the HTTP server.
runMigrations()
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
