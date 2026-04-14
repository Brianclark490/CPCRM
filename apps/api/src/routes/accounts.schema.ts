import { z } from 'zod';
import { registry } from '../lib/openapi.js';
import { commonResponses } from '../lib/openapi.js';

// Request schemas
export const CreateAccountRequestSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  industry: z.string().optional(),
  website: z.string().url().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  city: z.string().optional(),
  region: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().optional(),
  notes: z.string().optional(),
});

export const UpdateAccountRequestSchema = CreateAccountRequestSchema.partial();

// Response schema
const AccountSchema = z.object({
  id: z.string(),
  name: z.string(),
  industry: z.string().nullable(),
  website: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  address_line_1: z.string().nullable(),
  address_line_2: z.string().nullable(),
  city: z.string().nullable(),
  region: z.string().nullable(),
  postal_code: z.string().nullable(),
  country: z.string().nullable(),
  notes: z.string().nullable(),
  tenant_id: z.string(),
  owner_id: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

const OpportunitySchema = z.object({
  id: z.string(),
  name: z.string(),
  amount: z.number().nullable(),
  stage: z.string(),
  close_date: z.string().nullable(),
  created_at: z.string(),
});

const AccountWithOpportunitiesSchema = AccountSchema.extend({
  opportunities: z.array(OpportunitySchema),
});

// Register routes

// POST /accounts
registry.registerPath({
  method: 'post',
  path: '/accounts',
  description: 'Create a new account',
  tags: ['Accounts'],
  security: [{ bearerAuth: [] }],
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateAccountRequestSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Account created successfully',
      content: {
        'application/json': {
          schema: AccountSchema,
        },
      },
    },
    400: commonResponses[400],
    401: commonResponses[401],
    403: commonResponses[403],
    500: commonResponses[500],
  },
});

// GET /accounts
registry.registerPath({
  method: 'get',
  path: '/accounts',
  description: 'List all accounts',
  tags: ['Accounts'],
  security: [{ bearerAuth: [] }],
  request: {},
  responses: {
    200: {
      description: 'List of accounts',
      content: {
        'application/json': {
          schema: z.array(AccountSchema),
        },
      },
    },
    401: commonResponses[401],
    500: commonResponses[500],
  },
});

// GET /accounts/:id
registry.registerPath({
  method: 'get',
  path: '/accounts/{id}',
  description: 'Get account details with opportunities',
  tags: ['Accounts'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string(),
    }),
  },
  responses: {
    200: {
      description: 'Account details',
      content: {
        'application/json': {
          schema: AccountWithOpportunitiesSchema,
        },
      },
    },
    401: commonResponses[401],
    404: commonResponses[404],
    500: commonResponses[500],
  },
});

// PUT /accounts/:id
registry.registerPath({
  method: 'put',
  path: '/accounts/{id}',
  description: 'Update an account',
  tags: ['Accounts'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string(),
    }),
    body: {
      content: {
        'application/json': {
          schema: UpdateAccountRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Account updated successfully',
      content: {
        'application/json': {
          schema: AccountSchema,
        },
      },
    },
    400: commonResponses[400],
    401: commonResponses[401],
    404: commonResponses[404],
    500: commonResponses[500],
  },
});

// DELETE /accounts/:id
registry.registerPath({
  method: 'delete',
  path: '/accounts/{id}',
  description: 'Delete an account',
  tags: ['Accounts'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string(),
    }),
  },
  responses: {
    200: {
      description: 'Account deleted successfully',
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
