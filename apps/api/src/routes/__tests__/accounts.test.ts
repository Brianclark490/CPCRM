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

// ─── Mock the account service ────────────────────────────────────────────────

const mockCreateAccount = vi.fn();
const mockListAccounts = vi.fn();
const mockGetAccountWithOpportunities = vi.fn();
const mockUpdateAccount = vi.fn();
const mockDeleteAccount = vi.fn();

vi.mock('../../services/accountService.js', () => ({
  createAccount: mockCreateAccount,
  listAccounts: mockListAccounts,
  getAccountWithOpportunities: mockGetAccountWithOpportunities,
  updateAccount: mockUpdateAccount,
  deleteAccount: mockDeleteAccount,
}));

// ─── Mock logger so tests stay silent ────────────────────────────────────────

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const {
  handleCreateAccount,
  handleListAccounts,
  handleGetAccount,
  handleUpdateAccount,
  handleDeleteAccount,
} = await import('../accounts.js');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mockReq(
  body: unknown,
  user = { userId: 'user-123', tenantId: 'tenant-abc' },
  params: Record<string, string> = {},
  query: Record<string, string> = {},
) {
  return {
    body,
    path: '/accounts',
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

// ─── Tests: POST /accounts ──────────────────────────────────────────────────

describe('POST /accounts', () => {
  beforeEach(() => {
    mockCreateAccount.mockReset();
  });

  it('returns 201 with the created account on success', async () => {
    const now = new Date();
    const expectedAccount = {
      id: 'acc-uuid',
      tenantId: 'tenant-abc',
      name: 'Acme Corp',
      ownerId: 'user-123',
      createdAt: now,
      updatedAt: now,
      createdBy: 'user-123',
    };

    mockCreateAccount.mockResolvedValue(expectedAccount);

    const req = mockReq({ name: 'Acme Corp' });
    const res = mockRes();

    await handleCreateAccount(req, res);

    expect(mockCreateAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Acme Corp',
        tenantId: 'tenant-abc',
        requestingUserId: 'user-123',
      }),
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expectedAccount);
  });

  it('returns 201 and passes optional fields when provided', async () => {
    const now = new Date();
    mockCreateAccount.mockResolvedValue({
      id: 'acc-uuid',
      tenantId: 'tenant-abc',
      name: 'Acme Corp',
      email: 'info@acme.com',
      phone: '+44 20 1234 5678',
      ownerId: 'user-123',
      createdAt: now,
      updatedAt: now,
      createdBy: 'user-123',
    });

    const req = mockReq({
      name: 'Acme Corp',
      email: 'info@acme.com',
      phone: '+44 20 1234 5678',
      industry: 'Technology',
    });
    const res = mockRes();

    await handleCreateAccount(req, res);

    expect(mockCreateAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'info@acme.com',
        phone: '+44 20 1234 5678',
        industry: 'Technology',
      }),
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('returns 400 when the service throws a VALIDATION_ERROR', async () => {
    const validationErr = Object.assign(new Error('Account name is required'), {
      code: 'VALIDATION_ERROR',
    });
    mockCreateAccount.mockRejectedValue(validationErr);

    const req = mockReq({ name: '' });
    const res = mockRes();

    await handleCreateAccount(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Account name is required', code: 'VALIDATION_ERROR' });
  });

  it('returns 500 when the service throws an unexpected error', async () => {
    mockCreateAccount.mockRejectedValue(new Error('Database connection failed'));

    const req = mockReq({ name: 'Acme Corp' });
    const res = mockRes();

    await handleCreateAccount(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'An unexpected error occurred' });
  });
});

// ─── Tests: GET /accounts ───────────────────────────────────────────────────

describe('GET /accounts', () => {
  beforeEach(() => {
    mockListAccounts.mockReset();
  });

  it('returns 200 with paginated accounts wrapped in the canonical envelope', async () => {
    const now = new Date();
    const account = {
      id: 'acc-1',
      tenantId: 'tenant-abc',
      name: 'Acme Corp',
      ownerId: 'user-123',
      createdAt: now,
      updatedAt: now,
      createdBy: 'user-123',
    };

    mockListAccounts.mockResolvedValue({
      data: [account],
      total: 1,
      limit: 50,
      offset: 0,
    });

    const req = mockReq({}, undefined, {}, {});
    const res = mockRes();

    await handleListAccounts(req, res);

    expect(mockListAccounts).toHaveBeenCalledWith({
      tenantId: 'tenant-abc',
      ownerId: 'user-123',
      search: undefined,
      limit: 50,
      offset: 0,
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      data: [account],
      pagination: { total: 1, limit: 50, offset: 0, hasMore: false },
    });
  });

  it('passes search and pagination parameters to the service', async () => {
    mockListAccounts.mockResolvedValue({ data: [], total: 0, limit: 10, offset: 20 });

    const req = mockReq({}, undefined, {}, { search: 'acme', limit: '10', offset: '20' });
    const res = mockRes();

    await handleListAccounts(req, res);

    expect(mockListAccounts).toHaveBeenCalledWith({
      tenantId: 'tenant-abc',
      ownerId: 'user-123',
      search: 'acme',
      limit: 10,
      offset: 20,
    });
  });

  it('rejects limit greater than the max with HTTP 400', async () => {
    const req = mockReq({}, undefined, {}, { limit: '500' });
    const res = mockRes();

    await handleListAccounts(req, res);

    expect(mockListAccounts).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'VALIDATION_ERROR' }),
    );
  });

  it('rejects negative offset with HTTP 400', async () => {
    const req = mockReq({}, undefined, {}, { offset: '-1' });
    const res = mockRes();

    await handleListAccounts(req, res);

    expect(mockListAccounts).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('rejects non-numeric limit with HTTP 400', async () => {
    const req = mockReq({}, undefined, {}, { limit: 'banana' });
    const res = mockRes();

    await handleListAccounts(req, res);

    expect(mockListAccounts).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('reports hasMore=true when more results are available', async () => {
    mockListAccounts.mockResolvedValue({
      data: Array.from({ length: 50 }, (_, i) => ({ id: `acc-${i}` })),
      total: 120,
      limit: 50,
      offset: 0,
    });

    const req = mockReq({}, undefined, {}, {});
    const res = mockRes();

    await handleListAccounts(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        pagination: { total: 120, limit: 50, offset: 0, hasMore: true },
      }),
    );
  });

  it('returns 500 when the service throws an unexpected error', async () => {
    mockListAccounts.mockRejectedValue(new Error('Database error'));

    const req = mockReq({});
    const res = mockRes();

    await handleListAccounts(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'An unexpected error occurred' });
  });
});

// ─── Tests: GET /accounts/:id ───────────────────────────────────────────────

describe('GET /accounts/:id', () => {
  beforeEach(() => {
    mockGetAccountWithOpportunities.mockReset();
  });

  it('returns 200 with the account and opportunities when found', async () => {
    const now = new Date();
    const account = {
      id: 'acc-uuid',
      tenantId: 'tenant-abc',
      name: 'Acme Corp',
      ownerId: 'user-123',
      createdAt: now,
      updatedAt: now,
      createdBy: 'user-123',
      opportunities: [
        { id: 'opp-1', title: 'Deal One', stage: 'prospecting', createdAt: now, updatedAt: now },
      ],
    };

    mockGetAccountWithOpportunities.mockResolvedValue(account);

    const req = mockReq({}, { userId: 'user-123', tenantId: 'tenant-abc' }, { id: 'acc-uuid' });
    const res = mockRes();

    await handleGetAccount(req, res);

    expect(mockGetAccountWithOpportunities).toHaveBeenCalledWith('acc-uuid', 'tenant-abc', 'user-123');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(account);
  });

  it('returns 404 when the account is not found', async () => {
    mockGetAccountWithOpportunities.mockResolvedValue(null);

    const req = mockReq({}, { userId: 'user-123', tenantId: 'tenant-abc' }, { id: 'missing-id' });
    const res = mockRes();

    await handleGetAccount(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Account not found', code: 'NOT_FOUND' });
  });

  it('returns 500 when the service throws an unexpected error', async () => {
    mockGetAccountWithOpportunities.mockRejectedValue(new Error('Database error'));

    const req = mockReq({}, { userId: 'user-123', tenantId: 'tenant-abc' }, { id: 'acc-uuid' });
    const res = mockRes();

    await handleGetAccount(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'An unexpected error occurred' });
  });
});

// ─── Tests: PUT /accounts/:id ───────────────────────────────────────────────

describe('PUT /accounts/:id', () => {
  beforeEach(() => {
    mockUpdateAccount.mockReset();
  });

  it('returns 200 with the updated account on success', async () => {
    const now = new Date();
    const updatedAccount = {
      id: 'acc-uuid',
      tenantId: 'tenant-abc',
      name: 'Updated Corp',
      ownerId: 'user-123',
      createdAt: now,
      updatedAt: now,
      createdBy: 'user-123',
    };

    mockUpdateAccount.mockResolvedValue(updatedAccount);

    const req = mockReq(
      { name: 'Updated Corp' },
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { id: 'acc-uuid' },
    );
    const res = mockRes();

    await handleUpdateAccount(req, res);

    expect(mockUpdateAccount).toHaveBeenCalledWith(
      'acc-uuid',
      'tenant-abc',
      'user-123',
      expect.objectContaining({ name: 'Updated Corp' }),
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(updatedAccount);
  });

  it('returns 400 when the service throws a VALIDATION_ERROR', async () => {
    const validationErr = Object.assign(new Error('Email must be a valid email address'), {
      code: 'VALIDATION_ERROR',
    });
    mockUpdateAccount.mockRejectedValue(validationErr);

    const req = mockReq(
      { email: 'not-an-email' },
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { id: 'acc-uuid' },
    );
    const res = mockRes();

    await handleUpdateAccount(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Email must be a valid email address', code: 'VALIDATION_ERROR' });
  });

  it('returns 404 when the service throws a NOT_FOUND error', async () => {
    const notFoundErr = Object.assign(new Error('Account not found'), { code: 'NOT_FOUND' });
    mockUpdateAccount.mockRejectedValue(notFoundErr);

    const req = mockReq(
      { name: 'Updated Corp' },
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { id: 'missing-id' },
    );
    const res = mockRes();

    await handleUpdateAccount(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Account not found', code: 'NOT_FOUND' });
  });

  it('returns 500 when the service throws an unexpected error', async () => {
    mockUpdateAccount.mockRejectedValue(new Error('Database error'));

    const req = mockReq(
      { name: 'Updated Corp' },
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { id: 'acc-uuid' },
    );
    const res = mockRes();

    await handleUpdateAccount(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'An unexpected error occurred' });
  });

  it('only passes fields present in the request body to the service', async () => {
    const now = new Date();
    mockUpdateAccount.mockResolvedValue({
      id: 'acc-uuid',
      tenantId: 'tenant-abc',
      name: 'Acme Corp',
      industry: 'Updated Industry',
      ownerId: 'user-123',
      createdAt: now,
      updatedAt: now,
      createdBy: 'user-123',
    });

    const req = mockReq(
      { industry: 'Updated Industry' },
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { id: 'acc-uuid' },
    );
    const res = mockRes();

    await handleUpdateAccount(req, res);

    expect(mockUpdateAccount).toHaveBeenCalledWith(
      'acc-uuid',
      'tenant-abc',
      'user-123',
      { industry: 'Updated Industry' },
    );
  });
});

// ─── Tests: DELETE /accounts/:id ────────────────────────────────────────────

describe('DELETE /accounts/:id', () => {
  beforeEach(() => {
    mockDeleteAccount.mockReset();
  });

  it('returns 204 on successful deletion', async () => {
    mockDeleteAccount.mockResolvedValue(undefined);

    const req = mockReq({}, { userId: 'user-123', tenantId: 'tenant-abc' }, { id: 'acc-uuid' });
    const res = mockRes();

    await handleDeleteAccount(req, res);

    expect(mockDeleteAccount).toHaveBeenCalledWith('acc-uuid', 'tenant-abc', 'user-123');
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.end).toHaveBeenCalled();
  });

  it('returns 404 when the account is not found', async () => {
    const notFoundErr = Object.assign(new Error('Account not found'), { code: 'NOT_FOUND' });
    mockDeleteAccount.mockRejectedValue(notFoundErr);

    const req = mockReq({}, { userId: 'user-123', tenantId: 'tenant-abc' }, { id: 'missing-id' });
    const res = mockRes();

    await handleDeleteAccount(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Account not found', code: 'NOT_FOUND' });
  });

  it('returns 500 when the service throws an unexpected error', async () => {
    mockDeleteAccount.mockRejectedValue(new Error('Database error'));

    const req = mockReq({}, { userId: 'user-123', tenantId: 'tenant-abc' }, { id: 'acc-uuid' });
    const res = mockRes();

    await handleDeleteAccount(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'An unexpected error occurred' });
  });
});
