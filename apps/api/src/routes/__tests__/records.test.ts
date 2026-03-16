import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../../middleware/auth.js';

// ─── Mock middleware ──────────────────────────────────────────────────────────

vi.mock('../../middleware/auth.js', () => ({
  requireAuth: vi.fn((_req: AuthenticatedRequest, _res: Response, next: NextFunction) => next()),
}));

vi.mock('../../middleware/tenant.js', () => ({
  requireTenant: vi.fn((_req: AuthenticatedRequest, _res: Response, next: NextFunction) =>
    next(),
  ),
}));

// ─── Mock the record service ─────────────────────────────────────────────────

const mockCreateRecord = vi.fn();
const mockListRecords = vi.fn();
const mockGetRecord = vi.fn();
const mockUpdateRecord = vi.fn();
const mockDeleteRecord = vi.fn();

vi.mock('../../services/recordService.js', () => ({
  createRecord: mockCreateRecord,
  listRecords: mockListRecords,
  getRecord: mockGetRecord,
  updateRecord: mockUpdateRecord,
  deleteRecord: mockDeleteRecord,
}));

// ─── Mock logger so tests stay silent ────────────────────────────────────────

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const {
  handleCreateRecord,
  handleListRecords,
  handleGetRecord,
  handleUpdateRecord,
  handleDeleteRecord,
} = await import('../records.js');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mockReq(
  body: unknown,
  user = { userId: 'user-123', tenantId: 'tenant-abc' },
  params: Record<string, string> = { apiName: 'account' },
  query: Record<string, string> = {},
) {
  return {
    body,
    path: '/objects/account/records',
    user,
    params,
    query,
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

// ─── Tests: POST /objects/:apiName/records ──────────────────────────────────

describe('POST /objects/:apiName/records', () => {
  beforeEach(() => {
    mockCreateRecord.mockReset();
  });

  it('returns 201 with the created record on success', async () => {
    const now = new Date();
    const expectedRecord = {
      id: 'rec-uuid',
      objectId: 'obj-id',
      name: 'Acme Corp',
      fieldValues: { name: 'Acme Corp' },
      ownerId: 'user-123',
      createdAt: now,
      updatedAt: now,
      fields: [{ apiName: 'name', label: 'Name', fieldType: 'text', value: 'Acme Corp' }],
    };

    mockCreateRecord.mockResolvedValue(expectedRecord);

    const req = mockReq({ fieldValues: { name: 'Acme Corp' } });
    const res = mockRes();

    await handleCreateRecord(req, res);

    expect(mockCreateRecord).toHaveBeenCalledWith('account', { name: 'Acme Corp' }, 'user-123');
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expectedRecord);
  });

  it('returns 400 when validation fails', async () => {
    const err = Object.assign(new Error("Field 'Name' is required"), {
      code: 'VALIDATION_ERROR',
    });
    mockCreateRecord.mockRejectedValue(err);

    const req = mockReq({ fieldValues: {} });
    const res = mockRes();

    await handleCreateRecord(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: "Field 'Name' is required",
      code: 'VALIDATION_ERROR',
    });
  });

  it('returns 404 when object type not found', async () => {
    const err = Object.assign(new Error("Object type 'nonexistent' not found"), {
      code: 'NOT_FOUND',
    });
    mockCreateRecord.mockRejectedValue(err);

    const req = mockReq(
      { fieldValues: { name: 'Test' } },
      undefined,
      { apiName: 'nonexistent' },
    );
    const res = mockRes();

    await handleCreateRecord(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 500 on unexpected error', async () => {
    mockCreateRecord.mockRejectedValue(new Error('Database error'));

    const req = mockReq({ fieldValues: { name: 'Test' } });
    const res = mockRes();

    await handleCreateRecord(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'An unexpected error occurred' });
  });

  it('defaults to empty fieldValues when not provided', async () => {
    const now = new Date();
    mockCreateRecord.mockResolvedValue({
      id: 'rec-uuid',
      objectId: 'obj-id',
      name: 'Untitled',
      fieldValues: {},
      ownerId: 'user-123',
      createdAt: now,
      updatedAt: now,
      fields: [],
    });

    const req = mockReq({});
    const res = mockRes();

    await handleCreateRecord(req, res);

    expect(mockCreateRecord).toHaveBeenCalledWith('account', {}, 'user-123');
  });
});

// ─── Tests: GET /objects/:apiName/records ───────────────────────────────────

describe('GET /objects/:apiName/records', () => {
  beforeEach(() => {
    mockListRecords.mockReset();
  });

  it('returns 200 with paginated records', async () => {
    const result = {
      data: [],
      total: 0,
      page: 1,
      limit: 20,
      object: { id: 'obj-id', apiName: 'account', label: 'Account', pluralLabel: 'Accounts', isSystem: true },
    };

    mockListRecords.mockResolvedValue(result);

    const req = mockReq({}, undefined, { apiName: 'account' }, {});
    const res = mockRes();

    await handleListRecords(req, res);

    expect(mockListRecords).toHaveBeenCalledWith({
      apiName: 'account',
      ownerId: 'user-123',
      search: undefined,
      page: 1,
      limit: 20,
      sortBy: undefined,
      sortDir: undefined,
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(result);
  });

  it('passes search and pagination params to service', async () => {
    mockListRecords.mockResolvedValue({ data: [], total: 0, page: 2, limit: 10, object: {} });

    const req = mockReq(
      {},
      undefined,
      { apiName: 'account' },
      { search: 'acme', page: '2', limit: '10', sort_by: 'name', sort_dir: 'asc' },
    );
    const res = mockRes();

    await handleListRecords(req, res);

    expect(mockListRecords).toHaveBeenCalledWith({
      apiName: 'account',
      ownerId: 'user-123',
      search: 'acme',
      page: 2,
      limit: 10,
      sortBy: 'name',
      sortDir: 'asc',
    });
  });

  it('clamps limit to maximum of 100', async () => {
    mockListRecords.mockResolvedValue({ data: [], total: 0, page: 1, limit: 100, object: {} });

    const req = mockReq({}, undefined, { apiName: 'account' }, { limit: '500' });
    const res = mockRes();

    await handleListRecords(req, res);

    expect(mockListRecords).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 100 }),
    );
  });

  it('returns 404 when object type not found', async () => {
    const err = Object.assign(new Error("Object type 'bad' not found"), { code: 'NOT_FOUND' });
    mockListRecords.mockRejectedValue(err);

    const req = mockReq({}, undefined, { apiName: 'bad' }, {});
    const res = mockRes();

    await handleListRecords(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 500 on unexpected error', async () => {
    mockListRecords.mockRejectedValue(new Error('Database error'));

    const req = mockReq({});
    const res = mockRes();

    await handleListRecords(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ─── Tests: GET /objects/:apiName/records/:id ───────────────────────────────

describe('GET /objects/:apiName/records/:id', () => {
  beforeEach(() => {
    mockGetRecord.mockReset();
  });

  it('returns 200 with the record and relationships', async () => {
    const now = new Date();
    const record = {
      id: 'rec-uuid',
      objectId: 'obj-id',
      name: 'Acme Corp',
      fieldValues: { name: 'Acme Corp' },
      ownerId: 'user-123',
      createdAt: now,
      updatedAt: now,
      fields: [],
      relationships: [],
    };

    mockGetRecord.mockResolvedValue(record);

    const req = mockReq(
      {},
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { apiName: 'account', id: 'rec-uuid' },
    );
    const res = mockRes();

    await handleGetRecord(req, res);

    expect(mockGetRecord).toHaveBeenCalledWith('account', 'rec-uuid', 'user-123');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(record);
  });

  it('returns 404 when record not found', async () => {
    const err = Object.assign(new Error('Record not found'), { code: 'NOT_FOUND' });
    mockGetRecord.mockRejectedValue(err);

    const req = mockReq(
      {},
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { apiName: 'account', id: 'missing-id' },
    );
    const res = mockRes();

    await handleGetRecord(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Record not found', code: 'NOT_FOUND' });
  });

  it('returns 500 on unexpected error', async () => {
    mockGetRecord.mockRejectedValue(new Error('Database error'));

    const req = mockReq(
      {},
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { apiName: 'account', id: 'rec-uuid' },
    );
    const res = mockRes();

    await handleGetRecord(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ─── Tests: PUT /objects/:apiName/records/:id ───────────────────────────────

describe('PUT /objects/:apiName/records/:id', () => {
  beforeEach(() => {
    mockUpdateRecord.mockReset();
  });

  it('returns 200 with the updated record on success', async () => {
    const now = new Date();
    const updatedRecord = {
      id: 'rec-uuid',
      objectId: 'obj-id',
      name: 'Updated Corp',
      fieldValues: { name: 'Updated Corp' },
      ownerId: 'user-123',
      createdAt: now,
      updatedAt: now,
      fields: [],
    };

    mockUpdateRecord.mockResolvedValue(updatedRecord);

    const req = mockReq(
      { fieldValues: { name: 'Updated Corp' } },
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { apiName: 'account', id: 'rec-uuid' },
    );
    const res = mockRes();

    await handleUpdateRecord(req, res);

    expect(mockUpdateRecord).toHaveBeenCalledWith(
      'account',
      'rec-uuid',
      { name: 'Updated Corp' },
      'user-123',
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(updatedRecord);
  });

  it('returns 400 on validation error', async () => {
    const err = Object.assign(new Error("Field 'Email' must be a valid email"), {
      code: 'VALIDATION_ERROR',
    });
    mockUpdateRecord.mockRejectedValue(err);

    const req = mockReq(
      { fieldValues: { email: 'bad' } },
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { apiName: 'account', id: 'rec-uuid' },
    );
    const res = mockRes();

    await handleUpdateRecord(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: "Field 'Email' must be a valid email",
      code: 'VALIDATION_ERROR',
    });
  });

  it('returns 404 when record not found', async () => {
    const err = Object.assign(new Error('Record not found'), { code: 'NOT_FOUND' });
    mockUpdateRecord.mockRejectedValue(err);

    const req = mockReq(
      { fieldValues: { name: 'X' } },
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { apiName: 'account', id: 'missing-id' },
    );
    const res = mockRes();

    await handleUpdateRecord(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 500 on unexpected error', async () => {
    mockUpdateRecord.mockRejectedValue(new Error('Database error'));

    const req = mockReq(
      { fieldValues: { name: 'X' } },
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { apiName: 'account', id: 'rec-uuid' },
    );
    const res = mockRes();

    await handleUpdateRecord(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ─── Tests: DELETE /objects/:apiName/records/:id ────────────────────────────

describe('DELETE /objects/:apiName/records/:id', () => {
  beforeEach(() => {
    mockDeleteRecord.mockReset();
  });

  it('returns 204 on successful deletion', async () => {
    mockDeleteRecord.mockResolvedValue(undefined);

    const req = mockReq(
      {},
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { apiName: 'account', id: 'rec-uuid' },
    );
    const res = mockRes();

    await handleDeleteRecord(req, res);

    expect(mockDeleteRecord).toHaveBeenCalledWith('account', 'rec-uuid', 'user-123');
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.end).toHaveBeenCalled();
  });

  it('returns 404 when record not found', async () => {
    const err = Object.assign(new Error('Record not found'), { code: 'NOT_FOUND' });
    mockDeleteRecord.mockRejectedValue(err);

    const req = mockReq(
      {},
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { apiName: 'account', id: 'missing-id' },
    );
    const res = mockRes();

    await handleDeleteRecord(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Record not found', code: 'NOT_FOUND' });
  });

  it('returns 500 on unexpected error', async () => {
    mockDeleteRecord.mockRejectedValue(new Error('Database error'));

    const req = mockReq(
      {},
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { apiName: 'account', id: 'rec-uuid' },
    );
    const res = mockRes();

    await handleDeleteRecord(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
