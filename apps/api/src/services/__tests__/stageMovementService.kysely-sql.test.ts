/**
 * Kysely SQL regression suite for stageMovementService.
 *
 * Complements `stageMovementService.test.ts` (which asserts on return
 * values and domain behaviour) by asserting directly on the SQL Kysely
 * emits for each exported service function. It exists to:
 *
 *   1. Catch drift in the generated SQL as Kysely is upgraded or the
 *      service is refactored.
 *   2. Audit that every tenant-scoped query carries a `tenant_id` filter
 *      as defence-in-depth against an RLS misconfiguration (ADR-006).
 *   3. Verify `moveRecordStage` runs inside a single BEGIN/COMMIT
 *      transaction, and that every inner query is routed through the
 *      checked-out client (so the RLS proxy on db/client.ts gets a
 *      chance to set `app.current_tenant_id`).
 *
 * No real Postgres — the pg pool is mocked and captures every compiled
 * SQL string Kysely hands down.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const TENANT_ID = 'sql-tenant-001';
const OBJECT_ID = 'obj-opportunity-id';
const RECORD_ID = 'rec-1';
const OWNER_ID = 'user-123';

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

    const fakeRecords = new Map<string, Record<string, unknown>>();
    const fakeStages = new Map<string, Record<string, unknown>>();
    const fakePipelines = new Map<string, Record<string, unknown>>();
    const fakeGates: Record<string, unknown>[] = [];

    function runQuery(
      rawSql: string,
      params: unknown[] | undefined,
      via: 'pool' | 'client',
    ) {
      capturedQueries.push({ sql: rawSql, params: params ?? [], via });

      const s = rawSql.replace(/\s+/g, ' ').replace(/"/g, '').trim().toUpperCase();

      // Transaction control
      if (s === 'BEGIN' || s === 'COMMIT' || s === 'ROLLBACK') {
        return { rows: [] };
      }

      // resolve object by api_name
      if (s.startsWith('SELECT ID FROM OBJECT_DEFINITIONS')) {
        const apiName = params![0] as string;
        if (apiName === 'opportunity') {
          return { rows: [{ id: OBJECT_ID }] };
        }
        return { rows: [] };
      }

      // record lookup (SELECT *)
      if (
        s.startsWith('SELECT * FROM RECORDS WHERE ID') &&
        s.includes('OBJECT_ID') &&
        s.includes('TENANT_ID')
      ) {
        const id = params![0] as string;
        const row = fakeRecords.get(id);
        return row ? { rows: [row] } : { rows: [] };
      }

      // stage lookup by id + pipeline_id + tenant_id (current stage)
      if (
        s.startsWith('SELECT * FROM STAGE_DEFINITIONS WHERE ID') &&
        s.includes('PIPELINE_ID')
      ) {
        const id = params![0] as string;
        const pipelineId = params![1] as string;
        const row = fakeStages.get(id);
        if (row && row.pipeline_id === pipelineId) return { rows: [row] };
        return { rows: [] };
      }

      // target stage joined with pipeline_definitions to project
      // pipeline_object_id (for cross-object validation).
      if (
        s.includes('FROM STAGE_DEFINITIONS') &&
        s.includes('JOIN PIPELINE_DEFINITIONS') &&
        s.includes('PIPELINE_OBJECT_ID')
      ) {
        const id = params![0] as string;
        const row = fakeStages.get(id);
        if (row) {
          const pipeline = fakePipelines.get(row.pipeline_id as string);
          return {
            rows: [
              {
                ...row,
                pipeline_object_id: pipeline?.object_id ?? null,
              },
            ],
          };
        }
        return { rows: [] };
      }

      // stage lookup by id + tenant_id (target stage, legacy)
      if (s.startsWith('SELECT * FROM STAGE_DEFINITIONS WHERE ID')) {
        const id = params![0] as string;
        const row = fakeStages.get(id);
        return row ? { rows: [row] } : { rows: [] };
      }

      // stage_gates JOIN field_definitions
      if (
        s.includes('FROM STAGE_GATES') &&
        s.includes('JOIN FIELD_DEFINITIONS')
      ) {
        return { rows: fakeGates };
      }

      // INSERT INTO stage_history
      if (s.startsWith('INSERT INTO STAGE_HISTORY')) {
        return { rows: [] };
      }

      // UPDATE records in moveRecordStage (no pipeline_id in SET, has RETURNING)
      if (
        s.startsWith('UPDATE RECORDS') &&
        s.includes('CURRENT_STAGE_ID') &&
        !s.includes('PIPELINE_ID') &&
        s.includes('RETURNING')
      ) {
        const id = params![4] as string;
        const row = fakeRecords.get(id);
        if (row) {
          const updated = {
            ...row,
            current_stage_id: params![0],
            stage_entered_at: params![1],
            field_values: JSON.parse(params![2] as string),
            updated_at: params![3],
          };
          fakeRecords.set(id, updated);
          return { rows: [updated] };
        }
        return { rows: [] };
      }

      // default pipeline lookup
      if (
        s.includes('FROM PIPELINE_DEFINITIONS') &&
        s.includes('OBJECT_ID') &&
        s.includes('IS_DEFAULT')
      ) {
        const objectId = params![0] as string;
        const match = [...fakePipelines.values()].find(
          (p) => p.object_id === objectId && p.is_default === true,
        );
        return match ? { rows: [{ id: match.id }] } : { rows: [] };
      }

      // stage list for pipeline (assignDefaultPipeline)
      if (
        s.includes('FROM STAGE_DEFINITIONS') &&
        s.includes('PIPELINE_ID') &&
        s.includes('ORDER BY SORT_ORDER')
      ) {
        const pipelineId = params![0] as string;
        const rows = [...fakeStages.values()]
          .filter((st) => st.pipeline_id === pipelineId)
          .sort((a, b) => (a.sort_order as number) - (b.sort_order as number));
        return { rows };
      }

      // refetch pipeline columns
      if (
        s.startsWith(
          'SELECT PIPELINE_ID, CURRENT_STAGE_ID, STAGE_ENTERED_AT FROM RECORDS WHERE ID',
        )
      ) {
        const id = params![0] as string;
        const row = fakeRecords.get(id);
        return row ? { rows: [row] } : { rows: [] };
      }

      // select field_values (assignDefaultPipeline)
      if (s.startsWith('SELECT FIELD_VALUES FROM RECORDS WHERE ID')) {
        const id = params![0] as string;
        const row = fakeRecords.get(id);
        return row ? { rows: [{ field_values: row.field_values }] } : { rows: [] };
      }

      // UPDATE records in assignDefaultPipeline (with field_values)
      if (
        s.startsWith('UPDATE RECORDS') &&
        s.includes('PIPELINE_ID') &&
        s.includes('FIELD_VALUES')
      ) {
        const id = params![4] as string;
        const row = fakeRecords.get(id);
        if (row) {
          fakeRecords.set(id, {
            ...row,
            pipeline_id: params![0],
            current_stage_id: params![1],
            stage_entered_at: params![2],
            field_values: JSON.parse(params![3] as string),
          });
        }
        return { rows: [] };
      }

      // UPDATE records in assignDefaultPipeline (without field_values)
      if (s.startsWith('UPDATE RECORDS') && s.includes('PIPELINE_ID')) {
        const id = params![3] as string;
        const row = fakeRecords.get(id);
        if (row) {
          fakeRecords.set(id, {
            ...row,
            pipeline_id: params![0],
            current_stage_id: params![1],
            stage_entered_at: params![2],
          });
        }
        return { rows: [] };
      }

      return { rows: [] };
    }

    const mockQuery = vi.fn(async (sql: string, params?: unknown[]) => {
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
      fakeRecords.clear();
      fakeStages.clear();
      fakePipelines.clear();
      fakeGates.length = 0;

      // Seed a pipeline with 5 stages and a record at stage-prospect.
      fakePipelines.set('pipeline-1', {
        id: 'pipeline-1',
        object_id: OBJECT_ID,
        name: 'Sales Pipeline',
        is_default: true,
      });

      const stages: Array<Record<string, unknown>> = [
        {
          id: 'stage-prospect',
          pipeline_id: 'pipeline-1',
          name: 'Prospecting',
          api_name: 'prospecting',
          sort_order: 0,
          stage_type: 'open',
          default_probability: 10,
        },
        {
          id: 'stage-qualification',
          pipeline_id: 'pipeline-1',
          name: 'Qualification',
          api_name: 'qualification',
          sort_order: 1,
          stage_type: 'open',
          default_probability: 25,
        },
        {
          id: 'stage-proposal',
          pipeline_id: 'pipeline-1',
          name: 'Proposal',
          api_name: 'proposal',
          sort_order: 2,
          stage_type: 'open',
          default_probability: 60,
        },
        {
          id: 'stage-won',
          pipeline_id: 'pipeline-1',
          name: 'Closed Won',
          api_name: 'closed_won',
          sort_order: 3,
          stage_type: 'won',
          default_probability: 100,
        },
        {
          id: 'stage-lost',
          pipeline_id: 'pipeline-1',
          name: 'Closed Lost',
          api_name: 'closed_lost',
          sort_order: 4,
          stage_type: 'lost',
          default_probability: 0,
        },
      ];
      for (const st of stages) fakeStages.set(st.id as string, st);

      fakeRecords.set(RECORD_ID, {
        id: RECORD_ID,
        object_id: OBJECT_ID,
        name: 'Test Opportunity',
        field_values: { value: 50000 },
        owner_id: OWNER_ID,
        pipeline_id: 'pipeline-1',
        current_stage_id: 'stage-prospect',
        stage_entered_at: new Date(Date.now() - 86400000).toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
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

const { moveRecordStage, assignDefaultPipeline } = await import(
  '../stageMovementService.js'
);
const { db } = await import('../../db/kysely.js');

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

describe('stageMovementService Kysely SQL — tenant_id defence-in-depth', () => {
  it('every data query on moveRecordStage references tenant_id', async () => {
    await moveRecordStage(
      TENANT_ID,
      'opportunity',
      RECORD_ID,
      'stage-qualification',
      OWNER_ID,
    );

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

  it('every data query on moveRecordStage to a won stage references tenant_id', async () => {
    await moveRecordStage(
      TENANT_ID,
      'opportunity',
      RECORD_ID,
      'stage-won',
      OWNER_ID,
    );

    for (const q of dataQueries()) {
      const s = normalise(q.sql);
      expect(
        s.includes('TENANT_ID'),
        `Query missing TENANT_ID:\n  ${q.sql}`,
      ).toBe(true);
    }
  });

  it('assignDefaultPipeline called with tenantId carries it through every query', async () => {
    // Use a new record with no pipeline assigned.
    await assignDefaultPipeline(
      db,
      RECORD_ID,
      OBJECT_ID,
      OWNER_ID,
      TENANT_ID,
    );

    const queries = dataQueries();
    expect(queries.length).toBeGreaterThan(0);

    // Defence-in-depth (ADR-006): every data query — including the
    // records re-fetch and the records UPDATE — must carry an explicit
    // TENANT_ID predicate when a tenantId is supplied.
    for (const q of queries) {
      expect(
        normalise(q.sql).includes('TENANT_ID'),
        `Query missing TENANT_ID:\n  ${q.sql}`,
      ).toBe(true);
    }
  });
});

describe('stageMovementService Kysely SQL — generated SQL shape', () => {
  it('moveRecordStage joins stage_gates with field_definitions in one query', async () => {
    await moveRecordStage(
      TENANT_ID,
      'opportunity',
      RECORD_ID,
      'stage-qualification',
      OWNER_ID,
    );

    const gateQueries = dataQueries().filter((q) => {
      const s = normalise(q.sql);
      return s.includes('FROM STAGE_GATES') && s.includes('JOIN FIELD_DEFINITIONS');
    });
    // Exactly one gates query — not N per gate.
    expect(gateQueries.length).toBe(1);
    const s = normalise(gateQueries[0]!.sql);
    // Projected aliases the service relies on for rowToGate().
    expect(s).toContain('FIELD_API_NAME');
    expect(s).toContain('FIELD_LABEL');
    expect(s).toContain('FIELD_OPTIONS');
  });

  it('moveRecordStage issues exactly one stage_history insert', async () => {
    await moveRecordStage(
      TENANT_ID,
      'opportunity',
      RECORD_ID,
      'stage-qualification',
      OWNER_ID,
    );

    const historyInserts = dataQueries().filter((q) =>
      normalise(q.sql).startsWith('INSERT INTO STAGE_HISTORY'),
    );
    expect(historyInserts.length).toBe(1);
    // stage_history has 9 columns supplied by the service (id, tenant_id,
    // record_id, pipeline_id, from_stage_id, to_stage_id, changed_by,
    // changed_at, days_in_previous_stage).
    expect(historyInserts[0]!.params.length).toBe(9);
  });

  it('moveRecordStage UPDATE records carries id + object_id + tenant_id in WHERE', async () => {
    await moveRecordStage(
      TENANT_ID,
      'opportunity',
      RECORD_ID,
      'stage-qualification',
      OWNER_ID,
    );

    const updates = dataQueries().filter((q) => {
      const s = normalise(q.sql);
      return s.startsWith('UPDATE RECORDS') && s.includes('CURRENT_STAGE_ID');
    });
    expect(updates.length).toBeGreaterThanOrEqual(1);
    const s = normalise(updates[updates.length - 1]!.sql);
    expect(s).toContain('WHERE');
    expect(s).toContain('ID');
    expect(s).toContain('OBJECT_ID');
    expect(s).toContain('TENANT_ID');
    expect(s).toContain('RETURNING *');
  });
});

describe('stageMovementService Kysely SQL — transaction & RLS proxy wiring', () => {
  it('moveRecordStage runs all queries inside a single BEGIN/COMMIT transaction', async () => {
    await moveRecordStage(
      TENANT_ID,
      'opportunity',
      RECORD_ID,
      'stage-qualification',
      OWNER_ID,
    );

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
        `Query at index ${i} must be via the checked-out client, got ${capturedQueries[i]!.via}:\n  ${capturedQueries[i]!.sql}`,
      ).toBe('client');
    }
  });

  it('moveRecordStage rolls back on a validation error without committing', async () => {
    // Target stage is the same as the current stage → triggers a
    // VALIDATION_ERROR inside the transaction.
    await expect(
      moveRecordStage(
        TENANT_ID,
        'opportunity',
        RECORD_ID,
        'stage-prospect',
        OWNER_ID,
      ),
    ).rejects.toThrow('Record is already in this stage');

    const sqls = capturedQueries.map((q) => normalise(q.sql));
    expect(sqls).toContain('BEGIN');
    expect(sqls).toContain('ROLLBACK');
    expect(sqls).not.toContain('COMMIT');
  });
});
