/**
 * Kysely SQL regression suite for pipelineService.
 *
 * This file complements `pipelineService.test.ts` (which asserts on
 * return values and domain behaviour) by asserting directly on the SQL
 * Kysely emits for each exported service function. It exists to:
 *
 *   1. Catch accidental drift in the generated SQL as Kysely is upgraded
 *      or the service is refactored.
 *   2. Audit that every tenant-scoped query carries a `tenant_id` filter
 *      as defence-in-depth against an RLS misconfiguration (see ADR-006).
 *   3. Verify `createStage` runs inside a Kysely transaction so the
 *      `sort_order` shift and insert are atomic, and that the RLS proxy
 *      (db/client.ts) is exercised via `pool.connect()`.
 *
 * It does not require a real Postgres — the pg pool is mocked and
 * captures the compiled SQL that Kysely hands down.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const TENANT_ID = 'sql-tenant-001';
const OBJECT_ID = 'sql-object-001';

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ─── SQL capture ──────────────────────────────────────────────────────────────

interface CapturedQuery {
  sql: string;
  params: unknown[];
  /** 'pool' = direct pool.query, 'client' = checked-out client (tx or connect) */
  via: 'pool' | 'client';
}

const { capturedQueries, mockQuery, mockConnect, resetCapture } = vi.hoisted(
  () => {
    const capturedQueries: CapturedQuery[] = [];

    // Minimal fake record store so service assertions downstream still pass.
    const fakeObjects = new Map<string, Record<string, unknown>>();
    const fakePipelines = new Map<string, Record<string, unknown>>();
    const fakeStages = new Map<string, Record<string, unknown>>();

    function runQuery(
      rawSql: string,
      params: unknown[] | undefined,
      via: 'pool' | 'client',
    ) {
      capturedQueries.push({ sql: rawSql, params: params ?? [], via });

      // Strip identifier quotes and normalise whitespace so we can pattern-match
      // Kysely's compiled SQL with the same conventions as pipelineService.test.ts.
      const s = rawSql.replace(/\s+/g, ' ').replace(/"/g, '').trim().toUpperCase();

      // Transaction control — return an empty result set.
      if (s === 'BEGIN' || s === 'COMMIT' || s === 'ROLLBACK') {
        return { rows: [] };
      }

      // SELECT id FROM object_definitions WHERE id = $1 AND tenant_id = $2
      if (s.startsWith('SELECT ID FROM OBJECT_DEFINITIONS')) {
        const id = params![0] as string;
        const row = fakeObjects.get(id);
        return row ? { rows: [{ id: row.id }] } : { rows: [] };
      }

      // SELECT id FROM pipeline_definitions WHERE api_name = $1
      if (s.startsWith('SELECT ID FROM PIPELINE_DEFINITIONS WHERE API_NAME')) {
        const apiName = params![0] as string;
        const match = [...fakePipelines.values()].find(
          (r) => r.api_name === apiName,
        );
        return match ? { rows: [{ id: match.id }] } : { rows: [] };
      }

      // SELECT id FROM pipeline_definitions WHERE object_id = $1
      if (s.startsWith('SELECT ID FROM PIPELINE_DEFINITIONS WHERE OBJECT_ID')) {
        const objectId = params![0] as string;
        const rows = [...fakePipelines.values()].filter(
          (r) => r.object_id === objectId,
        );
        return { rows: rows.map((r) => ({ id: r.id })) };
      }

      // SELECT id FROM pipeline_definitions WHERE id = $1 (updateStage/reorderStages)
      if (s.startsWith('SELECT ID FROM PIPELINE_DEFINITIONS WHERE ID')) {
        const id = params![0] as string;
        const row = fakePipelines.get(id);
        return row ? { rows: [{ id: row.id }] } : { rows: [] };
      }

      // INSERT INTO pipeline_definitions
      if (s.startsWith('INSERT INTO PIPELINE_DEFINITIONS')) {
        const [
          id,
          _tenant_id,
          object_id,
          name,
          api_name,
          description,
          is_default,
          is_system,
          owner_id,
          created_at,
          updated_at,
        ] = params as unknown[];
        const row: Record<string, unknown> = {
          id,
          tenant_id: TENANT_ID,
          object_id,
          name,
          api_name,
          description,
          is_default,
          is_system,
          owner_id,
          created_at,
          updated_at,
        };
        fakePipelines.set(id as string, row);
        return { rows: [row] };
      }

      // INSERT INTO stage_definitions — either the 2-row terminal-seed batch
      // (createPipeline) or the single-row insert (createStage).
      if (s.startsWith('INSERT INTO STAGE_DEFINITIONS')) {
        if (params && params.length >= 20) {
          // 2-row batch insert from createPipeline (won + lost)
          const row1 = {
            id: params[0],
            tenant_id: params[1],
            pipeline_id: params[2],
            name: params[3],
            api_name: params[4],
            sort_order: params[5],
            stage_type: params[6],
            colour: params[7],
            default_probability: params[8],
            expected_days: null,
            description: null,
            created_at: params[9],
          };
          const row2 = {
            id: params[10],
            tenant_id: params[11],
            pipeline_id: params[12],
            name: params[13],
            api_name: params[14],
            sort_order: params[15],
            stage_type: params[16],
            colour: params[17],
            default_probability: params[18],
            expected_days: null,
            description: null,
            created_at: params[19],
          };
          fakeStages.set(params[0] as string, row1);
          fakeStages.set(params[10] as string, row2);
          return { rows: [row1, row2] };
        }
        // Single-row insert from createStage
        const [
          id,
          _tenant_id,
          pipeline_id,
          name,
          api_name,
          sort_order,
          stage_type,
          colour,
          default_probability,
          expected_days,
          description,
          created_at,
        ] = params as unknown[];
        const row = {
          id,
          tenant_id: _tenant_id,
          pipeline_id,
          name,
          api_name,
          sort_order,
          stage_type,
          colour,
          default_probability,
          expected_days,
          description,
          created_at,
        };
        fakeStages.set(id as string, row);
        return { rows: [row] };
      }

      // SELECT * FROM stage_definitions WHERE pipeline_id = $1 ...
      if (
        s.includes('FROM STAGE_DEFINITIONS WHERE PIPELINE_ID') &&
        s.includes('ORDER BY SORT_ORDER')
      ) {
        const pipelineId = params![0] as string;
        const rows = [...fakeStages.values()]
          .filter((r) => r.pipeline_id === pipelineId)
          .sort(
            (a, b) => (a.sort_order as number) - (b.sort_order as number),
          );
        return { rows };
      }

      // SELECT * FROM stage_definitions WHERE id = $1 AND pipeline_id = $2 ...
      if (s.startsWith('SELECT * FROM STAGE_DEFINITIONS WHERE ID')) {
        const id = params![0] as string;
        const row = fakeStages.get(id);
        return row ? { rows: [row] } : { rows: [] };
      }

      // SELECT * FROM pipeline_definitions WHERE id = $1 AND tenant_id = $2
      if (s.startsWith('SELECT * FROM PIPELINE_DEFINITIONS WHERE ID')) {
        const id = params![0] as string;
        const row = fakePipelines.get(id);
        return row ? { rows: [row] } : { rows: [] };
      }

      // SELECT * FROM pipeline_definitions WHERE tenant_id = $1 ORDER BY ...
      if (
        s.startsWith('SELECT * FROM PIPELINE_DEFINITIONS WHERE TENANT_ID')
      ) {
        return { rows: [...fakePipelines.values()] };
      }

      // SELECT * FROM stage_gates WHERE stage_id = ANY($1) ...
      if (s.includes('STAGE_GATES') && s.includes('ANY')) {
        return { rows: [] };
      }

      // COUNT queries — return zero so the delete path succeeds.
      if (s.includes('COUNT')) {
        return { rows: [{ count: '0' }] };
      }

      // UPDATE pipeline_definitions
      if (s.startsWith('UPDATE PIPELINE_DEFINITIONS')) {
        const id = params![params!.length - 2] as string;
        const existing = fakePipelines.get(id);
        if (!existing) return { rows: [] };
        const updated = { ...existing, updated_at: new Date() };
        fakePipelines.set(id, updated);
        return { rows: [updated] };
      }

      // UPDATE stage_definitions SET sort_order = sort_order + 1 ...
      if (
        s.includes('SORT_ORDER = SORT_ORDER + 1') &&
        s.includes('STAGE_DEFINITIONS')
      ) {
        return { rowCount: 0, rows: [] };
      }

      // UPDATE stage_definitions SET <fields> WHERE id = $N AND pipeline_id = $N+1 AND tenant_id = $N+2 RETURNING *
      if (s.startsWith('UPDATE STAGE_DEFINITIONS SET')) {
        const stageId = params![params!.length - 3] as string;
        const existing = fakeStages.get(stageId);
        if (!existing) return { rows: [] };
        return { rows: [existing] };
      }

      // DELETE FROM pipeline_definitions
      if (s.startsWith('DELETE FROM PIPELINE_DEFINITIONS')) {
        const id = params![0] as string;
        fakePipelines.delete(id);
        return { rowCount: 1, rows: [] };
      }

      // DELETE FROM stage_definitions
      if (s.startsWith('DELETE FROM STAGE_DEFINITIONS')) {
        return { rowCount: 1, rows: [] };
      }

      return { rows: [] };
    }

    const mockQuery = vi.fn(async (sql: string, params?: unknown[]) => {
      // Kysely's pg driver calls client.query(sql, params); some callers also
      // pass a QueryConfig object as the first arg, but Kysely does not.
      const rawSql = typeof sql === 'string' ? sql : (sql as { text: string }).text;
      return runQuery(rawSql, params, 'pool');
    });

    const mockConnect = vi.fn(async () => ({
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        const rawSql =
          typeof sql === 'string' ? sql : (sql as { text: string }).text;
        return runQuery(rawSql, params, 'client');
      }),
      release: vi.fn(),
    }));

    function resetCapture() {
      capturedQueries.length = 0;
      fakeObjects.set(OBJECT_ID, {
        id: OBJECT_ID,
        tenant_id: TENANT_ID,
        api_name: 'opportunity',
      });
      fakePipelines.clear();
      fakeStages.clear();
    }

    return { capturedQueries, mockQuery, mockConnect, resetCapture };
  },
);

vi.mock('../../db/client.js', () => ({
  pool: {
    query: mockQuery,
    connect: mockConnect,
  },
}));

const {
  createPipeline,
  getPipelineById,
  listPipelines,
  updatePipeline,
  deletePipeline,
  createStage,
  updateStage,
  deleteStage,
} = await import('../pipelineService.js');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalise(sql: string): string {
  return sql.replace(/\s+/g, ' ').replace(/"/g, '').trim().toUpperCase();
}

/**
 * Captured queries that are not transaction-control statements.
 * (BEGIN / COMMIT / ROLLBACK / RESET app.current_tenant_id etc.)
 */
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

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  resetCapture();
});

describe('pipelineService Kysely SQL — tenant_id defence-in-depth', () => {
  it('every data query on createPipeline references tenant_id', async () => {
    await createPipeline(TENANT_ID, {
      name: 'Sales',
      apiName: 'sales',
      objectId: OBJECT_ID,
      ownerId: 'user-1',
    });

    const queries = dataQueries();
    expect(queries.length).toBeGreaterThan(0);
    for (const q of queries) {
      const s = normalise(q.sql);
      // Every table touched here is tenant-scoped. Both the SELECT and
      // INSERT/UPDATE/DELETE forms must carry a tenant_id filter/value.
      expect(
        s.includes('TENANT_ID'),
        `Query missing TENANT_ID:\n  ${q.sql}`,
      ).toBe(true);
    }
  });

  it('every data query on getPipelineById references tenant_id', async () => {
    const created = await createPipeline(TENANT_ID, {
      name: 'Sales',
      apiName: 'sales',
      objectId: OBJECT_ID,
      ownerId: 'user-1',
    });
    capturedQueries.length = 0;

    await getPipelineById(TENANT_ID, created.id);

    const queries = dataQueries();
    expect(queries.length).toBeGreaterThan(0);
    for (const q of queries) {
      const s = normalise(q.sql);
      expect(
        s.includes('TENANT_ID'),
        `Query missing TENANT_ID:\n  ${q.sql}`,
      ).toBe(true);
    }
  });

  it('every data query on updatePipeline references tenant_id', async () => {
    const created = await createPipeline(TENANT_ID, {
      name: 'Sales',
      apiName: 'sales',
      objectId: OBJECT_ID,
      ownerId: 'user-1',
    });
    capturedQueries.length = 0;

    await updatePipeline(TENANT_ID, created.id, { name: 'Renamed' });

    for (const q of dataQueries()) {
      const s = normalise(q.sql);
      expect(
        s.includes('TENANT_ID'),
        `Query missing TENANT_ID:\n  ${q.sql}`,
      ).toBe(true);
    }
  });

  it('every data query on deletePipeline references tenant_id', async () => {
    const created = await createPipeline(TENANT_ID, {
      name: 'Sales',
      apiName: 'sales',
      objectId: OBJECT_ID,
      ownerId: 'user-1',
    });
    capturedQueries.length = 0;

    await deletePipeline(TENANT_ID, created.id);

    for (const q of dataQueries()) {
      const s = normalise(q.sql);
      expect(
        s.includes('TENANT_ID'),
        `Query missing TENANT_ID:\n  ${q.sql}`,
      ).toBe(true);
    }
  });

  it('every data query on createStage references tenant_id', async () => {
    const created = await createPipeline(TENANT_ID, {
      name: 'Sales',
      apiName: 'sales',
      objectId: OBJECT_ID,
      ownerId: 'user-1',
    });
    capturedQueries.length = 0;

    await createStage(TENANT_ID, created.id, {
      name: 'Prospecting',
      apiName: 'prospecting',
      stageType: 'open',
      colour: 'blue',
    });

    for (const q of dataQueries()) {
      const s = normalise(q.sql);
      expect(
        s.includes('TENANT_ID'),
        `Query missing TENANT_ID:\n  ${q.sql}`,
      ).toBe(true);
    }
  });
});

describe('pipelineService Kysely SQL — generated SQL shape', () => {
  it('listPipelines orders by is_system DESC then created_at ASC', async () => {
    await listPipelines(TENANT_ID);

    const [q] = dataQueries();
    const s = normalise(q!.sql);
    expect(s).toContain('SELECT * FROM PIPELINE_DEFINITIONS');
    expect(s).toContain('WHERE TENANT_ID');
    expect(s).toContain('ORDER BY IS_SYSTEM DESC');
    expect(s).toContain('CREATED_AT ASC');
  });

  it('getPipelineById fetches gates via ANY($1) single round-trip', async () => {
    const created = await createPipeline(TENANT_ID, {
      name: 'Sales',
      apiName: 'sales',
      objectId: OBJECT_ID,
      ownerId: 'user-1',
    });
    capturedQueries.length = 0;

    await getPipelineById(TENANT_ID, created.id);

    const gateQueries = dataQueries().filter((q) =>
      normalise(q.sql).includes('STAGE_GATES'),
    );
    // Exactly one gates query — not N per stage.
    expect(gateQueries.length).toBe(1);
    expect(normalise(gateQueries[0]!.sql)).toContain('STAGE_ID = ANY');
  });

  it('createStage uses "sort_order + 1" as a column-reference update (no param for the literal 1)', async () => {
    const pipeline = await createPipeline(TENANT_ID, {
      name: 'Sales',
      apiName: 'sales',
      objectId: OBJECT_ID,
      ownerId: 'user-1',
    });
    capturedQueries.length = 0;

    await createStage(TENANT_ID, pipeline.id, {
      name: 'Prospecting',
      apiName: 'prospecting',
      stageType: 'open',
      colour: 'blue',
    });

    const shiftQuery = dataQueries().find((q) =>
      normalise(q.sql).includes('SORT_ORDER = SORT_ORDER + 1'),
    );
    expect(
      shiftQuery,
      'Expected an UPDATE ... SET sort_order = sort_order + 1 on createStage',
    ).toBeDefined();
    // The `+ 1` must be emitted inline — not bound as a parameter.
    expect(shiftQuery!.sql).not.toMatch(/sort_order\s*=\s*sort_order\s*\+\s*\$/i);
  });

  it('createPipeline uses a single batch insert for the terminal stages', async () => {
    await createPipeline(TENANT_ID, {
      name: 'Sales',
      apiName: 'sales',
      objectId: OBJECT_ID,
      ownerId: 'user-1',
    });

    const stageInserts = dataQueries().filter((q) =>
      normalise(q.sql).startsWith('INSERT INTO STAGE_DEFINITIONS'),
    );
    expect(stageInserts.length).toBe(1);
    // One INSERT row per terminal stage. createPipeline's terminal-stage
    // seed sets 10 columns per row (id, tenant_id, pipeline_id, name,
    // api_name, sort_order, stage_type, colour, default_probability,
    // created_at) × 2 rows = 20 parameters on the compiled insert.
    expect(stageInserts[0]!.params.length).toBe(20);
  });

  it('deletePipeline uses COUNT(id) from records with a pipeline_id filter', async () => {
    const created = await createPipeline(TENANT_ID, {
      name: 'Sales',
      apiName: 'sales',
      objectId: OBJECT_ID,
      ownerId: 'user-1',
    });
    capturedQueries.length = 0;

    await deletePipeline(TENANT_ID, created.id);

    const countQuery = dataQueries().find((q) => {
      const s = normalise(q.sql);
      return s.includes('COUNT') && s.includes('RECORDS');
    });
    expect(countQuery).toBeDefined();
    const s = normalise(countQuery!.sql);
    expect(s).toContain('PIPELINE_ID');
    expect(s).toContain('TENANT_ID');
  });
});

describe('pipelineService Kysely SQL — transaction & RLS proxy wiring', () => {
  it('createStage runs the shift + insert inside a BEGIN/COMMIT transaction', async () => {
    const created = await createPipeline(TENANT_ID, {
      name: 'Sales',
      apiName: 'sales',
      objectId: OBJECT_ID,
      ownerId: 'user-1',
    });
    capturedQueries.length = 0;

    await createStage(TENANT_ID, created.id, {
      name: 'Prospecting',
      apiName: 'prospecting',
      stageType: 'open',
      colour: 'blue',
    });

    const sqls = capturedQueries.map((q) => normalise(q.sql));
    const beginIdx = sqls.indexOf('BEGIN');
    const commitIdx = sqls.indexOf('COMMIT');
    expect(beginIdx, 'Expected a BEGIN').toBeGreaterThanOrEqual(0);
    expect(commitIdx, 'Expected a COMMIT after BEGIN').toBeGreaterThan(
      beginIdx,
    );

    // Every query between BEGIN and COMMIT must come via the checked-out
    // client, not pool.query — that is how the RLS proxy (db/client.ts)
    // sets app.current_tenant_id before Kysely begins the transaction.
    for (let i = beginIdx; i <= commitIdx; i++) {
      expect(
        capturedQueries[i]!.via,
        `Query ${i} (${sqls[i]}) should run via the checked-out client, not pool.query`,
      ).toBe('client');
    }

    // The insert into stage_definitions must happen inside the transaction.
    const insertIdx = sqls.findIndex((s) =>
      s.startsWith('INSERT INTO STAGE_DEFINITIONS'),
    );
    expect(insertIdx).toBeGreaterThan(beginIdx);
    expect(insertIdx).toBeLessThan(commitIdx);
  });

  it('calls pool.connect() at least once for the transaction, exercising the RLS proxy', async () => {
    const created = await createPipeline(TENANT_ID, {
      name: 'Sales',
      apiName: 'sales',
      objectId: OBJECT_ID,
      ownerId: 'user-1',
    });
    const connectCallsBefore = mockConnect.mock.calls.length;

    await createStage(TENANT_ID, created.id, {
      name: 'Prospecting',
      apiName: 'prospecting',
      stageType: 'open',
      colour: 'blue',
    });

    // pool.connect() is the hook that the RLS proxy in db/client.ts uses to
    // run `SELECT set_config('app.current_tenant_id', $1, false)` before
    // handing the connection to Kysely. At least one new connect call must
    // have happened during createStage.
    expect(mockConnect.mock.calls.length).toBeGreaterThan(connectCallsBefore);
  });
});

describe('pipelineService Kysely SQL — no raw pg left behind', () => {
  it('exercising every service path produces valid compiled SQL', async () => {
    const created = await createPipeline(TENANT_ID, {
      name: 'Sales',
      apiName: 'sales',
      objectId: OBJECT_ID,
      ownerId: 'user-1',
    });
    await listPipelines(TENANT_ID);
    await getPipelineById(TENANT_ID, created.id);
    await updatePipeline(TENANT_ID, created.id, { name: 'Renamed' });
    const stage = await createStage(TENANT_ID, created.id, {
      name: 'Prospecting',
      apiName: 'prospecting',
      stageType: 'open',
      colour: 'blue',
    });
    await updateStage(TENANT_ID, created.id, stage.id, { name: 'Qualifying' });
    await deleteStage(TENANT_ID, created.id, stage.id);
    await deletePipeline(TENANT_ID, created.id);

    // Every captured query must be a non-empty string and use $N-style
    // placeholders where params are present (i.e. nothing was compiled as
    // a raw string with interpolated values).
    for (const q of capturedQueries) {
      expect(typeof q.sql).toBe('string');
      expect(q.sql.length).toBeGreaterThan(0);
      if (q.params.length > 0) {
        expect(q.sql).toMatch(/\$\d+/);
      }
    }
  });
});
