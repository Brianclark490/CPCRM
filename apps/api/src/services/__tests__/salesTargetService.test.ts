import { describe, it, expect, vi, beforeEach } from 'vitest';

const TENANT_ID = 'test-tenant-001';

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ─── Fake DB pool ─────────────────────────────────────────────────────────────

const { fakeTargets, mockQuery } = vi.hoisted(() => {
  const fakeTargets = new Map<string, Record<string, unknown>>();

  const mockQuery = vi.fn(async (sql: string, params?: unknown[]) => {
    const s = sql.replace(/\s+/g, ' ').trim().toUpperCase();

    // INSERT INTO sales_targets ... RETURNING *
    if (s.startsWith('INSERT INTO SALES_TARGETS')) {
      const id = 'new-target-id';
      const row = {
        id,
        tenant_id: params![0],
        target_type: params![1],
        target_entity_id: params![2],
        period_type: params![3],
        period_start: new Date(params![4] as string),
        period_end: new Date(params![5] as string),
        target_value: params![6],
        currency: params![7],
        created_at: new Date(),
        updated_at: new Date(),
      };
      fakeTargets.set(id, row);
      return { rows: [row] };
    }

    // SELECT * FROM sales_targets WHERE tenant_id = $1 (list)
    if (s.startsWith('SELECT * FROM SALES_TARGETS WHERE TENANT_ID')) {
      const tenantId = params![0] as string;
      const rows = [...fakeTargets.values()].filter((t) => t.tenant_id === tenantId);
      return { rows };
    }

    // DELETE FROM sales_targets WHERE id = $1 AND tenant_id = $2
    if (s.startsWith('DELETE FROM SALES_TARGETS')) {
      const targetId = params![0] as string;
      const tenantId = params![1] as string;
      const target = fakeTargets.get(targetId);
      if (target && target.tenant_id === tenantId) {
        fakeTargets.delete(targetId);
        return { rowCount: 1 };
      }
      return { rowCount: 0 };
    }

    // Actuals calculation query (COALESCE(SUM...))
    if (s.includes('COALESCE(SUM')) {
      return { rows: [{ actual: '12500.00' }] };
    }

    // Fallback
    return { rows: [] };
  });

  return { fakeTargets, mockQuery };
});

vi.mock('../../db/client.js', () => ({
  pool: { query: mockQuery },
}));

const { upsertTarget, listTargets, deleteTarget, calculateActual } = await import(
  '../salesTargetService.js'
);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('salesTargetService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakeTargets.clear();
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
      expect(result.id).toBe('new-target-id');
      expect(result.target_type).toBe('business');
      expect(result.target_value).toBe(500000);
      expect(mockQuery).toHaveBeenCalledTimes(1);
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

      const lastCall = mockQuery.mock.calls[mockQuery.mock.calls.length - 1];
      expect(lastCall[1]).toContain('user-123');
    });
  });
});
