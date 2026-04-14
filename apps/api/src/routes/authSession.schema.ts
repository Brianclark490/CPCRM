import { z } from 'zod';
import { registry } from '../lib/openapi.js';
import { commonResponses } from '../lib/openapi.js';

// POST /auth/session - Create session
export const CreateSessionRequestSchema = z.object({
  token: z.string().min(1, 'Token is required'),
});

export const CreateSessionResponseSchema = z.object({
  ok: z.boolean(),
  csrfToken: z.string(),
});

registry.registerPath({
  method: 'post',
  path: '/auth/session',
  description: 'Validate Descope token and create session cookies',
  tags: ['Authentication'],
  security: [], // No auth required for session creation
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateSessionRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Session created successfully',
      content: {
        'application/json': {
          schema: CreateSessionResponseSchema,
        },
      },
    },
    400: commonResponses[400],
    401: commonResponses[401],
    503: {
      description: 'Authentication service unavailable',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
  },
});

// DELETE /auth/session - Delete session
export const DeleteSessionResponseSchema = z.object({
  ok: z.boolean(),
});

registry.registerPath({
  method: 'delete',
  path: '/auth/session',
  description: 'Clear session cookies (logout)',
  tags: ['Authentication'],
  security: [], // No auth required for logout
  request: {},
  responses: {
    200: {
      description: 'Session cleared successfully',
      content: {
        'application/json': {
          schema: DeleteSessionResponseSchema,
        },
      },
    },
  },
});

// GET /auth/csrf-token - Get CSRF token
export const CsrfTokenResponseSchema = z.object({
  csrfToken: z.string(),
});

registry.registerPath({
  method: 'get',
  path: '/auth/csrf-token',
  description: 'Get a fresh CSRF token',
  tags: ['Authentication'],
  security: [], // No auth required for CSRF token
  request: {},
  responses: {
    200: {
      description: 'CSRF token generated',
      content: {
        'application/json': {
          schema: CsrfTokenResponseSchema,
        },
      },
    },
  },
});
