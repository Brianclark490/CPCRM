import { z } from 'zod';
import { registry } from '../lib/openapi.js';
import { commonResponses } from '../lib/openapi.js';

// Request schemas
export const CreateObjectDefinitionRequestSchema = z.object({
  apiName: z.string().min(3).max(50).regex(/^[a-z][a-z0-9_]*$/, 'Must be snake_case'),
  api_name: z.string().min(3).max(50).regex(/^[a-z][a-z0-9_]*$/, 'Must be snake_case').optional(),
  label: z.string().min(1, 'Label is required'),
  pluralLabel: z.string().min(1, 'Plural label is required'),
  plural_label: z.string().optional(),
  description: z.string().optional(),
  icon: z.string().optional(),
});

export const UpdateObjectDefinitionRequestSchema = z.object({
  label: z.string().optional(),
  pluralLabel: z.string().optional(),
  plural_label: z.string().optional(),
  description: z.string().nullable().optional(),
  icon: z.string().nullable().optional(),
});

export const ReorderObjectDefinitionsRequestSchema = z.object({
  orderedIds: z.array(z.string()),
});

// Response schemas
const ObjectDefinitionSchema = z.object({
  id: z.string(),
  api_name: z.string(),
  label: z.string(),
  plural_label: z.string(),
  description: z.string().nullable(),
  icon: z.string().nullable(),
  is_system: z.boolean(),
  tenant_id: z.string(),
  owner_id: z.string(),
  display_order: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
});

const ObjectDefinitionWithCountsSchema = ObjectDefinitionSchema.extend({
  field_count: z.number(),
  record_count: z.number(),
});

const FieldDefinitionSchema = z.object({
  id: z.string(),
  object_id: z.string(),
  api_name: z.string(),
  label: z.string(),
  data_type: z.string(),
  is_required: z.boolean(),
  is_system: z.boolean(),
  display_order: z.number(),
  constraints: z.record(z.string(), z.unknown()).nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

const RelationshipDefinitionSchema = z.object({
  id: z.string(),
  from_object_id: z.string(),
  to_object_id: z.string(),
  label: z.string(),
  relationship_type: z.string(),
  cascade_delete: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});

const LayoutSchema = z.object({
  id: z.string(),
  object_id: z.string(),
  layout_type: z.string(),
  config: z.record(z.string(), z.unknown()),
  created_at: z.string(),
  updated_at: z.string(),
});

const ObjectDefinitionDetailSchema = ObjectDefinitionSchema.extend({
  fields: z.array(FieldDefinitionSchema),
  relationships: z.array(RelationshipDefinitionSchema),
  layouts: z.array(LayoutSchema),
});

// Register routes

// POST /admin/objects
registry.registerPath({
  method: 'post',
  path: '/admin/objects',
  description: 'Create a new object definition with default form and list layouts',
  tags: ['Admin - Objects'],
  security: [{ bearerAuth: [] }],
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateObjectDefinitionRequestSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Object definition created successfully',
      content: {
        'application/json': {
          schema: ObjectDefinitionSchema,
        },
      },
    },
    400: commonResponses[400],
    401: commonResponses[401],
    409: commonResponses[409],
    500: commonResponses[500],
  },
});

// GET /admin/objects
registry.registerPath({
  method: 'get',
  path: '/admin/objects',
  description: 'List all object definitions with field and record counts',
  tags: ['Admin - Objects'],
  security: [{ bearerAuth: [] }],
  request: {},
  responses: {
    200: {
      description: 'List of object definitions',
      content: {
        'application/json': {
          schema: z.array(ObjectDefinitionWithCountsSchema),
        },
      },
    },
    401: commonResponses[401],
    500: commonResponses[500],
  },
});

// GET /admin/objects/:id
registry.registerPath({
  method: 'get',
  path: '/admin/objects/{id}',
  description: 'Get a single object definition with nested fields, relationships, and layouts',
  tags: ['Admin - Objects'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string(),
    }),
  },
  responses: {
    200: {
      description: 'Object definition details',
      content: {
        'application/json': {
          schema: ObjectDefinitionDetailSchema,
        },
      },
    },
    401: commonResponses[401],
    404: commonResponses[404],
    500: commonResponses[500],
  },
});

// PUT /admin/objects/:id
registry.registerPath({
  method: 'put',
  path: '/admin/objects/{id}',
  description: 'Update an existing object definition',
  tags: ['Admin - Objects'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string(),
    }),
    body: {
      content: {
        'application/json': {
          schema: UpdateObjectDefinitionRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Object definition updated successfully',
      content: {
        'application/json': {
          schema: ObjectDefinitionSchema,
        },
      },
    },
    400: commonResponses[400],
    401: commonResponses[401],
    404: commonResponses[404],
    500: commonResponses[500],
  },
});

// DELETE /admin/objects/:id
registry.registerPath({
  method: 'delete',
  path: '/admin/objects/{id}',
  description: 'Delete an object definition (only custom objects can be deleted)',
  tags: ['Admin - Objects'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string(),
    }),
  },
  responses: {
    200: {
      description: 'Object definition deleted successfully',
      content: {
        'application/json': {
          schema: z.object({
            ok: z.boolean(),
          }),
        },
      },
    },
    400: commonResponses[400],
    401: commonResponses[401],
    404: commonResponses[404],
    500: commonResponses[500],
  },
});

// POST /admin/objects/reorder
registry.registerPath({
  method: 'post',
  path: '/admin/objects/reorder',
  description: 'Reorder object definitions',
  tags: ['Admin - Objects'],
  security: [{ bearerAuth: [] }],
  request: {
    body: {
      content: {
        'application/json': {
          schema: ReorderObjectDefinitionsRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Objects reordered successfully',
      content: {
        'application/json': {
          schema: z.object({
            ok: z.boolean(),
          }),
        },
      },
    },
    400: commonResponses[400],
    401: commonResponses[401],
    500: commonResponses[500],
  },
});
