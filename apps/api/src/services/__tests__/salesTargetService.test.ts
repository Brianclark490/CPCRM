import { describe, it, expect, vi, beforeEach } from 'vitest';

const TENANT_ID = 'test-tenant-001';

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ─── Fake DB pool ─────────────────────────────────────────────────────────────
//
// Kysely's PostgresDriver calls `client.query({text, values})` while the
// legacy raw-pg path used `pool.query(sql, params)` tuples. This mock
// accepts both shapes and normalises identifier quoting so the SQL matchers
// stay readable.

const { fakeTargets, mockQuery, mockConnect, clientCalls } = vi.hoisted(() => {
  const fakeTargets = new Map<string, Record<string, unknown>>();
  const clientCalls: Array<{ sql: string; params: unknown[] }> = [];
  let targetCounter = 0;

  function runQuery(rawSql: string, params: unknown[]): { rows: unknown[]; rowCount?: number; command?: string } {
    const s = rawSql
      .replace(/\s+/g, ' ')
      .replace(/"/g, '')
      .trim()
      .toUpperCase();

    if (s === 'BEGIN' || s === 'COMMIT' || s === 'ROLLBACK') {
      return { rows: [] };
    }
    if (s.startsWith('SELECT SET_CONFIG')) {
      return { rows: [] };
    }

    // INSERT INTO sales_targets ... ON CONFLICT ... RETURNING *
    if (s.startsWith('INSERT INTO SALES_TARGETS')) {
      const id = `new-target-id-${++targetCounter}`;
      const [
        tenant_id,
        target_type,
        target_entity_id,
        period_type,
        period_start,
        period_end,
        target_value,
        currency,
        created_by,
      ] = params as unknown[];
      const row = {
        id,
        tenant_id,
        target_type,
        target_entity_id,
        period_type,
        period_start,
        period_end,
        target_value,
        currency,
        created_by,
        created_at: new Date(),
        updated_at: new Date(),
      };
      fakeTargets.set(id, row);
      return { rows: [row], rowCount: 1, command: 'INSERT' };
    }

    // SELECT FROM sales_targets (list)
    if (s.includes('FROM SALES_TARGETS') && s.startsWith('SELECT')) {
      const tenantId = params[0] as string;
      const rows = [...fakeTargets.values()].filter((t) => t.tenant_id === tenantId);
      return { rows };
    }

    // DELETE FROM sales_targets WHERE id = $1 AND tenant_id = $2
    if (s.startsWith('DELETE FROM SALES_TARGETS')) {
      const targetId = params[0] as string;
      const tenantId = params[1] as string;
      const target = fakeTargets.get(targetId);
      if (target && target.tenant_id === tenantId) {
        fakeTargets.delete(targetId);
        return { rows: [], rowCount: 1, command: 'DELETE' };
      }
      return { rows: [], rowCount: 0, command: 'DELETE' };
    }

    // Actuals calculation query (COALESCE(SUM...))
    if (s.includes('COALESCE(SUM')) {
      return { rows: [{ actual: '12500.00' }] };
    }

    // Fallback
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
      clientCalls.push({ sql, params });
      return runQuery(sql, params);
    }),
    release: vi.fn(),
  }));

  return { fakeTargets, mockQuery, mockConnect, clientCalls };
});

vi.mock('../../db/client.js', () => ({
  pool: { query: mockQuery, connect: mockConnect },
}));

const { upsertTarget, listTargets, deleteTarget, calculateActual, calculatePace } = await import(
  '../salesTargetService.js'
);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('salesTargetService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakeTargets.clear();
    clientCalls.length = 0;
  });

  // ── upsertTarget ──────────────────────────────────────────────────────────

  describe('upsertTarget', () => {
    it('creates a new target with valid params', async () => {
      const result = await upsertTarget(TENANT_ID, {
        targetType: 'business',
        periodType: 'quarterly',
        periodStart: '2026-01-01',
        periodEnd: '2026-04-01',
        targetValue: 500000,
        currency: 'GBP',
      });

      expect(result).toBeDefined();
      expect(result.id).toBe('new-target-id-1');
      expect(result.target_type).toBe('business');
      expect(result.target_value).toBe(500000);
    });

    it('rejects invalid target_type', async () => {
      await expect(
        upsertTarget(TENANT_ID, {
          targetType: 'invalid',
          periodType: 'quarterly',
          periodStart: '2026-01-01',
          periodEnd: '2026-04-01',
          targetValue: 500000,
        }),
      ).rejects.toThrow('target_type must be one of');
    });

    it('rejects invalid period_type', async () => {
      await expect(
        upsertTarget(TENANT_ID, {
          targetType: 'business',
          periodType: 'weekly',
          periodStart: '2026-01-01',
          periodEnd: '2026-04-01',
          targetValue: 500000,
        }),
      ).rejects.toThrow('period_type must be one of');
    });

    it('rejects invalid period_start format', async () => {
      await expect(
        upsertTarget(TENANT_ID, {
          targetType: 'business',
          periodType: 'quarterly',
          periodStart: 'not-a-date',
          periodEnd: '2026-04-01',
          targetValue: 500000,
        }),
      ).rejects.toThrow('period_start must be a valid ISO date');
    });

    it('rejects period_end before period_start', async () => {
      await expect(
        upsertTarget(TENANT_ID, {
          targetType: 'business',
          periodType: 'quarterly',
          periodStart: '2026-04-01',
          periodEnd: '2026-01-01',
          targetValue: 500000,
        }),
      ).rejects.toThrow('period_end must be after period_start');
    });

    it('rejects negative target_value', async () => {
      await expect(
        upsertTarget(TENANT_ID, {
          targetType: 'business',
          periodType: 'quarterly',
          periodStart: '2026-01-01',
          periodEnd: '2026-04-01',
          targetValue: -100,
        }),
      ).rejects.toThrow('target_value must be a non-negative number');
    });

    it('requires target_entity_id for team targets', async () => {
      await expect(
        upsertTarget(TENANT_ID, {
          targetType: 'team',
          periodType: 'quarterly',
          periodStart: '2026-01-01',
          periodEnd: '2026-04-01',
          targetValue: 300000,
        }),
      ).rejects.toThrow('target_entity_id is required for team and user targets');
    });

    it('requires target_entity_id for user targets', async () => {
      await expect(
        upsertTarget(TENANT_ID, {
          targetType: 'user',
          periodType: 'monthly',
          periodStart: '2026-03-01',
          periodEnd: '2026-04-01',
          targetValue: 100000,
        }),
      ).rejects.toThrow('target_entity_id is required for team and user targets');
    });

    it('accepts team targets with entity_id', async () => {
      const result = await upsertTarget(TENANT_ID, {
        targetType: 'team',
        targetEntityId: 'team-rec-1',
        periodType: 'quarterly',
        periodStart: '2026-01-01',
        periodEnd: '2026-04-01',
        targetValue: 300000,
      });

      expect(result).toBeDefined();
      expect(result.target_type).toBe('team');
    });

    it('rejects invalid currency format', async () => {
      await expect(
        upsertTarget(TENANT_ID, {
          targetType: 'business',
          periodType: 'quarterly',
          periodStart: '2026-01-01',
          periodEnd: '2026-04-01',
          targetValue: 500000,
          currency: 'INVALID',
        }),
      ).rejects.toThrow('currency must be a 3-letter ISO code');
    });
  });

  // ── listTargets ───────────────────────────────────────────────────────────

  describe('listTargets', () => {
    it('returns empty array when no targets exist', async () => {
      const result = await listTargets(TENANT_ID);
      expect(result).toEqual([]);
    });

    it('returns targets for the tenant', async () => {
      fakeTargets.set('t1', {
        id: 't1',
        tenant_id: TENANT_ID,
        target_type: 'business',
        target_entity_id: null,
        period_type: 'quarterly',
        period_start: new Date('2026-01-01'),
        period_end: new Date('2026-04-01'),
        target_value: '500000',
        currency: 'GBP',
        created_at: new Date(),
        updated_at: new Date(),
      });

      const result = await listTargets(TENANT_ID);
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('t1');
    });
  });

  // ── deleteTarget ──────────────────────────────────────────────────────────

  describe('deleteTarget', () => {
    it('deletes an existing target', async () => {
      fakeTargets.set('target-to-delete', {
        id: 'target-to-delete',
        tenant_id: TENANT_ID,
      });

      await expect(deleteTarget(TENANT_ID, 'target-to-delete')).resolves.toBeUndefined();
    });

    it('throws NOT_FOUND for non-existent target', async () => {
      await expect(deleteTarget(TENANT_ID, 'nonexistent')).rejects.toThrow('Target not found');
    });
  });

  // ── calculateActual ───────────────────────────────────────────────────────

  describe('calculateActual', () => {
    it('returns the actual from closed won opportunities', async () => {
      const result = await calculateActual(TENANT_ID, '2026-01-01', '2026-04-01');
      expect(result).toBe(12500);
    });

    it('passes owner_id when provided', async () => {
      await calculateActual(TENANT_ID, '2026-01-01', '2026-04-01', 'user-123');

      // Kysely's PostgresDriver checks out a client and runs the SELECT
      // against it; assert the owner_id bind landed on one of the
      // captured client.query calls.
      const ownerIdBound = clientCalls.some((c) =>
        c.params.some((p) => p === 'user-123'),
      );
      expect(ownerIdBound).toBe(true);
    });
  });

  // ── calculatePace ─────────────────────────────────────────────────────────

  describe('calculatePace', () => {
    it('returns on_track when pace > 90%', () => {
      // Period: Jan 1 to Apr 1 (90 days). If we're halfway through (45 days),
      // and percentage is 55%, pace = 55 / (0.5 * 100) = 1.1 → on_track
      const midpoint = new Date('2026-01-01');
      midpoint.setDate(midpoint.getDate() + 45);
      vi.setSystemTime(midpoint);

      const result = calculatePace(55, '2026-01-01', '2026-04-01');
      expect(result).toBe('on_track');
    });

    it('returns at_risk when pace is between 70% and 90%', () => {
      // Period: Jan 1 to Apr 1 (90 days). At day 45 (50%),
      // percentage is 40%, pace = 40 / (0.5 * 100) = 0.8 → at_risk
      const midpoint = new Date('2026-01-01');
      midpoint.setDate(midpoint.getDate() + 45);
      vi.setSystemTime(midpoint);

      const result = calculatePace(40, '2026-01-01', '2026-04-01');
      expect(result).toBe('at_risk');
    });

    it('returns behind when pace < 70%', () => {
      // Period: Jan 1 to Apr 1 (90 days). At day 45 (50%),
      // percentage is 30%, pace = 30 / (0.5 * 100) = 0.6 → behind
      const midpoint = new Date('2026-01-01');
      midpoint.setDate(midpoint.getDate() + 45);
      vi.setSystemTime(midpoint);

      const result = calculatePace(30, '2026-01-01', '2026-04-01');
      expect(result).toBe('behind');
    });

    it('returns behind for invalid period range', () => {
      const result = calculatePace(50, '2026-04-01', '2026-01-01');
      expect(result).toBe('behind');
    });

    it('returns on_track before the period starts', () => {
      vi.setSystemTime(new Date('2026-12-01'));

      const result = calculatePace(0, '2027-01-01', '2027-04-01');
      expect(result).toBe('on_track');
    });
  });
});
