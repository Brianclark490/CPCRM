import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import pinoHttp from 'pino-http';
import type { Options, HttpLogger } from 'pino-http';
import { config } from './lib/config.js';
import { logger } from './lib/logger.js';
import { healthRouter } from './routes/health.js';
import { meRouter } from './routes/me.js';

const app = express();

// pino-http is a CommonJS module; NodeNext moduleResolution requires an explicit
// cast to resolve the CJS/ESM interop type mismatch at compile time.
type PinoHttpFactory = (opts: Options) => HttpLogger;
const httpLogger = pinoHttp as unknown as PinoHttpFactory;

app.use(cors({ origin: config.corsOrigin }));
app.use(express.json());
app.use(httpLogger({ logger }));

app.use('/health', healthRouter);
app.use('/me', meRouter);

app.listen(config.port, () => {
  logger.info({ port: config.port, env: config.env }, 'API server started');
});

export { app };
