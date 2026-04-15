/**
 * Kysely SQL regression suite for stageGateService.
 *
 * Complements `stageGateService.test.ts` (which asserts on return
 * values and domain behaviour) by asserting directly on the SQL Kysely
 * emits for each exported service function. It exists to:
 *
 *   1. Catch drift in the generated SQL as Kysely is upgraded or the
 *      service is refactored.
 *   2. Audit that every tenant-scoped query carries a `tenant_id` filter
 *      as defence-in-depth against an RLS misconfiguration (ADR-006).
 *   3. Pin the join shape of the gate-with-field metadata select so a
 *      refactor doesn't accidentally switch to N+1 fetches.
 *
 * No real Postgres — the pg pool is mocked and captures every compiled
 * SQL string Kysely hands down.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const TENANT_ID = 'sql-tenant-001';
const OBJECT_ID = 'obj-opportunity-id';
const PIPELINE_ID = 'pipeline-1';
const STAGE_ID = 'stage-qualification';
const FIELD_ID = 'field-value';
const GATE_ID = 'gate-1';

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ─── SQL capture ──────────────────────────────────────────────────────────────

interface CapturedQuery {
  sql: string;
  params: unknown[];
  via: 'pool' | 'client';
}

const { capturedQueries, mockQuery, mockConnect, resetCapture } = vi.hoisted(
  () => {
    const capturedQueries: CapturedQuery[] = [];

    function runQuery(
      rawSql: string,
      params: unknown[] | undefined,
      via: 'pool' | 'client',
    ) {
      capturedQueries.push({ sql: rawSql, params: params ?? [], via });

      const s = rawSql.replace(/\s+/g, ' ').replace(/"/g, '').trim().toUpperCase();

      // resolveStageAndObject: stage_definitions INNER JOIN pipeline_definitions
      if (
        s.includes('FROM STAGE_DEFINITIONS AS SD') &&
        s.includes('JOIN PIPELINE_DEFINITIONS AS PD')
      ) {
        return {
          rows: [
            {
              stage_id: STAGE_ID,
              pipeline_id: PIPELINE_ID,
              object_id: OBJECT_ID,
            },
          ],
        };
      }

      // getFieldInfo: SELECT id, field_type, label, options FROM field_definitions
      if (
        s.includes('FROM FIELD_DEFINITIONS') &&
        s.includes('FIELD_TYPE') &&
        s.includes('LABEL') &&
        s.includes('OPTIONS')
      ) {
        return {
          rows: [
            {
              id: FIELD_ID,
              field_type: 'currency',
              label: 'Deal Value',
              options: {},
            },
          ],
        };
      }

      // fieldBelongsToObject: SELECT id FROM field_definitions WHERE id AND object_id
      if (
        s.includes('FROM FIELD_DEFINITIONS') &&
        s.includes('SELECT ID') &&
        s.includes('OBJECT_ID')
      ) {
        return { rows: [{ id: FIELD_ID }] };
      }

      // Duplicate check on create
      if (
        s.includes('FROM STAGE_GATES') &&
        !s.includes('AS SG') &&
        s.includes('SELECT ID') &&
        s.includes('FIELD_ID')
      ) {
        return { rows: [] };
      }

      // INSERT INTO stage_gates
      if (s.startsWith('INSERT INTO STAGE_GATES')) {
        return { rows: [] };
      }

      // Existing gate lookup in updateStageGate (SELECT *)
      if (s.startsWith('SELECT * FROM STAGE_GATES') && s.includes('STAGE_ID')) {
        return {
          rows: [
            {
              id: GATE_ID,
              tenant_id: TENANT_ID,
              stage_id: STAGE_ID,
              field_id: FIELD_ID,
              gate_type: 'required',
              gate_value: null,
              error_message: null,
            },
          ],
        };
      }

      // Existence check in deleteStageGate (SELECT id)
      if (
        s.startsWith('SELECT ID FROM STAGE_GATES') &&
        s.includes('STAGE_ID')
      ) {
        return { rows: [{ id: GATE_ID }] };
      }

      // Gate + field metadata join (post-create / post-update refetch, list)
      if (
        s.includes('FROM STAGE_GATES AS SG') &&
        s.includes('JOIN FIELD_DEFINITIONS AS FD')
      ) {
        return {
          rows: [
            {
              id: GATE_ID,
              stage_id: STAGE_ID,
              field_id: FIELD_ID,
              gate_type: 'required',
              gate_value: null,
              error_message: null,
              field_label: 'Deal Value',
              field_type: 'currency',
            },
          ],
        };
      }

      // UPDATE / DELETE are no-ops for shape assertions
      if (
        s.startsWith('UPDATE STAGE_GATES') ||
        s.startsWith('DELETE FROM STAGE_GATES')
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
    }

    return { capturedQueries, mockQuery, mockConnect, resetCapture };
  },
);

vi.mock('../../db/client.js', () => ({
  pool: { query: mockQuery, connect: mockConnect },
}));

const {
  listStageGates,
  createStageGate,
  updateStageGate,
  deleteStageGate,
} = await import('../stageGateService.js');

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

describe('stageGateService Kysely SQL — tenant_id defence-in-depth', () => {
  it('every data query on listStageGates references tenant_id', async () => {
    await listStageGates(TENANT_ID, STAGE_ID);

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

  it('every data query on createStageGate references tenant_id', async () => {
    await createStageGate(TENANT_ID, STAGE_ID, {
      fieldId: FIELD_ID,
      gateType: 'required',
      errorMessage: 'Deal value is required',
    });

    const queries = dataQueries();
    expect(queries.length).toBeGreaterThan(0);
    for (const q of queries) {
      const s = normalise(q.sql);
      // INSERT binds tenant_id as a value parameter rather than a WHERE;
      // both paths are acceptable.
      const hasPredicate = s.includes('TENANT_ID');
      expect(
        hasPredicate,
        `Query missing TENANT_ID:\n  ${q.sql}`,
      ).toBe(true);
    }
  });

  it('every data query on updateStageGate references tenant_id', async () => {
    await updateStageGate(TENANT_ID, STAGE_ID, GATE_ID, {
      errorMessage: 'Updated message',
    });

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

  it('every data query on deleteStageGate references tenant_id', async () => {
    await deleteStageGate(TENANT_ID, STAGE_ID, GATE_ID);

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

describe('stageGateService Kysely SQL — generated SQL shape', () => {
  it('listStageGates joins stage_gates with field_definitions in one query (no N+1)', async () => {
    await listStageGates(TENANT_ID, STAGE_ID);

    const gateJoins = dataQueries().filter((q) => {
      const s = normalise(q.sql);
      return (
        s.includes('FROM STAGE_GATES AS SG') &&
        s.includes('JOIN FIELD_DEFINITIONS AS FD')
      );
    });
    expect(gateJoins.length).toBe(1);

    const s = normalise(gateJoins[0]!.sql);
    // Projected aliases the service relies on for rowToStageGateResponse()
    expect(s).toContain('FIELD_LABEL');
    expect(s).toContain('FIELD_TYPE');
    // Scoped to the stage + tenant
    expect(s).toContain('SG.STAGE_ID');
    expect(s).toContain('SG.TENANT_ID');
    // Deterministic ordering
    expect(s).toContain('ORDER BY SG.ID');
  });

  it('createStageGate resolves the stage via a stage_definitions/pipeline_definitions join', async () => {
    await createStageGate(TENANT_ID, STAGE_ID, {
      fieldId: FIELD_ID,
      gateType: 'required',
    });

    const joinQueries = dataQueries().filter((q) => {
      const s = normalise(q.sql);
      return (
        s.includes('FROM STAGE_DEFINITIONS AS SD') &&
        s.includes('JOIN PIPELINE_DEFINITIONS AS PD') &&
        s.includes('PD.OBJECT_ID')
      );
    });
    // Exactly one resolveStageAndObject call — not repeated per validation step
    expect(joinQueries.length).toBe(1);
  });

  it('createStageGate issues exactly one INSERT INTO stage_gates with 7 columns', async () => {
    await createStageGate(TENANT_ID, STAGE_ID, {
      fieldId: FIELD_ID,
      gateType: 'required',
      errorMessage: 'Deal value is required',
    });

    const inserts = dataQueries().filter((q) =>
      normalise(q.sql).startsWith('INSERT INTO STAGE_GATES'),
    );
    expect(inserts.length).toBe(1);
    // id, tenant_id, stage_id, field_id, gate_type, gate_value, error_message
    expect(inserts[0]!.params.length).toBe(7);
    // tenant_id is the second bind
    expect(inserts[0]!.params[1]).toBe(TENANT_ID);
    expect(inserts[0]!.params[2]).toBe(STAGE_ID);
    expect(inserts[0]!.params[3]).toBe(FIELD_ID);
    expect(inserts[0]!.params[4]).toBe('required');
  });

  it('updateStageGate UPDATE carries id + stage_id + tenant_id in WHERE', async () => {
    await updateStageGate(TENANT_ID, STAGE_ID, GATE_ID, {
      errorMessage: 'Updated',
    });

    const updates = dataQueries().filter((q) =>
      normalise(q.sql).startsWith('UPDATE STAGE_GATES SET'),
    );
    expect(updates.length).toBe(1);

    const s = normalise(updates[0]!.sql);
    expect(s).toContain('ERROR_MESSAGE =');
    expect(s).toContain('WHERE');
    expect(s).toContain('ID =');
    expect(s).toContain('STAGE_ID =');
    expect(s).toContain('TENANT_ID =');
  });

  it('updateStageGate with no fields skips the UPDATE entirely', async () => {
    await updateStageGate(TENANT_ID, STAGE_ID, GATE_ID, {});

    const updates = dataQueries().filter((q) =>
      normalise(q.sql).startsWith('UPDATE STAGE_GATES SET'),
    );
    expect(updates.length).toBe(0);
  });

  it('deleteStageGate issues exactly one DELETE scoped by id + stage_id + tenant_id', async () => {
    await deleteStageGate(TENANT_ID, STAGE_ID, GATE_ID);

    const deletes = dataQueries().filter((q) =>
      normalise(q.sql).startsWith('DELETE FROM STAGE_GATES'),
    );
    expect(deletes.length).toBe(1);

    const s = normalise(deletes[0]!.sql);
    expect(s).toContain('WHERE');
    expect(s).toContain('ID =');
    expect(s).toContain('STAGE_ID =');
    expect(s).toContain('TENANT_ID =');
  });
});

describe('stageGateService Kysely SQL — no BEGIN/COMMIT (no explicit transactions)', () => {
  it('createStageGate runs without opening an explicit transaction', async () => {
    await createStageGate(TENANT_ID, STAGE_ID, {
      fieldId: FIELD_ID,
      gateType: 'required',
    });
    const sqls = capturedQueries.map((q) => normalise(q.sql));
    expect(sqls).not.toContain('BEGIN');
    expect(sqls).not.toContain('COMMIT');
  });

  it('updateStageGate runs without opening an explicit transaction', async () => {
    await updateStageGate(TENANT_ID, STAGE_ID, GATE_ID, {
      errorMessage: 'Updated',
    });
    const sqls = capturedQueries.map((q) => normalise(q.sql));
    expect(sqls).not.toContain('BEGIN');
    expect(sqls).not.toContain('COMMIT');
  });

  it('deleteStageGate runs without opening an explicit transaction', async () => {
    await deleteStageGate(TENANT_ID, STAGE_ID, GATE_ID);
    const sqls = capturedQueries.map((q) => normalise(q.sql));
    expect(sqls).not.toContain('BEGIN');
    expect(sqls).not.toContain('COMMIT');
  });
});
