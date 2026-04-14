import { z } from 'zod';
import { registry } from '../lib/openapi.js';
import { commonResponses } from '../lib/openapi.js';

// Request schema
export const CreateOrganisationRequestSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
});

// Response schemas
const OrganisationSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  tenantId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const MembershipSchema = z.object({
  id: z.string(),
  userId: z.string(),
  organisationId: z.string(),
  role: z.string(),
  createdAt: z.string(),
});

export const CreateOrganisationResponseSchema = z.object({
  organisation: OrganisationSchema,
  membership: MembershipSchema,
});

// Register the route
registry.registerPath({
  method: 'post',
  path: '/organisations',
  description: 'Create a new organisation within the authenticated user\'s tenant',
  tags: ['Organisations'],
  security: [{ bearerAuth: [] }],
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateOrganisationRequestSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Organisation created successfully',
      content: {
        'application/json': {
          schema: CreateOrganisationResponseSchema,
        },
      },
    },
    400: commonResponses[400],
    401: commonResponses[401],
    403: commonResponses[403],
    500: commonResponses[500],
  },
});
