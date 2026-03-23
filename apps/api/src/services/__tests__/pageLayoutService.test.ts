import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createPageLayout,
  listPageLayouts,
  getPageLayoutById,
  updatePageLayout,
  publishPageLayout,
  listPageLayoutVersions,
  deletePageLayout,
  validatePageLayoutName,
  validateLayoutJson,
} from '../pageLayoutService.js';

const TENANT_ID = 'test-tenant-001';

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ─── Fake DB pool ─────────────────────────────────────────────────────────────

const { fakeObjects, fakePageLayouts, fakePageLayoutVersions, mockQuery, mockConnect } = vi.hoisted(() => {
  const fakeObjects = new Map<string, Record<string, unknown>>();
  const fakePageLayouts = new Map<string, Record<string, unknown>>();
  const fakePageLayoutVersions = new Map<string, Record<string, unknown>>();

  const mockQuery = vi.fn(async (sql: string, params?: unknown[]) => {
    const s = sql.replace(/\s+/g, ' ').trim().toUpperCase();

    // SELECT id FROM object_definitions WHERE id = $1 AND tenant_id = $2
    if (s.startsWith('SELECT ID FROM OBJECT_DEFINITIONS WHERE ID')) {
      const id = params![0] as string;
      const row = fakeObjects.get(id);
      if (row) return { rows: [{ id: row.id }] };
      return { rows: [] };
    }

    // SELECT id FROM page_layouts WHERE tenant_id = ... (conflict check)
    if (s.startsWith('SELECT ID FROM PAGE_LAYOUTS') && s.includes('TENANT_ID')) {
      const tenantId = params![0] as string;
      const objectId = params![1] as string;
      const role = params!.length > 2 ? (params![2] as string) : null;
      const excludeId = s.includes('ID !=') ? (params![2] as string) : undefined;

      const match = [...fakePageLayouts.values()].find((l) => {
        if (l.tenant_id !== tenantId || l.object_id !== objectId) return false;
        if (excludeId && l.id === excludeId) return false;
        if (role === null) return l.role === null || l.role === undefined;
        return l.role === role;
      });

      if (match) return { rows: [{ id: match.id }] };
      return { rows: [] };
    }

    // INSERT INTO page_layouts
    if (s.startsWith('INSERT INTO PAGE_LAYOUTS')) {
      const [id, tenant_id, object_id, name, role, is_default, layout, version, status, created_at, updated_at] = params as unknown[];
      const row: Record<string, unknown> = {
        id, tenant_id, object_id, name, role, is_default,
        layout: typeof layout === 'string' ? JSON.parse(layout as string) : layout,
        published_layout: null,
        version, status, created_at, updated_at, published_at: null,
      };
      fakePageLayouts.set(id as string, row);
      return { rows: [row] };
    }

    // SELECT * FROM page_layouts WHERE tenant_id = ... ORDER BY name
    if (s.startsWith('SELECT * FROM PAGE_LAYOUTS WHERE TENANT_ID') && s.includes('ORDER BY')) {
      const tenantId = params![0] as string;
      const objectId = params![1] as string;
      const rows = [...fakePageLayouts.values()]
        .filter((l) => l.tenant_id === tenantId && l.object_id === objectId)
        .sort((a, b) => (a.name as string).localeCompare(b.name as string));
      return { rows };
    }

    // SELECT * FROM page_layouts WHERE id = $1 AND tenant_id = $2 AND object_id = $3
    if (s.startsWith('SELECT * FROM PAGE_LAYOUTS WHERE ID')) {
      const id = params![0] as string;
      const row = fakePageLayouts.get(id);
      if (row && row.tenant_id === params![1] && row.object_id === params![2]) {
        return { rows: [row] };
      }
      return { rows: [] };
    }

    // SELECT id FROM page_layouts WHERE id = ... (for listVersions check)
    if (s.startsWith('SELECT ID FROM PAGE_LAYOUTS WHERE ID')) {
      const id = params![0] as string;
      const row = fakePageLayouts.get(id);
      if (row && row.tenant_id === params![1] && row.object_id === params![2]) {
        return { rows: [{ id: row.id }] };
      }
      return { rows: [] };
    }

    // UPDATE page_layouts SET published_layout ... (publish)
    if (s.startsWith('UPDATE PAGE_LAYOUTS') && s.includes('PUBLISHED_LAYOUT = LAYOUT')) {
      const newVersion = params![0] as number;
      const now = params![1] as Date;
      const layoutId = params![2] as string;
      const row = fakePageLayouts.get(layoutId);
      if (row) {
        row.published_layout = row.layout;
        row.version = newVersion;
        row.status = 'published';
        row.published_at = now;
        row.updated_at = now;
        return { rows: [row] };
      }
      return { rows: [] };
    }

    // UPDATE page_layouts SET ... (general update)
    if (s.startsWith('UPDATE PAGE_LAYOUTS SET')) {
      // Find the layout ID in params (second-to-last param)
      const layoutId = params![params!.length - 2] as string;
      const row = fakePageLayouts.get(layoutId);
      if (row) {
        // Apply updates from params based on SQL fragments
        const sqlLower = sql.toLowerCase();
        let paramIdx = 0;
        if (sqlLower.includes('name =')) { row.name = params![paramIdx++]; }
        if (sqlLower.includes('role =')) { row.role = params![paramIdx++]; }
        if (sqlLower.includes('layout =')) {
          const val = params![paramIdx++];
          row.layout = typeof val === 'string' ? JSON.parse(val) : val;
        }
        if (sqlLower.includes('is_default =')) { row.is_default = params![paramIdx++]; }
        row.updated_at = params![paramIdx] ?? new Date();
        return { rows: [row] };
      }
      return { rows: [] };
    }

    // INSERT INTO page_layout_versions
    if (s.startsWith('INSERT INTO PAGE_LAYOUT_VERSIONS')) {
      const [id, layout_id, tenant_id, version, layout, published_by, published_at] = params as unknown[];
      const row: Record<string, unknown> = {
        id, layout_id, tenant_id, version, layout, published_by, published_at,
      };
      fakePageLayoutVersions.set(id as string, row);
      return { rows: [row] };
    }

    // SELECT * FROM page_layout_versions WHERE layout_id = ... ORDER BY version DESC
    if (s.startsWith('SELECT * FROM PAGE_LAYOUT_VERSIONS WHERE LAYOUT_ID')) {
      const layoutId = params![0] as string;
      const rows = [...fakePageLayoutVersions.values()]
        .filter((v) => v.layout_id === layoutId && v.tenant_id === params![1])
        .sort((a, b) => (b.version as number) - (a.version as number));
      return { rows };
    }

    // DELETE FROM page_layouts WHERE id = $1 AND tenant_id = $2
    if (s.startsWith('DELETE FROM PAGE_LAYOUTS WHERE ID')) {
      const id = params![0] as string;
      fakePageLayouts.delete(id);
      return { rows: [] };
    }

    // Transaction control statements (no-op in tests)
    if (s === 'BEGIN' || s === 'COMMIT' || s === 'ROLLBACK') {
      return { rows: [] };
    }

    return { rows: [] };
  });

  // The publish flow uses pool.connect() for transactions.  Return a fake
  // client whose .query() delegates to the same mockQuery so the in-memory
  // data stores stay consistent.
  const mockConnect = vi.fn(async () => ({
    query: mockQuery,
    release: vi.fn(),
  }));

  return { fakeObjects, fakePageLayouts, fakePageLayoutVersions, mockQuery, mockConnect };
});

vi.mock('../../db/client.js', () => ({
  pool: { query: mockQuery, connect: mockConnect },
}));

// ─── Test fixtures ────────────────────────────────────────────────────────────

const VALID_LAYOUT_JSON = {
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

// ─── Tests: validatePageLayoutName ───────────────────────────────────────────

describe('validatePageLayoutName', () => {
  it('returns null for a valid name', () => {
    expect(validatePageLayoutName('Default Page')).toBeNull();
  });

  it('returns error for empty string', () => {
    expect(validatePageLayoutName('')).toBe('name is required');
  });

  it('returns error for non-string', () => {
    expect(validatePageLayoutName(123)).toBe('name is required');
  });

  it('returns error for whitespace-only', () => {
    expect(validatePageLayoutName('   ')).toBe('name is required');
  });

  it('returns error for name over 255 chars', () => {
    const longName = 'a'.repeat(256);
    expect(validatePageLayoutName(longName)).toBe('name must be 255 characters or fewer');
  });
});

// ─── Tests: validateLayoutJson ───────────────────────────────────────────────

describe('validateLayoutJson', () => {
  it('returns null for a valid layout', () => {
    expect(validateLayoutJson(VALID_LAYOUT_JSON)).toBeNull();
  });

  it('returns error when layout is not an object', () => {
    expect(validateLayoutJson('not-an-object')).toBe('layout is required and must be an object');
  });

  it('returns error when layout is null', () => {
    expect(validateLayoutJson(null)).toBe('layout is required and must be an object');
  });

  it('returns error when header is missing', () => {
    expect(validateLayoutJson({ tabs: [] })).toBe('layout.header is required and must be an object');
  });

  it('returns error when header.primaryField is missing', () => {
    expect(validateLayoutJson({ header: {}, tabs: [] })).toBe('layout.header.primaryField is required');
  });

  it('returns error when tabs is not an array', () => {
    expect(validateLayoutJson({ header: { primaryField: 'name' }, tabs: 'not-array' })).toBe(
      'layout.tabs is required and must be an array',
    );
  });

  it('returns error when tab has no id', () => {
    const layout = {
      header: { primaryField: 'name' },
      tabs: [{ label: 'Test', sections: [] }],
    };
    expect(validateLayoutJson(layout)).toBe('Each tab must have an id');
  });

  it('returns error when tab has no label', () => {
    const layout = {
      header: { primaryField: 'name' },
      tabs: [{ id: 'tab-1', sections: [] }],
    };
    expect(validateLayoutJson(layout)).toBe('Each tab must have a label');
  });

  it('returns error for invalid section type', () => {
    const layout = {
      header: { primaryField: 'name' },
      tabs: [{
        id: 'tab-1', label: 'Tab', sections: [{
          id: 'sec-1', type: 'invalid', label: 'Sec', components: [],
        }],
      }],
    };
    expect(validateLayoutJson(layout)).toContain('invalid type');
  });

  it('returns error for invalid component type', () => {
    const layout = {
      header: { primaryField: 'name' },
      tabs: [{
        id: 'tab-1', label: 'Tab', sections: [{
          id: 'sec-1', type: 'field_section', label: 'Sec', components: [
            { id: 'comp-1', type: 'nonexistent', config: {} },
          ],
        }],
      }],
    };
    expect(validateLayoutJson(layout)).toContain('invalid type');
  });

  it('returns error when component has no config', () => {
    const layout = {
      header: { primaryField: 'name' },
      tabs: [{
        id: 'tab-1', label: 'Tab', sections: [{
          id: 'sec-1', type: 'field_section', label: 'Sec', components: [
            { id: 'comp-1', type: 'field' },
          ],
        }],
      }],
    };
    expect(validateLayoutJson(layout)).toContain('config object');
  });

  it('validates visibility rules on sections', () => {
    const layout = {
      header: { primaryField: 'name' },
      tabs: [{
        id: 'tab-1', label: 'Tab', sections: [{
          id: 'sec-1', type: 'field_section', label: 'Sec',
          visibility: { operator: 'INVALID', conditions: [] },
          components: [],
        }],
      }],
    };
    expect(validateLayoutJson(layout)).toContain('operator');
  });

  it('accepts valid visibility rules', () => {
    const layout = {
      header: { primaryField: 'name' },
      tabs: [{
        id: 'tab-1', label: 'Tab', sections: [{
          id: 'sec-1', type: 'field_section', label: 'Sec',
          visibility: {
            operator: 'AND',
            conditions: [{ field: 'stage', op: 'equals', value: 'Closed Won' }],
          },
          components: [],
        }],
      }],
    };
    expect(validateLayoutJson(layout)).toBeNull();
  });

  it('accepts null visibility', () => {
    const layout = {
      header: { primaryField: 'name' },
      tabs: [{
        id: 'tab-1', label: 'Tab', sections: [{
          id: 'sec-1', type: 'field_section', label: 'Sec',
          visibility: null,
          components: [],
        }],
      }],
    };
    expect(validateLayoutJson(layout)).toBeNull();
  });
});

// ─── Tests: createPageLayout ─────────────────────────────────────────────────

describe('createPageLayout', () => {
  beforeEach(() => {
    fakeObjects.clear();
    fakePageLayouts.clear();
    mockQuery.mockClear();
    fakeObjects.set('obj-1', { id: 'obj-1', tenant_id: TENANT_ID });
  });

  it('creates a page layout and returns it', async () => {
    const result = await createPageLayout(TENANT_ID, 'obj-1', {
      name: 'Default Page',
      layout: VALID_LAYOUT_JSON,
    });

    expect(result.name).toBe('Default Page');
    expect(result.objectId).toBe('obj-1');
    expect(result.status).toBe('draft');
    expect(result.version).toBe(1);
    expect(result.publishedLayout).toBeNull();
    expect(result.layout).toEqual(VALID_LAYOUT_JSON);
  });

  it('throws NOT_FOUND when object does not exist', async () => {
    await expect(
      createPageLayout(TENANT_ID, 'nonexistent', {
        name: 'Test',
        layout: VALID_LAYOUT_JSON,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('throws VALIDATION_ERROR for empty name', async () => {
    await expect(
      createPageLayout(TENANT_ID, 'obj-1', {
        name: '',
        layout: VALID_LAYOUT_JSON,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('throws VALIDATION_ERROR for invalid layout', async () => {
    await expect(
      createPageLayout(TENANT_ID, 'obj-1', {
        name: 'Test',
        layout: { header: {} } as unknown as typeof VALID_LAYOUT_JSON,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});

// ─── Tests: listPageLayouts ──────────────────────────────────────────────────

describe('listPageLayouts', () => {
  beforeEach(() => {
    fakeObjects.clear();
    fakePageLayouts.clear();
    mockQuery.mockClear();
    fakeObjects.set('obj-1', { id: 'obj-1', tenant_id: TENANT_ID });
  });

  it('returns all page layouts for an object', async () => {
    fakePageLayouts.set('pl1', {
      id: 'pl1', tenant_id: TENANT_ID, object_id: 'obj-1',
      name: 'Default', role: null, is_default: true,
      layout: VALID_LAYOUT_JSON, published_layout: null,
      version: 1, status: 'draft',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      published_at: null,
    });

    const result = await listPageLayouts(TENANT_ID, 'obj-1');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Default');
  });

  it('throws NOT_FOUND when object does not exist', async () => {
    await expect(listPageLayouts(TENANT_ID, 'nonexistent')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

// ─── Tests: getPageLayoutById ────────────────────────────────────────────────

describe('getPageLayoutById', () => {
  beforeEach(() => {
    fakeObjects.clear();
    fakePageLayouts.clear();
    mockQuery.mockClear();
    fakeObjects.set('obj-1', { id: 'obj-1', tenant_id: TENANT_ID });
  });

  it('returns a page layout by id', async () => {
    fakePageLayouts.set('pl1', {
      id: 'pl1', tenant_id: TENANT_ID, object_id: 'obj-1',
      name: 'Default', role: null, is_default: true,
      layout: VALID_LAYOUT_JSON, published_layout: null,
      version: 1, status: 'draft',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      published_at: null,
    });

    const result = await getPageLayoutById(TENANT_ID, 'obj-1', 'pl1');
    expect(result.id).toBe('pl1');
    expect(result.name).toBe('Default');
  });

  it('throws NOT_FOUND when layout does not exist', async () => {
    await expect(getPageLayoutById(TENANT_ID, 'obj-1', 'nonexistent')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

// ─── Tests: deletePageLayout ─────────────────────────────────────────────────

describe('deletePageLayout', () => {
  beforeEach(() => {
    fakeObjects.clear();
    fakePageLayouts.clear();
    mockQuery.mockClear();
    fakeObjects.set('obj-1', { id: 'obj-1', tenant_id: TENANT_ID });
  });

  it('deletes a non-default layout', async () => {
    fakePageLayouts.set('pl1', {
      id: 'pl1', tenant_id: TENANT_ID, object_id: 'obj-1',
      name: 'Custom', role: null, is_default: false,
      layout: VALID_LAYOUT_JSON, published_layout: null,
      version: 1, status: 'draft',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      published_at: null,
    });

    await deletePageLayout(TENANT_ID, 'obj-1', 'pl1');
    expect(fakePageLayouts.has('pl1')).toBe(false);
  });

  it('throws DELETE_BLOCKED for default layouts', async () => {
    fakePageLayouts.set('pl1', {
      id: 'pl1', tenant_id: TENANT_ID, object_id: 'obj-1',
      name: 'Default', role: null, is_default: true,
      layout: VALID_LAYOUT_JSON, published_layout: null,
      version: 1, status: 'draft',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      published_at: null,
    });

    await expect(deletePageLayout(TENANT_ID, 'obj-1', 'pl1')).rejects.toMatchObject({
      code: 'DELETE_BLOCKED',
    });
  });

  it('throws NOT_FOUND when layout does not exist', async () => {
    await expect(deletePageLayout(TENANT_ID, 'obj-1', 'nonexistent')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

// ─── Tests: publishPageLayout ────────────────────────────────────────────────

describe('publishPageLayout', () => {
  beforeEach(() => {
    fakeObjects.clear();
    fakePageLayouts.clear();
    fakePageLayoutVersions.clear();
    mockQuery.mockClear();
    fakeObjects.set('obj-1', { id: 'obj-1', tenant_id: TENANT_ID });
  });

  it('publishes a layout and creates a version snapshot', async () => {
    fakePageLayouts.set('pl1', {
      id: 'pl1', tenant_id: TENANT_ID, object_id: 'obj-1',
      name: 'Default', role: null, is_default: true,
      layout: VALID_LAYOUT_JSON, published_layout: null,
      version: 1, status: 'draft',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      published_at: null,
    });

    const result = await publishPageLayout(TENANT_ID, 'obj-1', 'pl1', 'user-123');

    expect(result.status).toBe('published');
    expect(result.version).toBe(2);
    expect(result.publishedLayout).toEqual(VALID_LAYOUT_JSON);
    expect(fakePageLayoutVersions.size).toBe(1);
  });

  it('throws NOT_FOUND when layout does not exist', async () => {
    await expect(
      publishPageLayout(TENANT_ID, 'obj-1', 'nonexistent', 'user-123'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

// ─── Tests: updatePageLayout ─────────────────────────────────────────────────

describe('updatePageLayout', () => {
  beforeEach(() => {
    fakeObjects.clear();
    fakePageLayouts.clear();
    mockQuery.mockClear();
    fakeObjects.set('obj-1', { id: 'obj-1', tenant_id: TENANT_ID });
  });

  it('updates a page layout name', async () => {
    fakePageLayouts.set('pl1', {
      id: 'pl1', tenant_id: TENANT_ID, object_id: 'obj-1',
      name: 'Original', role: null, is_default: false,
      layout: VALID_LAYOUT_JSON, published_layout: null,
      version: 1, status: 'draft',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      published_at: null,
    });

    const result = await updatePageLayout(TENANT_ID, 'obj-1', 'pl1', { name: 'Updated' });
    expect(result.name).toBe('Updated');
  });

  it('updates a page layout draft', async () => {
    fakePageLayouts.set('pl1', {
      id: 'pl1', tenant_id: TENANT_ID, object_id: 'obj-1',
      name: 'Default', role: null, is_default: false,
      layout: VALID_LAYOUT_JSON, published_layout: null,
      version: 1, status: 'draft',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      published_at: null,
    });

    const newLayout = {
      ...VALID_LAYOUT_JSON,
      header: { ...VALID_LAYOUT_JSON.header, primaryField: 'title' },
    };

    const result = await updatePageLayout(TENANT_ID, 'obj-1', 'pl1', { layout: newLayout });
    expect(result.layout.header.primaryField).toBe('title');
  });

  it('returns the existing layout when no fields are changed', async () => {
    fakePageLayouts.set('pl1', {
      id: 'pl1', tenant_id: TENANT_ID, object_id: 'obj-1',
      name: 'Default', role: null, is_default: false,
      layout: VALID_LAYOUT_JSON, published_layout: null,
      version: 1, status: 'draft',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      published_at: null,
    });

    const result = await updatePageLayout(TENANT_ID, 'obj-1', 'pl1', {});
    expect(result.name).toBe('Default');
  });

  it('throws NOT_FOUND when layout does not exist', async () => {
    await expect(
      updatePageLayout(TENANT_ID, 'obj-1', 'nonexistent', { name: 'New' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('throws VALIDATION_ERROR for empty name', async () => {
    fakePageLayouts.set('pl1', {
      id: 'pl1', tenant_id: TENANT_ID, object_id: 'obj-1',
      name: 'Original', role: null, is_default: false,
      layout: VALID_LAYOUT_JSON, published_layout: null,
      version: 1, status: 'draft',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      published_at: null,
    });

    await expect(
      updatePageLayout(TENANT_ID, 'obj-1', 'pl1', { name: '' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('throws VALIDATION_ERROR for invalid layout', async () => {
    fakePageLayouts.set('pl1', {
      id: 'pl1', tenant_id: TENANT_ID, object_id: 'obj-1',
      name: 'Original', role: null, is_default: false,
      layout: VALID_LAYOUT_JSON, published_layout: null,
      version: 1, status: 'draft',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      published_at: null,
    });

    await expect(
      updatePageLayout(TENANT_ID, 'obj-1', 'pl1', {
        layout: { header: {} } as unknown as typeof VALID_LAYOUT_JSON,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});

// ─── Tests: listPageLayoutVersions ───────────────────────────────────────────

describe('listPageLayoutVersions', () => {
  beforeEach(() => {
    fakeObjects.clear();
    fakePageLayouts.clear();
    fakePageLayoutVersions.clear();
    mockQuery.mockClear();
    fakeObjects.set('obj-1', { id: 'obj-1', tenant_id: TENANT_ID });
  });

  it('returns version history newest first', async () => {
    fakePageLayouts.set('pl1', {
      id: 'pl1', tenant_id: TENANT_ID, object_id: 'obj-1',
      name: 'Default', role: null, is_default: true,
      layout: VALID_LAYOUT_JSON, published_layout: VALID_LAYOUT_JSON,
      version: 3, status: 'published',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      published_at: new Date().toISOString(),
    });

    fakePageLayoutVersions.set('v1', {
      id: 'v1', layout_id: 'pl1', tenant_id: TENANT_ID,
      version: 1, layout: VALID_LAYOUT_JSON,
      published_by: 'user-1', published_at: new Date().toISOString(),
    });
    fakePageLayoutVersions.set('v2', {
      id: 'v2', layout_id: 'pl1', tenant_id: TENANT_ID,
      version: 2, layout: VALID_LAYOUT_JSON,
      published_by: 'user-2', published_at: new Date().toISOString(),
    });

    const result = await listPageLayoutVersions(TENANT_ID, 'obj-1', 'pl1');
    expect(result).toHaveLength(2);
    expect(result[0].version).toBe(2);
    expect(result[1].version).toBe(1);
  });

  it('returns empty array when no versions exist', async () => {
    fakePageLayouts.set('pl1', {
      id: 'pl1', tenant_id: TENANT_ID, object_id: 'obj-1',
      name: 'Default', role: null, is_default: true,
      layout: VALID_LAYOUT_JSON, published_layout: null,
      version: 1, status: 'draft',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      published_at: null,
    });

    const result = await listPageLayoutVersions(TENANT_ID, 'obj-1', 'pl1');
    expect(result).toHaveLength(0);
  });

  it('throws NOT_FOUND when layout does not exist', async () => {
    await expect(
      listPageLayoutVersions(TENANT_ID, 'obj-1', 'nonexistent'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

// ─── Tests: createPageLayout (CONFLICT) ──────────────────────────────────────

describe('createPageLayout — CONFLICT', () => {
  beforeEach(() => {
    fakeObjects.clear();
    fakePageLayouts.clear();
    mockQuery.mockClear();
    fakeObjects.set('obj-1', { id: 'obj-1', tenant_id: TENANT_ID });
  });

  it('throws CONFLICT when a layout already exists for the same object/role', async () => {
    fakePageLayouts.set('existing', {
      id: 'existing', tenant_id: TENANT_ID, object_id: 'obj-1',
      name: 'Existing', role: null, is_default: true,
      layout: VALID_LAYOUT_JSON, published_layout: null,
      version: 1, status: 'draft',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      published_at: null,
    });

    await expect(
      createPageLayout(TENANT_ID, 'obj-1', {
        name: 'Duplicate',
        layout: VALID_LAYOUT_JSON,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('throws CONFLICT when a layout exists for the same named role', async () => {
    fakePageLayouts.set('existing', {
      id: 'existing', tenant_id: TENANT_ID, object_id: 'obj-1',
      name: 'Admin Layout', role: 'admin', is_default: false,
      layout: VALID_LAYOUT_JSON, published_layout: null,
      version: 1, status: 'draft',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      published_at: null,
    });

    await expect(
      createPageLayout(TENANT_ID, 'obj-1', {
        name: 'Another Admin Layout',
        role: 'admin',
        layout: VALID_LAYOUT_JSON,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});
