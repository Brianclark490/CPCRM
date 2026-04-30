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

// ─── Mock the record relationship service ────────────────────────────────────

const mockLinkRecords = vi.fn();

vi.mock('../../services/recordRelationshipService.js', () => ({
  linkRecords: mockLinkRecords,
}));

// ─── Mock the lead conversion service ────────────────────────────────────────

const mockConvertLead = vi.fn();

vi.mock('../../services/leadConversionService.js', () => ({
  convertLead: mockConvertLead,
}));

// ─── Mock the stage movement service ─────────────────────────────────────────

const mockMoveRecordStage = vi.fn();

vi.mock('../../services/stageMovementService.js', () => ({
  moveRecordStage: mockMoveRecordStage,
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
  handleConvertLead,
  handleMoveStage,
} = await import('../records.js');

// ─── Constants ───────────────────────────────────────────────────────────────

const VALID_UUID = '00000000-0000-0000-0000-000000000001';
const VALID_UUID_2 = '00000000-0000-0000-0000-000000000002';

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
    mockLinkRecords.mockReset();
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

    expect(mockCreateRecord).toHaveBeenCalledWith('tenant-abc', 'account', { name: 'Acme Corp' }, 'user-123', undefined);
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

    expect(mockCreateRecord).toHaveBeenCalledWith('tenant-abc', 'account', {}, 'user-123', undefined);
  });

  it('returns 403 when trying to manually create a user record', async () => {
    const req = mockReq(
      { fieldValues: { email: 'test@example.com' } },
      undefined,
      { apiName: 'user' },
    );
    const res = mockRes();

    await handleCreateRecord(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: 'User records cannot be created manually. They are synced automatically from Descope on login.',
      code: 'CREATE_DISABLED',
    });
    expect(mockCreateRecord).not.toHaveBeenCalled();
  });

  it('calls linkRecords when linkTo is provided with source direction', async () => {
    const now = new Date();
    const expectedRecord = {
      id: 'rec-uuid',
      objectId: 'obj-id',
      name: 'Follow-up call',
      fieldValues: { subject: 'Follow-up call' },
      ownerId: 'user-123',
      createdAt: now,
      updatedAt: now,
      fields: [],
    };

    mockCreateRecord.mockResolvedValue(expectedRecord);
    mockLinkRecords.mockResolvedValue({ id: 'link-uuid' });

    const req = mockReq({
      fieldValues: { subject: 'Follow-up call' },
      linkTo: { recordId: VALID_UUID, relationshipId: VALID_UUID_2, direction: 'source' },
    });
    const res = mockRes();

    await handleCreateRecord(req, res);

    expect(mockCreateRecord).toHaveBeenCalled();
    // When parent direction is 'source', parent is the source and new record is the target
    expect(mockLinkRecords).toHaveBeenCalledWith(
      'tenant-abc',
      VALID_UUID,       // source = parent record
      VALID_UUID_2,     // relationship
      'rec-uuid',       // target = new record
      'user-123',
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expectedRecord);
  });

  it('calls linkRecords with new record as source when parent direction is target', async () => {
    const now = new Date();
    const expectedRecord = {
      id: 'rec-uuid',
      objectId: 'obj-id',
      name: 'Follow-up call',
      fieldValues: { subject: 'Follow-up call' },
      ownerId: 'user-123',
      createdAt: now,
      updatedAt: now,
      fields: [],
    };

    mockCreateRecord.mockResolvedValue(expectedRecord);
    mockLinkRecords.mockResolvedValue({ id: 'link-uuid' });

    const req = mockReq({
      fieldValues: { subject: 'Follow-up call' },
      linkTo: { recordId: VALID_UUID, relationshipId: VALID_UUID_2, direction: 'target' },
    });
    const res = mockRes();

    await handleCreateRecord(req, res);

    expect(mockCreateRecord).toHaveBeenCalled();
    // When parent direction is 'target', new record is the source and parent is the target
    expect(mockLinkRecords).toHaveBeenCalledWith(
      'tenant-abc',
      'rec-uuid',       // source = new record
      VALID_UUID_2,     // relationship
      VALID_UUID,       // target = parent record
      'user-123',
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expectedRecord);
  });

  it('still returns 201 even if linkRecords fails', async () => {
    const now = new Date();
    const expectedRecord = {
      id: 'rec-uuid',
      objectId: 'obj-id',
      name: 'Follow-up call',
      fieldValues: { subject: 'Follow-up call' },
      ownerId: 'user-123',
      createdAt: now,
      updatedAt: now,
      fields: [],
    };

    mockCreateRecord.mockResolvedValue(expectedRecord);
    mockLinkRecords.mockRejectedValue(new Error('Link failed'));

    const req = mockReq({
      fieldValues: { subject: 'Follow-up call' },
      linkTo: { recordId: VALID_UUID, relationshipId: VALID_UUID_2 },
    });
    const res = mockRes();

    await handleCreateRecord(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expectedRecord);
  });

  it('does not call linkRecords when linkTo is not provided', async () => {
    const now = new Date();
    mockCreateRecord.mockResolvedValue({
      id: 'rec-uuid',
      objectId: 'obj-id',
      name: 'Test',
      fieldValues: { name: 'Test' },
      ownerId: 'user-123',
      createdAt: now,
      updatedAt: now,
      fields: [],
    });

    const req = mockReq({ fieldValues: { name: 'Test' } });
    const res = mockRes();

    await handleCreateRecord(req, res);

    expect(mockLinkRecords).not.toHaveBeenCalled();
  });
});

// ─── Tests: GET /objects/:apiName/records ───────────────────────────────────

describe('GET /objects/:apiName/records', () => {
  beforeEach(() => {
    mockListRecords.mockReset();
  });

  it('returns 200 with paginated records wrapped in the canonical envelope', async () => {
    const objectDef = {
      id: 'obj-id',
      apiName: 'account',
      label: 'Account',
      pluralLabel: 'Accounts',
      isSystem: true,
    };
    const result = {
      data: [],
      total: 0,
      limit: 50,
      offset: 0,
      object: objectDef,
    };

    mockListRecords.mockResolvedValue(result);

    const req = mockReq({}, undefined, { apiName: 'account' }, {});
    const res = mockRes();

    await handleListRecords(req, res);

    expect(mockListRecords).toHaveBeenCalledWith({
      tenantId: 'tenant-abc',
      apiName: 'account',
      ownerId: 'user-123',
      search: undefined,
      limit: 50,
      offset: 0,
      sortBy: undefined,
      sortDir: undefined,
      filters: {},
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      data: [],
      pagination: { total: 0, limit: 50, offset: 0, hasMore: false },
      object: objectDef,
    });
  });

  it('passes search and pagination params to service', async () => {
    mockListRecords.mockResolvedValue({ data: [], total: 0, limit: 10, offset: 20, object: {} });

    const req = mockReq(
      {},
      undefined,
      { apiName: 'account' },
      { search: 'acme', limit: '10', offset: '20', sort_by: 'name', sort_dir: 'asc' },
    );
    const res = mockRes();

    await handleListRecords(req, res);

    expect(mockListRecords).toHaveBeenCalledWith({
      tenantId: 'tenant-abc',
      apiName: 'account',
      ownerId: 'user-123',
      search: 'acme',
      limit: 10,
      offset: 20,
      sortBy: 'name',
      sortDir: 'asc',
      filters: {},
    });
  });

  it('forwards dropdown field filters from filter[<field>] query params', async () => {
    mockListRecords.mockResolvedValue({ data: [], total: 0, limit: 50, offset: 0, object: {} });

    // Express's `qs` parser turns `filter[type]=Customer&filter[status]=Active`
    // into `req.query.filter = { type: 'Customer', status: 'Active' }`.
    const req = mockReq(
      {},
      undefined,
      { apiName: 'account' },
      { filter: { type: 'Customer', status: 'Active' } as unknown as string },
    );
    const res = mockRes();

    await handleListRecords(req, res);

    expect(mockListRecords).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: { type: 'Customer', status: 'Active' },
      }),
    );
  });

  it('rejects limit greater than the max with HTTP 400', async () => {
    const req = mockReq({}, undefined, { apiName: 'account' }, { limit: '500' });
    const res = mockRes();

    await handleListRecords(req, res);

    expect(mockListRecords).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'VALIDATION_ERROR' }),
    );
  });

  it('rejects negative offset with HTTP 400', async () => {
    const req = mockReq({}, undefined, { apiName: 'account' }, { offset: '-5' });
    const res = mockRes();

    await handleListRecords(req, res);

    expect(mockListRecords).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
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
      id: VALID_UUID,
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
      { apiName: 'account', id: VALID_UUID },
    );
    const res = mockRes();

    await handleGetRecord(req, res);

    expect(mockGetRecord).toHaveBeenCalledWith('tenant-abc', 'account', VALID_UUID, 'user-123');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(record);
  });

  it('returns 404 when record not found', async () => {
    const err = Object.assign(new Error('Record not found'), { code: 'NOT_FOUND' });
    mockGetRecord.mockRejectedValue(err);

    const req = mockReq(
      {},
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { apiName: 'account', id: VALID_UUID_2 },
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
      { apiName: 'account', id: VALID_UUID },
    );
    const res = mockRes();

    await handleGetRecord(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('returns 400 for non-UUID record ID', async () => {
    const req = mockReq(
      {},
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { apiName: 'account', id: 'new' },
    );
    const res = mockRes();

    await handleGetRecord(req, res);

    expect(mockGetRecord).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Invalid record ID format',
      code: 'VALIDATION_ERROR',
    });
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
      id: VALID_UUID,
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
      { apiName: 'account', id: VALID_UUID },
    );
    const res = mockRes();

    await handleUpdateRecord(req, res);

    expect(mockUpdateRecord).toHaveBeenCalledWith(
      'tenant-abc',
      'account',
      VALID_UUID,
      { name: 'Updated Corp' },
      'user-123',
      undefined,
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
      { apiName: 'account', id: VALID_UUID },
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
      { apiName: 'account', id: VALID_UUID_2 },
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
      { apiName: 'account', id: VALID_UUID },
    );
    const res = mockRes();

    await handleUpdateRecord(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('returns 400 for non-UUID record ID', async () => {
    const req = mockReq(
      { fieldValues: { name: 'X' } },
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { apiName: 'account', id: 'not-a-uuid' },
    );
    const res = mockRes();

    await handleUpdateRecord(req, res);

    expect(mockUpdateRecord).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Invalid record ID format',
      code: 'VALIDATION_ERROR',
    });
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
      { apiName: 'account', id: VALID_UUID },
    );
    const res = mockRes();

    await handleDeleteRecord(req, res);

    expect(mockDeleteRecord).toHaveBeenCalledWith('tenant-abc', 'account', VALID_UUID, 'user-123');
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.end).toHaveBeenCalled();
  });

  it('returns 404 when record not found', async () => {
    const err = Object.assign(new Error('Record not found'), { code: 'NOT_FOUND' });
    mockDeleteRecord.mockRejectedValue(err);

    const req = mockReq(
      {},
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { apiName: 'account', id: VALID_UUID_2 },
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
      { apiName: 'account', id: VALID_UUID },
    );
    const res = mockRes();

    await handleDeleteRecord(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('returns 400 for non-UUID record ID', async () => {
    const req = mockReq(
      {},
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { apiName: 'account', id: 'new' },
    );
    const res = mockRes();

    await handleDeleteRecord(req, res);

    expect(mockDeleteRecord).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Invalid record ID format',
      code: 'VALIDATION_ERROR',
    });
  });
});

// ─── Tests: POST /objects/lead/records/:id/convert ──────────────────────────

describe('POST /objects/lead/records/:id/convert', () => {
  beforeEach(() => {
    mockConvertLead.mockReset();
  });

  it('returns 200 with conversion result on success', async () => {
    const conversionResult = {
      account: { id: 'acc-uuid', name: 'Acme Corp' },
      contact: { id: 'con-uuid', name: 'John Smith' },
      opportunity: { id: 'opp-uuid', name: 'Acme Corp - Opportunity' },
      lead: { id: VALID_UUID, status: 'Converted' },
    };

    mockConvertLead.mockResolvedValue(conversionResult);

    const req = mockReq(
      { create_account: true, create_opportunity: true },
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { apiName: 'lead', id: VALID_UUID },
    );
    const res = mockRes();

    await handleConvertLead(req, res);

    expect(mockConvertLead).toHaveBeenCalledWith('tenant-abc', VALID_UUID, 'user-123', {
      createAccount: true,
      accountId: undefined,
      createOpportunity: true,
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(conversionResult);
  });

  it('returns 400 when object type is not lead', async () => {
    const req = mockReq(
      {},
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { apiName: 'account', id: VALID_UUID },
    );
    const res = mockRes();

    await handleConvertLead(req, res);

    expect(mockConvertLead).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Conversion is only supported for lead records',
      code: 'VALIDATION_ERROR',
    });
  });

  it('returns 400 for non-UUID record ID', async () => {
    const req = mockReq(
      {},
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { apiName: 'lead', id: 'not-a-uuid' },
    );
    const res = mockRes();

    await handleConvertLead(req, res);

    expect(mockConvertLead).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 for invalid account_id format', async () => {
    const req = mockReq(
      { account_id: 'not-a-uuid' },
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { apiName: 'lead', id: VALID_UUID },
    );
    const res = mockRes();

    await handleConvertLead(req, res);

    expect(mockConvertLead).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when lead is already converted', async () => {
    const err = Object.assign(new Error('Lead has already been converted'), {
      code: 'ALREADY_CONVERTED',
    });
    mockConvertLead.mockRejectedValue(err);

    const req = mockReq(
      {},
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { apiName: 'lead', id: VALID_UUID },
    );
    const res = mockRes();

    await handleConvertLead(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Lead has already been converted',
      code: 'ALREADY_CONVERTED',
    });
  });

  it('returns 404 when lead not found', async () => {
    const err = Object.assign(new Error('Lead not found'), { code: 'NOT_FOUND' });
    mockConvertLead.mockRejectedValue(err);

    const req = mockReq(
      {},
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { apiName: 'lead', id: VALID_UUID },
    );
    const res = mockRes();

    await handleConvertLead(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Lead not found',
      code: 'NOT_FOUND',
    });
  });

  it('returns 500 on unexpected error', async () => {
    mockConvertLead.mockRejectedValue(new Error('Database error'));

    const req = mockReq(
      {},
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { apiName: 'lead', id: VALID_UUID },
    );
    const res = mockRes();

    await handleConvertLead(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'An unexpected error occurred' });
  });

  it('passes account_id to service when provided', async () => {
    mockConvertLead.mockResolvedValue({
      account: { id: VALID_UUID_2, name: 'Existing Corp' },
      contact: { id: 'con-uuid', name: 'John Smith' },
      opportunity: null,
      lead: { id: VALID_UUID, status: 'Converted' },
    });

    const req = mockReq(
      { account_id: VALID_UUID_2, create_opportunity: false },
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { apiName: 'lead', id: VALID_UUID },
    );
    const res = mockRes();

    await handleConvertLead(req, res);

    expect(mockConvertLead).toHaveBeenCalledWith('tenant-abc', VALID_UUID, 'user-123', {
      createAccount: undefined,
      accountId: VALID_UUID_2,
      createOpportunity: false,
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

// ─── Tests: POST /objects/:apiName/records/:id/move-stage ──────────────────

describe('POST /objects/:apiName/records/:id/move-stage', () => {
  beforeEach(() => {
    mockMoveRecordStage.mockReset();
  });

  it('returns 200 with updated record on success', async () => {
    const moveResult = {
      id: VALID_UUID,
      objectId: 'obj-id',
      name: 'Test Opportunity',
      fieldValues: { name: 'Test Opportunity', probability: 25 },
      ownerId: 'user-123',
      pipelineId: 'pipeline-id',
      currentStageId: VALID_UUID_2,
      stageEnteredAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockMoveRecordStage.mockResolvedValue(moveResult);

    const req = mockReq(
      { target_stage_id: VALID_UUID_2 },
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { apiName: 'opportunity', id: VALID_UUID },
    );
    const res = mockRes();

    await handleMoveStage(req, res);

    expect(mockMoveRecordStage).toHaveBeenCalledWith('tenant-abc', 'opportunity', VALID_UUID, VALID_UUID_2, 'user-123');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(moveResult);
  });

  it('returns 400 for non-UUID record ID', async () => {
    const req = mockReq(
      { target_stage_id: VALID_UUID_2 },
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { apiName: 'opportunity', id: 'not-a-uuid' },
    );
    const res = mockRes();

    await handleMoveStage(req, res);

    expect(mockMoveRecordStage).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Invalid record ID format',
      code: 'VALIDATION_ERROR',
    });
  });

  it('returns 400 for missing target_stage_id', async () => {
    const req = mockReq(
      {},
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { apiName: 'opportunity', id: VALID_UUID },
    );
    const res = mockRes();

    await handleMoveStage(req, res);

    expect(mockMoveRecordStage).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'target_stage_id must be a valid UUID',
      code: 'VALIDATION_ERROR',
    });
  });

  it('returns 400 for invalid target_stage_id format', async () => {
    const req = mockReq(
      { target_stage_id: 'not-a-uuid' },
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { apiName: 'opportunity', id: VALID_UUID },
    );
    const res = mockRes();

    await handleMoveStage(req, res);

    expect(mockMoveRecordStage).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 422 when gate validation fails', async () => {
    const err = Object.assign(
      new Error('Cannot move to Proposal — missing required fields'),
      {
        code: 'GATE_VALIDATION_FAILED',
        failures: [
          { field: 'close_date', label: 'Close Date', gate: 'required', message: 'Expected close date is required' },
        ],
      },
    );
    mockMoveRecordStage.mockRejectedValue(err);

    const req = mockReq(
      { target_stage_id: VALID_UUID_2 },
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { apiName: 'opportunity', id: VALID_UUID },
    );
    const res = mockRes();

    await handleMoveStage(req, res);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Cannot move to Proposal — missing required fields',
      code: 'GATE_VALIDATION_FAILED',
      failures: [
        { field: 'close_date', label: 'Close Date', gate: 'required', message: 'Expected close date is required' },
      ],
    });
  });

  it('returns 404 when record not found', async () => {
    const err = Object.assign(new Error('Record not found'), { code: 'NOT_FOUND' });
    mockMoveRecordStage.mockRejectedValue(err);

    const req = mockReq(
      { target_stage_id: VALID_UUID_2 },
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { apiName: 'opportunity', id: VALID_UUID },
    );
    const res = mockRes();

    await handleMoveStage(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Record not found', code: 'NOT_FOUND' });
  });

  it('returns 400 when validation error occurs', async () => {
    const err = Object.assign(new Error('Record is already in this stage'), { code: 'VALIDATION_ERROR' });
    mockMoveRecordStage.mockRejectedValue(err);

    const req = mockReq(
      { target_stage_id: VALID_UUID_2 },
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { apiName: 'opportunity', id: VALID_UUID },
    );
    const res = mockRes();

    await handleMoveStage(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Record is already in this stage',
      code: 'VALIDATION_ERROR',
    });
  });

  it('includes AppError details in 400 body for cross-pipeline target stage', async () => {
    const err = Object.assign(
      new Error('Target stage does not belong to the same pipeline'),
      {
        code: 'VALIDATION_ERROR',
        details: {
          recordId: VALID_UUID,
          recordPipelineId: 'pipeline-a',
          targetStageId: VALID_UUID_2,
          targetStagePipelineId: 'pipeline-b',
        },
      },
    );
    mockMoveRecordStage.mockRejectedValue(err);

    const req = mockReq(
      { target_stage_id: VALID_UUID_2 },
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { apiName: 'opportunity', id: VALID_UUID },
    );
    const res = mockRes();

    await handleMoveStage(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Target stage does not belong to the same pipeline',
      code: 'VALIDATION_ERROR',
      recordId: VALID_UUID,
      recordPipelineId: 'pipeline-a',
      targetStageId: VALID_UUID_2,
      targetStagePipelineId: 'pipeline-b',
    });
  });

  it('returns 500 on unexpected error', async () => {
    mockMoveRecordStage.mockRejectedValue(new Error('Database error'));

    const req = mockReq(
      { target_stage_id: VALID_UUID_2 },
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { apiName: 'opportunity', id: VALID_UUID },
    );
    const res = mockRes();

    await handleMoveStage(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'An unexpected error occurred' });
  });
});
