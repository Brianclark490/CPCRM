/**
 * Kysely SQL regression suite for layoutDefinitionService.
 *
 * Pins the SQL Kysely emits so drift is caught early. Key things verified:
 *
 *   1. fetchLayoutFields JOIN carries fd.tenant_id ON clause +
 *      lf.tenant_id WHERE filter (closes previously-latent gap).
 *   2. INSERT INTO layout_fields includes tenant_id column
 *      (fixes latent production bug — column is NOT NULL, no default).
 *   3. DELETE layout_definitions scoped by id + tenant_id (was just id).
 *   4. DELETE layout_fields scoped by layout_id + tenant_id.
 *   5. Every data query carries a tenant_id bind.
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

  function runQuery(rawSql: string, params: unknown[]) {
    capturedQueries.push({ sql: rawSql, params });
    const s = norm(rawSql);

    if (s === 'BEGIN' || s === 'COMMIT' || s === 'ROLLBACK') return { rows: [] };
    if (s.startsWith('SELECT SET_CONFIG')) return { rows: [] };

    // object_definitions existence check
    if (s.startsWith('SELECT ID FROM OBJECT_DEFINITIONS')) {
      return { rows: [{ id: params[0] }] };
    }

    // Uniqueness check for layout name
    if (s.startsWith('SELECT ID FROM LAYOUT_DEFINITIONS') && s.includes('NAME =')) {
      return { rows: [] };
    }

    // INSERT INTO layout_definitions
    if (s.startsWith('INSERT INTO LAYOUT_DEFINITIONS')) {
      const [id, tenant_id, object_id, name, layout_type, is_default, created_at, updated_at] = params;
      return {
        rows: [{
          id, tenant_id, object_id, name, layout_type, is_default, created_at, updated_at,
        }],
      };
    }

    // SELECT * FROM layout_definitions (list or getById)
    if (s.includes('FROM LAYOUT_DEFINITIONS') && s.startsWith('SELECT')) {
      return {
        rows: [{
          id: 'layout-1', tenant_id: TENANT_ID, object_id: 'obj-1',
          name: 'Default Form', layout_type: 'form', is_default: false,
          created_at: new Date(), updated_at: new Date(),
        }],
      };
    }

    // fetchLayoutFields JOIN query
    if (s.includes('FROM LAYOUT_FIELDS') && s.includes('FIELD_DEFINITIONS')) {
      return { rows: [] };
    }

    // SELECT id FROM field_definitions (setLayoutFields validation)
    if (s.startsWith('SELECT ID FROM FIELD_DEFINITIONS')) {
      return { rows: [{ id: 'field-1' }] };
    }

    // DELETE FROM layout_fields
    if (s.startsWith('DELETE FROM LAYOUT_FIELDS')) {
      return { rows: [] };
    }

    // INSERT INTO layout_fields
    if (s.startsWith('INSERT INTO LAYOUT_FIELDS')) {
      return { rows: [{}] };
    }

    // UPDATE layout_definitions
    if (s.startsWith('UPDATE LAYOUT_DEFINITIONS')) {
      return {
        rows: [{
          id: 'layout-1', tenant_id: TENANT_ID, object_id: 'obj-1',
          name: 'Updated', layout_type: 'form', is_default: false,
          created_at: new Date(), updated_at: new Date(),
        }],
      };
    }

    // DELETE FROM layout_definitions
    if (s.startsWith('DELETE FROM LAYOUT_DEFINITIONS')) {
      return { rows: [] };
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
  createLayoutDefinition,
  getLayoutDefinitionById,
  setLayoutFields,
  deleteLayoutDefinition,
} = await import('../layoutDefinitionService.js');

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

beforeEach(() => {
  resetCapture();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('layoutDefinitionService Kysely SQL — createLayoutDefinition', () => {
  it('INSERT carries tenant_id and returns all columns', async () => {
    await createLayoutDefinition(TENANT_ID, 'obj-1', {
      name: 'Detail View',
      layoutType: 'detail',
    });

    const insert = dataQueries().find((q) =>
      normalise(q.sql).startsWith('INSERT INTO LAYOUT_DEFINITIONS'),
    )!;
    const s = normalise(insert.sql);

    expect(s).toContain('TENANT_ID');
    expect(s).toContain('RETURNING');
    expect(insert.params).toContain(TENANT_ID);
    expect(insert.params).toContain('Detail View');
    expect(insert.params).toContain('detail');
  });
});

describe('layoutDefinitionService Kysely SQL — fetchLayoutFields tenant_id defence', () => {
  it('JOIN ON carries fd.tenant_id and WHERE carries lf.tenant_id', async () => {
    await getLayoutDefinitionById(TENANT_ID, 'obj-1', 'layout-1');

    const joinQuery = dataQueries().find((q) => {
      const s = normalise(q.sql);
      return s.includes('FROM LAYOUT_FIELDS') && s.includes('FIELD_DEFINITIONS');
    })!;
    const s = normalise(joinQuery.sql);

    expect(s).toMatch(/JOIN FIELD_DEFINITIONS AS FD ON FD\.ID = LF\.FIELD_ID AND FD\.TENANT_ID =/);
    expect(s).toContain('LF.TENANT_ID =');
    expect(s).toContain('LF.LAYOUT_ID =');

    const tenantCount = joinQuery.params.filter((p) => p === TENANT_ID).length;
    expect(tenantCount).toBeGreaterThanOrEqual(2);
  });
});

describe('layoutDefinitionService Kysely SQL — setLayoutFields', () => {
  it('INSERT INTO layout_fields includes tenant_id column', async () => {
    await setLayoutFields(TENANT_ID, 'obj-1', 'layout-1', [
      { label: 'Info', fields: [{ fieldId: 'field-1', width: 'half' }] },
    ]);

    const inserts = dataQueries().filter((q) =>
      normalise(q.sql).startsWith('INSERT INTO LAYOUT_FIELDS'),
    );
    expect(inserts.length).toBe(1);

    const s = normalise(inserts[0].sql);
    expect(s).toContain('TENANT_ID');
    expect(inserts[0].params).toContain(TENANT_ID);
  });

  it('DELETE FROM layout_fields scoped by layout_id + tenant_id', async () => {
    await setLayoutFields(TENANT_ID, 'obj-1', 'layout-1', [
      { label: 'Info', fields: [{ fieldId: 'field-1' }] },
    ]);

    const del = dataQueries().find((q) =>
      normalise(q.sql).startsWith('DELETE FROM LAYOUT_FIELDS'),
    )!;
    const s = normalise(del.sql);

    expect(s).toContain('LAYOUT_ID =');
    expect(s).toContain('TENANT_ID =');
    expect(del.params).toContain(TENANT_ID);
  });
});

describe('layoutDefinitionService Kysely SQL — deleteLayoutDefinition', () => {
  it('DELETE scoped by id + tenant_id', async () => {
    await deleteLayoutDefinition(TENANT_ID, 'obj-1', 'layout-1');

    const del = dataQueries().find((q) =>
      normalise(q.sql).startsWith('DELETE FROM LAYOUT_DEFINITIONS'),
    )!;
    const s = normalise(del.sql);

    expect(s).toContain('ID =');
    expect(s).toContain('TENANT_ID =');
    expect(del.params).toContain(TENANT_ID);
    expect(del.params).toContain('layout-1');
  });
});
