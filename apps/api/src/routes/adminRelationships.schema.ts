import { z } from 'zod';
import { registry } from '../lib/openapi.js';
import { commonResponses } from '../lib/openapi.js';

// Request schemas
export const CreateRelationshipRequestSchema = z.object({
  sourceObjectId: z.string().optional(),
  source_object_id: z.string().optional(),
  targetObjectId: z.string().optional(),
  target_object_id: z.string().optional(),
  relationshipType: z.enum(['lookup', 'parent_child']).optional(),
  relationship_type: z.enum(['lookup', 'parent_child']).optional(),
  apiName: z.string().optional(),
  api_name: z.string().optional(),
  label: z.string().optional(),
  reverseLabel: z.string().optional(),
  reverse_label: z.string().optional(),
  required: z.boolean().optional(),
});

// Response schema
const RelationshipSchema = z.object({
  id: z.string(),
  sourceObjectId: z.string(),
  targetObjectId: z.string(),
  apiName: z.string(),
  label: z.string(),
  reverseLabel: z.string().optional(),
  relationshipType: z.string(),
  required: z.boolean().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const RelationshipWithObjectsSchema = RelationshipSchema.extend({
  sourceObject: z.object({
    label: z.string(),
    pluralLabel: z.string(),
  }).optional(),
  targetObject: z.object({
    label: z.string(),
    pluralLabel: z.string(),
  }).optional(),
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

// GET /admin/objects/:objectId/relationships
registry.registerPath({
  method: 'get',
  path: '/admin/objects/{objectId}/relationships',
  description: 'List relationships for an object',
  tags: ['Admin - Relationships'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      objectId: z.string(),
    }),
  },
  responses: {
    200: {
      description: 'List of relationships with object metadata',
      content: {
        'application/json': {
          schema: z.array(RelationshipWithObjectsSchema),
        },
      },
    },
    401: commonResponses[401],
    404: commonResponses[404],
    500: commonResponses[500],
  },
});

// DELETE /admin/relationships/:id
registry.registerPath({
  method: 'delete',
  path: '/admin/relationships/{id}',
  description: 'Delete a relationship definition',
  tags: ['Admin - Relationships'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string(),
    }),
  },
  responses: {
    204: {
      description: 'Relationship deleted successfully',
    },
    400: commonResponses[400],
    401: commonResponses[401],
    404: commonResponses[404],
    500: commonResponses[500],
  },
});
