import { OpenAPIRegistry, OpenApiGeneratorV3, extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

// Extend Zod with OpenAPI methods
extendZodWithOpenApi(z);

// Create a global registry for OpenAPI routes
export const registry = new OpenAPIRegistry();

// Register security scheme
registry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
  description: 'Descope JWT token',
});

// Common error response schemas
export const ErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
    requestId: z.string().optional(),
  }),
}).openapi('ErrorResponse');

export const ValidationErrorResponseSchema = z.object({
  error: z.object({
    code: z.literal('VALIDATION_ERROR'),
    message: z.string(),
    details: z.object({
      fieldErrors: z.record(z.string(), z.string()),
    }).optional(),
    requestId: z.string().optional(),
  }),
}).openapi('ValidationErrorResponse');

// Common response types
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
export type ValidationErrorResponse = z.infer<typeof ValidationErrorResponseSchema>;

// Common response definitions
export const commonResponses = {
  400: {
    description: 'Validation error',
    content: {
      'application/json': {
        schema: ValidationErrorResponseSchema,
      },
    },
  },
  401: {
    description: 'Unauthenticated - missing or invalid Bearer token',
    content: {
      'application/json': {
        schema: ErrorResponseSchema,
      },
    },
  },
  403: {
    description: 'Forbidden - insufficient permissions',
    content: {
      'application/json': {
        schema: ErrorResponseSchema,
      },
    },
  },
  404: {
    description: 'Not found',
    content: {
      'application/json': {
        schema: ErrorResponseSchema,
      },
    },
  },
  409: {
    description: 'Conflict',
    content: {
      'application/json': {
        schema: ErrorResponseSchema,
      },
    },
  },
  429: {
    description: 'Rate limited',
    content: {
      'application/json': {
        schema: ErrorResponseSchema,
      },
    },
  },
  500: {
    description: 'Internal server error',
    content: {
      'application/json': {
        schema: ErrorResponseSchema,
      },
    },
  },
};

// Generate OpenAPI document
export function generateOpenAPIDocument() {
  const generator = new OpenApiGeneratorV3(registry.definitions);

  return generator.generateDocument({
    openapi: '3.0.0',
    info: {
      version: '1.0.0',
      title: 'CPCRM API',
      description: 'Multi-tenant CRM platform API for managing Microsoft opportunities',
    },
    servers: [
      {
        url: '/api/v1',
        description: 'API base path (versioned)',
      },
      {
        url: '/api',
        description: 'Legacy unversioned alias (deprecated — see ADR-005)',
      },
    ],
    security: [
      {
        bearerAuth: [],
      },
    ],
  });
}


