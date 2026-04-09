import rateLimit from 'express-rate-limit';
import type { RequestHandler } from 'express';

/**
 * Global rate limiter — 100 requests per minute per IP.
 * Applied to all /api routes.
 */
export const globalLimiter: RequestHandler = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Strict rate limiter — 20 requests per minute per IP for write operations.
 * Applied to POST, PUT, PATCH, and DELETE requests.
 */
const writeLimiter: RequestHandler = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Wrapper that applies the write rate limiter only to mutating HTTP methods.
 * GET and HEAD requests pass through without consuming a write-limit token.
 */
export const writeMethodLimiter: RequestHandler = (req, res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    writeLimiter(req, res, next);
    return;
  }
  next();
};

/**
 * Auth rate limiter — 10 requests per minute per IP.
 * Applied to authentication-related endpoints.
 */
export const authLimiter: RequestHandler = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});
