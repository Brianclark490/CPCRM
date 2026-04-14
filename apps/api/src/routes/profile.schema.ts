import { z } from 'zod';
import { registry } from '../lib/openapi.js';
import { commonResponses } from '../lib/openapi.js';

// Request schema
export const UpdateProfileRequestSchema = z.object({
  displayName: z.string().optional(),
  jobTitle: z.string().optional(),
});

// Response schema
const ProfileSchema = z.object({
  userId: z.string(),
  email: z.string().email(),
  displayName: z.string().optional(),
  phone: z.string().nullable().optional(),
  jobTitle: z.string().nullable().optional(),
  department: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  updatedBy: z.string().optional(),
});

// Register routes

// GET /profile
registry.registerPath({
  method: 'get',
  path: '/profile',
  description: 'Get current user profile',
  tags: ['Profile'],
  security: [{ bearerAuth: [] }],
  request: {},
  responses: {
    200: {
      description: 'User profile',
      content: {
        'application/json': {
          schema: ProfileSchema,
        },
      },
    },
    401: commonResponses[401],
    500: commonResponses[500],
  },
});

// PUT /profile
registry.registerPath({
  method: 'put',
  path: '/profile',
  description: 'Update current user profile',
  tags: ['Profile'],
  security: [{ bearerAuth: [] }],
  request: {
    body: {
      content: {
        'application/json': {
          schema: UpdateProfileRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Profile updated successfully',
      content: {
        'application/json': {
          schema: ProfileSchema,
        },
      },
    },
    400: commonResponses[400],
    401: commonResponses[401],
    404: commonResponses[404],
    500: commonResponses[500],
  },
});
