import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../../middleware/auth.js';

// ─── Mock middleware ──────────────────────────────────────────────────────────

vi.mock('../../middleware/auth.js', () => ({
  requireAuth: vi.fn((_req: AuthenticatedRequest, _res: Response, next: NextFunction) => next()),
}));

// ─── Mock the service ────────────────────────────────────────────────────────

const mockCreateFieldDefinition = vi.fn();
const mockListFieldDefinitions = vi.fn();
const mockUpdateFieldDefinition = vi.fn();
const mockDeleteFieldDefinition = vi.fn();
const mockReorderFieldDefinitions = vi.fn();

vi.mock('../../services/fieldDefinitionService.js', () => ({
  createFieldDefinition: mockCreateFieldDefinition,
  listFieldDefinitions: mockListFieldDefinitions,
  updateFieldDefinition: mockUpdateFieldDefinition,
  deleteFieldDefinition: mockDeleteFieldDefinition,
  reorderFieldDefinitions: mockReorderFieldDefinitions,
}));

// ─── Mock logger so tests stay silent ────────────────────────────────────────

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const {
  handleCreateField,
  handleListFields,
  handleUpdateField,
  handleDeleteField,
  handleReorderFields,
} = await import('../adminFields.js');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mockReq(
  body: unknown,
  user = { userId: 'user-123', tenantId: 'tenant-abc' },
  params: Record<string, string> = { objectId: 'obj-1' },
) {
  return {
    body,
    path: '/admin/objects/obj-1/fields',
    user,
    params,
  } as unknown as AuthenticatedRequest;
}

function mockRes() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    end: vi.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

// ─── Tests: POST /admin/objects/:objectId/fields ────────────────────────────

describe('POST /admin/objects/:objectId/fields', () => {
  beforeEach(() => {
    mockCreateFieldDefinition.mockReset();
  });

  it('returns 201 with the created field on success', async () => {
    const now = new Date();
    const expectedField = {
      id: 'field-uuid',
      objectId: 'obj-1',
      apiName: 'company_name',
      label: 'Company Name',
      fieldType: 'text',
      required: false,
      options: { max_length: 200 },
      sortOrder: 1,
      isSystem: false,
      createdAt: now,
      updatedAt: now,
    };

    mockCreateFieldDefinition.mockResolvedValue(expectedField);

    const req = mockReq({
      api_name: 'company_name',
      label: 'Company Name',
      field_type: 'text',
      options: { max_length: 200 },
    });
    const res = mockRes();

    await handleCreateField(req, res);

    expect(mockCreateFieldDefinition).toHaveBeenCalledWith(
      'obj-1',
      expect.objectContaining({
        apiName: 'company_name',
        label: 'Company Name',
        fieldType: 'text',
      }),
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expectedField);
  });

  it('accepts camelCase field names', async () => {
    mockCreateFieldDefinition.mockResolvedValue({
      id: 'field-uuid',
      apiName: 'test_field',
      fieldType: 'text',
    });

    const req = mockReq({
      apiName: 'test_field',
      label: 'Test',
      fieldType: 'text',
    });
    const res = mockRes();

    await handleCreateField(req, res);

    expect(mockCreateFieldDefinition).toHaveBeenCalledWith(
      'obj-1',
      expect.objectContaining({
        apiName: 'test_field',
        fieldType: 'text',
      }),
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('returns 400 on VALIDATION_ERROR', async () => {
    const err = Object.assign(new Error('field_type is required'), { code: 'VALIDATION_ERROR' });
    mockCreateFieldDefinition.mockRejectedValue(err);

    const req = mockReq({ api_name: 'test' });
    const res = mockRes();

    await handleCreateField(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'field_type is required', code: 'VALIDATION_ERROR' });
  });

  it('returns 404 when parent object not found', async () => {
    const err = Object.assign(new Error('Object definition not found'), { code: 'NOT_FOUND' });
    mockCreateFieldDefinition.mockRejectedValue(err);

    const req = mockReq({ api_name: 'test', label: 'Test', field_type: 'text' });
    const res = mockRes();

    await handleCreateField(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 409 on CONFLICT', async () => {
    const err = Object.assign(new Error('api_name already exists'), { code: 'CONFLICT' });
    mockCreateFieldDefinition.mockRejectedValue(err);

    const req = mockReq({ api_name: 'dup', label: 'Dup', field_type: 'text' });
    const res = mockRes();

    await handleCreateField(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('returns 500 on unexpected error', async () => {
    mockCreateFieldDefinition.mockRejectedValue(new Error('Database error'));

    const req = mockReq({ api_name: 'test', label: 'Test', field_type: 'text' });
    const res = mockRes();

    await handleCreateField(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'An unexpected error occurred' });
  });
});

// ─── Tests: GET /admin/objects/:objectId/fields ─────────────────────────────

describe('GET /admin/objects/:objectId/fields', () => {
  beforeEach(() => {
    mockListFieldDefinitions.mockReset();
  });

  it('returns 200 with all fields', async () => {
    const fields = [
      { id: 'f1', apiName: 'name', label: 'Name', fieldType: 'text', sortOrder: 1 },
    ];
    mockListFieldDefinitions.mockResolvedValue(fields);

    const req = mockReq({});
    const res = mockRes();

    await handleListFields(req, res);

    expect(mockListFieldDefinitions).toHaveBeenCalledWith('obj-1');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(fields);
  });

  it('returns 404 when parent object not found', async () => {
    const err = Object.assign(new Error('Object definition not found'), { code: 'NOT_FOUND' });
    mockListFieldDefinitions.mockRejectedValue(err);

    const req = mockReq({});
    const res = mockRes();

    await handleListFields(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 500 on unexpected error', async () => {
    mockListFieldDefinitions.mockRejectedValue(new Error('Database error'));

    const req = mockReq({});
    const res = mockRes();

    await handleListFields(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ─── Tests: PUT /admin/objects/:objectId/fields/:id ─────────────────────────

describe('PUT /admin/objects/:objectId/fields/:id', () => {
  beforeEach(() => {
    mockUpdateFieldDefinition.mockReset();
  });

  it('returns 200 with the updated field', async () => {
    const updated = {
      id: 'f1',
      objectId: 'obj-1',
      apiName: 'test',
      label: 'Updated Label',
      fieldType: 'text',
    };
    mockUpdateFieldDefinition.mockResolvedValue(updated);

    const req = mockReq(
      { label: 'Updated Label' },
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { objectId: 'obj-1', id: 'f1' },
    );
    const res = mockRes();

    await handleUpdateField(req, res);

    expect(mockUpdateFieldDefinition).toHaveBeenCalledWith(
      'obj-1',
      'f1',
      expect.objectContaining({ label: 'Updated Label' }),
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(updated);
  });

  it('accepts snake_case field names in body', async () => {
    mockUpdateFieldDefinition.mockResolvedValue({ id: 'f1' });

    const req = mockReq(
      { field_type: 'number', default_value: '42' },
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { objectId: 'obj-1', id: 'f1' },
    );
    const res = mockRes();

    await handleUpdateField(req, res);

    expect(mockUpdateFieldDefinition).toHaveBeenCalledWith(
      'obj-1',
      'f1',
      expect.objectContaining({ fieldType: 'number', defaultValue: '42' }),
    );
  });

  it('returns 400 on VALIDATION_ERROR', async () => {
    const err = Object.assign(new Error('Cannot change field_type on system fields'), { code: 'VALIDATION_ERROR' });
    mockUpdateFieldDefinition.mockRejectedValue(err);

    const req = mockReq(
      { field_type: 'number' },
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { objectId: 'obj-1', id: 'f1' },
    );
    const res = mockRes();

    await handleUpdateField(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 404 when field not found', async () => {
    const err = Object.assign(new Error('Field definition not found'), { code: 'NOT_FOUND' });
    mockUpdateFieldDefinition.mockRejectedValue(err);

    const req = mockReq(
      { label: 'Updated' },
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { objectId: 'obj-1', id: 'missing' },
    );
    const res = mockRes();

    await handleUpdateField(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 500 on unexpected error', async () => {
    mockUpdateFieldDefinition.mockRejectedValue(new Error('Database error'));

    const req = mockReq(
      { label: 'Updated' },
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { objectId: 'obj-1', id: 'f1' },
    );
    const res = mockRes();

    await handleUpdateField(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ─── Tests: DELETE /admin/objects/:objectId/fields/:id ──────────────────────

describe('DELETE /admin/objects/:objectId/fields/:id', () => {
  beforeEach(() => {
    mockDeleteFieldDefinition.mockReset();
  });

  it('returns 204 on successful deletion', async () => {
    mockDeleteFieldDefinition.mockResolvedValue(undefined);

    const req = mockReq(
      {},
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { objectId: 'obj-1', id: 'f1' },
    );
    const res = mockRes();

    await handleDeleteField(req, res);

    expect(mockDeleteFieldDefinition).toHaveBeenCalledWith('obj-1', 'f1');
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.end).toHaveBeenCalled();
  });

  it('returns 404 when field not found', async () => {
    const err = Object.assign(new Error('Field definition not found'), { code: 'NOT_FOUND' });
    mockDeleteFieldDefinition.mockRejectedValue(err);

    const req = mockReq(
      {},
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { objectId: 'obj-1', id: 'missing' },
    );
    const res = mockRes();

    await handleDeleteField(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 400 for system fields', async () => {
    const err = Object.assign(new Error('Cannot delete system fields'), { code: 'DELETE_BLOCKED' });
    mockDeleteFieldDefinition.mockRejectedValue(err);

    const req = mockReq(
      {},
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { objectId: 'obj-1', id: 'system-f1' },
    );
    const res = mockRes();

    await handleDeleteField(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Cannot delete system fields', code: 'DELETE_BLOCKED' });
  });

  it('returns 500 on unexpected error', async () => {
    mockDeleteFieldDefinition.mockRejectedValue(new Error('Database error'));

    const req = mockReq(
      {},
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { objectId: 'obj-1', id: 'f1' },
    );
    const res = mockRes();

    await handleDeleteField(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ─── Tests: PATCH /admin/objects/:objectId/fields/reorder ──────────────────

describe('PATCH /admin/objects/:objectId/fields/reorder', () => {
  beforeEach(() => {
    mockReorderFieldDefinitions.mockReset();
  });

  it('returns 200 with reordered fields', async () => {
    const fields = [
      { id: 'f2', sortOrder: 1 },
      { id: 'f1', sortOrder: 2 },
    ];
    mockReorderFieldDefinitions.mockResolvedValue(fields);

    const req = mockReq({ field_ids: ['f2', 'f1'] });
    const res = mockRes();

    await handleReorderFields(req, res);

    expect(mockReorderFieldDefinitions).toHaveBeenCalledWith('obj-1', ['f2', 'f1']);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(fields);
  });

  it('accepts camelCase fieldIds', async () => {
    mockReorderFieldDefinitions.mockResolvedValue([]);

    const req = mockReq({ fieldIds: ['f1', 'f2'] });
    const res = mockRes();

    await handleReorderFields(req, res);

    expect(mockReorderFieldDefinitions).toHaveBeenCalledWith('obj-1', ['f1', 'f2']);
  });

  it('returns 400 on VALIDATION_ERROR', async () => {
    const err = Object.assign(new Error('field_ids must be a non-empty array'), { code: 'VALIDATION_ERROR' });
    mockReorderFieldDefinitions.mockRejectedValue(err);

    const req = mockReq({ field_ids: [] });
    const res = mockRes();

    await handleReorderFields(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 404 when parent object not found', async () => {
    const err = Object.assign(new Error('Object definition not found'), { code: 'NOT_FOUND' });
    mockReorderFieldDefinitions.mockRejectedValue(err);

    const req = mockReq({ field_ids: ['f1'] });
    const res = mockRes();

    await handleReorderFields(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 500 on unexpected error', async () => {
    mockReorderFieldDefinitions.mockRejectedValue(new Error('Database error'));

    const req = mockReq({ field_ids: ['f1'] });
    const res = mockRes();

    await handleReorderFields(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
