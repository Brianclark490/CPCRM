import { z } from 'zod';
import { registry } from '../lib/openapi.js';
import { commonResponses } from '../lib/openapi.js';

// Request schemas
export const CreateUserRequestSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1, 'Name is required'),
  role: z.string().optional(),
});

export const UpdateUserRequestSchema = z.object({
  name: z.string().optional(),
  role: z.string().optional(),
  is_active: z.boolean().optional(),
});

// Response schema
const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  role: z.string().nullable(),
  is_active: z.boolean(),
  tenant_id: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

// Register routes

// POST /admin/users
registry.registerPath({
  method: 'post',
  path: '/admin/users',
  description: 'Create a new user',
  tags: ['Admin - Users'],
  security: [{ bearerAuth: [] }],
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateUserRequestSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'User created successfully',
      content: {
        'application/json': {
          schema: UserSchema,
        },
      },
    },
    400: commonResponses[400],
    401: commonResponses[401],
    409: commonResponses[409],
    500: commonResponses[500],
  },
});

// GET /admin/users
registry.registerPath({
  method: 'get',
  path: '/admin/users',
  description: 'List all users',
  tags: ['Admin - Users'],
  security: [{ bearerAuth: [] }],
  request: {},
  responses: {
    200: {
      description: 'List of users',
      content: {
        'application/json': {
          schema: z.array(UserSchema),
        },
      },
    },
    401: commonResponses[401],
    500: commonResponses[500],
  },
});

// GET /admin/users/:id
registry.registerPath({
  method: 'get',
  path: '/admin/users/{id}',
  description: 'Get user details',
  tags: ['Admin - Users'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string(),
    }),
  },
  responses: {
    200: {
      description: 'User details',
      content: {
        'application/json': {
          schema: UserSchema,
        },
      },
    },
    401: commonResponses[401],
    404: commonResponses[404],
    500: commonResponses[500],
  },
});

// PUT /admin/users/:id
registry.registerPath({
  method: 'put',
  path: '/admin/users/{id}',
  description: 'Update a user',
  tags: ['Admin - Users'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string(),
    }),
    body: {
      content: {
        'application/json': {
          schema: UpdateUserRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'User updated successfully',
      content: {
        'application/json': {
          schema: UserSchema,
        },
      },
    },
    400: commonResponses[400],
    401: commonResponses[401],
    404: commonResponses[404],
    500: commonResponses[500],
  },
});

// DELETE /admin/users/:id
registry.registerPath({
  method: 'delete',
  path: '/admin/users/{id}',
  description: 'Deactivate a user',
  tags: ['Admin - Users'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string(),
    }),
  },
  responses: {
    200: {
      description: 'User deactivated successfully',
      content: {
        'application/json': {
          schema: z.object({
            ok: z.boolean(),
          }),
        },
      },
    },
    401: commonResponses[401],
    404: commonResponses[404],
    500: commonResponses[500],
  },
});
