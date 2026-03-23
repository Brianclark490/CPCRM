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

const mockCreatePageLayout = vi.fn();
const mockListPageLayouts = vi.fn();
const mockGetPageLayoutById = vi.fn();
const mockUpdatePageLayout = vi.fn();
const mockPublishPageLayout = vi.fn();
const mockListPageLayoutVersions = vi.fn();
const mockDeletePageLayout = vi.fn();

vi.mock('../../services/pageLayoutService.js', () => ({
  createPageLayout: mockCreatePageLayout,
  listPageLayouts: mockListPageLayouts,
  getPageLayoutById: mockGetPageLayoutById,
  updatePageLayout: mockUpdatePageLayout,
  publishPageLayout: mockPublishPageLayout,
  listPageLayoutVersions: mockListPageLayoutVersions,
  deletePageLayout: mockDeletePageLayout,
}));

// ─── Mock component registry ─────────────────────────────────────────────────

vi.mock('../../lib/componentRegistry.js', () => ({
  COMPONENT_REGISTRY: [
    { type: 'field', label: 'Field', icon: 'text-cursor', category: 'fields', configSchema: {}, defaultConfig: {} },
  ],
}));

// ─── Mock logger so tests stay silent ────────────────────────────────────────

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const {
  handleCreatePageLayout,
  handleListPageLayouts,
  handleGetPageLayout,
  handleUpdatePageLayout,
  handlePublishPageLayout,
  handleListPageLayoutVersions,
  handleDeletePageLayout,
  handleGetComponentRegistry,
} = await import('../adminPageLayouts.js');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mockReq(
  body: unknown,
  user = { userId: 'user-123', tenantId: 'tenant-abc' },
  params: Record<string, string> = { objectId: 'obj-1' },
) {
  return {
    body,
    path: '/admin/objects/obj-1/page-layouts',
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

const VALID_LAYOUT = {
  header: { primaryField: 'name', secondaryFields: ['stage'], actions: ['edit'] },
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

// ─── Tests: POST /admin/objects/:objectId/page-layouts ───────────────────────

describe('POST /admin/objects/:objectId/page-layouts', () => {
  beforeEach(() => {
    mockCreatePageLayout.mockReset();
  });

  it('returns 201 with the created page layout on success', async () => {
    const now = new Date();
    const expectedLayout = {
      id: 'pl-uuid',
      objectId: 'obj-1',
      name: 'Default Page',
      role: null,
      isDefault: true,
      layout: VALID_LAYOUT,
      publishedLayout: null,
      version: 1,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
      publishedAt: null,
    };

    mockCreatePageLayout.mockResolvedValue(expectedLayout);

    const req = mockReq({
      name: 'Default Page',
      is_default: true,
      layout: VALID_LAYOUT,
    });
    const res = mockRes();

    await handleCreatePageLayout(req, res);

    expect(mockCreatePageLayout).toHaveBeenCalledWith(
      'tenant-abc',
      'obj-1',
      expect.objectContaining({
        name: 'Default Page',
        isDefault: true,
        layout: VALID_LAYOUT,
      }),
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expectedLayout);
  });

  it('returns 400 on VALIDATION_ERROR', async () => {
    const err = Object.assign(new Error('name is required'), { code: 'VALIDATION_ERROR' });
    mockCreatePageLayout.mockRejectedValue(err);

    const req = mockReq({ layout: VALID_LAYOUT });
    const res = mockRes();

    await handleCreatePageLayout(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'name is required', code: 'VALIDATION_ERROR' });
  });

  it('returns 404 when parent object not found', async () => {
    const err = Object.assign(new Error('Object definition not found'), { code: 'NOT_FOUND' });
    mockCreatePageLayout.mockRejectedValue(err);

    const req = mockReq({ name: 'Test', layout: VALID_LAYOUT });
    const res = mockRes();

    await handleCreatePageLayout(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 409 on CONFLICT', async () => {
    const err = Object.assign(new Error('layout already exists'), { code: 'CONFLICT' });
    mockCreatePageLayout.mockRejectedValue(err);

    const req = mockReq({ name: 'Default', layout: VALID_LAYOUT });
    const res = mockRes();

    await handleCreatePageLayout(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('returns 500 on unexpected error', async () => {
    mockCreatePageLayout.mockRejectedValue(new Error('Database error'));

    const req = mockReq({ name: 'Test', layout: VALID_LAYOUT });
    const res = mockRes();

    await handleCreatePageLayout(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'An unexpected error occurred' });
  });
});

// ─── Tests: GET /admin/objects/:objectId/page-layouts ────────────────────────

describe('GET /admin/objects/:objectId/page-layouts', () => {
  beforeEach(() => {
    mockListPageLayouts.mockReset();
  });

  it('returns 200 with all page layouts', async () => {
    const layouts = [
      { id: 'pl1', name: 'Default Page', status: 'published' },
    ];
    mockListPageLayouts.mockResolvedValue(layouts);

    const req = mockReq({});
    const res = mockRes();

    await handleListPageLayouts(req, res);

    expect(mockListPageLayouts).toHaveBeenCalledWith('tenant-abc', 'obj-1');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(layouts);
  });

  it('returns 404 when parent object not found', async () => {
    const err = Object.assign(new Error('Object definition not found'), { code: 'NOT_FOUND' });
    mockListPageLayouts.mockRejectedValue(err);

    const req = mockReq({});
    const res = mockRes();

    await handleListPageLayouts(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 500 on unexpected error', async () => {
    mockListPageLayouts.mockRejectedValue(new Error('Database error'));

    const req = mockReq({});
    const res = mockRes();

    await handleListPageLayouts(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ─── Tests: GET /admin/objects/:objectId/page-layouts/:id ────────────────────

describe('GET /admin/objects/:objectId/page-layouts/:id', () => {
  beforeEach(() => {
    mockGetPageLayoutById.mockReset();
  });

  it('returns 200 with the page layout', async () => {
    const layout = { id: 'pl1', name: 'Default', layout: VALID_LAYOUT };
    mockGetPageLayoutById.mockResolvedValue(layout);

    const req = mockReq(
      {},
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { objectId: 'obj-1', id: 'pl1' },
    );
    const res = mockRes();

    await handleGetPageLayout(req, res);

    expect(mockGetPageLayoutById).toHaveBeenCalledWith('tenant-abc', 'obj-1', 'pl1');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(layout);
  });

  it('returns 404 when layout not found', async () => {
    const err = Object.assign(new Error('Page layout not found'), { code: 'NOT_FOUND' });
    mockGetPageLayoutById.mockRejectedValue(err);

    const req = mockReq(
      {},
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { objectId: 'obj-1', id: 'missing' },
    );
    const res = mockRes();

    await handleGetPageLayout(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 500 on unexpected error', async () => {
    mockGetPageLayoutById.mockRejectedValue(new Error('Database error'));

    const req = mockReq(
      {},
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { objectId: 'obj-1', id: 'pl1' },
    );
    const res = mockRes();

    await handleGetPageLayout(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ─── Tests: PUT /admin/objects/:objectId/page-layouts/:id ────────────────────

describe('PUT /admin/objects/:objectId/page-layouts/:id', () => {
  beforeEach(() => {
    mockUpdatePageLayout.mockReset();
  });

  it('returns 200 with the updated page layout', async () => {
    const updated = { id: 'pl1', name: 'Updated Name' };
    mockUpdatePageLayout.mockResolvedValue(updated);

    const req = mockReq(
      { name: 'Updated Name' },
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { objectId: 'obj-1', id: 'pl1' },
    );
    const res = mockRes();

    await handleUpdatePageLayout(req, res);

    expect(mockUpdatePageLayout).toHaveBeenCalledWith(
      'tenant-abc',
      'obj-1',
      'pl1',
      expect.objectContaining({ name: 'Updated Name' }),
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(updated);
  });

  it('returns 400 on VALIDATION_ERROR', async () => {
    const err = Object.assign(new Error('name is required'), { code: 'VALIDATION_ERROR' });
    mockUpdatePageLayout.mockRejectedValue(err);

    const req = mockReq(
      { name: '' },
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { objectId: 'obj-1', id: 'pl1' },
    );
    const res = mockRes();

    await handleUpdatePageLayout(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 404 when layout not found', async () => {
    const err = Object.assign(new Error('Page layout not found'), { code: 'NOT_FOUND' });
    mockUpdatePageLayout.mockRejectedValue(err);

    const req = mockReq(
      { name: 'New' },
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { objectId: 'obj-1', id: 'missing' },
    );
    const res = mockRes();

    await handleUpdatePageLayout(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 409 on CONFLICT', async () => {
    const err = Object.assign(new Error('role conflict'), { code: 'CONFLICT' });
    mockUpdatePageLayout.mockRejectedValue(err);

    const req = mockReq(
      { role: 'admin' },
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { objectId: 'obj-1', id: 'pl1' },
    );
    const res = mockRes();

    await handleUpdatePageLayout(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('returns 500 on unexpected error', async () => {
    mockUpdatePageLayout.mockRejectedValue(new Error('Database error'));

    const req = mockReq(
      { name: 'Test' },
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { objectId: 'obj-1', id: 'pl1' },
    );
    const res = mockRes();

    await handleUpdatePageLayout(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ─── Tests: POST /admin/objects/:objectId/page-layouts/:id/publish ───────────

describe('POST /admin/objects/:objectId/page-layouts/:id/publish', () => {
  beforeEach(() => {
    mockPublishPageLayout.mockReset();
  });

  it('returns 200 with the published layout', async () => {
    const published = { id: 'pl1', status: 'published', version: 2 };
    mockPublishPageLayout.mockResolvedValue(published);

    const req = mockReq(
      {},
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { objectId: 'obj-1', id: 'pl1' },
    );
    const res = mockRes();

    await handlePublishPageLayout(req, res);

    expect(mockPublishPageLayout).toHaveBeenCalledWith('tenant-abc', 'obj-1', 'pl1', 'user-123');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(published);
  });

  it('returns 404 when layout not found', async () => {
    const err = Object.assign(new Error('Page layout not found'), { code: 'NOT_FOUND' });
    mockPublishPageLayout.mockRejectedValue(err);

    const req = mockReq(
      {},
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { objectId: 'obj-1', id: 'missing' },
    );
    const res = mockRes();

    await handlePublishPageLayout(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 500 on unexpected error', async () => {
    mockPublishPageLayout.mockRejectedValue(new Error('Database error'));

    const req = mockReq(
      {},
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { objectId: 'obj-1', id: 'pl1' },
    );
    const res = mockRes();

    await handlePublishPageLayout(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ─── Tests: GET /admin/objects/:objectId/page-layouts/:id/versions ───────────

describe('GET /admin/objects/:objectId/page-layouts/:id/versions', () => {
  beforeEach(() => {
    mockListPageLayoutVersions.mockReset();
  });

  it('returns 200 with version history', async () => {
    const versions = [
      { id: 'v2', layoutId: 'pl1', version: 2 },
      { id: 'v1', layoutId: 'pl1', version: 1 },
    ];
    mockListPageLayoutVersions.mockResolvedValue(versions);

    const req = mockReq(
      {},
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { objectId: 'obj-1', id: 'pl1' },
    );
    const res = mockRes();

    await handleListPageLayoutVersions(req, res);

    expect(mockListPageLayoutVersions).toHaveBeenCalledWith('tenant-abc', 'obj-1', 'pl1');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(versions);
  });

  it('returns 404 when layout not found', async () => {
    const err = Object.assign(new Error('Page layout not found'), { code: 'NOT_FOUND' });
    mockListPageLayoutVersions.mockRejectedValue(err);

    const req = mockReq(
      {},
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { objectId: 'obj-1', id: 'missing' },
    );
    const res = mockRes();

    await handleListPageLayoutVersions(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 500 on unexpected error', async () => {
    mockListPageLayoutVersions.mockRejectedValue(new Error('Database error'));

    const req = mockReq(
      {},
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { objectId: 'obj-1', id: 'pl1' },
    );
    const res = mockRes();

    await handleListPageLayoutVersions(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ─── Tests: DELETE /admin/objects/:objectId/page-layouts/:id ─────────────────

describe('DELETE /admin/objects/:objectId/page-layouts/:id', () => {
  beforeEach(() => {
    mockDeletePageLayout.mockReset();
  });

  it('returns 204 on successful deletion', async () => {
    mockDeletePageLayout.mockResolvedValue(undefined);

    const req = mockReq(
      {},
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { objectId: 'obj-1', id: 'pl1' },
    );
    const res = mockRes();

    await handleDeletePageLayout(req, res);

    expect(mockDeletePageLayout).toHaveBeenCalledWith('tenant-abc', 'obj-1', 'pl1');
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.end).toHaveBeenCalled();
  });

  it('returns 404 when layout not found', async () => {
    const err = Object.assign(new Error('Page layout not found'), { code: 'NOT_FOUND' });
    mockDeletePageLayout.mockRejectedValue(err);

    const req = mockReq(
      {},
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { objectId: 'obj-1', id: 'missing' },
    );
    const res = mockRes();

    await handleDeletePageLayout(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 400 for default layouts', async () => {
    const err = Object.assign(new Error('Cannot delete default page layouts'), { code: 'DELETE_BLOCKED' });
    mockDeletePageLayout.mockRejectedValue(err);

    const req = mockReq(
      {},
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { objectId: 'obj-1', id: 'default-pl1' },
    );
    const res = mockRes();

    await handleDeletePageLayout(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Cannot delete default page layouts', code: 'DELETE_BLOCKED' });
  });

  it('returns 500 on unexpected error', async () => {
    mockDeletePageLayout.mockRejectedValue(new Error('Database error'));

    const req = mockReq(
      {},
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { objectId: 'obj-1', id: 'pl1' },
    );
    const res = mockRes();

    await handleDeletePageLayout(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ─── Tests: GET /admin/component-registry ────────────────────────────────────

describe('GET /admin/component-registry', () => {
  it('returns 200 with the component registry', async () => {
    const req = mockReq({});
    const res = mockRes();

    await handleGetComponentRegistry(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ type: 'field' }),
      ]),
    );
  });
});
