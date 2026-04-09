import { Router } from 'express';
import type { Request, Response } from 'express';
import { pool } from '../db/client.js';
import { logger } from '../lib/logger.js';

export const healthRouter = Router();

export async function handleHealthCheck(_req: Request, res: Response): Promise<void> {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch (err) {
    logger.error({ err }, 'Health check failed: database unreachable');
    res.status(503).json({ status: 'degraded', error: 'Database connection failed' });
  }
}

healthRouter.get('/', handleHealthCheck);
