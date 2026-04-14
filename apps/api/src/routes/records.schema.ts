import { z } from 'zod';
import { registry } from '../lib/openapi.js';
import { commonResponses } from '../lib/openapi.js';

// Request schemas
export const CreateRecordRequestSchema = z.object({
  field_values: z.record(z.string(), z.unknown()),
  parent_record_id: z.string().optional(),
});

export const UpdateRecordRequestSchema = z.object({
  field_values: z.record(z.string(), z.unknown()),
});

// Response schema
const RecordSchema = z.object({
  id: z.string(),
  object_id: z.string(),
  tenant_id: z.string(),
  owner_id: z.string(),
  field_values: z.record(z.string(), z.unknown()),
  created_at: z.string(),
  updated_at: z.string(),
});

const RecordWithRelationsSchema = RecordSchema.extend({
  related_records: z.record(z.string(), z.array(z.unknown())).optional(),
});

// Register routes

// POST /objects/:apiName/records
registry.registerPath({
  method: 'post',
  path: '/objects/{apiName}/records',
  description: 'Create a new record',
  tags: ['Records'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      apiName: z.string(),
    }),
    body: {
      content: {
        'application/json': {
          schema: CreateRecordRequestSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Record created successfully',
      content: {
        'application/json': {
          schema: RecordSchema,
        },
      },
    },
    400: commonResponses[400],
    401: commonResponses[401],
    404: commonResponses[404],
    500: commonResponses[500],
  },
});

// GET /objects/:apiName/records
registry.registerPath({
  method: 'get',
  path: '/objects/{apiName}/records',
  description: 'List records for an object',
  tags: ['Records'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      apiName: z.string(),
    }),
    query: z.object({
      page: z.string().optional(),
      limit: z.string().optional(),
    }),
  },
  responses: {
    200: {
      description: 'List of records',
      content: {
        'application/json': {
          schema: z.object({
            records: z.array(RecordSchema),
            total: z.number(),
            page: z.number(),
            limit: z.number(),
          }),
        },
      },
    },
    401: commonResponses[401],
    404: commonResponses[404],
    500: commonResponses[500],
  },
});

// GET /objects/:apiName/records/:id
registry.registerPath({
  method: 'get',
  path: '/objects/{apiName}/records/{id}',
  description: 'Get a single record with related records',
  tags: ['Records'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      apiName: z.string(),
      id: z.string(),
    }),
  },
  responses: {
    200: {
      description: 'Record details',
      content: {
        'application/json': {
          schema: RecordWithRelationsSchema,
        },
      },
    },
    401: commonResponses[401],
    404: commonResponses[404],
    500: commonResponses[500],
  },
});

// PUT /objects/:apiName/records/:id
registry.registerPath({
  method: 'put',
  path: '/objects/{apiName}/records/{id}',
  description: 'Update a record',
  tags: ['Records'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      apiName: z.string(),
      id: z.string(),
    }),
    body: {
      content: {
        'application/json': {
          schema: UpdateRecordRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Record updated successfully',
      content: {
        'application/json': {
          schema: RecordSchema,
        },
      },
    },
    400: commonResponses[400],
    401: commonResponses[401],
    404: commonResponses[404],
    500: commonResponses[500],
  },
});

// DELETE /objects/:apiName/records/:id
registry.registerPath({
  method: 'delete',
  path: '/objects/{apiName}/records/{id}',
  description: 'Delete a record',
  tags: ['Records'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      apiName: z.string(),
      id: z.string(),
    }),
  },
  responses: {
    200: {
      description: 'Record deleted successfully',
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
