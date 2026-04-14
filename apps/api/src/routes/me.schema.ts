import { z } from 'zod';
import { registry } from '../lib/openapi.js';
import { commonResponses } from '../lib/openapi.js';

// User schema - represents the authenticated user from JWT
const UserSchema = z.object({
  userId: z.string(),
  name: z.string(),
  email: z.string().email(),
  tenantId: z.string().optional(),
  organisationId: z.string().optional(),
  roles: z.array(z.string()).optional(),
  permissions: z.array(z.string()).optional(),
});

// Response schema
export const MeResponseSchema = z.object({
  user: UserSchema.optional(),
  isSuperAdmin: z.boolean(),
});

// Register the route
registry.registerPath({
  method: 'get',
  path: '/me',
  description: 'Get current authenticated user information',
  tags: ['Authentication'],
  security: [{ bearerAuth: [] }],
  request: {},
  responses: {
    200: {
      description: 'Current user information',
      content: {
        'application/json': {
          schema: MeResponseSchema,
        },
      },
    },
    401: commonResponses[401],
    500: commonResponses[500],
  },
});
