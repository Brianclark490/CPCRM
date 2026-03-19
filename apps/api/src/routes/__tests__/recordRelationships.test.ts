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

// ─── Mock the record relationship service ────────────────────────────────────

const mockLinkRecords = vi.fn();
const mockUnlinkRecords = vi.fn();
const mockGetRelatedRecords = vi.fn();

vi.mock('../../services/recordRelationshipService.js', () => ({
  linkRecords: mockLinkRecords,
  unlinkRecords: mockUnlinkRecords,
  getRelatedRecords: mockGetRelatedRecords,
}));

// ─── Mock logger so tests stay silent ────────────────────────────────────────

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const {
  handleLinkRecords,
  handleUnlinkRecords,
  handleGetRelatedRecords,
} = await import('../recordRelationships.js');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mockReq(
  body: unknown,
  user = { userId: 'user-123', tenantId: 'tenant-abc' },
  params: Record<string, string> = { id: 'rec-uuid' },
  query: Record<string, string> = {},
) {
  return {
    body,
    path: '/records/rec-uuid/relationships',
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

// ─── Tests: POST /records/:id/relationships ─────────────────────────────────

describe('POST /records/:id/relationships', () => {
  beforeEach(() => {
    mockLinkRecords.mockReset();
  });

  it('returns 201 with the created link on success', async () => {
    const now = new Date();
    const expectedLink = {
      id: 'link-uuid',
      relationshipId: 'rel-1',
      sourceRecordId: 'rec-uuid',
      targetRecordId: 'rec-target',
      createdAt: now,
    };

    mockLinkRecords.mockResolvedValue(expectedLink);

    const req = mockReq({ relationship_id: 'rel-1', target_record_id: 'rec-target' });
    const res = mockRes();

    await handleLinkRecords(req, res);

    expect(mockLinkRecords).toHaveBeenCalledWith('tenant-abc', 'rec-uuid', 'rel-1', 'rec-target', 'user-123');
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expectedLink);
  });

  it('accepts camelCase body fields', async () => {
    mockLinkRecords.mockResolvedValue({ id: 'link-uuid' });

    const req = mockReq({ relationshipId: 'rel-1', targetRecordId: 'rec-target' });
    const res = mockRes();

    await handleLinkRecords(req, res);

    expect(mockLinkRecords).toHaveBeenCalledWith('tenant-abc', 'rec-uuid', 'rel-1', 'rec-target', 'user-123');
  });

  it('returns 400 when validation fails', async () => {
    const err = Object.assign(
      new Error('Source record object type does not match relationship source object'),
      { code: 'VALIDATION_ERROR' },
    );
    mockLinkRecords.mockRejectedValue(err);

    const req = mockReq({ relationship_id: 'rel-1', target_record_id: 'rec-target' });
    const res = mockRes();

    await handleLinkRecords(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Source record object type does not match relationship source object',
      code: 'VALIDATION_ERROR',
    });
  });

  it('returns 404 when record not found', async () => {
    const err = Object.assign(new Error('Source record not found'), { code: 'NOT_FOUND' });
    mockLinkRecords.mockRejectedValue(err);

    const req = mockReq({ relationship_id: 'rel-1', target_record_id: 'rec-target' });
    const res = mockRes();

    await handleLinkRecords(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 409 when duplicate link exists', async () => {
    const err = Object.assign(
      new Error('This relationship link already exists'),
      { code: 'CONFLICT' },
    );
    mockLinkRecords.mockRejectedValue(err);

    const req = mockReq({ relationship_id: 'rel-1', target_record_id: 'rec-target' });
    const res = mockRes();

    await handleLinkRecords(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      error: 'This relationship link already exists',
      code: 'CONFLICT',
    });
  });

  it('returns 500 on unexpected error', async () => {
    mockLinkRecords.mockRejectedValue(new Error('Database error'));

    const req = mockReq({ relationship_id: 'rel-1', target_record_id: 'rec-target' });
    const res = mockRes();

    await handleLinkRecords(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'An unexpected error occurred' });
  });
});

// ─── Tests: DELETE /records/:id/relationships/:relId ────────────────────────

describe('DELETE /records/:id/relationships/:relId', () => {
  beforeEach(() => {
    mockUnlinkRecords.mockReset();
  });

  it('returns 204 on successful unlink', async () => {
    mockUnlinkRecords.mockResolvedValue(undefined);

    const req = mockReq({}, undefined, { id: 'rec-uuid', relId: 'link-uuid' });
    const res = mockRes();

    await handleUnlinkRecords(req, res);

    expect(mockUnlinkRecords).toHaveBeenCalledWith('tenant-abc', 'rec-uuid', 'link-uuid', 'user-123');
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.end).toHaveBeenCalled();
  });

  it('returns 404 when link not found', async () => {
    const err = Object.assign(new Error('Relationship link not found'), { code: 'NOT_FOUND' });
    mockUnlinkRecords.mockRejectedValue(err);

    const req = mockReq({}, undefined, { id: 'rec-uuid', relId: 'missing-link' });
    const res = mockRes();

    await handleUnlinkRecords(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Relationship link not found',
      code: 'NOT_FOUND',
    });
  });

  it('returns 500 on unexpected error', async () => {
    mockUnlinkRecords.mockRejectedValue(new Error('Database error'));

    const req = mockReq({}, undefined, { id: 'rec-uuid', relId: 'link-uuid' });
    const res = mockRes();

    await handleUnlinkRecords(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ─── Tests: GET /records/:id/related/:objectApiName ─────────────────────────

describe('GET /records/:id/related/:objectApiName', () => {
  beforeEach(() => {
    mockGetRelatedRecords.mockReset();
  });

  it('returns 200 with paginated related records', async () => {
    const result = {
      data: [
        { id: 'rec-2', name: 'Acme Corp', fieldValues: { name: 'Acme Corp' }, createdAt: new Date(), updatedAt: new Date() },
      ],
      total: 1,
      page: 1,
      limit: 20,
    };

    mockGetRelatedRecords.mockResolvedValue(result);

    const req = mockReq(
      {},
      undefined,
      { id: 'rec-uuid', objectApiName: 'account' },
      {},
    );
    const res = mockRes();

    await handleGetRelatedRecords(req, res);

    expect(mockGetRelatedRecords).toHaveBeenCalledWith('tenant-abc', 'rec-uuid', 'account', 'user-123', 1, 20);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(result);
  });

  it('passes pagination params to service', async () => {
    mockGetRelatedRecords.mockResolvedValue({ data: [], total: 0, page: 2, limit: 10 });

    const req = mockReq(
      {},
      undefined,
      { id: 'rec-uuid', objectApiName: 'account' },
      { page: '2', limit: '10' },
    );
    const res = mockRes();

    await handleGetRelatedRecords(req, res);

    expect(mockGetRelatedRecords).toHaveBeenCalledWith('tenant-abc', 'rec-uuid', 'account', 'user-123', 2, 10);
  });

  it('clamps limit to maximum of 100', async () => {
    mockGetRelatedRecords.mockResolvedValue({ data: [], total: 0, page: 1, limit: 100 });

    const req = mockReq(
      {},
      undefined,
      { id: 'rec-uuid', objectApiName: 'account' },
      { limit: '500' },
    );
    const res = mockRes();

    await handleGetRelatedRecords(req, res);

    expect(mockGetRelatedRecords).toHaveBeenCalledWith(
      'tenant-abc', 'rec-uuid', 'account', 'user-123', 1, 100,
    );
  });

  it('returns 404 when record not found', async () => {
    const err = Object.assign(new Error('Record not found'), { code: 'NOT_FOUND' });
    mockGetRelatedRecords.mockRejectedValue(err);

    const req = mockReq(
      {},
      undefined,
      { id: 'missing-id', objectApiName: 'account' },
    );
    const res = mockRes();

    await handleGetRelatedRecords(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 404 when object type not found', async () => {
    const err = Object.assign(new Error("Object type 'nonexistent' not found"), { code: 'NOT_FOUND' });
    mockGetRelatedRecords.mockRejectedValue(err);

    const req = mockReq(
      {},
      undefined,
      { id: 'rec-uuid', objectApiName: 'nonexistent' },
    );
    const res = mockRes();

    await handleGetRelatedRecords(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 500 on unexpected error', async () => {
    mockGetRelatedRecords.mockRejectedValue(new Error('Database error'));

    const req = mockReq(
      {},
      undefined,
      { id: 'rec-uuid', objectApiName: 'account' },
    );
    const res = mockRes();

    await handleGetRelatedRecords(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
