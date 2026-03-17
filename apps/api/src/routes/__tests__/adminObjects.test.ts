import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../../middleware/auth.js';

// ─── Mock middleware ──────────────────────────────────────────────────────────

vi.mock('../../middleware/auth.js', () => ({
  requireAuth: vi.fn((_req: AuthenticatedRequest, _res: Response, next: NextFunction) => next()),
}));

// ─── Mock the service ────────────────────────────────────────────────────────

const mockCreateObjectDefinition = vi.fn();
const mockListObjectDefinitions = vi.fn();
const mockGetObjectDefinitionById = vi.fn();
const mockUpdateObjectDefinition = vi.fn();
const mockDeleteObjectDefinition = vi.fn();
const mockReorderObjectDefinitions = vi.fn();

vi.mock('../../services/objectDefinitionService.js', () => ({
  createObjectDefinition: mockCreateObjectDefinition,
  listObjectDefinitions: mockListObjectDefinitions,
  getObjectDefinitionById: mockGetObjectDefinitionById,
  updateObjectDefinition: mockUpdateObjectDefinition,
  deleteObjectDefinition: mockDeleteObjectDefinition,
  reorderObjectDefinitions: mockReorderObjectDefinitions,
}));

// ─── Mock nested field routes to prevent transitive db/client import ─────────

vi.mock('../adminFields.js', () => ({
  adminFieldsRouter: vi.fn((_req: unknown, _res: unknown, next: NextFunction) => next()),
}));

// ─── Mock nested relationship routes to prevent transitive db/client import ──

vi.mock('../adminRelationships.js', () => ({
  adminObjectRelationshipsRouter: vi.fn((_req: unknown, _res: unknown, next: NextFunction) => next()),
}));

// ─── Mock logger so tests stay silent ────────────────────────────────────────

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const {
  handleCreateObject,
  handleListObjects,
  handleGetObject,
  handleUpdateObject,
  handleDeleteObject,
  handleReorderObjects,
} = await import('../adminObjects.js');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mockReq(
  body: unknown,
  user = { userId: 'user-123', tenantId: 'tenant-abc' },
  params: Record<string, string> = {},
) {
  return {
    body,
    path: '/admin/objects',
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

// ─── Tests: POST /admin/objects ─────────────────────────────────────────────

describe('POST /admin/objects', () => {
  beforeEach(() => {
    mockCreateObjectDefinition.mockReset();
  });

  it('returns 201 with the created object on success', async () => {
    const now = new Date();
    const expectedObject = {
      id: 'obj-uuid',
      apiName: 'custom_project',
      label: 'Custom Project',
      pluralLabel: 'Custom Projects',
      isSystem: false,
      ownerId: 'user-123',
      createdAt: now,
      updatedAt: now,
    };

    mockCreateObjectDefinition.mockResolvedValue(expectedObject);

    const req = mockReq({
      apiName: 'custom_project',
      label: 'Custom Project',
      pluralLabel: 'Custom Projects',
    });
    const res = mockRes();

    await handleCreateObject(req, res);

    expect(mockCreateObjectDefinition).toHaveBeenCalledWith(
      expect.objectContaining({
        apiName: 'custom_project',
        label: 'Custom Project',
        pluralLabel: 'Custom Projects',
        ownerId: 'user-123',
      }),
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expectedObject);
  });

  it('accepts snake_case field names (api_name, plural_label)', async () => {
    const now = new Date();
    mockCreateObjectDefinition.mockResolvedValue({
      id: 'obj-uuid',
      apiName: 'custom_task',
      label: 'Custom Task',
      pluralLabel: 'Custom Tasks',
      isSystem: false,
      ownerId: 'user-123',
      createdAt: now,
      updatedAt: now,
    });

    const req = mockReq({
      api_name: 'custom_task',
      label: 'Custom Task',
      plural_label: 'Custom Tasks',
    });
    const res = mockRes();

    await handleCreateObject(req, res);

    expect(mockCreateObjectDefinition).toHaveBeenCalledWith(
      expect.objectContaining({
        apiName: 'custom_task',
        pluralLabel: 'Custom Tasks',
      }),
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('returns 400 when the service throws a VALIDATION_ERROR', async () => {
    const validationErr = Object.assign(new Error('api_name is required'), {
      code: 'VALIDATION_ERROR',
    });
    mockCreateObjectDefinition.mockRejectedValue(validationErr);

    const req = mockReq({ apiName: '' });
    const res = mockRes();

    await handleCreateObject(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'api_name is required', code: 'VALIDATION_ERROR' });
  });

  it('returns 409 when the service throws a CONFLICT error', async () => {
    const conflictErr = Object.assign(
      new Error('An object with api_name "custom_project" already exists'),
      { code: 'CONFLICT' },
    );
    mockCreateObjectDefinition.mockRejectedValue(conflictErr);

    const req = mockReq({ apiName: 'custom_project', label: 'Custom Project', pluralLabel: 'Custom Projects' });
    const res = mockRes();

    await handleCreateObject(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'CONFLICT' }));
  });

  it('returns 500 when the service throws an unexpected error', async () => {
    mockCreateObjectDefinition.mockRejectedValue(new Error('Database connection failed'));

    const req = mockReq({ apiName: 'custom_project', label: 'CP', pluralLabel: 'CPs' });
    const res = mockRes();

    await handleCreateObject(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'An unexpected error occurred' });
  });
});

// ─── Tests: GET /admin/objects ──────────────────────────────────────────────

describe('GET /admin/objects', () => {
  beforeEach(() => {
    mockListObjectDefinitions.mockReset();
  });

  it('returns 200 with all objects', async () => {
    const now = new Date();
    const objects = [
      {
        id: 'obj-1',
        apiName: 'account',
        label: 'Account',
        pluralLabel: 'Accounts',
        isSystem: true,
        ownerId: 'SYSTEM',
        fieldCount: 12,
        recordCount: 5,
        createdAt: now,
        updatedAt: now,
      },
    ];

    mockListObjectDefinitions.mockResolvedValue(objects);

    const req = mockReq({});
    const res = mockRes();

    await handleListObjects(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(objects);
  });

  it('returns 500 when the service throws an unexpected error', async () => {
    mockListObjectDefinitions.mockRejectedValue(new Error('Database error'));

    const req = mockReq({});
    const res = mockRes();

    await handleListObjects(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'An unexpected error occurred' });
  });
});

// ─── Tests: GET /admin/objects/:id ──────────────────────────────────────────

describe('GET /admin/objects/:id', () => {
  beforeEach(() => {
    mockGetObjectDefinitionById.mockReset();
  });

  it('returns 200 with the object and nested data when found', async () => {
    const now = new Date();
    const objectDef = {
      id: 'obj-uuid',
      apiName: 'custom_project',
      label: 'Custom Project',
      pluralLabel: 'Custom Projects',
      isSystem: false,
      ownerId: 'user-123',
      createdAt: now,
      updatedAt: now,
      fields: [],
      relationships: [],
      layouts: [],
    };

    mockGetObjectDefinitionById.mockResolvedValue(objectDef);

    const req = mockReq({}, undefined, { id: 'obj-uuid' });
    const res = mockRes();

    await handleGetObject(req, res);

    expect(mockGetObjectDefinitionById).toHaveBeenCalledWith('obj-uuid');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(objectDef);
  });

  it('returns 404 when the object is not found', async () => {
    mockGetObjectDefinitionById.mockResolvedValue(null);

    const req = mockReq({}, undefined, { id: 'missing-id' });
    const res = mockRes();

    await handleGetObject(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Object definition not found', code: 'NOT_FOUND' });
  });

  it('returns 500 when the service throws an unexpected error', async () => {
    mockGetObjectDefinitionById.mockRejectedValue(new Error('Database error'));

    const req = mockReq({}, undefined, { id: 'obj-uuid' });
    const res = mockRes();

    await handleGetObject(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'An unexpected error occurred' });
  });
});

// ─── Tests: PUT /admin/objects/:id ──────────────────────────────────────────

describe('PUT /admin/objects/:id', () => {
  beforeEach(() => {
    mockUpdateObjectDefinition.mockReset();
  });

  it('returns 200 with the updated object on success', async () => {
    const now = new Date();
    const updatedObject = {
      id: 'obj-uuid',
      apiName: 'custom_project',
      label: 'Updated Label',
      pluralLabel: 'Custom Projects',
      isSystem: false,
      ownerId: 'user-123',
      createdAt: now,
      updatedAt: now,
    };

    mockUpdateObjectDefinition.mockResolvedValue(updatedObject);

    const req = mockReq(
      { label: 'Updated Label' },
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { id: 'obj-uuid' },
    );
    const res = mockRes();

    await handleUpdateObject(req, res);

    expect(mockUpdateObjectDefinition).toHaveBeenCalledWith(
      'obj-uuid',
      expect.objectContaining({ label: 'Updated Label' }),
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(updatedObject);
  });

  it('returns 400 when the service throws a VALIDATION_ERROR', async () => {
    const validationErr = Object.assign(new Error('label is required'), {
      code: 'VALIDATION_ERROR',
    });
    mockUpdateObjectDefinition.mockRejectedValue(validationErr);

    const req = mockReq(
      { label: '' },
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { id: 'obj-uuid' },
    );
    const res = mockRes();

    await handleUpdateObject(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'label is required', code: 'VALIDATION_ERROR' });
  });

  it('returns 404 when the object is not found', async () => {
    const notFoundErr = Object.assign(new Error('Object definition not found'), { code: 'NOT_FOUND' });
    mockUpdateObjectDefinition.mockRejectedValue(notFoundErr);

    const req = mockReq(
      { label: 'Updated' },
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { id: 'missing-id' },
    );
    const res = mockRes();

    await handleUpdateObject(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Object definition not found', code: 'NOT_FOUND' });
  });

  it('returns 500 when the service throws an unexpected error', async () => {
    mockUpdateObjectDefinition.mockRejectedValue(new Error('Database error'));

    const req = mockReq(
      { label: 'Updated' },
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { id: 'obj-uuid' },
    );
    const res = mockRes();

    await handleUpdateObject(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'An unexpected error occurred' });
  });
});

// ─── Tests: DELETE /admin/objects/:id ───────────────────────────────────────

describe('DELETE /admin/objects/:id', () => {
  beforeEach(() => {
    mockDeleteObjectDefinition.mockReset();
  });

  it('returns 204 on successful deletion', async () => {
    mockDeleteObjectDefinition.mockResolvedValue(undefined);

    const req = mockReq({}, { userId: 'user-123', tenantId: 'tenant-abc' }, { id: 'obj-uuid' });
    const res = mockRes();

    await handleDeleteObject(req, res);

    expect(mockDeleteObjectDefinition).toHaveBeenCalledWith('obj-uuid');
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.end).toHaveBeenCalled();
  });

  it('returns 404 when the object is not found', async () => {
    const notFoundErr = Object.assign(new Error('Object definition not found'), { code: 'NOT_FOUND' });
    mockDeleteObjectDefinition.mockRejectedValue(notFoundErr);

    const req = mockReq({}, { userId: 'user-123', tenantId: 'tenant-abc' }, { id: 'missing-id' });
    const res = mockRes();

    await handleDeleteObject(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Object definition not found', code: 'NOT_FOUND' });
  });

  it('returns 400 when the object is a system object', async () => {
    const blockedErr = Object.assign(new Error('Cannot delete system objects'), { code: 'DELETE_BLOCKED' });
    mockDeleteObjectDefinition.mockRejectedValue(blockedErr);

    const req = mockReq({}, { userId: 'user-123', tenantId: 'tenant-abc' }, { id: 'system-obj-id' });
    const res = mockRes();

    await handleDeleteObject(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Cannot delete system objects', code: 'DELETE_BLOCKED' });
  });

  it('returns 400 when records exist for the object', async () => {
    const blockedErr = Object.assign(new Error('Delete all records first'), { code: 'DELETE_BLOCKED' });
    mockDeleteObjectDefinition.mockRejectedValue(blockedErr);

    const req = mockReq({}, { userId: 'user-123', tenantId: 'tenant-abc' }, { id: 'obj-uuid' });
    const res = mockRes();

    await handleDeleteObject(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Delete all records first', code: 'DELETE_BLOCKED' });
  });

  it('returns 500 when the service throws an unexpected error', async () => {
    mockDeleteObjectDefinition.mockRejectedValue(new Error('Database error'));

    const req = mockReq({}, { userId: 'user-123', tenantId: 'tenant-abc' }, { id: 'obj-uuid' });
    const res = mockRes();

    await handleDeleteObject(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'An unexpected error occurred' });
  });
});

// ─── Tests: PUT /admin/objects/reorder ──────────────────────────────────────

describe('PUT /admin/objects/reorder', () => {
  beforeEach(() => {
    mockReorderObjectDefinitions.mockReset();
  });

  it('returns 204 on successful reorder', async () => {
    mockReorderObjectDefinitions.mockResolvedValue(undefined);

    const req = mockReq({ orderedIds: ['id-1', 'id-2', 'id-3'] });
    const res = mockRes();

    await handleReorderObjects(req, res);

    expect(mockReorderObjectDefinitions).toHaveBeenCalledWith(['id-1', 'id-2', 'id-3']);
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.end).toHaveBeenCalled();
  });

  it('returns 400 when the service throws a VALIDATION_ERROR', async () => {
    const validationErr = Object.assign(
      new Error('orderedIds must be a non-empty array of object definition IDs'),
      { code: 'VALIDATION_ERROR' },
    );
    mockReorderObjectDefinitions.mockRejectedValue(validationErr);

    const req = mockReq({ orderedIds: [] });
    const res = mockRes();

    await handleReorderObjects(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'VALIDATION_ERROR' }),
    );
  });

  it('passes empty array when orderedIds is missing from body', async () => {
    const validationErr = Object.assign(
      new Error('orderedIds must be a non-empty array of object definition IDs'),
      { code: 'VALIDATION_ERROR' },
    );
    mockReorderObjectDefinitions.mockRejectedValue(validationErr);

    const req = mockReq({});
    const res = mockRes();

    await handleReorderObjects(req, res);

    expect(mockReorderObjectDefinitions).toHaveBeenCalledWith([]);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 500 when the service throws an unexpected error', async () => {
    mockReorderObjectDefinitions.mockRejectedValue(new Error('Database error'));

    const req = mockReq({ orderedIds: ['id-1'] });
    const res = mockRes();

    await handleReorderObjects(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'An unexpected error occurred' });
  });
});
