import { z } from 'zod';
import { registry } from '../lib/openapi.js';
import { commonResponses } from '../lib/openapi.js';

// Request schemas
export const CreateFieldDefinitionRequestSchema = z.object({
  api_name: z.string().min(1).regex(/^[a-z][a-z0-9_]*$/, 'Must be snake_case'),
  apiName: z.string().optional(),
  label: z.string().min(1, 'Label is required'),
  field_type: z.string().min(1, 'Field type is required'),
  fieldType: z.string().optional(),
  description: z.string().optional(),
  required: z.boolean().optional(),
  default_value: z.string().optional(),
  defaultValue: z.string().optional(),
  options: z.record(z.string(), z.unknown()).optional(),
});

export const UpdateFieldDefinitionRequestSchema = z.object({
  label: z.string().optional(),
  description: z.string().nullable().optional(),
  required: z.boolean().optional(),
  default_value: z.string().nullable().optional(),
  defaultValue: z.string().nullable().optional(),
  options: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const ReorderFieldDefinitionsRequestSchema = z.object({
  field_ids: z.array(z.string()).optional(),
  fieldIds: z.array(z.string()).optional(),
});

// Response schema
const FieldDefinitionSchema = z.object({
  id: z.string(),
  objectId: z.string(),
  object_id: z.string().optional(),
  apiName: z.string(),
  api_name: z.string().optional(),
  label: z.string(),
  dataType: z.string(),
  data_type: z.string().optional(),
  description: z.string().nullable(),
  isRequired: z.boolean(),
  is_required: z.boolean().optional(),
  isSystem: z.boolean(),
  is_system: z.boolean().optional(),
  defaultValue: z.string().nullable(),
  default_value: z.string().nullable().optional(),
  displayOrder: z.number(),
  display_order: z.number().optional(),
  constraints: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.string(),
  created_at: z.string().optional(),
  updatedAt: z.string(),
  updated_at: z.string().optional(),
});

// Register routes

// POST /admin/objects/:objectId/fields
registry.registerPath({
  method: 'post',
  path: '/admin/objects/{objectId}/fields',
  description: 'Create a new field definition on the specified object',
  tags: ['Admin - Fields'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      objectId: z.string(),
    }),
    body: {
      content: {
        'application/json': {
          schema: CreateFieldDefinitionRequestSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Field definition created successfully',
      content: {
        'application/json': {
          schema: FieldDefinitionSchema,
        },
      },
    },
    400: commonResponses[400],
    401: commonResponses[401],
    404: commonResponses[404],
    409: commonResponses[409],
    500: commonResponses[500],
  },
});

// GET /admin/objects/:objectId/fields
registry.registerPath({
  method: 'get',
  path: '/admin/objects/{objectId}/fields',
  description: 'List all field definitions for the specified object',
  tags: ['Admin - Fields'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      objectId: z.string(),
    }),
  },
  responses: {
    200: {
      description: 'List of field definitions',
      content: {
        'application/json': {
          schema: z.array(FieldDefinitionSchema),
        },
      },
    },
    401: commonResponses[401],
    500: commonResponses[500],
  },
});

// PUT /admin/objects/:objectId/fields/:fieldId
registry.registerPath({
  method: 'put',
  path: '/admin/objects/{objectId}/fields/{fieldId}',
  description: 'Update an existing field definition',
  tags: ['Admin - Fields'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      objectId: z.string(),
      fieldId: z.string(),
    }),
    body: {
      content: {
        'application/json': {
          schema: UpdateFieldDefinitionRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Field definition updated successfully',
      content: {
        'application/json': {
          schema: FieldDefinitionSchema,
        },
      },
    },
    400: commonResponses[400],
    401: commonResponses[401],
    404: commonResponses[404],
    500: commonResponses[500],
  },
});

// DELETE /admin/objects/:objectId/fields/:fieldId
registry.registerPath({
  method: 'delete',
  path: '/admin/objects/{objectId}/fields/{fieldId}',
  description: 'Delete a field definition (only custom fields can be deleted)',
  tags: ['Admin - Fields'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      objectId: z.string(),
      fieldId: z.string(),
    }),
  },
  responses: {
    204: {
      description: 'Field definition deleted successfully',
    },
    400: commonResponses[400],
    401: commonResponses[401],
    404: commonResponses[404],
    500: commonResponses[500],
  },
});

// PATCH /admin/objects/:objectId/fields/reorder
registry.registerPath({
  method: 'patch',
  path: '/admin/objects/{objectId}/fields/reorder',
  description: 'Reorder field definitions for the specified object',
  tags: ['Admin - Fields'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      objectId: z.string(),
    }),
    body: {
      content: {
        'application/json': {
          schema: ReorderFieldDefinitionsRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Fields reordered successfully',
      content: {
        'application/json': {
          schema: z.array(FieldDefinitionSchema),
        },
      },
    },
    400: commonResponses[400],
    401: commonResponses[401],
    404: commonResponses[404],
    500: commonResponses[500],
  },
});
