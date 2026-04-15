/**
 * Kysely SQL regression suite for pipelineAnalyticsService.
 *
 * Complements `pipelineAnalyticsService.test.ts` (which asserts on return
 * values and domain behaviour) by asserting directly on the SQL Kysely
 * emits for each exported service function. It exists to:
 *
 *   1. Catch drift in the generated SQL as Kysely is upgraded or the
 *      service is refactored.
 *   2. Audit that every tenant-scoped query carries a `tenant_id` filter
 *      as defence-in-depth against an RLS misconfiguration (ADR-006).
 *   3. Verify the JSONB aggregates and subquery shape the service depends
 *      on for the won/lost totals and avg-days-to-close metric.
 *
 * No real Postgres — the pg pool is mocked and captures every compiled
 * SQL string Kysely hands down.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const TENANT_ID = 'sql-tenant-001';
const OBJECT_ID = 'obj-opportunity-id';
const PIPELINE_ID = 'pipeline-1';
const OWNER_ID = 'user-123';

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ─── SQL capture ──────────────────────────────────────────────────────────────

interface CapturedQuery {
  sql: string;
  params: unknown[];
  /** 'pool' = direct pool.query, 'client' = checked-out client */
  via: 'pool' | 'client';
}

const { capturedQueries, mockQuery, mockConnect, resetCapture } = vi.hoisted(
  () => {
    const capturedQueries: CapturedQuery[] = [];

    const fakePipelines = new Map<string, Record<string, unknown>>();
    const fakeStages = new Map<string, Record<string, unknown>>();
    const fakeRecords = new Map<string, Record<string, unknown>>();

    function runQuery(
      rawSql: string,
      params: unknown[] | undefined,
      via: 'pool' | 'client',
    ) {
      capturedQueries.push({ sql: rawSql, params: params ?? [], via });

      const s = rawSql.replace(/\s+/g, ' ').replace(/"/g, '').trim().toUpperCase();

      // Pipeline lookup
      if (s.startsWith('SELECT ID, NAME, OBJECT_ID FROM PIPELINE_DEFINITIONS')) {
        const id = params![0] as string;
        const row = fakePipelines.get(id);
        if (row) {
          return {
            rows: [{ id: row.id, name: row.name, object_id: row.object_id }],
          };
        }
        return { rows: [] };
      }

      // Stage list — summary variant (includes default_probability)
      if (
        s.includes('STAGE_DEFINITIONS') &&
        s.includes('DEFAULT_PROBABILITY') &&
        s.includes('EXPECTED_DAYS')
      ) {
        const pipelineId = params![0] as string;
        const rows = [...fakeStages.values()]
          .filter((st) => st.pipeline_id === pipelineId)
          .sort((a, b) => (a.sort_order as number) - (b.sort_order as number));
        return { rows };
      }

      // Stage list — velocity variant (no default_probability)
      if (
        s.includes('STAGE_DEFINITIONS') &&
        s.includes('EXPECTED_DAYS') &&
        !s.includes('DEFAULT_PROBABILITY')
      ) {
        const pipelineId = params![0] as string;
        const rows = [...fakeStages.values()]
          .filter((st) => st.pipeline_id === pipelineId)
          .sort((a, b) => (a.sort_order as number) - (b.sort_order as number));
        return { rows };
      }

      // Records query for summary
      if (
        s.includes('FROM RECORDS') &&
        s.includes('FIELD_VALUES') &&
        s.includes('CURRENT_STAGE_ID') &&
        s.includes('STAGE_ENTERED_AT') &&
        !s.includes('JOIN') &&
        !s.includes('DAYS_IN_STAGE')
      ) {
        const rows = [...fakeRecords.values()].map((r) => ({
          id: r.id,
          field_values: r.field_values,
          current_stage_id: r.current_stage_id ?? null,
          stage_entered_at: r.stage_entered_at ?? null,
        }));
        return { rows };
      }

      // Won / Lost aggregates
      if (s.includes('WON_COUNT') && s.includes('WON_VALUE')) {
        return { rows: [{ won_count: 0, won_value: '0' }] };
      }
      if (s.includes('LOST_COUNT')) {
        return { rows: [{ lost_count: 0 }] };
      }

      // Entered counts
      if (
        s.includes('TO_STAGE_ID AS STAGE_ID') &&
        s.includes('ENTERED') &&
        s.includes('GROUP BY')
      ) {
        return { rows: [] };
      }

      // Exited counts
      if (
        s.includes('FROM_STAGE_ID AS STAGE_ID') &&
        s.includes('EXITED') &&
        s.includes('GROUP BY')
      ) {
        return { rows: [] };
      }

      // Avg days to close
      if (s.includes('AVG_DAYS') && s.includes('DURATION_DAYS')) {
        return { rows: [{ avg_days: '0' }] };
      }

      // Overdue records
      if (
        s.includes('DAYS_IN_STAGE') &&
        s.includes('STAGE_NAME') &&
        s.includes('FROM RECORDS')
      ) {
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
      fakePipelines.clear();
      fakeStages.clear();
      fakeRecords.clear();

      fakePipelines.set(PIPELINE_ID, {
        id: PIPELINE_ID,
        name: 'Sales Pipeline',
        object_id: OBJECT_ID,
      });

      const stages: Array<Record<string, unknown>> = [
        {
          id: 'stage-prospect',
          pipeline_id: PIPELINE_ID,
          name: 'Prospecting',
          api_name: 'prospecting',
          stage_type: 'open',
          sort_order: 0,
          default_probability: 10,
          expected_days: 14,
        },
        {
          id: 'stage-qualification',
          pipeline_id: PIPELINE_ID,
          name: 'Qualification',
          api_name: 'qualification',
          stage_type: 'open',
          sort_order: 1,
          default_probability: 25,
          expected_days: 14,
        },
        {
          id: 'stage-won',
          pipeline_id: PIPELINE_ID,
          name: 'Closed Won',
          api_name: 'closed_won',
          stage_type: 'won',
          sort_order: 2,
          default_probability: 100,
          expected_days: null,
        },
        {
          id: 'stage-lost',
          pipeline_id: PIPELINE_ID,
          name: 'Closed Lost',
          api_name: 'closed_lost',
          stage_type: 'lost',
          sort_order: 3,
          default_probability: 0,
          expected_days: null,
        },
      ];
      for (const st of stages) fakeStages.set(st.id as string, st);
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

const { getPipelineSummary, getPipelineVelocity, getOverdueRecords } =
  await import('../pipelineAnalyticsService.js');

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

describe('pipelineAnalyticsService Kysely SQL — tenant_id defence-in-depth', () => {
  it('every data query on getPipelineSummary references tenant_id', async () => {
    await getPipelineSummary(TENANT_ID, PIPELINE_ID, OWNER_ID);

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

  it('every data query on getPipelineVelocity (30d) references tenant_id', async () => {
    await getPipelineVelocity(TENANT_ID, PIPELINE_ID, OWNER_ID, '30d');

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

  it('every data query on getPipelineVelocity (all) references tenant_id', async () => {
    // The `all` period skips the cutoffDate WHERE — make sure the
    // $if() branch elision does not strip the tenant_id predicate.
    await getPipelineVelocity(TENANT_ID, PIPELINE_ID, OWNER_ID, 'all');

    for (const q of dataQueries()) {
      const s = normalise(q.sql);
      expect(
        s.includes('TENANT_ID'),
        `Query missing TENANT_ID:\n  ${q.sql}`,
      ).toBe(true);
    }
  });

  it('every data query on getOverdueRecords references tenant_id', async () => {
    await getOverdueRecords(TENANT_ID, PIPELINE_ID, OWNER_ID);

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
});

describe('pipelineAnalyticsService Kysely SQL — generated SQL shape', () => {
  it('getPipelineSummary issues its won aggregate with JSONB ->> and ::numeric coercions', async () => {
    await getPipelineSummary(TENANT_ID, PIPELINE_ID, OWNER_ID);

    const wonQueries = dataQueries().filter((q) => {
      const s = normalise(q.sql);
      return s.includes('WON_COUNT') && s.includes('WON_VALUE');
    });
    expect(wonQueries.length).toBe(1);

    const raw = wonQueries[0]!.sql; // preserve original casing for JSONB keys
    // JSONB value extraction with the three canonical keys
    expect(raw).toContain("'value'");
    expect(raw).toContain("'amount'");
    expect(raw).toContain("'deal_value'");
    // Numeric coercion and distinct record count
    const upper = normalise(raw);
    expect(upper).toContain('::NUMERIC');
    expect(upper).toContain('COUNT(DISTINCT');
    // Joins stage_definitions + records onto stage_history
    expect(upper).toContain('FROM STAGE_HISTORY');
    expect(upper).toContain('JOIN STAGE_DEFINITIONS');
    expect(upper).toContain('JOIN RECORDS');
  });

  it('getPipelineSummary issues exactly one records query with the pipeline_id OR (object_id AND pipeline_id IS NULL) predicate', async () => {
    await getPipelineSummary(TENANT_ID, PIPELINE_ID, OWNER_ID);

    const recordQueries = dataQueries().filter((q) => {
      const s = normalise(q.sql);
      return (
        s.includes('FROM RECORDS') &&
        s.includes('FIELD_VALUES') &&
        s.includes('CURRENT_STAGE_ID') &&
        s.includes('STAGE_ENTERED_AT') &&
        !s.includes('JOIN')
      );
    });
    expect(recordQueries.length).toBe(1);

    const s = normalise(recordQueries[0]!.sql);
    // OR clause wiring pipeline_id vs object_id fallback
    expect(s).toContain('PIPELINE_ID');
    expect(s).toContain('OBJECT_ID');
    expect(s).toContain('IS NULL');
    expect(s).toContain('OR');
  });

  it('getPipelineVelocity issues grouped entered/exited counts from stage_history', async () => {
    await getPipelineVelocity(TENANT_ID, PIPELINE_ID, OWNER_ID, '90d');

    const queries = dataQueries().map((q) => normalise(q.sql));

    const entered = queries.filter(
      (s) =>
        s.includes('TO_STAGE_ID AS STAGE_ID') &&
        s.includes('ENTERED') &&
        s.includes('GROUP BY'),
    );
    const exited = queries.filter(
      (s) =>
        s.includes('FROM_STAGE_ID AS STAGE_ID') &&
        s.includes('EXITED') &&
        s.includes('GROUP BY'),
    );

    expect(entered.length).toBe(1);
    expect(exited.length).toBe(1);
    // Exited query averages days_in_previous_stage
    expect(exited[0]).toContain('AVG(SH.DAYS_IN_PREVIOUS_STAGE)');
    // Exited query filters out NULL from_stage_id
    expect(exited[0]).toContain('FROM_STAGE_ID IS NOT NULL');
  });

  it('getPipelineVelocity avg-days-to-close runs a subquery with stage_history self-join', async () => {
    await getPipelineVelocity(TENANT_ID, PIPELINE_ID, OWNER_ID, '30d');

    const avgQuery = dataQueries().find((q) => {
      const s = normalise(q.sql);
      return s.includes('AVG_DAYS') && s.includes('DURATION_DAYS');
    });
    expect(avgQuery).toBeDefined();

    const s = normalise(avgQuery!.sql);
    // Subquery references the self-joined aliases
    expect(s).toContain('SH_WON');
    expect(s).toContain('SH_FIRST');
    // Uses EXTRACT(EPOCH FROM ...) / 86400 to compute duration
    expect(s).toContain('EXTRACT(EPOCH FROM');
    expect(s).toContain('/ 86400');
    // Joined to stage_definitions and records
    expect(s).toContain('STAGE_DEFINITIONS');
    expect(s).toContain('RECORDS');
    // Wrapping select averages duration_days
    expect(s).toContain('AVG(DURATION_DAYS)');
  });

  it('getPipelineVelocity with period=all omits the changed_at cutoff from the entered query', async () => {
    await getPipelineVelocity(TENANT_ID, PIPELINE_ID, OWNER_ID, 'all');

    const entered = dataQueries().find((q) => {
      const s = normalise(q.sql);
      return (
        s.includes('TO_STAGE_ID AS STAGE_ID') &&
        s.includes('ENTERED') &&
        s.includes('GROUP BY')
      );
    });
    expect(entered).toBeDefined();
    const s = normalise(entered!.sql);
    expect(s).not.toContain('CHANGED_AT >=');
  });

  it('getOverdueRecords orders by (days_in_stage - expected_days) DESC and carries the JSONB value fallback', async () => {
    await getOverdueRecords(TENANT_ID, PIPELINE_ID, OWNER_ID);

    const overdueQueries = dataQueries().filter((q) => {
      const s = normalise(q.sql);
      return (
        s.includes('DAYS_IN_STAGE') &&
        s.includes('STAGE_NAME') &&
        s.includes('FROM RECORDS')
      );
    });
    expect(overdueQueries.length).toBe(1);

    const raw = overdueQueries[0]!.sql;
    const s = normalise(raw);

    // Joins stage_definitions for expected_days / stage name
    expect(s).toContain('JOIN STAGE_DEFINITIONS');
    // Overdue predicate present in WHERE
    expect(s).toContain('EXTRACT(EPOCH FROM (NOW() - R.STAGE_ENTERED_AT))');
    expect(s).toContain('> SD.EXPECTED_DAYS');
    // ORDER BY the overdue delta DESC
    expect(s).toContain('ORDER BY');
    expect(s).toContain('DESC');
    // JSONB value fallback across the three canonical keys
    expect(raw).toContain("'value'");
    expect(raw).toContain("'amount'");
    expect(raw).toContain("'deal_value'");
    expect(s).toContain('::NUMERIC');
  });

  it('getOverdueRecords WHERE clause carries the pipeline_id OR (object_id AND pipeline_id IS NULL) predicate', async () => {
    await getOverdueRecords(TENANT_ID, PIPELINE_ID, OWNER_ID);

    const q = dataQueries().find((q) => {
      const s = normalise(q.sql);
      return (
        s.includes('DAYS_IN_STAGE') &&
        s.includes('STAGE_NAME') &&
        s.includes('FROM RECORDS')
      );
    });
    expect(q).toBeDefined();
    const s = normalise(q!.sql);
    expect(s).toContain('PIPELINE_ID');
    expect(s).toContain('OBJECT_ID');
    expect(s).toContain('IS NULL');
    expect(s).toContain('OR');
  });
});

describe('pipelineAnalyticsService Kysely SQL — no BEGIN/COMMIT (read-only)', () => {
  it('getPipelineSummary runs without opening a transaction', async () => {
    await getPipelineSummary(TENANT_ID, PIPELINE_ID, OWNER_ID);
    const sqls = capturedQueries.map((q) => normalise(q.sql));
    expect(sqls).not.toContain('BEGIN');
    expect(sqls).not.toContain('COMMIT');
  });

  it('getPipelineVelocity runs without opening a transaction', async () => {
    await getPipelineVelocity(TENANT_ID, PIPELINE_ID, OWNER_ID, '30d');
    const sqls = capturedQueries.map((q) => normalise(q.sql));
    expect(sqls).not.toContain('BEGIN');
    expect(sqls).not.toContain('COMMIT');
  });

  it('getOverdueRecords runs without opening a transaction', async () => {
    await getOverdueRecords(TENANT_ID, PIPELINE_ID, OWNER_ID);
    const sqls = capturedQueries.map((q) => normalise(q.sql));
    expect(sqls).not.toContain('BEGIN');
    expect(sqls).not.toContain('COMMIT');
  });
});
