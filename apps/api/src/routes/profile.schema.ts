import { z } from 'zod';
import { registry } from '../lib/openapi.js';
import { commonResponses } from '../lib/openapi.js';

// Request schema
export const UpdateProfileRequestSchema = z.object({
  name: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  title: z.string().optional(),
  department: z.string().optional(),
});

// Response schema
const ProfileSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  name: z.string(),
  email: z.string().email(),
  phone: z.string().nullable(),
  title: z.string().nullable(),
  department: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
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
    500: commonResponses[500],
  },
});
