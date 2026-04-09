import { Router } from 'express';
import type { Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireTenant } from '../middleware/tenant.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import {
  createFieldDefinition,
  listFieldDefinitions,
  updateFieldDefinition,
  deleteFieldDefinition,
  reorderFieldDefinitions,
} from '../services/fieldDefinitionService.js';
import type { UpdateFieldDefinitionParams } from '../services/fieldDefinitionService.js';
import { logger } from '../lib/logger.js';

export const adminFieldsRouter = Router({ mergeParams: true });

/**
 * POST /admin/objects/:objectId/fields
 *
 * Creates a new field definition on the specified object.
 * Auto-adds the field to the object's default form layout.
 *
 * Request body (JSON):
 *   {
 *     "api_name": string,
 *     "label": string,
 *     "field_type": string,
 *     "description"?: string,
 *     "required"?: boolean,
 *     "default_value"?: string,
 *     "options"?: object
 *   }
 *
 * Responses:
 *   201  – field definition created
 *   400  – validation error
 *   401  – missing or invalid Bearer token
 *   404  – parent object not found
 *   409  – api_name already exists on this object
 *   500  – unexpected server error
 */
export async function handleCreateField(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const { objectId } = req.params as { objectId: string };

  const body = req.body as {
    api_name?: string;
    apiName?: string;
    label?: string;
    field_type?: string;
    fieldType?: string;
    description?: string;
    required?: boolean;
    default_value?: string;
    defaultValue?: string;
    options?: Record<string, unknown>;
  };

  const apiName = body.api_name ?? body.apiName ?? '';
  const fieldType = body.field_type ?? body.fieldType ?? '';
  const defaultValue = body.default_value ?? body.defaultValue;

  try {
    const field = await createFieldDefinition(req.user!.tenantId!, objectId, {
      apiName,
      label: body.label ?? '',
      fieldType,
      description: body.description,
      required: body.required,
      defaultValue,
      options: body.options,
    });

    res.status(201).json(field);
  } catch (err: unknown) {
    const code = (err as Error & { code?: string }).code;

    if (code === 'VALIDATION_ERROR') {
      res.status(400).json({ error: (err as Error).message, code: 'VALIDATION_ERROR' });
      return;
    }

    if (code === 'NOT_FOUND') {
      res.status(404).json({ error: (err as Error).message, code: 'NOT_FOUND' });
      return;
    }

    if (code === 'CONFLICT') {
      res.status(409).json({ error: (err as Error).message, code: 'CONFLICT' });
      return;
    }

    logger.error({ err, objectId }, 'Unexpected error creating field definition');
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

/**
 * GET /admin/objects/:objectId/fields
 *
 * Returns all field definitions for the specified object, ordered by sort_order.
 *
 * Responses:
 *   200  – array of field definitions
 *   401  – missing or invalid Bearer token
 *   404  – parent object not found
 *   500  – unexpected server error
 */
export async function handleListFields(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const { objectId } = req.params as { objectId: string };

  try {
    const fields = await listFieldDefinitions(req.user!.tenantId!, objectId);
    res.status(200).json(fields);
  } catch (err: unknown) {
    const code = (err as Error & { code?: string }).code;

    if (code === 'NOT_FOUND') {
      res.status(404).json({ error: (err as Error).message, code: 'NOT_FOUND' });
      return;
    }

    logger.error({ err, objectId }, 'Unexpected error listing field definitions');
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

/**
 * PUT /admin/objects/:objectId/fields/:id
 *
 * Updates a field definition. System fields cannot have their field_type changed.
 *
 * Request body (JSON) — all fields optional:
 *   {
 *     "label"?: string,
 *     "field_type"?: string,
 *     "description"?: string | null,
 *     "required"?: boolean,
 *     "default_value"?: string | null,
 *     "options"?: object
 *   }
 *
 * Responses:
 *   200  – updated field definition (may include warning)
 *   400  – validation error
 *   401  – missing or invalid Bearer token
 *   404  – field or parent object not found
 *   500  – unexpected server error
 */
export async function handleUpdateField(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const { objectId, id } = req.params as { objectId: string; id: string };

  const body = req.body as {
    label?: string;
    field_type?: string;
    fieldType?: string;
    description?: string | null;
    required?: boolean;
    default_value?: string | null;
    defaultValue?: string | null;
    options?: Record<string, unknown>;
  };

  const params: UpdateFieldDefinitionParams = {};
  if ('label' in body) params.label = body.label;
  if ('field_type' in body) params.fieldType = body.field_type;
  if ('fieldType' in body && !('field_type' in body)) params.fieldType = body.fieldType;
  if ('description' in body) params.description = body.description;
  if ('required' in body) params.required = body.required;
  if ('default_value' in body) params.defaultValue = body.default_value;
  if ('defaultValue' in body && !('default_value' in body)) params.defaultValue = body.defaultValue;
  if ('options' in body) params.options = body.options;

  try {
    const updated = await updateFieldDefinition(req.user!.tenantId!, objectId, id, params);
    res.status(200).json(updated);
  } catch (err: unknown) {
    const code = (err as Error & { code?: string }).code;

    if (code === 'VALIDATION_ERROR') {
      res.status(400).json({ error: (err as Error).message, code: 'VALIDATION_ERROR' });
      return;
    }

    if (code === 'NOT_FOUND') {
      res.status(404).json({ error: (err as Error).message, code: 'NOT_FOUND' });
      return;
    }

    logger.error({ err, objectId, fieldId: id }, 'Unexpected error updating field definition');
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

/**
 * DELETE /admin/objects/:objectId/fields/:id
 *
 * Deletes a field definition. System fields cannot be deleted.
 * Removes the field from all layouts. Does NOT remove existing data from
 * records.field_values.
 *
 * Responses:
 *   204  – field definition deleted
 *   400  – system field (delete blocked)
 *   401  – missing or invalid Bearer token
 *   404  – field or parent object not found
 *   500  – unexpected server error
 */
export async function handleDeleteField(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const { objectId, id } = req.params as { objectId: string; id: string };

  try {
    await deleteFieldDefinition(req.user!.tenantId!, objectId, id);
    res.status(204).end();
  } catch (err: unknown) {
    const code = (err as Error & { code?: string }).code;

    if (code === 'NOT_FOUND') {
      res.status(404).json({ error: (err as Error).message, code: 'NOT_FOUND' });
      return;
    }

    if (code === 'DELETE_BLOCKED') {
      res.status(400).json({ error: (err as Error).message, code: 'DELETE_BLOCKED' });
      return;
    }

    logger.error({ err, objectId, fieldId: id }, 'Unexpected error deleting field definition');
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

/**
 * PATCH /admin/objects/:objectId/fields/reorder
 *
 * Reorders field definitions by updating sort_order based on the provided
 * array of field IDs.
 *
 * Request body (JSON):
 *   { "field_ids": string[] }
 *
 * Responses:
 *   200  – reordered field definitions
 *   400  – validation error
 *   401  – missing or invalid Bearer token
 *   404  – parent object not found
 *   500  – unexpected server error
 */
export async function handleReorderFields(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const { objectId } = req.params as { objectId: string };

  const body = req.body as {
    field_ids?: unknown;
    fieldIds?: unknown;
  };

  const rawFieldIds = body.field_ids ?? body.fieldIds;
  const MAX_REORDER_FIELDS = 1000;

  if (!Array.isArray(rawFieldIds) || rawFieldIds.length === 0) {
    res.status(400).json({ error: 'field_ids must be a non-empty array', code: 'VALIDATION_ERROR' });
    return;
  }

  if (rawFieldIds.length > MAX_REORDER_FIELDS) {
    res.status(400).json({
      error: `field_ids cannot contain more than ${MAX_REORDER_FIELDS} items`,
      code: 'VALIDATION_ERROR',
    });
    return;
  }

  if (!rawFieldIds.every((id) => typeof id === 'string')) {
    res.status(400).json({ error: 'field_ids must be an array of strings', code: 'VALIDATION_ERROR' });
    return;
  }

  const fieldIds = rawFieldIds.slice(0, MAX_REORDER_FIELDS);

  try {
    const fields = await reorderFieldDefinitions(req.user!.tenantId!, objectId, fieldIds);
    res.status(200).json(fields);
  } catch (err: unknown) {
    const code = (err as Error & { code?: string }).code;

    if (code === 'VALIDATION_ERROR') {
      res.status(400).json({ error: (err as Error).message, code: 'VALIDATION_ERROR' });
      return;
    }

    if (code === 'NOT_FOUND') {
      res.status(404).json({ error: (err as Error).message, code: 'NOT_FOUND' });
      return;
    }

    logger.error({ err, objectId }, 'Unexpected error reordering field definitions');
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

adminFieldsRouter.post('/', requireAuth, requireTenant, handleCreateField);
adminFieldsRouter.get('/', requireAuth, requireTenant, handleListFields);
adminFieldsRouter.patch('/reorder', requireAuth, requireTenant, handleReorderFields);
adminFieldsRouter.put('/:id', requireAuth, requireTenant, handleUpdateField);
adminFieldsRouter.delete('/:id', requireAuth, requireTenant, handleDeleteField);
