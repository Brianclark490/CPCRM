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

vi.mock('../../middleware/permission.js', () => ({
  requireRole: vi.fn(() => (_req: AuthenticatedRequest, _res: Response, next: NextFunction) => next()),
}));

// ─── Mock the database pool ──────────────────────────────────────────────────

const mockQuery = vi.fn();

vi.mock('../../db/client.js', () => ({
  pool: { query: mockQuery },
}));

// ─── Mock logger so tests stay silent ────────────────────────────────────────

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { handleGetTenantSettings, handleUpdateTenantSettings } = await import('../adminTenantSettings.js');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mockReq(
  body: unknown = {},
  user = { userId: 'user-123', tenantId: 'tenant-abc', roles: ['admin'], permissions: [] },
) {
  return {
    body,
    path: '/api/admin/tenant-settings',
    user,
  } as unknown as AuthenticatedRequest;
}

function mockRes() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

const baseTenantRow = {
  name: 'Acme Corp',
  slug: 'acme-corp',
  status: 'active',
  plan: 'pro',
  settings: { currency: 'GBP', dateFormat: 'DD/MM/YYYY' },
};

// ─── GET /api/admin/tenant-settings ──────────────────────────────────────────

describe('GET /api/admin/tenant-settings', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('returns 200 with tenant settings on success', async () => {
    mockQuery.mockResolvedValue({ rows: [baseTenantRow] });

    const req = mockReq();
    const res = mockRes();

    await handleGetTenantSettings(req, res);

    expect(mockQuery).toHaveBeenCalledWith(
      'SELECT name, slug, status, plan, settings FROM tenants WHERE id = $1',
      ['tenant-abc'],
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      name: 'Acme Corp',
      slug: 'acme-corp',
      status: 'active',
      plan: 'pro',
      settings: { currency: 'GBP', dateFormat: 'DD/MM/YYYY' },
    });
  });

  it('returns 404 when tenant is not found', async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    const req = mockReq();
    const res = mockRes();

    await handleGetTenantSettings(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Tenant not found', code: 'NOT_FOUND' });
  });

  it('returns 500 when the database throws', async () => {
    mockQuery.mockRejectedValue(new Error('DB error'));

    const req = mockReq();
    const res = mockRes();

    await handleGetTenantSettings(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'An unexpected error occurred' });
  });

  it('defaults plan to free and settings to empty object when null', async () => {
    mockQuery.mockResolvedValue({
      rows: [{ name: 'Test', slug: 'test', status: 'active', plan: null, settings: null }],
    });

    const req = mockReq();
    const res = mockRes();

    await handleGetTenantSettings(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      name: 'Test',
      slug: 'test',
      status: 'active',
      plan: 'free',
      settings: {},
    });
  });
});

// ─── PUT /api/admin/tenant-settings ──────────────────────────────────────────

describe('PUT /api/admin/tenant-settings', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('returns 200 with updated settings when updating name and settings', async () => {
    const updatedRow = {
      ...baseTenantRow,
      name: 'New Name',
      settings: { currency: 'USD' },
    };
    mockQuery.mockResolvedValue({ rows: [updatedRow] });

    const req = mockReq({ name: 'New Name', settings: { currency: 'USD' } });
    const res = mockRes();

    await handleUpdateTenantSettings(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      name: 'New Name',
      slug: 'acme-corp',
      status: 'active',
      plan: 'pro',
      settings: { currency: 'USD' },
    });
  });

  it('returns 400 when name is empty', async () => {
    const req = mockReq({ name: '   ' });
    const res = mockRes();

    await handleUpdateTenantSettings(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Company name cannot be empty',
      code: 'VALIDATION_ERROR',
    });
  });

  it('returns 400 when name exceeds 255 characters', async () => {
    const req = mockReq({ name: 'x'.repeat(256) });
    const res = mockRes();

    await handleUpdateTenantSettings(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Company name must be 255 characters or fewer',
      code: 'VALIDATION_ERROR',
    });
  });

  it('returns 400 when no fields to update', async () => {
    const req = mockReq({});
    const res = mockRes();

    await handleUpdateTenantSettings(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'No fields to update',
      code: 'VALIDATION_ERROR',
    });
  });

  it('returns 400 for invalid currency', async () => {
    const req = mockReq({ settings: { currency: 'INVALID' } });
    const res = mockRes();

    await handleUpdateTenantSettings(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'VALIDATION_ERROR' }),
    );
  });

  it('returns 400 for invalid date format', async () => {
    const req = mockReq({ settings: { dateFormat: 'INVALID' } });
    const res = mockRes();

    await handleUpdateTenantSettings(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'VALIDATION_ERROR' }),
    );
  });

  it('returns 400 for invalid timezone', async () => {
    const req = mockReq({ settings: { timezone: 'Mars/Olympus' } });
    const res = mockRes();

    await handleUpdateTenantSettings(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'VALIDATION_ERROR' }),
    );
  });

  it('returns 400 for invalid financial year start', async () => {
    const req = mockReq({ settings: { financialYearStart: 'March' } });
    const res = mockRes();

    await handleUpdateTenantSettings(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'VALIDATION_ERROR' }),
    );
  });

  it('returns 400 when leadAutoConversion is not a boolean', async () => {
    const req = mockReq({ settings: { leadAutoConversion: 'yes' } });
    const res = mockRes();

    await handleUpdateTenantSettings(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'VALIDATION_ERROR' }),
    );
  });

  it('returns 404 when tenant is not found during update', async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    const req = mockReq({ name: 'New Name' });
    const res = mockRes();

    await handleUpdateTenantSettings(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Tenant not found', code: 'NOT_FOUND' });
  });

  it('returns 500 when the database throws during update', async () => {
    mockQuery.mockRejectedValue(new Error('DB error'));

    const req = mockReq({ name: 'New Name' });
    const res = mockRes();

    await handleUpdateTenantSettings(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'An unexpected error occurred' });
  });

  it('accepts valid settings fields and passes them to the query', async () => {
    mockQuery.mockResolvedValue({ rows: [baseTenantRow] });

    const req = mockReq({
      settings: {
        currency: 'EUR',
        dateFormat: 'YYYY-MM-DD',
        timezone: 'Europe/London',
        financialYearStart: 'April',
        defaultPipeline: 'pipeline-1',
        defaultRecordOwner: 'creator',
        leadAutoConversion: true,
      },
    });
    const res = mockRes();

    await handleUpdateTenantSettings(req, res);

    expect(mockQuery).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
