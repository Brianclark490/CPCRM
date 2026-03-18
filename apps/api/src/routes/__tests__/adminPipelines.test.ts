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

const mockCreatePipeline = vi.fn();
const mockListPipelines = vi.fn();
const mockGetPipelineById = vi.fn();
const mockUpdatePipeline = vi.fn();
const mockDeletePipeline = vi.fn();
const mockCreateStage = vi.fn();
const mockUpdateStage = vi.fn();
const mockDeleteStage = vi.fn();
const mockReorderStages = vi.fn();

vi.mock('../../services/pipelineService.js', () => ({
  createPipeline: mockCreatePipeline,
  listPipelines: mockListPipelines,
  getPipelineById: mockGetPipelineById,
  updatePipeline: mockUpdatePipeline,
  deletePipeline: mockDeletePipeline,
  createStage: mockCreateStage,
  updateStage: mockUpdateStage,
  deleteStage: mockDeleteStage,
  reorderStages: mockReorderStages,
}));

// ─── Mock logger so tests stay silent ────────────────────────────────────────

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const {
  handleCreatePipeline,
  handleListPipelines,
  handleGetPipeline,
  handleUpdatePipeline,
  handleDeletePipeline,
  handleCreateStage,
  handleUpdateStage,
  handleDeleteStage,
  handleReorderStages,
} = await import('../adminPipelines.js');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mockReq(
  body: unknown,
  user = { userId: 'user-123', tenantId: 'tenant-abc' },
  params: Record<string, string> = {},
) {
  return {
    body,
    path: '/admin/pipelines',
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

// ─── Tests: POST /admin/pipelines ───────────────────────────────────────────

describe('POST /admin/pipelines', () => {
  beforeEach(() => {
    mockCreatePipeline.mockReset();
  });

  it('returns 201 with the created pipeline on success', async () => {
    const now = new Date();
    const expectedPipeline = {
      id: 'pipe-uuid',
      objectId: 'obj-1',
      name: 'Custom Pipeline',
      apiName: 'custom_pipeline',
      isDefault: true,
      isSystem: false,
      ownerId: 'user-123',
      createdAt: now,
      updatedAt: now,
      stages: [
        { id: 's1', name: 'Closed Won', stageType: 'won', sortOrder: 0 },
        { id: 's2', name: 'Closed Lost', stageType: 'lost', sortOrder: 1 },
      ],
    };

    mockCreatePipeline.mockResolvedValue(expectedPipeline);

    const req = mockReq({
      name: 'Custom Pipeline',
      api_name: 'custom_pipeline',
      object_id: 'obj-1',
    });
    const res = mockRes();

    await handleCreatePipeline(req, res);

    expect(mockCreatePipeline).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Custom Pipeline',
        apiName: 'custom_pipeline',
        objectId: 'obj-1',
        ownerId: 'user-123',
      }),
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expectedPipeline);
  });

  it('accepts camelCase field names', async () => {
    mockCreatePipeline.mockResolvedValue({ id: 'pipe-uuid' });

    const req = mockReq({
      name: 'Test Pipeline',
      apiName: 'test_pipeline',
      objectId: 'obj-1',
    });
    const res = mockRes();

    await handleCreatePipeline(req, res);

    expect(mockCreatePipeline).toHaveBeenCalledWith(
      expect.objectContaining({
        apiName: 'test_pipeline',
        objectId: 'obj-1',
      }),
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('returns 400 on VALIDATION_ERROR', async () => {
    const err = Object.assign(new Error('name is required'), { code: 'VALIDATION_ERROR' });
    mockCreatePipeline.mockRejectedValue(err);

    const req = mockReq({ name: '' });
    const res = mockRes();

    await handleCreatePipeline(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'name is required', code: 'VALIDATION_ERROR' });
  });

  it('returns 404 when object_id not found', async () => {
    const err = Object.assign(new Error('Object definition not found'), { code: 'NOT_FOUND' });
    mockCreatePipeline.mockRejectedValue(err);

    const req = mockReq({ name: 'Test', api_name: 'test_pipe', object_id: 'missing' });
    const res = mockRes();

    await handleCreatePipeline(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 409 on CONFLICT', async () => {
    const err = Object.assign(new Error('api_name already exists'), { code: 'CONFLICT' });
    mockCreatePipeline.mockRejectedValue(err);

    const req = mockReq({ name: 'Test', api_name: 'dup', object_id: 'obj-1' });
    const res = mockRes();

    await handleCreatePipeline(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('returns 500 on unexpected error', async () => {
    mockCreatePipeline.mockRejectedValue(new Error('Database error'));

    const req = mockReq({ name: 'Test', api_name: 'test_pipe', object_id: 'obj-1' });
    const res = mockRes();

    await handleCreatePipeline(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'An unexpected error occurred' });
  });
});

// ─── Tests: GET /admin/pipelines ────────────────────────────────────────────

describe('GET /admin/pipelines', () => {
  beforeEach(() => {
    mockListPipelines.mockReset();
  });

  it('returns 200 with all pipelines', async () => {
    const pipelines = [
      { id: 'p1', name: 'Sales Pipeline', apiName: 'sales_pipeline', isSystem: true },
    ];
    mockListPipelines.mockResolvedValue(pipelines);

    const req = mockReq({});
    const res = mockRes();

    await handleListPipelines(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(pipelines);
  });

  it('returns 500 on unexpected error', async () => {
    mockListPipelines.mockRejectedValue(new Error('Database error'));

    const req = mockReq({});
    const res = mockRes();

    await handleListPipelines(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ─── Tests: GET /admin/pipelines/:id ────────────────────────────────────────

describe('GET /admin/pipelines/:id', () => {
  beforeEach(() => {
    mockGetPipelineById.mockReset();
  });

  it('returns 200 with pipeline and stages when found', async () => {
    const pipeline = {
      id: 'p1',
      name: 'Sales Pipeline',
      stages: [
        { id: 's1', name: 'Prospecting', gates: [] },
      ],
    };
    mockGetPipelineById.mockResolvedValue(pipeline);

    const req = mockReq({}, undefined, { id: 'p1' });
    const res = mockRes();

    await handleGetPipeline(req, res);

    expect(mockGetPipelineById).toHaveBeenCalledWith('p1');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(pipeline);
  });

  it('returns 404 when pipeline not found', async () => {
    mockGetPipelineById.mockResolvedValue(null);

    const req = mockReq({}, undefined, { id: 'missing' });
    const res = mockRes();

    await handleGetPipeline(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Pipeline not found', code: 'NOT_FOUND' });
  });

  it('returns 500 on unexpected error', async () => {
    mockGetPipelineById.mockRejectedValue(new Error('Database error'));

    const req = mockReq({}, undefined, { id: 'p1' });
    const res = mockRes();

    await handleGetPipeline(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ─── Tests: PUT /admin/pipelines/:id ────────────────────────────────────────

describe('PUT /admin/pipelines/:id', () => {
  beforeEach(() => {
    mockUpdatePipeline.mockReset();
  });

  it('returns 200 with updated pipeline', async () => {
    const updated = { id: 'p1', name: 'Updated Pipeline' };
    mockUpdatePipeline.mockResolvedValue(updated);

    const req = mockReq(
      { name: 'Updated Pipeline' },
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { id: 'p1' },
    );
    const res = mockRes();

    await handleUpdatePipeline(req, res);

    expect(mockUpdatePipeline).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({ name: 'Updated Pipeline' }),
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(updated);
  });

  it('accepts snake_case field names', async () => {
    mockUpdatePipeline.mockResolvedValue({ id: 'p1' });

    const req = mockReq(
      { is_default: true },
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { id: 'p1' },
    );
    const res = mockRes();

    await handleUpdatePipeline(req, res);

    expect(mockUpdatePipeline).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({ isDefault: true }),
    );
  });

  it('returns 400 on VALIDATION_ERROR', async () => {
    const err = Object.assign(new Error('name is required'), { code: 'VALIDATION_ERROR' });
    mockUpdatePipeline.mockRejectedValue(err);

    const req = mockReq({ name: '' }, undefined, { id: 'p1' });
    const res = mockRes();

    await handleUpdatePipeline(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 404 when pipeline not found', async () => {
    const err = Object.assign(new Error('Pipeline not found'), { code: 'NOT_FOUND' });
    mockUpdatePipeline.mockRejectedValue(err);

    const req = mockReq({ name: 'Updated' }, undefined, { id: 'missing' });
    const res = mockRes();

    await handleUpdatePipeline(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 500 on unexpected error', async () => {
    mockUpdatePipeline.mockRejectedValue(new Error('Database error'));

    const req = mockReq({ name: 'Updated' }, undefined, { id: 'p1' });
    const res = mockRes();

    await handleUpdatePipeline(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ─── Tests: DELETE /admin/pipelines/:id ─────────────────────────────────────

describe('DELETE /admin/pipelines/:id', () => {
  beforeEach(() => {
    mockDeletePipeline.mockReset();
  });

  it('returns 204 on successful deletion', async () => {
    mockDeletePipeline.mockResolvedValue(undefined);

    const req = mockReq({}, undefined, { id: 'p1' });
    const res = mockRes();

    await handleDeletePipeline(req, res);

    expect(mockDeletePipeline).toHaveBeenCalledWith('p1');
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.end).toHaveBeenCalled();
  });

  it('returns 404 when pipeline not found', async () => {
    const err = Object.assign(new Error('Pipeline not found'), { code: 'NOT_FOUND' });
    mockDeletePipeline.mockRejectedValue(err);

    const req = mockReq({}, undefined, { id: 'missing' });
    const res = mockRes();

    await handleDeletePipeline(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 400 when system pipeline', async () => {
    const err = Object.assign(new Error('Cannot delete system pipelines'), { code: 'DELETE_BLOCKED' });
    mockDeletePipeline.mockRejectedValue(err);

    const req = mockReq({}, undefined, { id: 'system-p1' });
    const res = mockRes();

    await handleDeletePipeline(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Cannot delete system pipelines', code: 'DELETE_BLOCKED' });
  });

  it('returns 400 when records exist', async () => {
    const err = Object.assign(new Error('Cannot delete pipeline with existing records'), { code: 'DELETE_BLOCKED' });
    mockDeletePipeline.mockRejectedValue(err);

    const req = mockReq({}, undefined, { id: 'p1' });
    const res = mockRes();

    await handleDeletePipeline(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 500 on unexpected error', async () => {
    mockDeletePipeline.mockRejectedValue(new Error('Database error'));

    const req = mockReq({}, undefined, { id: 'p1' });
    const res = mockRes();

    await handleDeletePipeline(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ─── Tests: POST /admin/pipelines/:pipelineId/stages ────────────────────────

describe('POST /admin/pipelines/:pipelineId/stages', () => {
  beforeEach(() => {
    mockCreateStage.mockReset();
  });

  it('returns 201 with the created stage', async () => {
    const stage = {
      id: 's-uuid',
      pipelineId: 'p1',
      name: 'Discovery',
      apiName: 'discovery',
      stageType: 'open',
      colour: 'blue',
      sortOrder: 0,
    };
    mockCreateStage.mockResolvedValue(stage);

    const req = mockReq(
      { name: 'Discovery', api_name: 'discovery', stage_type: 'open', colour: 'blue' },
      undefined,
      { pipelineId: 'p1' },
    );
    const res = mockRes();

    await handleCreateStage(req, res);

    expect(mockCreateStage).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({
        name: 'Discovery',
        apiName: 'discovery',
        stageType: 'open',
        colour: 'blue',
      }),
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(stage);
  });

  it('accepts camelCase field names', async () => {
    mockCreateStage.mockResolvedValue({ id: 's-uuid' });

    const req = mockReq(
      { name: 'Test', apiName: 'test_stage', stageType: 'open', colour: 'green', defaultProbability: 50 },
      undefined,
      { pipelineId: 'p1' },
    );
    const res = mockRes();

    await handleCreateStage(req, res);

    expect(mockCreateStage).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({
        apiName: 'test_stage',
        stageType: 'open',
        defaultProbability: 50,
      }),
    );
  });

  it('returns 400 on VALIDATION_ERROR', async () => {
    const err = Object.assign(new Error('stage_type is required'), { code: 'VALIDATION_ERROR' });
    mockCreateStage.mockRejectedValue(err);

    const req = mockReq({ name: 'Test' }, undefined, { pipelineId: 'p1' });
    const res = mockRes();

    await handleCreateStage(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 404 when pipeline not found', async () => {
    const err = Object.assign(new Error('Pipeline not found'), { code: 'NOT_FOUND' });
    mockCreateStage.mockRejectedValue(err);

    const req = mockReq(
      { name: 'Test', api_name: 'test_stage', stage_type: 'open', colour: 'blue' },
      undefined,
      { pipelineId: 'missing' },
    );
    const res = mockRes();

    await handleCreateStage(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 409 on CONFLICT', async () => {
    const err = Object.assign(new Error('api_name already exists'), { code: 'CONFLICT' });
    mockCreateStage.mockRejectedValue(err);

    const req = mockReq(
      { name: 'Dup', api_name: 'dup', stage_type: 'open', colour: 'blue' },
      undefined,
      { pipelineId: 'p1' },
    );
    const res = mockRes();

    await handleCreateStage(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('returns 500 on unexpected error', async () => {
    mockCreateStage.mockRejectedValue(new Error('Database error'));

    const req = mockReq(
      { name: 'Test', api_name: 'test_stage', stage_type: 'open', colour: 'blue' },
      undefined,
      { pipelineId: 'p1' },
    );
    const res = mockRes();

    await handleCreateStage(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ─── Tests: PUT /admin/pipelines/:pipelineId/stages/:id ─────────────────────

describe('PUT /admin/pipelines/:pipelineId/stages/:id', () => {
  beforeEach(() => {
    mockUpdateStage.mockReset();
  });

  it('returns 200 with updated stage', async () => {
    const updated = { id: 's1', name: 'Updated Stage' };
    mockUpdateStage.mockResolvedValue(updated);

    const req = mockReq(
      { name: 'Updated Stage' },
      undefined,
      { pipelineId: 'p1', id: 's1' },
    );
    const res = mockRes();

    await handleUpdateStage(req, res);

    expect(mockUpdateStage).toHaveBeenCalledWith(
      'p1',
      's1',
      expect.objectContaining({ name: 'Updated Stage' }),
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('accepts snake_case field names', async () => {
    mockUpdateStage.mockResolvedValue({ id: 's1' });

    const req = mockReq(
      { stage_type: 'won', default_probability: 100, expected_days: 7 },
      undefined,
      { pipelineId: 'p1', id: 's1' },
    );
    const res = mockRes();

    await handleUpdateStage(req, res);

    expect(mockUpdateStage).toHaveBeenCalledWith(
      'p1',
      's1',
      expect.objectContaining({
        stageType: 'won',
        defaultProbability: 100,
        expectedDays: 7,
      }),
    );
  });

  it('returns 400 on VALIDATION_ERROR', async () => {
    const err = Object.assign(new Error('stage_type must be one of: open, won, lost'), { code: 'VALIDATION_ERROR' });
    mockUpdateStage.mockRejectedValue(err);

    const req = mockReq(
      { stage_type: 'invalid' },
      undefined,
      { pipelineId: 'p1', id: 's1' },
    );
    const res = mockRes();

    await handleUpdateStage(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 404 when stage not found', async () => {
    const err = Object.assign(new Error('Stage not found'), { code: 'NOT_FOUND' });
    mockUpdateStage.mockRejectedValue(err);

    const req = mockReq(
      { name: 'Updated' },
      undefined,
      { pipelineId: 'p1', id: 'missing' },
    );
    const res = mockRes();

    await handleUpdateStage(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 500 on unexpected error', async () => {
    mockUpdateStage.mockRejectedValue(new Error('Database error'));

    const req = mockReq(
      { name: 'Updated' },
      undefined,
      { pipelineId: 'p1', id: 's1' },
    );
    const res = mockRes();

    await handleUpdateStage(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ─── Tests: DELETE /admin/pipelines/:pipelineId/stages/:id ──────────────────

describe('DELETE /admin/pipelines/:pipelineId/stages/:id', () => {
  beforeEach(() => {
    mockDeleteStage.mockReset();
  });

  it('returns 204 on successful deletion', async () => {
    mockDeleteStage.mockResolvedValue(undefined);

    const req = mockReq({}, undefined, { pipelineId: 'p1', id: 's1' });
    const res = mockRes();

    await handleDeleteStage(req, res);

    expect(mockDeleteStage).toHaveBeenCalledWith('p1', 's1');
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.end).toHaveBeenCalled();
  });

  it('returns 404 when stage not found', async () => {
    const err = Object.assign(new Error('Stage not found'), { code: 'NOT_FOUND' });
    mockDeleteStage.mockRejectedValue(err);

    const req = mockReq({}, undefined, { pipelineId: 'p1', id: 'missing' });
    const res = mockRes();

    await handleDeleteStage(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 400 when deletion is blocked', async () => {
    const err = Object.assign(new Error('Cannot delete stage with existing records'), { code: 'DELETE_BLOCKED' });
    mockDeleteStage.mockRejectedValue(err);

    const req = mockReq({}, undefined, { pipelineId: 'p1', id: 's1' });
    const res = mockRes();

    await handleDeleteStage(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Cannot delete stage with existing records',
      code: 'DELETE_BLOCKED',
    });
  });

  it('returns 400 when deleting last won stage', async () => {
    const err = Object.assign(new Error('Cannot delete the last won stage'), { code: 'DELETE_BLOCKED' });
    mockDeleteStage.mockRejectedValue(err);

    const req = mockReq({}, undefined, { pipelineId: 'p1', id: 's-won' });
    const res = mockRes();

    await handleDeleteStage(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when deleting from system pipeline', async () => {
    const err = Object.assign(new Error('Cannot delete stages from system pipelines'), { code: 'DELETE_BLOCKED' });
    mockDeleteStage.mockRejectedValue(err);

    const req = mockReq({}, undefined, { pipelineId: 'sys-p1', id: 's1' });
    const res = mockRes();

    await handleDeleteStage(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 500 on unexpected error', async () => {
    mockDeleteStage.mockRejectedValue(new Error('Database error'));

    const req = mockReq({}, undefined, { pipelineId: 'p1', id: 's1' });
    const res = mockRes();

    await handleDeleteStage(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ─── Tests: PATCH /admin/pipelines/:pipelineId/stages/reorder ───────────────

describe('PATCH /admin/pipelines/:pipelineId/stages/reorder', () => {
  beforeEach(() => {
    mockReorderStages.mockReset();
  });

  it('returns 200 with reordered stages', async () => {
    const stages = [
      { id: 's2', sortOrder: 0 },
      { id: 's1', sortOrder: 1 },
      { id: 's-won', sortOrder: 2 },
      { id: 's-lost', sortOrder: 3 },
    ];
    mockReorderStages.mockResolvedValue(stages);

    const req = mockReq(
      { stage_ids: ['s2', 's1', 's-won', 's-lost'] },
      undefined,
      { pipelineId: 'p1' },
    );
    const res = mockRes();

    await handleReorderStages(req, res);

    expect(mockReorderStages).toHaveBeenCalledWith('p1', ['s2', 's1', 's-won', 's-lost']);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(stages);
  });

  it('accepts camelCase stageIds', async () => {
    mockReorderStages.mockResolvedValue([]);

    const req = mockReq(
      { stageIds: ['s1', 's2'] },
      undefined,
      { pipelineId: 'p1' },
    );
    const res = mockRes();

    await handleReorderStages(req, res);

    expect(mockReorderStages).toHaveBeenCalledWith('p1', ['s1', 's2']);
  });

  it('returns 400 on VALIDATION_ERROR', async () => {
    const err = Object.assign(new Error('Won/lost stages must remain at the end of the pipeline'), { code: 'VALIDATION_ERROR' });
    mockReorderStages.mockRejectedValue(err);

    const req = mockReq(
      { stage_ids: ['s-won', 's1'] },
      undefined,
      { pipelineId: 'p1' },
    );
    const res = mockRes();

    await handleReorderStages(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 404 when pipeline not found', async () => {
    const err = Object.assign(new Error('Pipeline not found'), { code: 'NOT_FOUND' });
    mockReorderStages.mockRejectedValue(err);

    const req = mockReq(
      { stage_ids: ['s1'] },
      undefined,
      { pipelineId: 'missing' },
    );
    const res = mockRes();

    await handleReorderStages(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 500 on unexpected error', async () => {
    mockReorderStages.mockRejectedValue(new Error('Database error'));

    const req = mockReq(
      { stage_ids: ['s1'] },
      undefined,
      { pipelineId: 'p1' },
    );
    const res = mockRes();

    await handleReorderStages(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
