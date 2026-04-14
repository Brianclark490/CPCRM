import { z } from 'zod';
import { registry } from '../lib/openapi.js';
import { commonResponses } from '../lib/openapi.js';
import { PaginationMetaSchema, PaginationOpenApiQuery } from '../lib/pagination.js';

// Request schemas
const LinkToSchema = z.object({
  recordId: z.string(),
  relationshipId: z.string(),
  direction: z.enum(['source', 'target']).optional(),
});

export const CreateRecordRequestSchema = z.object({
  fieldValues: z.record(z.string(), z.unknown()),
  linkTo: LinkToSchema.optional(),
});

export const UpdateRecordRequestSchema = z.object({
  fieldValues: z.record(z.string(), z.unknown()),
});

// Response schema — camelCase to match recordService / records.ts responses
const RecordSchema = z.object({
  id: z.string(),
  objectId: z.string(),
  tenantId: z.string(),
  ownerId: z.string(),
  name: z.string().optional(),
  pipelineId: z.string().optional(),
  currentStageId: z.string().optional(),
  fieldValues: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const ObjectDefinitionSummarySchema = z.object({
  id: z.string(),
  apiName: z.string(),
  label: z.string(),
  pluralLabel: z.string(),
}).passthrough();

const RecordWithRelationsSchema = RecordSchema.extend({
  relatedRecords: z.record(z.string(), z.array(z.unknown())).optional(),
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
  description: 'List records for an object with pagination, search and sorting',
  tags: ['Records'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      apiName: z.string(),
    }),
    query: z.object({
      search: z.string().optional(),
      sort_by: z.string().optional(),
      sort_dir: z.enum(['asc', 'desc']).optional(),
    }).merge(PaginationOpenApiQuery),
  },
  responses: {
    200: {
      description: 'Paginated list of records',
      content: {
        'application/json': {
          schema: z.object({
            data: z.array(RecordSchema),
            pagination: PaginationMetaSchema,
            object: ObjectDefinitionSummarySchema,
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
    204: {
      description: 'Record deleted successfully',
    },
    401: commonResponses[401],
    404: commonResponses[404],
    500: commonResponses[500],
  },
});
