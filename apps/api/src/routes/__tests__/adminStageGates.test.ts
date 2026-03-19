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

const mockListStageGates = vi.fn();
const mockCreateStageGate = vi.fn();
const mockUpdateStageGate = vi.fn();
const mockDeleteStageGate = vi.fn();

vi.mock('../../services/stageGateService.js', () => ({
  listStageGates: mockListStageGates,
  createStageGate: mockCreateStageGate,
  updateStageGate: mockUpdateStageGate,
  deleteStageGate: mockDeleteStageGate,
}));

// ─── Mock logger so tests stay silent ────────────────────────────────────────

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const {
  handleListGates,
  handleCreateGate,
  handleUpdateGate,
  handleDeleteGate,
} = await import('../adminStageGates.js');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mockReq(
  body: unknown,
  user = { userId: 'user-123', tenantId: 'tenant-abc' },
  params: Record<string, string> = { stageId: 'stage-1' },
) {
  return {
    body,
    path: '/admin/stages/stage-1/gates',
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

const sampleGate = {
  id: 'gate-uuid',
  stageId: 'stage-1',
  field: { id: 'field-1', label: 'Value', fieldType: 'currency' },
  gateType: 'required',
  gateValue: null,
  errorMessage: 'Deal value is required',
};

// ─── Tests: GET /admin/stages/:stageId/gates ────────────────────────────────

describe('GET /admin/stages/:stageId/gates', () => {
  beforeEach(() => {
    mockListStageGates.mockReset();
  });

  it('returns 200 with all gates for a stage', async () => {
    mockListStageGates.mockResolvedValue([sampleGate]);

    const req = mockReq({});
    const res = mockRes();

    await handleListGates(req, res);

    expect(mockListStageGates).toHaveBeenCalledWith('tenant-abc', 'stage-1');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith([sampleGate]);
  });

  it('returns 404 when stage not found', async () => {
    const err = Object.assign(new Error('Stage not found'), { code: 'NOT_FOUND' });
    mockListStageGates.mockRejectedValue(err);

    const req = mockReq({});
    const res = mockRes();

    await handleListGates(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Stage not found', code: 'NOT_FOUND' });
  });

  it('returns 500 on unexpected error', async () => {
    mockListStageGates.mockRejectedValue(new Error('Database error'));

    const req = mockReq({});
    const res = mockRes();

    await handleListGates(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'An unexpected error occurred' });
  });
});

// ─── Tests: POST /admin/stages/:stageId/gates ───────────────────────────────

describe('POST /admin/stages/:stageId/gates', () => {
  beforeEach(() => {
    mockCreateStageGate.mockReset();
  });

  it('returns 201 with the created gate on success', async () => {
    mockCreateStageGate.mockResolvedValue(sampleGate);

    const req = mockReq({
      field_id: 'field-1',
      gate_type: 'required',
      error_message: 'Deal value is required',
    });
    const res = mockRes();

    await handleCreateGate(req, res);

    expect(mockCreateStageGate).toHaveBeenCalledWith('tenant-abc', 'stage-1', {
      fieldId: 'field-1',
      gateType: 'required',
      gateValue: null,
      errorMessage: 'Deal value is required',
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(sampleGate);
  });

  it('accepts camelCase field names', async () => {
    mockCreateStageGate.mockResolvedValue(sampleGate);

    const req = mockReq({
      fieldId: 'field-1',
      gateType: 'required',
      errorMessage: 'Deal value is required',
    });
    const res = mockRes();

    await handleCreateGate(req, res);

    expect(mockCreateStageGate).toHaveBeenCalledWith('tenant-abc', 'stage-1', {
      fieldId: 'field-1',
      gateType: 'required',
      gateValue: null,
      errorMessage: 'Deal value is required',
    });
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('returns 400 on VALIDATION_ERROR', async () => {
    const err = Object.assign(new Error('gate_type is required'), { code: 'VALIDATION_ERROR' });
    mockCreateStageGate.mockRejectedValue(err);

    const req = mockReq({ field_id: 'field-1' });
    const res = mockRes();

    await handleCreateGate(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'gate_type is required', code: 'VALIDATION_ERROR' });
  });

  it('returns 404 when stage or field not found', async () => {
    const err = Object.assign(new Error('Stage not found'), { code: 'NOT_FOUND' });
    mockCreateStageGate.mockRejectedValue(err);

    const req = mockReq({ field_id: 'field-1', gate_type: 'required' });
    const res = mockRes();

    await handleCreateGate(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 409 on duplicate gate', async () => {
    const err = Object.assign(new Error('A gate already exists for this field on this stage'), { code: 'CONFLICT' });
    mockCreateStageGate.mockRejectedValue(err);

    const req = mockReq({ field_id: 'field-1', gate_type: 'required' });
    const res = mockRes();

    await handleCreateGate(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('returns 500 on unexpected error', async () => {
    mockCreateStageGate.mockRejectedValue(new Error('Database error'));

    const req = mockReq({ field_id: 'field-1', gate_type: 'required' });
    const res = mockRes();

    await handleCreateGate(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'An unexpected error occurred' });
  });
});

// ─── Tests: PUT /admin/stages/:stageId/gates/:id ────────────────────────────

describe('PUT /admin/stages/:stageId/gates/:id', () => {
  beforeEach(() => {
    mockUpdateStageGate.mockReset();
  });

  it('returns 200 with the updated gate', async () => {
    const updated = { ...sampleGate, errorMessage: 'Updated message' };
    mockUpdateStageGate.mockResolvedValue(updated);

    const req = mockReq(
      { error_message: 'Updated message' },
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { stageId: 'stage-1', id: 'gate-uuid' },
    );
    const res = mockRes();

    await handleUpdateGate(req, res);

    expect(mockUpdateStageGate).toHaveBeenCalledWith(
      'tenant-abc',
      'stage-1',
      'gate-uuid',
      expect.objectContaining({ errorMessage: 'Updated message' }),
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(updated);
  });

  it('accepts snake_case field names in body', async () => {
    mockUpdateStageGate.mockResolvedValue(sampleGate);

    const req = mockReq(
      { gate_type: 'min_value', gate_value: '100' },
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { stageId: 'stage-1', id: 'gate-uuid' },
    );
    const res = mockRes();

    await handleUpdateGate(req, res);

    expect(mockUpdateStageGate).toHaveBeenCalledWith(
      'tenant-abc',
      'stage-1',
      'gate-uuid',
      expect.objectContaining({ gateType: 'min_value', gateValue: '100' }),
    );
  });

  it('returns 400 on VALIDATION_ERROR', async () => {
    const err = Object.assign(new Error('Invalid gate_type'), { code: 'VALIDATION_ERROR' });
    mockUpdateStageGate.mockRejectedValue(err);

    const req = mockReq(
      { gate_type: 'invalid' },
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { stageId: 'stage-1', id: 'gate-uuid' },
    );
    const res = mockRes();

    await handleUpdateGate(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 404 when gate not found', async () => {
    const err = Object.assign(new Error('Stage gate not found'), { code: 'NOT_FOUND' });
    mockUpdateStageGate.mockRejectedValue(err);

    const req = mockReq(
      { error_message: 'Updated' },
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { stageId: 'stage-1', id: 'missing' },
    );
    const res = mockRes();

    await handleUpdateGate(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 500 on unexpected error', async () => {
    mockUpdateStageGate.mockRejectedValue(new Error('Database error'));

    const req = mockReq(
      { error_message: 'Updated' },
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { stageId: 'stage-1', id: 'gate-uuid' },
    );
    const res = mockRes();

    await handleUpdateGate(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ─── Tests: DELETE /admin/stages/:stageId/gates/:id ─────────────────────────

describe('DELETE /admin/stages/:stageId/gates/:id', () => {
  beforeEach(() => {
    mockDeleteStageGate.mockReset();
  });

  it('returns 204 on successful deletion', async () => {
    mockDeleteStageGate.mockResolvedValue(undefined);

    const req = mockReq(
      {},
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { stageId: 'stage-1', id: 'gate-uuid' },
    );
    const res = mockRes();

    await handleDeleteGate(req, res);

    expect(mockDeleteStageGate).toHaveBeenCalledWith('tenant-abc', 'stage-1', 'gate-uuid');
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.end).toHaveBeenCalled();
  });

  it('returns 404 when gate not found', async () => {
    const err = Object.assign(new Error('Stage gate not found'), { code: 'NOT_FOUND' });
    mockDeleteStageGate.mockRejectedValue(err);

    const req = mockReq(
      {},
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { stageId: 'stage-1', id: 'missing' },
    );
    const res = mockRes();

    await handleDeleteGate(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 500 on unexpected error', async () => {
    mockDeleteStageGate.mockRejectedValue(new Error('Database error'));

    const req = mockReq(
      {},
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { stageId: 'stage-1', id: 'gate-uuid' },
    );
    const res = mockRes();

    await handleDeleteGate(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
