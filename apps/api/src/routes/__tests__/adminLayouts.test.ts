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

const mockCreateLayoutDefinition = vi.fn();
const mockListLayoutDefinitions = vi.fn();
const mockGetLayoutDefinitionById = vi.fn();
const mockUpdateLayoutDefinition = vi.fn();
const mockSetLayoutFields = vi.fn();
const mockDeleteLayoutDefinition = vi.fn();

vi.mock('../../services/layoutDefinitionService.js', () => ({
  createLayoutDefinition: mockCreateLayoutDefinition,
  listLayoutDefinitions: mockListLayoutDefinitions,
  getLayoutDefinitionById: mockGetLayoutDefinitionById,
  updateLayoutDefinition: mockUpdateLayoutDefinition,
  setLayoutFields: mockSetLayoutFields,
  deleteLayoutDefinition: mockDeleteLayoutDefinition,
}));

// ─── Mock logger so tests stay silent ────────────────────────────────────────

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const {
  handleCreateLayout,
  handleListLayouts,
  handleGetLayout,
  handleUpdateLayout,
  handleSetLayoutFields,
  handleDeleteLayout,
} = await import('../adminLayouts.js');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mockReq(
  body: unknown,
  user = { userId: 'user-123', tenantId: 'tenant-abc' },
  params: Record<string, string> = { objectId: 'obj-1' },
) {
  return {
    body,
    path: '/admin/objects/obj-1/layouts',
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

// ─── Tests: POST /admin/objects/:objectId/layouts ────────────────────────────

describe('POST /admin/objects/:objectId/layouts', () => {
  beforeEach(() => {
    mockCreateLayoutDefinition.mockReset();
  });

  it('returns 201 with the created layout on success', async () => {
    const now = new Date();
    const expectedLayout = {
      id: 'layout-uuid',
      objectId: 'obj-1',
      name: 'Custom Form',
      layoutType: 'form',
      isDefault: false,
      createdAt: now,
      updatedAt: now,
    };

    mockCreateLayoutDefinition.mockResolvedValue(expectedLayout);

    const req = mockReq({
      name: 'Custom Form',
      layout_type: 'form',
    });
    const res = mockRes();

    await handleCreateLayout(req, res);

    expect(mockCreateLayoutDefinition).toHaveBeenCalledWith(
      'tenant-abc',
      'obj-1',
      expect.objectContaining({
        name: 'Custom Form',
        layoutType: 'form',
      }),
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expectedLayout);
  });

  it('accepts camelCase field names', async () => {
    mockCreateLayoutDefinition.mockResolvedValue({
      id: 'layout-uuid',
      name: 'Test',
      layoutType: 'list',
    });

    const req = mockReq({
      name: 'Test',
      layoutType: 'list',
    });
    const res = mockRes();

    await handleCreateLayout(req, res);

    expect(mockCreateLayoutDefinition).toHaveBeenCalledWith(
      'tenant-abc',
      'obj-1',
      expect.objectContaining({
        layoutType: 'list',
      }),
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('returns 400 on VALIDATION_ERROR', async () => {
    const err = Object.assign(new Error('name is required'), { code: 'VALIDATION_ERROR' });
    mockCreateLayoutDefinition.mockRejectedValue(err);

    const req = mockReq({ layout_type: 'form' });
    const res = mockRes();

    await handleCreateLayout(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'name is required', code: 'VALIDATION_ERROR' });
  });

  it('returns 404 when parent object not found', async () => {
    const err = Object.assign(new Error('Object definition not found'), { code: 'NOT_FOUND' });
    mockCreateLayoutDefinition.mockRejectedValue(err);

    const req = mockReq({ name: 'Test', layout_type: 'form' });
    const res = mockRes();

    await handleCreateLayout(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 409 on CONFLICT', async () => {
    const err = Object.assign(new Error('layout name already exists'), { code: 'CONFLICT' });
    mockCreateLayoutDefinition.mockRejectedValue(err);

    const req = mockReq({ name: 'Default Form', layout_type: 'form' });
    const res = mockRes();

    await handleCreateLayout(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('returns 500 on unexpected error', async () => {
    mockCreateLayoutDefinition.mockRejectedValue(new Error('Database error'));

    const req = mockReq({ name: 'Test', layout_type: 'form' });
    const res = mockRes();

    await handleCreateLayout(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'An unexpected error occurred' });
  });
});

// ─── Tests: GET /admin/objects/:objectId/layouts ─────────────────────────────

describe('GET /admin/objects/:objectId/layouts', () => {
  beforeEach(() => {
    mockListLayoutDefinitions.mockReset();
  });

  it('returns 200 with all layouts', async () => {
    const layouts = [
      { id: 'l1', name: 'Default Form', layoutType: 'form', isDefault: true },
    ];
    mockListLayoutDefinitions.mockResolvedValue(layouts);

    const req = mockReq({});
    const res = mockRes();

    await handleListLayouts(req, res);

    expect(mockListLayoutDefinitions).toHaveBeenCalledWith('tenant-abc', 'obj-1');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(layouts);
  });

  it('returns 404 when parent object not found', async () => {
    const err = Object.assign(new Error('Object definition not found'), { code: 'NOT_FOUND' });
    mockListLayoutDefinitions.mockRejectedValue(err);

    const req = mockReq({});
    const res = mockRes();

    await handleListLayouts(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 500 on unexpected error', async () => {
    mockListLayoutDefinitions.mockRejectedValue(new Error('Database error'));

    const req = mockReq({});
    const res = mockRes();

    await handleListLayouts(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ─── Tests: GET /admin/objects/:objectId/layouts/:id ────────────────────────

describe('GET /admin/objects/:objectId/layouts/:id', () => {
  beforeEach(() => {
    mockGetLayoutDefinitionById.mockReset();
  });

  it('returns 200 with layout and field metadata', async () => {
    const layout = {
      id: 'l1',
      objectId: 'obj-1',
      name: 'Default Form',
      layoutType: 'form',
      isDefault: true,
      fields: [
        {
          id: 'lf1',
          layoutId: 'l1',
          fieldId: 'f1',
          section: 0,
          sectionLabel: 'Basic Info',
          sortOrder: 1,
          width: 'full',
          fieldApiName: 'name',
          fieldLabel: 'Name',
          fieldType: 'text',
          fieldRequired: true,
          fieldOptions: {},
        },
      ],
    };
    mockGetLayoutDefinitionById.mockResolvedValue(layout);

    const req = mockReq(
      {},
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { objectId: 'obj-1', id: 'l1' },
    );
    const res = mockRes();

    await handleGetLayout(req, res);

    expect(mockGetLayoutDefinitionById).toHaveBeenCalledWith('tenant-abc', 'obj-1', 'l1');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(layout);
  });

  it('returns 404 when layout not found', async () => {
    const err = Object.assign(new Error('Layout definition not found'), { code: 'NOT_FOUND' });
    mockGetLayoutDefinitionById.mockRejectedValue(err);

    const req = mockReq(
      {},
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { objectId: 'obj-1', id: 'missing' },
    );
    const res = mockRes();

    await handleGetLayout(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 500 on unexpected error', async () => {
    mockGetLayoutDefinitionById.mockRejectedValue(new Error('Database error'));

    const req = mockReq(
      {},
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { objectId: 'obj-1', id: 'l1' },
    );
    const res = mockRes();

    await handleGetLayout(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ─── Tests: PUT /admin/objects/:objectId/layouts/:id ────────────────────────

describe('PUT /admin/objects/:objectId/layouts/:id', () => {
  beforeEach(() => {
    mockUpdateLayoutDefinition.mockReset();
  });

  it('returns 200 with the updated layout', async () => {
    const updated = {
      id: 'l1',
      objectId: 'obj-1',
      name: 'Updated Name',
      layoutType: 'form',
    };
    mockUpdateLayoutDefinition.mockResolvedValue(updated);

    const req = mockReq(
      { name: 'Updated Name' },
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { objectId: 'obj-1', id: 'l1' },
    );
    const res = mockRes();

    await handleUpdateLayout(req, res);

    expect(mockUpdateLayoutDefinition).toHaveBeenCalledWith(
      'tenant-abc',
      'obj-1',
      'l1',
      expect.objectContaining({ name: 'Updated Name' }),
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(updated);
  });

  it('accepts snake_case field names in body', async () => {
    mockUpdateLayoutDefinition.mockResolvedValue({ id: 'l1' });

    const req = mockReq(
      { layout_type: 'list' },
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { objectId: 'obj-1', id: 'l1' },
    );
    const res = mockRes();

    await handleUpdateLayout(req, res);

    expect(mockUpdateLayoutDefinition).toHaveBeenCalledWith(
      'tenant-abc',
      'obj-1',
      'l1',
      expect.objectContaining({ layoutType: 'list' }),
    );
  });

  it('returns 400 on VALIDATION_ERROR', async () => {
    const err = Object.assign(new Error('name is required'), { code: 'VALIDATION_ERROR' });
    mockUpdateLayoutDefinition.mockRejectedValue(err);

    const req = mockReq(
      { name: '' },
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { objectId: 'obj-1', id: 'l1' },
    );
    const res = mockRes();

    await handleUpdateLayout(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 404 when layout not found', async () => {
    const err = Object.assign(new Error('Layout definition not found'), { code: 'NOT_FOUND' });
    mockUpdateLayoutDefinition.mockRejectedValue(err);

    const req = mockReq(
      { name: 'New' },
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { objectId: 'obj-1', id: 'missing' },
    );
    const res = mockRes();

    await handleUpdateLayout(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 409 on CONFLICT', async () => {
    const err = Object.assign(new Error('layout name already exists'), { code: 'CONFLICT' });
    mockUpdateLayoutDefinition.mockRejectedValue(err);

    const req = mockReq(
      { name: 'Default Form' },
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { objectId: 'obj-1', id: 'l2' },
    );
    const res = mockRes();

    await handleUpdateLayout(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('returns 500 on unexpected error', async () => {
    mockUpdateLayoutDefinition.mockRejectedValue(new Error('Database error'));

    const req = mockReq(
      { name: 'Test' },
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { objectId: 'obj-1', id: 'l1' },
    );
    const res = mockRes();

    await handleUpdateLayout(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ─── Tests: PUT /admin/objects/:objectId/layouts/:id/fields ─────────────────

describe('PUT /admin/objects/:objectId/layouts/:id/fields', () => {
  beforeEach(() => {
    mockSetLayoutFields.mockReset();
  });

  it('returns 200 with layout and full field metadata', async () => {
    const result = {
      id: 'l1',
      objectId: 'obj-1',
      name: 'Default Form',
      layoutType: 'form',
      isDefault: true,
      fields: [
        {
          id: 'lf1',
          layoutId: 'l1',
          fieldId: 'f1',
          section: 0,
          sectionLabel: 'Basic Info',
          sortOrder: 1,
          width: 'full',
          fieldApiName: 'name',
          fieldLabel: 'Name',
          fieldType: 'text',
          fieldRequired: true,
          fieldOptions: {},
        },
      ],
    };
    mockSetLayoutFields.mockResolvedValue(result);

    const req = mockReq(
      {
        sections: [
          {
            label: 'Basic Info',
            fields: [{ field_id: 'f1', width: 'full' }],
          },
        ],
      },
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { objectId: 'obj-1', id: 'l1' },
    );
    const res = mockRes();

    await handleSetLayoutFields(req, res);

    expect(mockSetLayoutFields).toHaveBeenCalledWith('tenant-abc', 'obj-1', 'l1', [
      {
        label: 'Basic Info',
        fields: [{ field_id: 'f1', width: 'full' }],
      },
    ]);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(result);
  });

  it('defaults to empty sections when body.sections is missing', async () => {
    mockSetLayoutFields.mockResolvedValue({ id: 'l1', fields: [] });

    const req = mockReq(
      {},
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { objectId: 'obj-1', id: 'l1' },
    );
    const res = mockRes();

    await handleSetLayoutFields(req, res);

    expect(mockSetLayoutFields).toHaveBeenCalledWith('tenant-abc', 'obj-1', 'l1', []);
  });

  it('returns 400 on VALIDATION_ERROR', async () => {
    const err = Object.assign(new Error('Each field must have a field_id'), { code: 'VALIDATION_ERROR' });
    mockSetLayoutFields.mockRejectedValue(err);

    const req = mockReq(
      { sections: [{ fields: [{}] }] },
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { objectId: 'obj-1', id: 'l1' },
    );
    const res = mockRes();

    await handleSetLayoutFields(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 404 when layout not found', async () => {
    const err = Object.assign(new Error('Layout definition not found'), { code: 'NOT_FOUND' });
    mockSetLayoutFields.mockRejectedValue(err);

    const req = mockReq(
      { sections: [] },
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { objectId: 'obj-1', id: 'missing' },
    );
    const res = mockRes();

    await handleSetLayoutFields(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 500 on unexpected error', async () => {
    mockSetLayoutFields.mockRejectedValue(new Error('Database error'));

    const req = mockReq(
      { sections: [] },
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { objectId: 'obj-1', id: 'l1' },
    );
    const res = mockRes();

    await handleSetLayoutFields(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ─── Tests: DELETE /admin/objects/:objectId/layouts/:id ─────────────────────

describe('DELETE /admin/objects/:objectId/layouts/:id', () => {
  beforeEach(() => {
    mockDeleteLayoutDefinition.mockReset();
  });

  it('returns 204 on successful deletion', async () => {
    mockDeleteLayoutDefinition.mockResolvedValue(undefined);

    const req = mockReq(
      {},
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { objectId: 'obj-1', id: 'l1' },
    );
    const res = mockRes();

    await handleDeleteLayout(req, res);

    expect(mockDeleteLayoutDefinition).toHaveBeenCalledWith('tenant-abc', 'obj-1', 'l1');
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.end).toHaveBeenCalled();
  });

  it('returns 404 when layout not found', async () => {
    const err = Object.assign(new Error('Layout definition not found'), { code: 'NOT_FOUND' });
    mockDeleteLayoutDefinition.mockRejectedValue(err);

    const req = mockReq(
      {},
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { objectId: 'obj-1', id: 'missing' },
    );
    const res = mockRes();

    await handleDeleteLayout(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 400 for default layouts', async () => {
    const err = Object.assign(new Error('Cannot delete default layouts'), { code: 'DELETE_BLOCKED' });
    mockDeleteLayoutDefinition.mockRejectedValue(err);

    const req = mockReq(
      {},
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { objectId: 'obj-1', id: 'default-l1' },
    );
    const res = mockRes();

    await handleDeleteLayout(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Cannot delete default layouts', code: 'DELETE_BLOCKED' });
  });

  it('returns 500 on unexpected error', async () => {
    mockDeleteLayoutDefinition.mockRejectedValue(new Error('Database error'));

    const req = mockReq(
      {},
      { userId: 'user-123', tenantId: 'tenant-abc' },
      { objectId: 'obj-1', id: 'l1' },
    );
    const res = mockRes();

    await handleDeleteLayout(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
