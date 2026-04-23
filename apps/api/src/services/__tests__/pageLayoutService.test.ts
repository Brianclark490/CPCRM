import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createPageLayout,
  listPageLayouts,
  getPageLayoutById,
  updatePageLayout,
  publishPageLayout,
  listPageLayoutVersions,
  deletePageLayout,
  copyLayout,
  revertLayout,
  validatePageLayoutName,
  validateLayoutJson,
  normalizeLayout,
} from '../pageLayoutService.js';
import type { PageLayoutJson } from '../pageLayoutService.js';

const TENANT_ID = 'test-tenant-001';

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ─── Fake DB pool ─────────────────────────────────────────────────────────────

const { fakeObjects, fakePageLayouts, fakePageLayoutVersions, mockQuery, mockConnect } = vi.hoisted(() => {
  const fakeObjects = new Map<string, Record<string, unknown>>();
  const fakePageLayouts = new Map<string, Record<string, unknown>>();
  const fakePageLayoutVersions = new Map<string, Record<string, unknown>>();

  function normaliseCall(sqlOrQuery: unknown, paramsArg?: unknown[]) {
    if (typeof sqlOrQuery === 'string') {
      return { sql: sqlOrQuery, params: paramsArg ?? [] };
    }
    const q = sqlOrQuery as { text: string; values?: unknown[] };
    return { sql: q.text, params: q.values ?? [] };
  }

  function runQuery(rawSql: string, params: unknown[]) {
    const s = rawSql.replace(/\s+/g, ' ').replace(/"/g, '').trim().toUpperCase();

    if (s === 'BEGIN' || s === 'COMMIT' || s === 'ROLLBACK') return { rows: [] };
    if (s.startsWith('SELECT SET_CONFIG')) return { rows: [] };

    // SELECT id FROM object_definitions WHERE id = $1 AND tenant_id = $2
    if (s.startsWith('SELECT ID FROM OBJECT_DEFINITIONS WHERE ID')) {
      const id = params[0] as string;
      const row = fakeObjects.get(id);
      if (row) return { rows: [{ id: row.id }] };
      return { rows: [] };
    }

    // SELECT id FROM page_layouts WHERE tenant_id = ... (conflict check)
    if (s.startsWith('SELECT ID FROM PAGE_LAYOUTS WHERE TENANT_ID')) {
      const tenantId = params[0] as string;
      const objectId = params[1] as string;
      const hasExclude = s.includes('ID !=');
      const isNullRole = s.includes('IS NULL');

      let excludeId: string | undefined;
      let role: string | null;

      if (hasExclude) {
        excludeId = params[2] as string;
        role = isNullRole ? null : (params[3] as string);
      } else {
        role = isNullRole ? null : (params[2] as string);
      }

      const match = [...fakePageLayouts.values()].find((l) => {
        if (l.tenant_id !== tenantId || l.object_id !== objectId) return false;
        if (excludeId && l.id === excludeId) return false;
        if (role === null) return l.role === null || l.role === undefined;
        return l.role === role;
      });

      if (match) return { rows: [{ id: match.id }] };
      return { rows: [] };
    }

    // ── page_layout_versions (more specific, must precede page_layouts) ──

    // INSERT INTO page_layout_versions
    if (s.startsWith('INSERT INTO PAGE_LAYOUT_VERSIONS')) {
      const [id, layout_id, tenant_id, version, layout, published_by, published_at] = params as unknown[];
      const row: Record<string, unknown> = {
        id, layout_id, tenant_id, version, layout, published_by, published_at,
      };
      fakePageLayoutVersions.set(id as string, row);
      return { rows: [row] };
    }

    // SELECT * FROM page_layout_versions
    if (s.includes('FROM PAGE_LAYOUT_VERSIONS') && s.startsWith('SELECT')) {
      const layoutId = params[0] as string;
      const tenantId = params[1] as string;
      const version = params.length > 2 ? (params[2] as number) : undefined;
      const rows = [...fakePageLayoutVersions.values()]
        .filter((v) => {
          if (v.layout_id !== layoutId || v.tenant_id !== tenantId) return false;
          if (version !== undefined) return v.version === version;
          return true;
        })
        .sort((a, b) => (b.version as number) - (a.version as number));
      return { rows };
    }

    // ── page_layouts ─────────────────────────────────────────────────────

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

    // SELECT * FROM page_layouts ... ORDER BY (list)
    if (s.includes('FROM PAGE_LAYOUTS') && s.startsWith('SELECT') && s.includes('ORDER BY')) {
      const tenantId = params[0] as string;
      const objectId = params[1] as string;
      const rows = [...fakePageLayouts.values()]
        .filter((l) => l.tenant_id === tenantId && l.object_id === objectId)
        .sort((a, b) => (a.name as string).localeCompare(b.name as string));
      return { rows };
    }

    // SELECT ... FROM page_layouts WHERE id = ... (getById / existence check)
    if (s.includes('FROM PAGE_LAYOUTS') && s.startsWith('SELECT') && s.includes('WHERE ID =')) {
      const id = params[0] as string;
      const row = fakePageLayouts.get(id);
      if (row && row.tenant_id === params[1] && row.object_id === params[2]) {
        return { rows: [row] };
      }
      return { rows: [] };
    }

    // UPDATE page_layouts SET ...
    if (s.startsWith('UPDATE PAGE_LAYOUTS SET')) {
      let layoutId: string | undefined;
      for (const p of params) {
        if (typeof p === 'string' && fakePageLayouts.has(p)) {
          layoutId = p;
          break;
        }
      }
      const row = layoutId ? fakePageLayouts.get(layoutId) : undefined;
      if (row) {
        if (s.includes('PUBLISHED_LAYOUT = LAYOUT')) {
          // Publish: SET published_layout=layout (column ref), version=$1, status=$2, published_at=$3, updated_at=$4
          row.published_layout = row.layout;
          const [version, _status, published_at, updated_at] = params;
          row.version = version;
          row.status = 'published';
          row.published_at = published_at;
          row.updated_at = updated_at;
        } else {
          // General / copy / revert update
          let paramIdx = 0;
          if (s.includes('NAME =')) { row.name = params[paramIdx++]; }
          if (s.includes('ROLE =')) { row.role = params[paramIdx++]; }
          if (s.includes('LAYOUT =')) {
            const val = params[paramIdx++];
            row.layout = typeof val === 'string' ? JSON.parse(val as string) : val;
          }
          if (s.includes('IS_DEFAULT =')) { row.is_default = params[paramIdx++]; }
          row.updated_at = params[paramIdx] ?? new Date();
        }
        return { rows: [row] };
      }
      return { rows: [] };
    }

    // DELETE FROM page_layouts
    if (s.startsWith('DELETE FROM PAGE_LAYOUTS')) {
      for (const p of params) {
        if (typeof p === 'string' && fakePageLayouts.has(p)) {
          fakePageLayouts.delete(p);
          break;
        }
      }
      return { rows: [] };
    }

    return { rows: [] };
  }

  const mockQuery = vi.fn(async (sqlOrQuery: unknown, paramsArg?: unknown[]) => {
    const { sql, params } = normaliseCall(sqlOrQuery, paramsArg);
    return runQuery(sql, params);
  });

  const mockConnect = vi.fn(async () => ({
    query: vi.fn(async (sqlOrQuery: unknown, paramsArg?: unknown[]) => {
      const { sql, params } = normaliseCall(sqlOrQuery, paramsArg);
      return runQuery(sql, params);
    }),
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
    // Read path normalises zones onto legacy-shaped layouts.
    expect(result.layout).toEqual({
      ...VALID_LAYOUT_JSON,
      zones: { kpi: [], leftRail: [], rightRail: [] },
    });
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
    expect(result.publishedLayout).toEqual({
      ...VALID_LAYOUT_JSON,
      zones: { kpi: [], leftRail: [], rightRail: [] },
    });
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

// ─── Tests: copyLayout ──────────────────────────────────────────────────────

describe('copyLayout', () => {
  beforeEach(() => {
    fakeObjects.clear();
    fakePageLayouts.clear();
    mockQuery.mockClear();
    fakeObjects.set('obj-1', { id: 'obj-1', tenant_id: TENANT_ID });
  });

  it('copies layout JSON from source to target', async () => {
    const sourceLayout = {
      ...VALID_LAYOUT_JSON,
      header: { ...VALID_LAYOUT_JSON.header, primaryField: 'source_field' },
    };

    fakePageLayouts.set('source-pl', {
      id: 'source-pl', tenant_id: TENANT_ID, object_id: 'obj-1',
      name: 'Default', role: null, is_default: true,
      layout: sourceLayout, published_layout: null,
      version: 1, status: 'draft',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      published_at: null,
    });

    fakePageLayouts.set('target-pl', {
      id: 'target-pl', tenant_id: TENANT_ID, object_id: 'obj-1',
      name: 'Manager', role: 'manager', is_default: false,
      layout: VALID_LAYOUT_JSON, published_layout: null,
      version: 1, status: 'draft',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      published_at: null,
    });

    const result = await copyLayout(TENANT_ID, 'obj-1', 'target-pl', 'source-pl');
    expect(result.layout.header.primaryField).toBe('source_field');
  });

  it('throws NOT_FOUND when source layout does not exist', async () => {
    fakePageLayouts.set('target-pl', {
      id: 'target-pl', tenant_id: TENANT_ID, object_id: 'obj-1',
      name: 'Manager', role: 'manager', is_default: false,
      layout: VALID_LAYOUT_JSON, published_layout: null,
      version: 1, status: 'draft',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      published_at: null,
    });

    await expect(
      copyLayout(TENANT_ID, 'obj-1', 'target-pl', 'nonexistent'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('throws NOT_FOUND when target layout does not exist', async () => {
    fakePageLayouts.set('source-pl', {
      id: 'source-pl', tenant_id: TENANT_ID, object_id: 'obj-1',
      name: 'Default', role: null, is_default: true,
      layout: VALID_LAYOUT_JSON, published_layout: null,
      version: 1, status: 'draft',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      published_at: null,
    });

    await expect(
      copyLayout(TENANT_ID, 'obj-1', 'nonexistent', 'source-pl'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('throws NOT_FOUND when object does not exist', async () => {
    await expect(
      copyLayout(TENANT_ID, 'nonexistent', 'target-pl', 'source-pl'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

// ─── Tests: revertLayout ────────────────────────────────────────────────────

describe('revertLayout', () => {
  beforeEach(() => {
    fakeObjects.clear();
    fakePageLayouts.clear();
    fakePageLayoutVersions.clear();
    mockQuery.mockClear();
    fakeObjects.set('obj-1', { id: 'obj-1', tenant_id: TENANT_ID });
  });

  it('restores layout from a version snapshot', async () => {
    const oldLayout = {
      ...VALID_LAYOUT_JSON,
      header: { ...VALID_LAYOUT_JSON.header, primaryField: 'old_field' },
    };

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
      version: 1, layout: oldLayout,
      published_by: 'user-1', published_at: new Date().toISOString(),
    });

    const result = await revertLayout(TENANT_ID, 'obj-1', 'pl1', 1);
    expect(result.layout.header.primaryField).toBe('old_field');
  });

  it('throws NOT_FOUND when layout does not exist', async () => {
    await expect(
      revertLayout(TENANT_ID, 'obj-1', 'nonexistent', 1),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('throws NOT_FOUND when version does not exist', async () => {
    fakePageLayouts.set('pl1', {
      id: 'pl1', tenant_id: TENANT_ID, object_id: 'obj-1',
      name: 'Default', role: null, is_default: true,
      layout: VALID_LAYOUT_JSON, published_layout: null,
      version: 1, status: 'draft',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      published_at: null,
    });

    await expect(
      revertLayout(TENANT_ID, 'obj-1', 'pl1', 99),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('throws NOT_FOUND when object does not exist', async () => {
    await expect(
      revertLayout(TENANT_ID, 'nonexistent', 'pl1', 1),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

// ─── Tests: normalizeLayout / zones schema ──────────────────────────────────

describe('normalizeLayout', () => {
  it('fills zones with empty arrays when missing (legacy layout)', () => {
    const normalized = normalizeLayout(VALID_LAYOUT_JSON as PageLayoutJson);
    expect(normalized.zones).toEqual({ kpi: [], leftRail: [], rightRail: [] });
    expect(normalized.tabs).toEqual(VALID_LAYOUT_JSON.tabs);
    expect(normalized.header).toEqual(VALID_LAYOUT_JSON.header);
  });

  it('round-trips a populated layout unchanged', () => {
    const newShape: PageLayoutJson = {
      ...VALID_LAYOUT_JSON,
      zones: {
        kpi: [{ id: 'k-1', type: 'field', config: { fieldId: 'uuid-1' } }],
        leftRail: [
          { id: 'lr-1', type: 'field_section', label: 'Left', columns: 1, components: [] },
        ],
        rightRail: [],
      },
    };
    const normalized = normalizeLayout(newShape);
    expect(normalized.zones).toEqual(newShape.zones);
    // Idempotent on re-normalise.
    expect(normalizeLayout(normalized)).toEqual(normalized);
  });

  it('fills missing rail arrays when zones is partially populated', () => {
    const partial: PageLayoutJson = {
      ...VALID_LAYOUT_JSON,
      zones: {
        kpi: [{ id: 'k-1', type: 'kpi', config: {} }],
      } as PageLayoutJson['zones'],
    };
    const normalized = normalizeLayout(partial);
    expect(normalized.zones?.kpi).toHaveLength(1);
    expect(normalized.zones?.leftRail).toEqual([]);
    expect(normalized.zones?.rightRail).toEqual([]);
  });

  it('does not mutate the input layout', () => {
    const snapshot = JSON.parse(JSON.stringify(VALID_LAYOUT_JSON));
    normalizeLayout(VALID_LAYOUT_JSON as PageLayoutJson);
    expect(VALID_LAYOUT_JSON).toEqual(snapshot);
  });
});

describe('validateLayoutJson — zones', () => {
  it('accepts a layout with no zones (legacy shape)', () => {
    expect(validateLayoutJson(VALID_LAYOUT_JSON)).toBeNull();
  });

  it('accepts a layout with a fully populated zones object', () => {
    const layout = {
      ...VALID_LAYOUT_JSON,
      zones: {
        kpi: [{ id: 'k-1', type: 'field', config: { fieldId: 'uuid-1' } }],
        leftRail: [
          { id: 'lr-1', type: 'field_section', label: 'Left', columns: 1, components: [] },
        ],
        rightRail: [],
      },
    };
    expect(validateLayoutJson(layout)).toBeNull();
  });

  it('rejects zones when it is not an object', () => {
    const layout = { ...VALID_LAYOUT_JSON, zones: 'not-an-object' };
    expect(validateLayoutJson(layout)).toContain('layout.zones');
  });

  it('rejects zones when it is an array (typeof array === "object")', () => {
    const layout = { ...VALID_LAYOUT_JSON, zones: [] };
    expect(validateLayoutJson(layout)).toContain('layout.zones');
  });

  it('rejects zones.kpi when it is not an array', () => {
    const layout = { ...VALID_LAYOUT_JSON, zones: { kpi: 'oops' } };
    expect(validateLayoutJson(layout)).toContain('layout.zones.kpi');
  });

  it('rejects zones.leftRail with an invalid section type', () => {
    const layout = {
      ...VALID_LAYOUT_JSON,
      zones: {
        leftRail: [
          { id: 'lr-1', type: 'invalid', label: 'Left', columns: 1, components: [] },
        ],
      },
    };
    expect(validateLayoutJson(layout)).toContain('zones.leftRail');
  });

  it('rejects a kpi component with an unknown type', () => {
    const layout = {
      ...VALID_LAYOUT_JSON,
      zones: {
        kpi: [{ id: 'k-1', type: 'nonexistent-type', config: {} }],
      },
    };
    expect(validateLayoutJson(layout)).toContain('zones.kpi');
  });
});

// ─── Tests: service read-path normalises zones ───────────────────────────────

describe('pageLayoutService read paths normalise zones', () => {
  beforeEach(() => {
    fakeObjects.clear();
    fakePageLayouts.clear();
    fakePageLayoutVersions.clear();
    mockQuery.mockClear();
    fakeObjects.set('obj-1', { id: 'obj-1', tenant_id: TENANT_ID });
  });

  it('getPageLayoutById fills zones on a legacy-shaped layout', async () => {
    fakePageLayouts.set('pl1', {
      id: 'pl1', tenant_id: TENANT_ID, object_id: 'obj-1',
      name: 'Default', role: null, is_default: true,
      layout: VALID_LAYOUT_JSON, published_layout: VALID_LAYOUT_JSON,
      version: 1, status: 'published',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      published_at: new Date().toISOString(),
    });

    const result = await getPageLayoutById(TENANT_ID, 'obj-1', 'pl1');
    expect(result.layout.zones).toEqual({ kpi: [], leftRail: [], rightRail: [] });
    expect(result.publishedLayout?.zones).toEqual({ kpi: [], leftRail: [], rightRail: [] });
  });

  it('listPageLayoutVersions normalises each version layout', async () => {
    fakePageLayouts.set('pl1', {
      id: 'pl1', tenant_id: TENANT_ID, object_id: 'obj-1',
      name: 'Default', role: null, is_default: true,
      layout: VALID_LAYOUT_JSON, published_layout: null,
      version: 1, status: 'draft',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      published_at: null,
    });
    fakePageLayoutVersions.set('v1', {
      id: 'v1', layout_id: 'pl1', tenant_id: TENANT_ID,
      version: 1, layout: VALID_LAYOUT_JSON,
      published_by: 'user-1', published_at: new Date().toISOString(),
    });

    const versions = await listPageLayoutVersions(TENANT_ID, 'obj-1', 'pl1');
    expect(versions).toHaveLength(1);
    expect(versions[0].layout.zones).toEqual({ kpi: [], leftRail: [], rightRail: [] });
  });
});
