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

// ─── Mock the database pool ──────────────────────────────────────────────────

const mockQuery = vi.fn();

vi.mock('../../db/client.js', () => ({
  pool: { query: (...args: unknown[]) => mockQuery(...args) },
}));

// ─── Mock logger so tests stay silent ────────────────────────────────────────

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { handleGetEffectivePageLayout } = await import('../pageLayouts.js');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mockReq(
  apiName: string,
  user = { userId: 'user-123', tenantId: 'tenant-abc', roles: [] as string[], permissions: [] as string[] },
) {
  return {
    body: {},
    path: `/api/objects/${apiName}/page-layout`,
    user,
    params: { apiName },
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

const PUBLISHED_LAYOUT = {
  header: { primaryField: 'name', secondaryFields: ['industry'] },
  tabs: [
    {
      id: 'tab-1',
      label: 'Details',
      sections: [
        {
          id: 'sec-1',
          type: 'field_section',
          label: 'Info',
          columns: 2,
          components: [
            { id: 'comp-1', type: 'field', config: { fieldId: 'uuid-1', span: 1 } },
          ],
        },
      ],
    },
  ],
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('GET /objects/:apiName/page-layout', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('returns 404 when the object is not found', async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    const req = mockReq('nonexistent');
    const res = mockRes();

    await handleGetEffectivePageLayout(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Object not found' });
  });

  it('returns 204 when no published layout exists', async () => {
    // Object lookup returns a result
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'obj-1' }] })
      // Default layout query returns nothing
      .mockResolvedValueOnce({ rows: [] });

    const req = mockReq('account');
    const res = mockRes();

    await handleGetEffectivePageLayout(req, res);

    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.end).toHaveBeenCalled();
  });

  it('returns the default published layout when no role-specific layout exists', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'obj-1' }] })
      // Default layout query returns a published layout
      .mockResolvedValueOnce({ rows: [{ published_layout: PUBLISHED_LAYOUT }] });

    const req = mockReq('account');
    const res = mockRes();

    await handleGetEffectivePageLayout(req, res);

    expect(res.json).toHaveBeenCalledWith({
      ...PUBLISHED_LAYOUT,
      zones: { kpi: [], leftRail: [], rightRail: [] },
    });
  });

  it('preserves populated zones on the published layout', async () => {
    const withZones = {
      ...PUBLISHED_LAYOUT,
      zones: {
        kpi: [{ id: 'k-1', type: 'field', config: { fieldId: 'uuid-1' } }],
        leftRail: [],
        rightRail: [],
      },
    };

    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'obj-1' }] })
      .mockResolvedValueOnce({ rows: [{ published_layout: withZones }] });

    const req = mockReq('account');
    const res = mockRes();

    await handleGetEffectivePageLayout(req, res);

    expect(res.json).toHaveBeenCalledWith(withZones);
  });

  it('returns role-specific layout when user has a matching role', async () => {
    const roleLayout = { ...PUBLISHED_LAYOUT, header: { ...PUBLISHED_LAYOUT.header, primaryField: 'company_name' } };

    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'obj-1' }] })
      // Role-specific query returns a layout
      .mockResolvedValueOnce({ rows: [{ published_layout: roleLayout }] });

    const req = mockReq('account', {
      userId: 'user-123',
      tenantId: 'tenant-abc',
      roles: ['sales_rep'],
      permissions: [],
    });
    const res = mockRes();

    await handleGetEffectivePageLayout(req, res);

    expect(res.json).toHaveBeenCalledWith({
      ...roleLayout,
      zones: { kpi: [], leftRail: [], rightRail: [] },
    });
    // Should have queried with the user's role
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('role = $3'),
      ['tenant-abc', 'obj-1', 'sales_rep'],
    );
  });

  it('falls back to default layout when role-specific layout has no published_layout', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'obj-1' }] })
      // Role-specific query returns a row but with null published_layout
      .mockResolvedValueOnce({ rows: [{ published_layout: null }] })
      // Default layout query returns a published layout
      .mockResolvedValueOnce({ rows: [{ published_layout: PUBLISHED_LAYOUT }] });

    const req = mockReq('account', {
      userId: 'user-123',
      tenantId: 'tenant-abc',
      roles: ['manager'],
      permissions: [],
    });
    const res = mockRes();

    await handleGetEffectivePageLayout(req, res);

    expect(res.json).toHaveBeenCalledWith({
      ...PUBLISHED_LAYOUT,
      zones: { kpi: [], leftRail: [], rightRail: [] },
    });
  });

  it('returns 204 when role-specific query returns nothing and no default exists', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'obj-1' }] })
      // Role-specific query returns nothing
      .mockResolvedValueOnce({ rows: [] })
      // Default layout query also returns nothing
      .mockResolvedValueOnce({ rows: [] });

    const req = mockReq('account', {
      userId: 'user-123',
      tenantId: 'tenant-abc',
      roles: ['admin'],
      permissions: [],
    });
    const res = mockRes();

    await handleGetEffectivePageLayout(req, res);

    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.end).toHaveBeenCalled();
  });

  it('returns 500 on unexpected database error', async () => {
    mockQuery.mockRejectedValue(new Error('Connection refused'));

    const req = mockReq('account');
    const res = mockRes();

    await handleGetEffectivePageLayout(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'An unexpected error occurred' });
  });
});
