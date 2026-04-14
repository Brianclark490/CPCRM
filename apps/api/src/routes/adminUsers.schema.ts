import { z } from 'zod';
import { registry } from '../lib/openapi.js';
import { commonResponses } from '../lib/openapi.js';

// Request schemas
export const InviteUserRequestSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1, 'Name is required'),
  role: z.string(),
});

export const ChangeRoleRequestSchema = z.object({
  role: z.string(),
});

// Response schema
const UserSchema = z.object({
  userId: z.string(),
  loginId: z.string(),
  email: z.string().email(),
  name: z.string(),
  roles: z.array(z.string()),
  status: z.string(),
  lastLogin: z.string().optional(),
});

const InviteResultSchema = z.object({
  userId: z.string(),
  email: z.string(),
  role: z.string(),
});

// Register routes

// POST /admin/users/invite
registry.registerPath({
  method: 'post',
  path: '/admin/users/invite',
  description: 'Invite a user to the tenant',
  tags: ['Admin - Users'],
  security: [{ bearerAuth: [] }],
  request: {
    body: {
      content: {
        'application/json': {
          schema: InviteUserRequestSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'User invited successfully',
      content: {
        'application/json': {
          schema: InviteResultSchema,
        },
      },
    },
    400: commonResponses[400],
    401: commonResponses[401],
    403: commonResponses[403],
    500: commonResponses[500],
  },
});

// GET /admin/users
registry.registerPath({
  method: 'get',
  path: '/admin/users',
  description: 'List all users in the tenant',
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
    403: commonResponses[403],
    500: commonResponses[500],
  },
});

// PUT /admin/users/:loginId/role
registry.registerPath({
  method: 'put',
  path: '/admin/users/{loginId}/role',
  description: 'Change a user\'s role',
  tags: ['Admin - Users'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      loginId: z.string(),
    }),
    body: {
      content: {
        'application/json': {
          schema: ChangeRoleRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Role updated successfully',
      content: {
        'application/json': {
          schema: z.object({
            loginId: z.string(),
            tenantId: z.string(),
            role: z.string(),
          }),
        },
      },
    },
    400: commonResponses[400],
    401: commonResponses[401],
    403: commonResponses[403],
    500: commonResponses[500],
  },
});

// DELETE /admin/users/:loginId
registry.registerPath({
  method: 'delete',
  path: '/admin/users/{loginId}',
  description: 'Remove a user from the tenant',
  tags: ['Admin - Users'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      loginId: z.string(),
    }),
  },
  responses: {
    204: {
      description: 'User removed from tenant successfully',
    },
    401: commonResponses[401],
    403: commonResponses[403],
    500: commonResponses[500],
  },
});
