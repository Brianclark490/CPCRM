/**
 * Kysely SQL regression suite for pageLayoutService.
 *
 * Pins the SQL Kysely emits so drift is caught early. Key things verified:
 *
 *   1. publishPageLayout uses db.transaction() — no manual BEGIN/COMMIT
 *      envelope; instead UPDATE + INSERT version run inside a Kysely
 *      transaction (the driver wraps them in BEGIN/COMMIT).
 *   2. Conflict check uses IS NULL for null role (no parameter binding).
 *   3. DELETE scoped by id + tenant_id.
 *   4. Every data query carries a tenant_id bind.
 *   5. UPDATE + INSERT version within publish carry correct column sets.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const TENANT_ID = 'sql-tenant-001';

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ─── SQL capture ──────────────────────────────────────────────────────────────

interface CapturedQuery {
  sql: string;
  params: unknown[];
}

const { capturedQueries, mockQuery, mockConnect, resetCapture } = vi.hoisted(() => {
  const capturedQueries: CapturedQuery[] = [];

  function norm(rawSql: string): string {
    return rawSql.replace(/\s+/g, ' ').replace(/"/g, '').trim().toUpperCase();
  }

  const VALID_LAYOUT = JSON.stringify({
    header: { primaryField: 'name' },
    tabs: [{ id: 't1', label: 'Tab', sections: [] }],
  });

  function runQuery(rawSql: string, params: unknown[]) {
    capturedQueries.push({ sql: rawSql, params });
    const s = norm(rawSql);

    if (s === 'BEGIN' || s === 'COMMIT' || s === 'ROLLBACK') return { rows: [] };
    if (s.startsWith('SELECT SET_CONFIG')) return { rows: [] };

    // object_definitions existence check
    if (s.startsWith('SELECT ID FROM OBJECT_DEFINITIONS')) {
      return { rows: [{ id: params[0] }] };
    }

    // Conflict check for page_layouts
    if (s.startsWith('SELECT ID FROM PAGE_LAYOUTS WHERE TENANT_ID')) {
      return { rows: [] };
    }

    // INSERT INTO page_layout_versions
    if (s.startsWith('INSERT INTO PAGE_LAYOUT_VERSIONS')) {
      return { rows: [{}] };
    }

    // INSERT INTO page_layouts
    if (s.startsWith('INSERT INTO PAGE_LAYOUTS')) {
      const [id, tenant_id, object_id, name, role, is_default, layout, version, status, created_at, updated_at] = params as unknown[];
      return {
        rows: [{
          id, tenant_id, object_id, name, role, is_default,
          layout, published_layout: null, version, status,
          created_at, updated_at, published_at: null,
        }],
      };
    }

    // SELECT * FROM page_layouts ... ORDER BY (list)
    if (s.includes('FROM PAGE_LAYOUTS') && s.startsWith('SELECT') && s.includes('ORDER BY')) {
      return { rows: [] };
    }

    // SELECT from page_layouts by id (getById / existence)
    if (s.includes('FROM PAGE_LAYOUTS') && s.startsWith('SELECT')) {
      return {
        rows: [{
          id: 'pl-1', tenant_id: TENANT_ID, object_id: 'obj-1',
          name: 'Default', role: null, is_default: false,
          layout: VALID_LAYOUT, published_layout: null,
          version: 1, status: 'draft',
          created_at: new Date(), updated_at: new Date(), published_at: null,
        }],
      };
    }

    // UPDATE page_layouts
    if (s.startsWith('UPDATE PAGE_LAYOUTS')) {
      return {
        rows: [{
          id: 'pl-1', tenant_id: TENANT_ID, object_id: 'obj-1',
          name: 'Default', role: null, is_default: false,
          layout: VALID_LAYOUT, published_layout: VALID_LAYOUT,
          version: 2, status: 'published',
          created_at: new Date(), updated_at: new Date(), published_at: new Date(),
        }],
      };
    }

    // DELETE FROM page_layouts
    if (s.startsWith('DELETE FROM PAGE_LAYOUTS')) {
      return { rows: [] };
    }

    // SELECT from page_layout_versions
    if (s.includes('FROM PAGE_LAYOUT_VERSIONS')) {
      return {
        rows: [{
          id: 'v-1', layout_id: 'pl-1', tenant_id: TENANT_ID,
          version: 1, layout: VALID_LAYOUT,
          published_by: 'user-1', published_at: new Date(),
        }],
      };
    }

    return { rows: [] };
  }

  function normaliseCall(sqlOrQuery: unknown, paramsArg?: unknown[]) {
    if (typeof sqlOrQuery === 'string') {
      return { sql: sqlOrQuery, params: paramsArg ?? [] };
    }
    const q = sqlOrQuery as { text: string; values?: unknown[] };
    return { sql: q.text, params: q.values ?? [] };
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

  function resetCapture() {
    capturedQueries.length = 0;
  }

  return { capturedQueries, mockQuery, mockConnect, resetCapture };
});

vi.mock('../../db/client.js', () => ({
  pool: { query: mockQuery, connect: mockConnect },
}));

const {
  createPageLayout,
  publishPageLayout,
  deletePageLayout,
  updatePageLayout,
  listPageLayouts,
} = await import('../pageLayoutService.js');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalise(sql: string): string {
  return sql.replace(/\s+/g, ' ').replace(/"/g, '').trim().toUpperCase();
}

function dataQueries(): CapturedQuery[] {
  return capturedQueries.filter((q) => {
    const s = normalise(q.sql);
    return (
      s !== 'BEGIN' &&
      s !== 'COMMIT' &&
      s !== 'ROLLBACK' &&
      !s.startsWith('RESET ') &&
      !s.startsWith('SELECT SET_CONFIG')
    );
  });
}

function allQueries(): CapturedQuery[] {
  return capturedQueries;
}

beforeEach(() => {
  resetCapture();
});

const VALID_LAYOUT_JSON = {
  header: { primaryField: 'name', secondaryFields: ['stage'], actions: ['edit'] },
  tabs: [{
    id: 'tab-1', label: 'Details',
    sections: [{
      id: 'sec-1', type: 'field_section', label: 'Info', columns: 2,
      components: [{ id: 'comp-1', type: 'field', config: { fieldId: 'uuid-1', span: 1 } }],
    }],
  }],
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('pageLayoutService Kysely SQL — createPageLayout', () => {
  it('conflict check uses IS NULL for null role (no param binding)', async () => {
    await createPageLayout(TENANT_ID, 'obj-1', {
      name: 'Default Page',
      layout: VALID_LAYOUT_JSON,
    });

    const conflictCheck = dataQueries().find((q) => {
      const s = normalise(q.sql);
      return s.startsWith('SELECT ID FROM PAGE_LAYOUTS WHERE TENANT_ID');
    })!;
    const s = normalise(conflictCheck.sql);

    expect(s).toContain('ROLE IS NULL');
    expect(conflictCheck.params).toContain(TENANT_ID);
    expect(conflictCheck.params).toContain('obj-1');
    expect(conflictCheck.params).not.toContainEqual(null);
  });

  it('conflict check binds role as parameter for non-null role', async () => {
    await createPageLayout(TENANT_ID, 'obj-1', {
      name: 'Admin Page',
      role: 'admin',
      layout: VALID_LAYOUT_JSON,
    });

    const conflictCheck = dataQueries().find((q) => {
      const s = normalise(q.sql);
      return s.startsWith('SELECT ID FROM PAGE_LAYOUTS WHERE TENANT_ID');
    })!;
    const s = normalise(conflictCheck.sql);

    expect(s).toContain('ROLE =');
    expect(s).not.toContain('IS NULL');
    expect(conflictCheck.params).toContain('admin');
  });

  it('INSERT carries tenant_id and JSON-stringified layout', async () => {
    await createPageLayout(TENANT_ID, 'obj-1', {
      name: 'Default Page',
      layout: VALID_LAYOUT_JSON,
    });

    const insert = dataQueries().find((q) =>
      normalise(q.sql).startsWith('INSERT INTO PAGE_LAYOUTS'),
    )!;
    const s = normalise(insert.sql);

    expect(s).toContain('TENANT_ID');
    expect(s).toContain('RETURNING');
    expect(insert.params).toContain(TENANT_ID);
    expect(insert.params).toContain('Default Page');
    const layoutParam = insert.params.find((p) => typeof p === 'string' && p.includes('primaryField'));
    expect(layoutParam).toBeDefined();
  });
});

describe('pageLayoutService Kysely SQL — publishPageLayout', () => {
  it('wraps UPDATE + INSERT version in a Kysely transaction (BEGIN/COMMIT present)', async () => {
    await publishPageLayout(TENANT_ID, 'obj-1', 'pl-1', 'user-123');

    const raw = allQueries().map((q) => normalise(q.sql));
    expect(raw).toContain('BEGIN');
    expect(raw).toContain('COMMIT');

    const beginIdx = raw.indexOf('BEGIN');
    const commitIdx = raw.indexOf('COMMIT');
    expect(beginIdx).toBeLessThan(commitIdx);
  });

  it('UPDATE sets published_layout, version, status, published_at, updated_at', async () => {
    await publishPageLayout(TENANT_ID, 'obj-1', 'pl-1', 'user-123');

    const update = dataQueries().find((q) =>
      normalise(q.sql).startsWith('UPDATE PAGE_LAYOUTS SET'),
    )!;
    const s = normalise(update.sql);

    expect(s).toContain('PUBLISHED_LAYOUT =');
    expect(s).toContain('VERSION =');
    expect(s).toContain('STATUS =');
    expect(s).toContain('PUBLISHED_AT =');
    expect(s).toContain('UPDATED_AT =');
    expect(s).toContain('RETURNING');
    expect(update.params).toContain(TENANT_ID);
  });

  it('INSERT INTO page_layout_versions carries tenant_id and version', async () => {
    await publishPageLayout(TENANT_ID, 'obj-1', 'pl-1', 'user-123');

    const insert = dataQueries().find((q) =>
      normalise(q.sql).startsWith('INSERT INTO PAGE_LAYOUT_VERSIONS'),
    )!;
    const s = normalise(insert.sql);

    expect(s).toContain('TENANT_ID');
    expect(s).toContain('LAYOUT_ID');
    expect(s).toContain('VERSION');
    expect(s).toContain('PUBLISHED_BY');
    expect(insert.params).toContain(TENANT_ID);
    expect(insert.params).toContain('pl-1');
    expect(insert.params).toContain('user-123');
  });
});

describe('pageLayoutService Kysely SQL — deletePageLayout', () => {
  it('DELETE scoped by id + tenant_id', async () => {
    await deletePageLayout(TENANT_ID, 'obj-1', 'pl-1');

    const del = dataQueries().find((q) =>
      normalise(q.sql).startsWith('DELETE FROM PAGE_LAYOUTS'),
    )!;
    const s = normalise(del.sql);

    expect(s).toContain('ID =');
    expect(s).toContain('TENANT_ID =');
    expect(del.params).toContain(TENANT_ID);
    expect(del.params).toContain('pl-1');
  });
});

describe('pageLayoutService Kysely SQL — updatePageLayout', () => {
  it('UPDATE carries tenant_id in WHERE and RETURNING', async () => {
    await updatePageLayout(TENANT_ID, 'obj-1', 'pl-1', { name: 'Renamed' });

    const update = dataQueries().find((q) =>
      normalise(q.sql).startsWith('UPDATE PAGE_LAYOUTS SET'),
    )!;
    const s = normalise(update.sql);

    expect(s).toContain('TENANT_ID =');
    expect(s).toContain('RETURNING');
    expect(update.params).toContain(TENANT_ID);
    expect(update.params).toContain('Renamed');
  });
});

describe('pageLayoutService Kysely SQL — listPageLayouts', () => {
  it('SELECT ordered by name with tenant_id + object_id filter', async () => {
    await listPageLayouts(TENANT_ID, 'obj-1');

    const select = dataQueries().find((q) => {
      const s = normalise(q.sql);
      return s.includes('FROM PAGE_LAYOUTS') && s.includes('ORDER BY');
    })!;
    const s = normalise(select.sql);

    expect(s).toContain('TENANT_ID =');
    expect(s).toContain('OBJECT_ID =');
    expect(s).toMatch(/ORDER BY NAME/);
    expect(select.params).toContain(TENANT_ID);
    expect(select.params).toContain('obj-1');
  });
});
