import { z } from 'zod';
import { registry } from '../lib/openapi.js';

// Response schemas
export const HealthCheckOkResponseSchema = z.object({
  status: z.literal('ok'),
});

export const HealthCheckDegradedResponseSchema = z.object({
  status: z.literal('degraded'),
  error: z.string(),
});

// Register the route
registry.registerPath({
  method: 'get',
  path: '/health',
  description: 'Health check endpoint - verifies API and database connectivity',
  tags: ['System'],
  security: [], // No auth required for health check
  request: {},
  responses: {
    200: {
      description: 'Service is healthy',
      content: {
        'application/json': {
          schema: HealthCheckOkResponseSchema,
        },
      },
    },
    503: {
      description: 'Service is degraded',
      content: {
        'application/json': {
          schema: HealthCheckDegradedResponseSchema,
        },
      },
    },
  },
});
