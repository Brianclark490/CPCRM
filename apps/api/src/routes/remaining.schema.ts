import { z } from 'zod';
import { registry } from '../lib/openapi.js';
import { commonResponses } from '../lib/openapi.js';

// Simple schemas for remaining admin routes

// Admin Stage Gates — camelCase response with field metadata
const StageGateFieldSchema = z.object({
  id: z.string(),
  apiName: z.string(),
  label: z.string(),
  dataType: z.string(),
});

const StageGateResponseSchema = z.object({
  id: z.string(),
  stageId: z.string(),
  fieldId: z.string(),
  gateType: z.string(),
  gateValue: z.string().nullable(),
  errorMessage: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  field: StageGateFieldSchema.optional(),
});

const CreateStageGateRequestSchema = z.object({
  field_id: z.string().optional(),
  fieldId: z.string().optional(),
  gate_type: z.string().optional(),
  gateType: z.string().optional(),
  gate_value: z.string().nullable().optional(),
  gateValue: z.string().nullable().optional(),
  error_message: z.string().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
});

const UpdateStageGateRequestSchema = z.object({
  gate_type: z.string().optional(),
  gateType: z.string().optional(),
  gate_value: z.string().nullable().optional(),
  gateValue: z.string().nullable().optional(),
  error_message: z.string().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
});

registry.registerPath({
  method: 'get',
  path: '/admin/stages/{stageId}/gates',
  description: 'List stage gate validation rules for a stage',
  tags: ['Admin - Stage Gates'],
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ stageId: z.string() }) },
  responses: {
    200: { description: 'List of stage gates', content: { 'application/json': { schema: z.array(StageGateResponseSchema) } } },
    401: commonResponses[401],
    404: commonResponses[404],
    500: commonResponses[500],
  },
});

registry.registerPath({
  method: 'post',
  path: '/admin/stages/{stageId}/gates',
  description: 'Create a stage gate validation rule',
  tags: ['Admin - Stage Gates'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ stageId: z.string() }),
    body: { content: { 'application/json': { schema: CreateStageGateRequestSchema } } },
  },
  responses: {
    201: { description: 'Stage gate created', content: { 'application/json': { schema: StageGateResponseSchema } } },
    400: commonResponses[400],
    401: commonResponses[401],
    404: commonResponses[404],
    409: commonResponses[409],
    500: commonResponses[500],
  },
});

registry.registerPath({
  method: 'put',
  path: '/admin/stages/{stageId}/gates/{id}',
  description: 'Update a stage gate validation rule',
  tags: ['Admin - Stage Gates'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ stageId: z.string(), id: z.string() }),
    body: { content: { 'application/json': { schema: UpdateStageGateRequestSchema } } },
  },
  responses: {
    200: { description: 'Stage gate updated', content: { 'application/json': { schema: StageGateResponseSchema } } },
    400: commonResponses[400],
    401: commonResponses[401],
    404: commonResponses[404],
    500: commonResponses[500],
  },
});

registry.registerPath({
  method: 'delete',
  path: '/admin/stages/{stageId}/gates/{id}',
  description: 'Delete a stage gate validation rule',
  tags: ['Admin - Stage Gates'],
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ stageId: z.string(), id: z.string() }) },
  responses: {
    204: { description: 'Gate deleted' },
    401: commonResponses[401],
    404: commonResponses[404],
    500: commonResponses[500],
  },
});

// Admin Targets — snake_case fields to match adminTargets request/response
const CreateTargetRequestSchema = z.object({
  target_type: z.enum(['business', 'team', 'user']).optional(),
  targetType: z.enum(['business', 'team', 'user']).optional(),
  target_entity_id: z.string().nullable().optional(),
  targetEntityId: z.string().nullable().optional(),
  period_type: z.enum(['monthly', 'quarterly', 'annual']).optional(),
  periodType: z.enum(['monthly', 'quarterly', 'annual']).optional(),
  period_start: z.string().optional(),
  periodStart: z.string().optional(),
  period_end: z.string().optional(),
  periodEnd: z.string().optional(),
  target_value: z.number().optional(),
  targetValue: z.number().optional(),
  currency: z.string().optional(),
});

const TargetSchema = z.object({
  id: z.string(),
  tenant_id: z.string(),
  target_type: z.string(),
  target_entity_id: z.string().nullable(),
  period_type: z.string(),
  period_start: z.string(),
  period_end: z.string(),
  target_value: z.number(),
  currency: z.string().nullable(),
  created_by: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

registry.registerPath({
  method: 'post',
  path: '/admin/targets',
  description: 'Create or update (upsert) a sales target',
  tags: ['Admin - Targets'],
  security: [{ bearerAuth: [] }],
  request: {
    body: { content: { 'application/json': { schema: CreateTargetRequestSchema } } },
  },
  responses: {
    201: { description: 'Target created/updated', content: { 'application/json': { schema: TargetSchema } } },
    400: commonResponses[400],
    401: commonResponses[401],
    403: commonResponses[403],
    500: commonResponses[500],
  },
});

registry.registerPath({
  method: 'get',
  path: '/admin/targets',
  description: 'List all sales targets for the tenant, optionally filtered by period',
  tags: ['Admin - Targets'],
  security: [{ bearerAuth: [] }],
  request: {
    query: z.object({
      period_start: z.string().optional(),
      period_end: z.string().optional(),
    }),
  },
  responses: {
    200: { description: 'List of targets', content: { 'application/json': { schema: z.array(TargetSchema) } } },
    401: commonResponses[401],
    403: commonResponses[403],
    500: commonResponses[500],
  },
});

registry.registerPath({
  method: 'delete',
  path: '/admin/targets/{id}',
  description: 'Delete a sales target by ID',
  tags: ['Admin - Targets'],
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string() }) },
  responses: {
    204: { description: 'Target deleted' },
    401: commonResponses[401],
    403: commonResponses[403],
    404: commonResponses[404],
    500: commonResponses[500],
  },
});

// User Targets
registry.registerPath({
  method: 'get',
  path: '/targets',
  description: 'Get user targets and progress',
  tags: ['Targets'],
  security: [{ bearerAuth: [] }],
  request: {},
  responses: {
    200: { description: 'User targets', content: { 'application/json': { schema: z.array(z.object({ target: TargetSchema, progress: z.number() })) } } },
    401: commonResponses[401],
    500: commonResponses[500],
  },
});

// Platform Tenants
const CreateTenantRequestSchema = z.object({
  name: z.string(),
  slug: z.string(),
  adminEmail: z.string().email(),
  adminName: z.string(),
  plan: z.string().optional(),
});

const UpdateTenantRequestSchema = z.object({
  name: z.string().optional(),
  status: z.string().optional(),
  plan: z.string().optional(),
});

const TenantSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  status: z.string(),
  plan: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
});

const ProvisionTenantResultSchema = z.object({
  tenant: TenantSchema,
  descopeTenantId: z.string().optional(),
  adminUserId: z.string().optional(),
  inviteUrl: z.string().optional(),
}).passthrough();

const ListTenantsResponseSchema = z.object({
  tenants: z.array(TenantSchema),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
});

registry.registerPath({
  method: 'post',
  path: '/platform/tenants',
  description: 'Provision a new tenant end-to-end (super-admin only)',
  tags: ['Platform - Tenants'],
  security: [{ bearerAuth: [] }],
  request: {
    body: { content: { 'application/json': { schema: CreateTenantRequestSchema } } },
  },
  responses: {
    201: { description: 'Tenant provisioned', content: { 'application/json': { schema: ProvisionTenantResultSchema } } },
    400: commonResponses[400],
    401: commonResponses[401],
    403: commonResponses[403],
    409: commonResponses[409],
    500: commonResponses[500],
  },
});

registry.registerPath({
  method: 'get',
  path: '/platform/tenants',
  description: 'List tenants with pagination (super-admin only)',
  tags: ['Platform - Tenants'],
  security: [{ bearerAuth: [] }],
  request: {
    query: z.object({
      limit: z.string().optional(),
      offset: z.string().optional(),
    }),
  },
  responses: {
    200: { description: 'Paginated list of tenants', content: { 'application/json': { schema: ListTenantsResponseSchema } } },
    401: commonResponses[401],
    403: commonResponses[403],
    500: commonResponses[500],
  },
});

registry.registerPath({
  method: 'get',
  path: '/platform/tenants/{id}',
  description: 'Get a single tenant with its user count (super-admin only)',
  tags: ['Platform - Tenants'],
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: { description: 'Tenant details', content: { 'application/json': { schema: TenantSchema } } },
    401: commonResponses[401],
    403: commonResponses[403],
    404: commonResponses[404],
    500: commonResponses[500],
  },
});

registry.registerPath({
  method: 'put',
  path: '/platform/tenants/{id}',
  description: 'Update a tenant (super-admin only)',
  tags: ['Platform - Tenants'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ id: z.string() }),
    body: { content: { 'application/json': { schema: UpdateTenantRequestSchema } } },
  },
  responses: {
    200: { description: 'Tenant updated', content: { 'application/json': { schema: TenantSchema } } },
    400: commonResponses[400],
    401: commonResponses[401],
    403: commonResponses[403],
    404: commonResponses[404],
    500: commonResponses[500],
  },
});

registry.registerPath({
  method: 'delete',
  path: '/platform/tenants/{id}',
  description: 'Suspend a tenant (super-admin only). Pass ?cascade=true to also remove from Descope.',
  tags: ['Platform - Tenants'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ id: z.string() }),
    query: z.object({ cascade: z.string().optional() }),
  },
  responses: {
    204: { description: 'Tenant suspended' },
    401: commonResponses[401],
    403: commonResponses[403],
    404: commonResponses[404],
    500: commonResponses[500],
  },
});

// Pipeline Analytics — real endpoints: /summary, /velocity, /overdue
registry.registerPath({
  method: 'get',
  path: '/pipelines/{pipelineId}/summary',
  description: 'Pipeline summary with per-stage aggregates and totals',
  tags: ['Analytics'],
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ pipelineId: z.string() }) },
  responses: {
    200: {
      description: 'Pipeline summary',
      content: {
        'application/json': {
          schema: z.object({
            stages: z.array(z.record(z.string(), z.unknown())),
            totals: z.record(z.string(), z.unknown()),
          }).passthrough(),
        },
      },
    },
    401: commonResponses[401],
    404: commonResponses[404],
    500: commonResponses[500],
  },
});

registry.registerPath({
  method: 'get',
  path: '/pipelines/{pipelineId}/velocity',
  description: 'Stage-by-stage conversion metrics for the given period',
  tags: ['Analytics'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ pipelineId: z.string() }),
    query: z.object({
      period: z.enum(['7d', '30d', '90d', 'all']).optional(),
    }),
  },
  responses: {
    200: {
      description: 'Velocity metrics per stage',
      content: {
        'application/json': {
          schema: z.object({
            stages: z.array(z.record(z.string(), z.unknown())),
          }).passthrough(),
        },
      },
    },
    400: commonResponses[400],
    401: commonResponses[401],
    404: commonResponses[404],
    500: commonResponses[500],
  },
});

registry.registerPath({
  method: 'get',
  path: '/pipelines/{pipelineId}/overdue',
  description: 'Records that have exceeded their stage expected_days threshold',
  tags: ['Analytics'],
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ pipelineId: z.string() }) },
  responses: {
    200: { description: 'Overdue records', content: { 'application/json': { schema: z.array(z.record(z.string(), z.unknown())) } } },
    401: commonResponses[401],
    404: commonResponses[404],
    500: commonResponses[500],
  },
});

// Record Relationships
const LinkRecordsRequestSchema = z.object({
  relationship_id: z.string().optional(),
  relationshipId: z.string().optional(),
  target_record_id: z.string().optional(),
  targetRecordId: z.string().optional(),
});

const RecordLinkSchema = z.object({
  id: z.string(),
  sourceRecordId: z.string(),
  targetRecordId: z.string(),
  relationshipId: z.string(),
  createdAt: z.string(),
}).passthrough();

const RelatedRecordRowSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  fieldValues: z.record(z.string(), z.unknown()).optional(),
}).passthrough();

registry.registerPath({
  method: 'post',
  path: '/records/{id}/relationships',
  description: 'Link the record to another record via a defined relationship',
  tags: ['Record Relationships'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ id: z.string() }),
    body: { content: { 'application/json': { schema: LinkRecordsRequestSchema } } },
  },
  responses: {
    201: { description: 'Relationship created', content: { 'application/json': { schema: RecordLinkSchema } } },
    400: commonResponses[400],
    401: commonResponses[401],
    403: commonResponses[403],
    404: commonResponses[404],
    409: commonResponses[409],
    500: commonResponses[500],
  },
});

registry.registerPath({
  method: 'delete',
  path: '/records/{id}/relationships/{relId}',
  description: 'Unlink related records',
  tags: ['Record Relationships'],
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string(), relId: z.string() }) },
  responses: {
    204: { description: 'Relationship deleted' },
    401: commonResponses[401],
    403: commonResponses[403],
    404: commonResponses[404],
    500: commonResponses[500],
  },
});

registry.registerPath({
  method: 'get',
  path: '/records/{id}/related/{objectApiName}',
  description: 'Get records related to this record that belong to a specific object type',
  tags: ['Record Relationships'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ id: z.string(), objectApiName: z.string() }),
    query: z.object({
      page: z.string().optional(),
      limit: z.string().optional(),
    }),
  },
  responses: {
    200: {
      description: 'Paginated related records',
      content: {
        'application/json': {
          schema: z.object({
            data: z.array(RelatedRecordRowSchema),
            total: z.number(),
            page: z.number(),
            limit: z.number(),
          }),
        },
      },
    },
    401: commonResponses[401],
    403: commonResponses[403],
    404: commonResponses[404],
    500: commonResponses[500],
  },
});

// Admin Tenant Settings
registry.registerPath({
  method: 'get',
  path: '/admin/tenant-settings',
  description: 'Get tenant settings',
  tags: ['Admin - Tenant Settings'],
  security: [{ bearerAuth: [] }],
  request: {},
  responses: {
    200: { description: 'Tenant settings', content: { 'application/json': { schema: z.record(z.string(), z.unknown()) } } },
    401: commonResponses[401],
    500: commonResponses[500],
  },
});

registry.registerPath({
  method: 'put',
  path: '/admin/tenant-settings',
  description: 'Update tenant settings',
  tags: ['Admin - Tenant Settings'],
  security: [{ bearerAuth: [] }],
  request: {
    body: { content: { 'application/json': { schema: z.record(z.string(), z.unknown()) } } },
  },
  responses: {
    200: { description: 'Settings updated', content: { 'application/json': { schema: z.object({ ok: z.boolean() }) } } },
    400: commonResponses[400],
    401: commonResponses[401],
    500: commonResponses[500],
  },
});

// Page Layouts
registry.registerPath({
  method: 'get',
  path: '/objects/{apiName}/page-layout',
  description: 'Get page layout configuration for an object',
  tags: ['Page Layouts'],
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ apiName: z.string() }) },
  responses: {
    200: { description: 'Page layout', content: { 'application/json': { schema: z.object({ layout: z.record(z.string(), z.unknown()) }) } } },
    401: commonResponses[401],
    404: commonResponses[404],
    500: commonResponses[500],
  },
});

// Admin Page Layouts (Component Registry)
registry.registerPath({
  method: 'get',
  path: '/admin/component-registry',
  description: 'List available page layout components',
  tags: ['Admin - Component Registry'],
  security: [{ bearerAuth: [] }],
  request: {},
  responses: {
    200: { description: 'Component registry', content: { 'application/json': { schema: z.array(z.object({ id: z.string(), name: z.string(), type: z.string() })) } } },
    401: commonResponses[401],
    500: commonResponses[500],
  },
});

// Admin Layouts
registry.registerPath({
  method: 'post',
  path: '/admin/objects/{objectId}/layouts',
  description: 'Create a layout for an object',
  tags: ['Admin - Layouts'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ objectId: z.string() }),
    body: { content: { 'application/json': { schema: z.object({ layout_type: z.string(), config: z.record(z.string(), z.unknown()) }) } } },
  },
  responses: {
    201: { description: 'Layout created', content: { 'application/json': { schema: z.object({ id: z.string(), layout_type: z.string() }) } } },
    400: commonResponses[400],
    401: commonResponses[401],
    404: commonResponses[404],
    500: commonResponses[500],
  },
});

registry.registerPath({
  method: 'put',
  path: '/admin/objects/{objectId}/layouts/{layoutId}',
  description: 'Update a layout',
  tags: ['Admin - Layouts'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ objectId: z.string(), layoutId: z.string() }),
    body: { content: { 'application/json': { schema: z.object({ config: z.record(z.string(), z.unknown()) }) } } },
  },
  responses: {
    200: { description: 'Layout updated', content: { 'application/json': { schema: z.object({ ok: z.boolean() }) } } },
    400: commonResponses[400],
    401: commonResponses[401],
    404: commonResponses[404],
    500: commonResponses[500],
  },
});

registry.registerPath({
  method: 'get',
  path: '/admin/objects/{objectId}/layouts',
  description: 'List layouts for an object',
  tags: ['Admin - Layouts'],
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ objectId: z.string() }) },
  responses: {
    200: { description: 'List of layouts', content: { 'application/json': { schema: z.array(z.object({ id: z.string(), layout_type: z.string() })) } } },
    401: commonResponses[401],
    500: commonResponses[500],
  },
});

registry.registerPath({
  method: 'delete',
  path: '/admin/objects/{objectId}/layouts/{layoutId}',
  description: 'Delete a layout',
  tags: ['Admin - Layouts'],
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ objectId: z.string(), layoutId: z.string() }) },
  responses: {
    200: { description: 'Layout deleted', content: { 'application/json': { schema: z.object({ ok: z.boolean() }) } } },
    401: commonResponses[401],
    404: commonResponses[404],
    500: commonResponses[500],
  },
});
