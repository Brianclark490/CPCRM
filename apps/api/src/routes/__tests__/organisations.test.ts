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

// ─── Mock the provisioning service ───────────────────────────────────────────

const mockProvisionOrganisation = vi.fn();

vi.mock('../../services/organisationService.js', () => ({
  provisionOrganisation: mockProvisionOrganisation,
}));

// ─── Mock logger so tests stay silent ────────────────────────────────────────

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { handleCreateOrganisation } = await import('../organisations.js');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mockReq(body: unknown, user = { userId: 'user-123', tenantId: 'tenant-abc' }) {
  return {
    body,
    path: '/organisations',
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

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('POST /organisations', () => {
  beforeEach(() => {
    mockProvisionOrganisation.mockReset();
  });

  it('returns 201 with the provisioned organisation and membership on success', async () => {
    const now = new Date();
    const expectedResult = {
      organisation: {
        id: 'org-uuid',
        tenantId: 'tenant-abc',
        name: 'Acme Corp',
        description: undefined,
        createdAt: now,
        updatedAt: now,
      },
      membership: {
        id: 'membership-uuid',
        tenantId: 'tenant-abc',
        userId: 'user-123',
        organisationId: 'org-uuid',
        role: 'owner',
        createdAt: now,
        updatedAt: now,
      },
    };

    mockProvisionOrganisation.mockResolvedValue(expectedResult);

    const req = mockReq({ name: 'Acme Corp' });
    const res = mockRes();

    await handleCreateOrganisation(req, res);

    expect(mockProvisionOrganisation).toHaveBeenCalledWith({
      name: 'Acme Corp',
      description: undefined,
      tenantId: 'tenant-abc',
      requestingUserId: 'user-123',
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expectedResult);
  });

  it('returns 201 and passes description when provided', async () => {
    const now = new Date();
    mockProvisionOrganisation.mockResolvedValue({
      organisation: {
        id: 'org-uuid',
        tenantId: 'tenant-abc',
        name: 'Acme Corp',
        description: 'Our main organisation',
        createdAt: now,
        updatedAt: now,
      },
      membership: {
        id: 'membership-uuid',
        tenantId: 'tenant-abc',
        userId: 'user-123',
        organisationId: 'org-uuid',
        role: 'owner',
        createdAt: now,
        updatedAt: now,
      },
    });

    const req = mockReq({ name: 'Acme Corp', description: 'Our main organisation' });
    const res = mockRes();

    await handleCreateOrganisation(req, res);

    expect(mockProvisionOrganisation).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'Our main organisation' }),
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('returns 400 when the service throws a VALIDATION_ERROR', async () => {
    const validationErr = Object.assign(new Error('Organisation name is required'), {
      code: 'VALIDATION_ERROR',
    });
    mockProvisionOrganisation.mockRejectedValue(validationErr);

    const req = mockReq({ name: '' });
    const res = mockRes();

    await handleCreateOrganisation(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Organisation name is required' });
  });

  it('returns 400 when name is missing from the request body', async () => {
    const validationErr = Object.assign(new Error('Organisation name is required'), {
      code: 'VALIDATION_ERROR',
    });
    mockProvisionOrganisation.mockRejectedValue(validationErr);

    const req = mockReq({});
    const res = mockRes();

    await handleCreateOrganisation(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Organisation name is required' });
  });

  it('returns 500 when the service throws an unexpected error', async () => {
    mockProvisionOrganisation.mockRejectedValue(new Error('Database connection failed'));

    const req = mockReq({ name: 'Acme Corp' });
    const res = mockRes();

    await handleCreateOrganisation(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'An unexpected error occurred' });
  });
});
