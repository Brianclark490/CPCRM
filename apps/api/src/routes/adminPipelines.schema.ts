import { z } from 'zod';
import { registry } from '../lib/openapi.js';
import { commonResponses } from '../lib/openapi.js';

// Request schemas
export const CreatePipelineRequestSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  apiName: z.string().optional(),
  api_name: z.string().optional(),
  objectId: z.string().optional(),
  object_id: z.string().optional(),
  description: z.string().optional(),
});

export const UpdatePipelineRequestSchema = z.object({
  name: z.string().optional(),
  description: z.string().nullable().optional(),
  isDefault: z.boolean().optional(),
  is_default: z.boolean().optional(),
});

export const CreateStageRequestSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  apiName: z.string().optional(),
  api_name: z.string().optional(),
  stageType: z.string().optional(),
  stage_type: z.string().optional(),
  colour: z.string().optional(),
  defaultProbability: z.number().min(0).max(100).optional(),
  default_probability: z.number().min(0).max(100).optional(),
  expectedDays: z.number().optional(),
  expected_days: z.number().optional(),
  description: z.string().optional(),
});

export const UpdateStageRequestSchema = z.object({
  name: z.string().optional(),
  stageType: z.string().optional(),
  stage_type: z.string().optional(),
  colour: z.string().optional(),
  defaultProbability: z.number().min(0).max(100).nullable().optional(),
  default_probability: z.number().min(0).max(100).nullable().optional(),
  expectedDays: z.number().nullable().optional(),
  expected_days: z.number().nullable().optional(),
  description: z.string().nullable().optional(),
});

export const ReorderStagesRequestSchema = z.object({
  stage_ids: z.array(z.string()).optional(),
  stageIds: z.array(z.string()).optional(),
});

// Response schemas
const StageSchema = z.object({
  id: z.string(),
  pipelineId: z.string(),
  pipeline_id: z.string().optional(),
  name: z.string(),
  apiName: z.string(),
  api_name: z.string().optional(),
  sortOrder: z.number(),
  sort_order: z.number().optional(),
  stageType: z.string(),
  stage_type: z.string().optional(),
  colour: z.string(),
  defaultProbability: z.number().nullable(),
  default_probability: z.number().nullable().optional(),
  expectedDays: z.number().nullable(),
  expected_days: z.number().nullable().optional(),
  description: z.string().nullable(),
  createdAt: z.string(),
  created_at: z.string().optional(),
  updatedAt: z.string(),
  updated_at: z.string().optional(),
});

const PipelineSchema = z.object({
  id: z.string(),
  objectId: z.string(),
  object_id: z.string().optional(),
  name: z.string(),
  apiName: z.string(),
  api_name: z.string().optional(),
  description: z.string().nullable(),
  isDefault: z.boolean(),
  is_default: z.boolean().optional(),
  isSystem: z.boolean(),
  is_system: z.boolean().optional(),
  ownerId: z.string(),
  owner_id: z.string().optional(),
  tenantId: z.string(),
  tenant_id: z.string().optional(),
  createdAt: z.string(),
  created_at: z.string().optional(),
  updatedAt: z.string(),
  updated_at: z.string().optional(),
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
  description: 'Delete a pipeline (custom pipelines only)',
  tags: ['Admin - Pipelines'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string(),
    }),
  },
  responses: {
    204: {
      description: 'Pipeline deleted successfully',
    },
    400: commonResponses[400],
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
  description: 'Delete a stage (custom stages only)',
  tags: ['Admin - Pipelines'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      pipelineId: z.string(),
      stageId: z.string(),
    }),
  },
  responses: {
    204: {
      description: 'Stage deleted successfully',
    },
    400: commonResponses[400],
    401: commonResponses[401],
    404: commonResponses[404],
    500: commonResponses[500],
  },
});

// PATCH /admin/pipelines/:pipelineId/stages/reorder
registry.registerPath({
  method: 'patch',
  path: '/admin/pipelines/{pipelineId}/stages/reorder',
  description: 'Reorder stages in a pipeline',
  tags: ['Admin - Pipelines'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      pipelineId: z.string(),
    }),
    body: {
      content: {
        'application/json': {
          schema: ReorderStagesRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Stages reordered successfully',
      content: {
        'application/json': {
          schema: z.array(StageSchema),
        },
      },
    },
    400: commonResponses[400],
    401: commonResponses[401],
    404: commonResponses[404],
    500: commonResponses[500],
  },
});
