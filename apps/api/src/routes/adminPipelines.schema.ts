import { z } from 'zod';
import { registry } from '../lib/openapi.js';
import { commonResponses } from '../lib/openapi.js';

// Request schemas
export const CreatePipelineRequestSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  object_id: z.string(),
});

export const UpdatePipelineRequestSchema = z.object({
  name: z.string().optional(),
  description: z.string().nullable().optional(),
});

export const CreateStageRequestSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  display_order: z.number().optional(),
  probability: z.number().min(0).max(100).optional(),
});

export const UpdateStageRequestSchema = CreateStageRequestSchema.partial();

// Response schemas
const StageSchema = z.object({
  id: z.string(),
  pipeline_id: z.string(),
  name: z.string(),
  display_order: z.number(),
  probability: z.number().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

const PipelineSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  object_id: z.string(),
  tenant_id: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

const PipelineWithStagesSchema = PipelineSchema.extend({
  stages: z.array(StageSchema),
});

// Register routes

// POST /admin/pipelines
registry.registerPath({
  method: 'post',
  path: '/admin/pipelines',
  description: 'Create a new pipeline',
  tags: ['Admin - Pipelines'],
  security: [{ bearerAuth: [] }],
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreatePipelineRequestSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Pipeline created successfully',
      content: {
        'application/json': {
          schema: PipelineSchema,
        },
      },
    },
    400: commonResponses[400],
    401: commonResponses[401],
    500: commonResponses[500],
  },
});

// GET /admin/pipelines
registry.registerPath({
  method: 'get',
  path: '/admin/pipelines',
  description: 'List all pipelines',
  tags: ['Admin - Pipelines'],
  security: [{ bearerAuth: [] }],
  request: {},
  responses: {
    200: {
      description: 'List of pipelines',
      content: {
        'application/json': {
          schema: z.array(PipelineWithStagesSchema),
        },
      },
    },
    401: commonResponses[401],
    500: commonResponses[500],
  },
});

// GET /admin/pipelines/:id
registry.registerPath({
  method: 'get',
  path: '/admin/pipelines/{id}',
  description: 'Get pipeline details with stages',
  tags: ['Admin - Pipelines'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string(),
    }),
  },
  responses: {
    200: {
      description: 'Pipeline details',
      content: {
        'application/json': {
          schema: PipelineWithStagesSchema,
        },
      },
    },
    401: commonResponses[401],
    404: commonResponses[404],
    500: commonResponses[500],
  },
});

// PUT /admin/pipelines/:id
registry.registerPath({
  method: 'put',
  path: '/admin/pipelines/{id}',
  description: 'Update a pipeline',
  tags: ['Admin - Pipelines'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string(),
    }),
    body: {
      content: {
        'application/json': {
          schema: UpdatePipelineRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Pipeline updated successfully',
      content: {
        'application/json': {
          schema: PipelineSchema,
        },
      },
    },
    400: commonResponses[400],
    401: commonResponses[401],
    404: commonResponses[404],
    500: commonResponses[500],
  },
});

// DELETE /admin/pipelines/:id
registry.registerPath({
  method: 'delete',
  path: '/admin/pipelines/{id}',
  description: 'Delete a pipeline',
  tags: ['Admin - Pipelines'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string(),
    }),
  },
  responses: {
    200: {
      description: 'Pipeline deleted successfully',
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

// POST /admin/pipelines/:id/stages
registry.registerPath({
  method: 'post',
  path: '/admin/pipelines/{id}/stages',
  description: 'Create a new stage in a pipeline',
  tags: ['Admin - Pipelines'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string(),
    }),
    body: {
      content: {
        'application/json': {
          schema: CreateStageRequestSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Stage created successfully',
      content: {
        'application/json': {
          schema: StageSchema,
        },
      },
    },
    400: commonResponses[400],
    401: commonResponses[401],
    404: commonResponses[404],
    500: commonResponses[500],
  },
});

// PUT /admin/pipelines/:pipelineId/stages/:stageId
registry.registerPath({
  method: 'put',
  path: '/admin/pipelines/{pipelineId}/stages/{stageId}',
  description: 'Update a stage',
  tags: ['Admin - Pipelines'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      pipelineId: z.string(),
      stageId: z.string(),
    }),
    body: {
      content: {
        'application/json': {
          schema: UpdateStageRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Stage updated successfully',
      content: {
        'application/json': {
          schema: StageSchema,
        },
      },
    },
    400: commonResponses[400],
    401: commonResponses[401],
    404: commonResponses[404],
    500: commonResponses[500],
  },
});

// DELETE /admin/pipelines/:pipelineId/stages/:stageId
registry.registerPath({
  method: 'delete',
  path: '/admin/pipelines/{pipelineId}/stages/{stageId}',
  description: 'Delete a stage',
  tags: ['Admin - Pipelines'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      pipelineId: z.string(),
      stageId: z.string(),
    }),
  },
  responses: {
    200: {
      description: 'Stage deleted successfully',
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
