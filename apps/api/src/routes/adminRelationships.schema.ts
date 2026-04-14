import { z } from 'zod';
import { registry } from '../lib/openapi.js';
import { commonResponses } from '../lib/openapi.js';

// Request schemas
export const CreateRelationshipRequestSchema = z.object({
  from_object_id: z.string(),
  to_object_id: z.string(),
  label: z.string().min(1, 'Label is required'),
  relationship_type: z.enum(['one_to_many', 'many_to_one', 'many_to_many']),
  cascade_delete: z.boolean().optional(),
});

export const UpdateRelationshipRequestSchema = z.object({
  label: z.string().optional(),
  cascade_delete: z.boolean().optional(),
});

// Response schema
const RelationshipSchema = z.object({
  id: z.string(),
  from_object_id: z.string(),
  to_object_id: z.string(),
  label: z.string(),
  relationship_type: z.string(),
  cascade_delete: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});

// Register routes

// POST /admin/relationships
registry.registerPath({
  method: 'post',
  path: '/admin/relationships',
  description: 'Create a new relationship between objects',
  tags: ['Admin - Relationships'],
  security: [{ bearerAuth: [] }],
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateRelationshipRequestSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Relationship created successfully',
      content: {
        'application/json': {
          schema: RelationshipSchema,
        },
      },
    },
    400: commonResponses[400],
    401: commonResponses[401],
    500: commonResponses[500],
  },
});

// GET /admin/relationships
registry.registerPath({
  method: 'get',
  path: '/admin/relationships',
  description: 'List all relationships',
  tags: ['Admin - Relationships'],
  security: [{ bearerAuth: [] }],
  request: {},
  responses: {
    200: {
      description: 'List of relationships',
      content: {
        'application/json': {
          schema: z.array(RelationshipSchema),
        },
      },
    },
    401: commonResponses[401],
    500: commonResponses[500],
  },
});

// PUT /admin/relationships/:id
registry.registerPath({
  method: 'put',
  path: '/admin/relationships/{id}',
  description: 'Update a relationship',
  tags: ['Admin - Relationships'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string(),
    }),
    body: {
      content: {
        'application/json': {
          schema: UpdateRelationshipRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Relationship updated successfully',
      content: {
        'application/json': {
          schema: RelationshipSchema,
        },
      },
    },
    400: commonResponses[400],
    401: commonResponses[401],
    404: commonResponses[404],
    500: commonResponses[500],
  },
});

// DELETE /admin/relationships/:id
registry.registerPath({
  method: 'delete',
  path: '/admin/relationships/{id}',
  description: 'Delete a relationship',
  tags: ['Admin - Relationships'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string(),
    }),
  },
  responses: {
    200: {
      description: 'Relationship deleted successfully',
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
