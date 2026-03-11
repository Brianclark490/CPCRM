import pino from 'pino';
import { config } from './config.js';

/**
 * Application logger backed by pino.
 *
 * Outputs structured JSON, which is suitable for both local development and
 * Azure Monitor / Log Analytics ingestion in deployed environments.
 *
 * Log level is controlled by the LOG_LEVEL environment variable (default: 'info').
 * In test environments the level is forced to 'silent' to keep test output clean.
 */
export const logger = pino({
  name: 'cpcrm-api',
  level: config.env === 'test' ? 'silent' : config.logLevel,
});
