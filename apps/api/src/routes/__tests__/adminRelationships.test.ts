import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../../middleware/auth.js';

// ─── Mock middleware ──────────────────────────────────────────────────────────

vi.mock('../../middleware/auth.js', () => ({
  requireAuth: vi.fn((_req: AuthenticatedRequest, _res: Response, next: NextFunction) => next()),
}));

vi.mock('../../middleware/tenant.js', () => ({
  requireTenant: vi.fn((_req: AuthenticatedRequest, _res: Response, next: NextFunction) => next()),
}));

// ─── Mock the service ────────────────────────────────────────────────────────

const mockCreateRelationshipDefinition = vi.fn();
const mockListRelationshipDefinitions = vi.fn();
const mockDeleteRelationshipDefinition = vi.fn();

vi.mock('../../services/relationshipDefinitionService.js', () => ({
  createRelationshipDefinition: mockCreateRelationshipDefinition,
  listRelationshipDefinitions: mockListRelationshipDefinitions,
  deleteRelationshipDefinition: mockDeleteRelationshipDefinition,
}));

// ─── Mock logger so tests stay silent ────────────────────────────────────────

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const {
  handleCreateRelationship,
  handleListRelationships,
  handleDeleteRelationship,
} = await import('../adminRelationships.js');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mockReq(
  body: unknown,
  user = { userId: 'user-123', tenantId: 'tenant-abc' },
  params: Record<string, string> = {},
) {
  return {
    body,
    path: '/admin/relationships',
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

// ─── Tests: POST /admin/relationships ───────────────────────────────────────

describe('POST /admin/relationships', () => {
  beforeEach(() => {
    mockCreateRelationshipDefinition.mockReset();
  });

  it('returns 201 with the created relationship on success', async () => {
    const now = new Date();
    const expectedRelationship = {
      id: 'rel-uuid',
      sourceObjectId: 'obj-1',
      targetObjectId: 'obj-2',
      relationshipType: 'lookup',
      apiName: 'project_account',
      label: 'Account',
      reverseLabel: 'Projects',
      required: false,
      createdAt: now,
    };

    mockCreateRelationshipDefinition.mockResolvedValue(expectedRelationship);

    const req = mockReq({
      source_object_id: 'obj-1',
      target_object_id: 'obj-2',
      relationship_type: 'lookup',
      api_name: 'project_account',
      label: 'Account',
      reverse_label: 'Projects',
    });
    const res = mockRes();

    await handleCreateRelationship(req, res);

    expect(mockCreateRelationshipDefinition).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceObjectId: 'obj-1',
        targetObjectId: 'obj-2',
        relationshipType: 'lookup',
        apiName: 'project_account',
        label: 'Account',
        reverseLabel: 'Projects',
      }),
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expectedRelationship);
  });

  it('accepts camelCase field names', async () => {
    mockCreateRelationshipDefinition.mockResolvedValue({
      id: 'rel-uuid',
      sourceObjectId: 'obj-1',
      targetObjectId: 'obj-2',
      relationshipType: 'parent_child',
      apiName: 'task_project',
      label: 'Project',
    });

    const req = mockReq({
      sourceObjectId: 'obj-1',
      targetObjectId: 'obj-2',
      relationshipType: 'parent_child',
      apiName: 'task_project',
      label: 'Project',
      reverseLabel: 'Tasks',
    });
    const res = mockRes();

    await handleCreateRelationship(req, res);

    expect(mockCreateRelationshipDefinition).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceObjectId: 'obj-1',
        targetObjectId: 'obj-2',
        relationshipType: 'parent_child',
        apiName: 'task_project',
      }),
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('returns 400 on VALIDATION_ERROR', async () => {
    const err = Object.assign(new Error('api_name is required'), { code: 'VALIDATION_ERROR' });
    mockCreateRelationshipDefinition.mockRejectedValue(err);

    const req = mockReq({ source_object_id: 'obj-1' });
    const res = mockRes();

    await handleCreateRelationship(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'api_name is required', code: 'VALIDATION_ERROR' });
  });

  it('returns 404 when source object not found', async () => {
    const err = Object.assign(new Error('Source object definition not found'), { code: 'NOT_FOUND' });
    mockCreateRelationshipDefinition.mockRejectedValue(err);

    const req = mockReq({
      source_object_id: 'missing',
      target_object_id: 'obj-2',
      relationship_type: 'lookup',
      api_name: 'test_rel',
      label: 'Test',
    });
    const res = mockRes();

    await handleCreateRelationship(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 409 on CONFLICT', async () => {
    const err = Object.assign(new Error('api_name already exists'), { code: 'CONFLICT' });
    mockCreateRelationshipDefinition.mockRejectedValue(err);

    const req = mockReq({
      source_object_id: 'obj-1',
      target_object_id: 'obj-2',
      relationship_type: 'lookup',
      api_name: 'dup_rel',
      label: 'Dup',
    });
    const res = mockRes();

    await handleCreateRelationship(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('returns 500 on unexpected error', async () => {
    mockCreateRelationshipDefinition.mockRejectedValue(new Error('Database error'));

    const req = mockReq({
      source_object_id: 'obj-1',
      target_object_id: 'obj-2',
      relationship_type: 'lookup',
      api_name: 'test_rel',
      label: 'Test',
    });
    const res = mockRes();

    await handleCreateRelationship(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'An unexpected error occurred' });
  });
});

// ─── Tests: GET /admin/objects/:objectId/relationships ──────────────────────

describe('GET /admin/objects/:objectId/relationships', () => {
  beforeEach(() => {
    mockListRelationshipDefinitions.mockReset();
  });

  it('returns 200 with all relationships including object metadata', async () => {
    const relationships = [
      {
        id: 'rel-1',
        sourceObjectId: 'obj-1',
        targetObjectId: 'obj-2',
        relationshipType: 'lookup',
        apiName: 'project_account',
        label: 'Account',
        sourceObjectLabel: 'Project',
        sourceObjectPluralLabel: 'Projects',
        targetObjectLabel: 'Account',
        targetObjectPluralLabel: 'Accounts',
      },
    ];
    mockListRelationshipDefinitions.mockResolvedValue(relationships);

    const req = mockReq({}, undefined, { objectId: 'obj-1' });
    const res = mockRes();

    await handleListRelationships(req, res);

    expect(mockListRelationshipDefinitions).toHaveBeenCalledWith('obj-1');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(relationships);
  });

  it('returns 404 when object not found', async () => {
    const err = Object.assign(new Error('Object definition not found'), { code: 'NOT_FOUND' });
    mockListRelationshipDefinitions.mockRejectedValue(err);

    const req = mockReq({}, undefined, { objectId: 'missing' });
    const res = mockRes();

    await handleListRelationships(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 500 on unexpected error', async () => {
    mockListRelationshipDefinitions.mockRejectedValue(new Error('Database error'));

    const req = mockReq({}, undefined, { objectId: 'obj-1' });
    const res = mockRes();

    await handleListRelationships(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ─── Tests: DELETE /admin/relationships/:id ─────────────────────────────────

describe('DELETE /admin/relationships/:id', () => {
  beforeEach(() => {
    mockDeleteRelationshipDefinition.mockReset();
  });

  it('returns 204 on successful deletion', async () => {
    mockDeleteRelationshipDefinition.mockResolvedValue(undefined);

    const req = mockReq({}, undefined, { id: 'rel-1' });
    const res = mockRes();

    await handleDeleteRelationship(req, res);

    expect(mockDeleteRelationshipDefinition).toHaveBeenCalledWith('rel-1');
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.end).toHaveBeenCalled();
  });

  it('returns 404 when relationship not found', async () => {
    const err = Object.assign(new Error('Relationship definition not found'), { code: 'NOT_FOUND' });
    mockDeleteRelationshipDefinition.mockRejectedValue(err);

    const req = mockReq({}, undefined, { id: 'missing' });
    const res = mockRes();

    await handleDeleteRelationship(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 400 for system relationships', async () => {
    const err = Object.assign(new Error('Cannot delete system relationships'), { code: 'DELETE_BLOCKED' });
    mockDeleteRelationshipDefinition.mockRejectedValue(err);

    const req = mockReq({}, undefined, { id: 'system-rel' });
    const res = mockRes();

    await handleDeleteRelationship(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Cannot delete system relationships', code: 'DELETE_BLOCKED' });
  });

  it('returns 500 on unexpected error', async () => {
    mockDeleteRelationshipDefinition.mockRejectedValue(new Error('Database error'));

    const req = mockReq({}, undefined, { id: 'rel-1' });
    const res = mockRes();

    await handleDeleteRelationship(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
