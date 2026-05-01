import { describe, it, expect, vi, beforeEach } from 'vitest';

const TENANT_ID = 'test-tenant-001';

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ─── Fake DB pool ─────────────────────────────────────────────────────────────
//
// NOTE (Phase 3b Kysely migration, issue #445): the service is now on
// Kysely. The mock below therefore matches Kysely-emitted SQL. Identifier
// quoting is stripped by the normaliser, matching the pattern used by
// stageMovementService.test.ts. The test bodies further down are kept
// semantically unchanged — only the mock router is updated.
//
// A dedicated Kysely SQL regression suite lives next door:
//   apps/api/src/services/__tests__/pipelineAnalyticsService.kysely-sql.test.ts

const {
  fakePipelines,
  fakeStages,
  fakeRecords,
  fakeStageHistory,
  mockQuery,
  mockConnect,
} = vi.hoisted(() => {
  const fakePipelines = new Map<string, Record<string, unknown>>();
  const fakeStages = new Map<string, Record<string, unknown>>();
  const fakeRecords = new Map<string, Record<string, unknown>>();
  const fakeStageHistory = new Map<string, Record<string, unknown>>();

  function runQuery(sql: string, params?: unknown[]) {
    // Strip identifier quotes and normalise whitespace so pattern-matching
    // is quote-agnostic (Kysely wraps identifiers in "…").
    const s = sql.replace(/\s+/g, ' ').replace(/"/g, '').trim().toUpperCase();

    // SELECT id, name, object_id FROM pipeline_definitions WHERE id = $1 AND tenant_id = $2
    if (s.startsWith('SELECT ID, NAME, OBJECT_ID FROM PIPELINE_DEFINITIONS WHERE ID')) {
      const id = params![0] as string;
      const row = fakePipelines.get(id);
      if (row) return { rows: [{ id: row.id, name: row.name, object_id: row.object_id ?? 'opp-obj-id' }] };
      return { rows: [] };
    }

    // SELECT id, name, api_name, stage_type, default_probability, expected_days FROM stage_definitions WHERE pipeline_id
    if (s.includes('DEFAULT_PROBABILITY') && s.includes('EXPECTED_DAYS') && s.includes('STAGE_DEFINITIONS WHERE PIPELINE_ID')) {
      const pipelineId = params![0] as string;
      const rows = [...fakeStages.values()]
        .filter((st) => st.pipeline_id === pipelineId)
        .sort((a, b) => (a.sort_order as number) - (b.sort_order as number))
        .map((st) => ({
          id: st.id,
          name: st.name,
          api_name: st.api_name ?? (st.name as string).toLowerCase().replace(/\s+/g, '_'),
          stage_type: st.stage_type,
          default_probability: st.default_probability,
          expected_days: st.expected_days,
        }));
      return { rows };
    }

    // SELECT id, name, stage_type, expected_days FROM stage_definitions WHERE pipeline_id (velocity variant)
    if (s.includes('EXPECTED_DAYS') && s.includes('STAGE_DEFINITIONS WHERE PIPELINE_ID') && !s.includes('DEFAULT_PROBABILITY')) {
      const pipelineId = params![0] as string;
      const rows = [...fakeStages.values()]
        .filter((st) => st.pipeline_id === pipelineId)
        .sort((a, b) => (a.sort_order as number) - (b.sort_order as number))
        .map((st) => ({ id: st.id, name: st.name, stage_type: st.stage_type, expected_days: st.expected_days }));
      return { rows };
    }

    // Records for summary: SELECT id, field_values, current_stage_id, stage_entered_at
    //   FROM records WHERE tenant_id = $1 AND (pipeline_id = $2 OR (object_id = $3 AND pipeline_id IS NULL))
    // Params order: [tenantId, pipelineId, objectId]
    if (
      s.includes('FROM RECORDS') &&
      s.includes('FIELD_VALUES') &&
      s.includes('CURRENT_STAGE_ID') &&
      s.includes('STAGE_ENTERED_AT') &&
      !s.includes('JOIN STAGE_DEFINITIONS')
    ) {
      const pipelineId = params![1] as string;
      const objectId = params![2] as string;
      const matching = [...fakeRecords.values()].filter(
        (r) =>
          (r.pipeline_id === pipelineId || (r.object_id === objectId && !r.pipeline_id)),
      );
      const rows = matching.map((r) => ({
        id: r.id,
        field_values: r.field_values,
        current_stage_id: r.current_stage_id ?? null,
        stage_entered_at: r.stage_entered_at ?? null,
      }));
      return { rows };
    }

    // Won this month (COUNT DISTINCT + SUM) — emits alias COUNT(DISTINCT sh.record_id)::int AS won_count
    // Params order: [pipelineId, tenantId, 'won', monthStart]
    if (s.includes('WON_COUNT') && s.includes('WON_VALUE')) {
      const pipelineId = params![0] as string;
      const monthStart = params![3] as Date;
      const wonStageIds = [...fakeStages.values()]
        .filter((st) => st.stage_type === 'won')
        .map((st) => st.id as string);
      let wonCount = 0;
      let wonValue = 0;
      const seenRecords = new Set<string>();
      for (const h of fakeStageHistory.values()) {
        if (
          h.pipeline_id === pipelineId &&
          wonStageIds.includes(h.to_stage_id as string) &&
          new Date(h.changed_at as string) >= monthStart
        ) {
          const rec = fakeRecords.get(h.record_id as string);
          if (rec && !seenRecords.has(rec.id as string)) {
            seenRecords.add(rec.id as string);
            wonCount++;
            const fv = (rec.field_values as Record<string, unknown>) ?? {};
            wonValue += Number(fv.value ?? fv.amount ?? fv.deal_value ?? 0);
          }
        }
      }
      return { rows: [{ won_count: wonCount, won_value: wonValue }] };
    }

    // Lost this month — Params order: [pipelineId, tenantId, 'lost', monthStart]
    if (s.includes('LOST_COUNT')) {
      const pipelineId = params![0] as string;
      const monthStart = params![3] as Date;
      const lostStageIds = [...fakeStages.values()]
        .filter((st) => st.stage_type === 'lost')
        .map((st) => st.id as string);
      let lostCount = 0;
      const seenRecords = new Set<string>();
      for (const h of fakeStageHistory.values()) {
        if (
          h.pipeline_id === pipelineId &&
          lostStageIds.includes(h.to_stage_id as string) &&
          new Date(h.changed_at as string) >= monthStart
        ) {
          const rec = fakeRecords.get(h.record_id as string);
          if (rec && !seenRecords.has(rec.id as string)) {
            seenRecords.add(rec.id as string);
            lostCount++;
          }
        }
      }
      return { rows: [{ lost_count: lostCount }] };
    }

    // Entered count (to_stage_id) — Kysely emits: sh.to_stage_id as stage_id
    if (s.includes('TO_STAGE_ID AS STAGE_ID') && s.includes('ENTERED') && s.includes('GROUP BY')) {
      const pipelineId = params![0] as string;
      const history = [...fakeStageHistory.values()].filter((h) => {
        return h.pipeline_id === pipelineId;
      });
      const grouped = new Map<string, number>();
      for (const h of history) {
        const stageId = h.to_stage_id as string;
        grouped.set(stageId, (grouped.get(stageId) ?? 0) + 1);
      }
      const rows = [...grouped.entries()].map(([stageId, count]) => ({
        stage_id: stageId,
        entered: count,
      }));
      return { rows };
    }

    // Exited count (from_stage_id)
    if (s.includes('FROM_STAGE_ID AS STAGE_ID') && s.includes('EXITED') && s.includes('GROUP BY')) {
      const pipelineId = params![0] as string;
      const history = [...fakeStageHistory.values()].filter((h) => {
        return (
          h.pipeline_id === pipelineId &&
          h.from_stage_id
        );
      });
      const grouped = new Map<string, { count: number; totalDays: number }>();
      for (const h of history) {
        const stageId = h.from_stage_id as string;
        const current = grouped.get(stageId) ?? { count: 0, totalDays: 0 };
        current.count += 1;
        current.totalDays += (h.days_in_previous_stage as number) ?? 0;
        grouped.set(stageId, current);
      }
      const rows = [...grouped.entries()].map(([stageId, agg]) => ({
        stage_id: stageId,
        exited: agg.count,
        avg_days: agg.count > 0 ? agg.totalDays / agg.count : 0,
      }));
      return { rows };
    }

    // Avg days to close — returned by the wrapping SELECT over the subquery alias
    if (s.includes('AVG_DAYS') && s.includes('DURATION_DAYS')) {
      return { rows: [{ avg_days: 0 }] };
    }

    // Overdue records — Params order: [tenantId, pipelineId, objectId]
    if (s.includes('DAYS_IN_STAGE') && s.includes('STAGE_NAME') && s.includes('FROM RECORDS')) {
      const pipelineId = params![1] as string;
      const objectId = params![2] as string;
      const results: Array<Record<string, unknown>> = [];
      for (const r of fakeRecords.values()) {
        if (
          !(r.pipeline_id === pipelineId || (r.object_id === objectId && !r.pipeline_id)) ||
          !r.current_stage_id ||
          !r.stage_entered_at
        )
          continue;
        const stage = fakeStages.get(r.current_stage_id as string);
        if (!stage || stage.expected_days == null) continue;
        const enteredAt = new Date(r.stage_entered_at as string);
        const daysInStage = (Date.now() - enteredAt.getTime()) / (86400 * 1000);
        if (daysInStage > (stage.expected_days as number)) {
          const fv = (r.field_values as Record<string, unknown>) ?? {};
          results.push({
            id: r.id,
            name: r.name,
            value: fv.value ?? fv.amount ?? fv.deal_value ?? null,
            days_in_stage: daysInStage,
            expected_days: stage.expected_days,
            stage_name: stage.name,
            owner_id: r.owner_id,
          });
        }
      }
      // Sort by most overdue first
      results.sort((a, b) => {
        const overdueA = (a.days_in_stage as number) - (a.expected_days as number);
        const overdueB = (b.days_in_stage as number) - (b.expected_days as number);
        return overdueB - overdueA;
      });
      return { rows: results };
    }

    return { rows: [] };
  }

  const mockQuery = vi.fn(async (sql: string, params?: unknown[]) => {
    const rawSql = typeof sql === 'string' ? sql : (sql as { text: string }).text;
    return runQuery(rawSql, params);
  });

  const mockConnect = vi.fn(async () => ({
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      const rawSql = typeof sql === 'string' ? sql : (sql as { text: string }).text;
      return runQuery(rawSql, params);
    }),
    release: vi.fn(),
  }));

  return { fakePipelines, fakeStages, fakeRecords, fakeStageHistory, mockQuery, mockConnect };
});

vi.mock('../../db/client.js', () => ({
  pool: { query: mockQuery, connect: mockConnect },
}));

const {
  getPipelineSummary,
  getPipelineVelocity,
  getOverdueRecords,
} = await import('../pipelineAnalyticsService.js');

// ─── Setup helpers ───────────────────────────────────────────────────────────

const PIPELINE_ID = 'pipeline-1';
const OWNER_ID = 'user-123';
const OBJECT_ID = 'opp-obj-id';

function seedPipeline(id = PIPELINE_ID) {
  fakePipelines.set(id, { id, name: 'Sales Pipeline', object_id: OBJECT_ID });
}

function seedStages(pipelineId = PIPELINE_ID) {
  const stages = [
    { id: 'stage-prospecting', pipeline_id: pipelineId, name: 'Prospecting', api_name: 'prospecting', stage_type: 'open', sort_order: 0, default_probability: 10, expected_days: 14 },
    { id: 'stage-qualification', pipeline_id: pipelineId, name: 'Qualification', api_name: 'qualification', stage_type: 'open', sort_order: 1, default_probability: 25, expected_days: 14 },
    { id: 'stage-won', pipeline_id: pipelineId, name: 'Closed Won', api_name: 'closed_won', stage_type: 'won', sort_order: 2, default_probability: 100, expected_days: null },
    { id: 'stage-lost', pipeline_id: pipelineId, name: 'Closed Lost', api_name: 'closed_lost', stage_type: 'lost', sort_order: 3, default_probability: 0, expected_days: null },
  ];
  for (const stage of stages) {
    fakeStages.set(stage.id, stage);
  }
}

function seedRecord(
  id: string,
  stageId: string,
  value: number,
  daysAgo: number,
  ownerId = OWNER_ID,
  pipelineId: string | null = PIPELINE_ID,
) {
  const enteredAt = new Date(Date.now() - daysAgo * 86400 * 1000);
  fakeRecords.set(id, {
    id,
    pipeline_id: pipelineId,
    object_id: OBJECT_ID,
    current_stage_id: stageId,
    stage_entered_at: enteredAt.toISOString(),
    field_values: { value },
    owner_id: ownerId,
    name: `Record ${id}`,
  });
}

function seedHistory(
  id: string,
  recordId: string,
  fromStageId: string | null,
  toStageId: string,
  daysAgo: number,
  daysInPrevious: number | null = null,
  pipelineId = PIPELINE_ID,
) {
  const changedAt = new Date(Date.now() - daysAgo * 86400 * 1000);
  fakeStageHistory.set(id, {
    id,
    record_id: recordId,
    pipeline_id: pipelineId,
    from_stage_id: fromStageId,
    to_stage_id: toStageId,
    changed_at: changedAt.toISOString(),
    days_in_previous_stage: daysInPrevious,
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('getPipelineSummary', () => {
  beforeEach(() => {
    fakePipelines.clear();
    fakeStages.clear();
    fakeRecords.clear();
    fakeStageHistory.clear();
  });

  it('throws NOT_FOUND if pipeline does not exist', async () => {
    await expect(getPipelineSummary(TENANT_ID, 'nonexistent', OWNER_ID)).rejects.toThrow('Pipeline not found');
  });

  it('returns empty summary when no records exist', async () => {
    seedPipeline();
    seedStages();

    const result = await getPipelineSummary(TENANT_ID, PIPELINE_ID, OWNER_ID);

    expect(result.pipeline.id).toBe(PIPELINE_ID);
    expect(result.pipeline.name).toBe('Sales Pipeline');
    expect(result.stages).toHaveLength(4);
    expect(result.stages[0].recordCount).toBe(0);
    expect(result.totals.openDeals).toBe(0);
    expect(result.totals.totalOpenValue).toBe(0);
  });

  it('calculates per-stage aggregates correctly', async () => {
    seedPipeline();
    seedStages();

    // Two records in Prospecting
    seedRecord('rec-1', 'stage-prospecting', 10000, 5);
    seedRecord('rec-2', 'stage-prospecting', 20000, 10);
    // One record in Qualification
    seedRecord('rec-3', 'stage-qualification', 50000, 3);

    const result = await getPipelineSummary(TENANT_ID, PIPELINE_ID, OWNER_ID);

    const prospecting = result.stages.find((s) => s.name === 'Prospecting')!;
    expect(prospecting.recordCount).toBe(2);
    expect(prospecting.totalValue).toBe(30000);
    // weightedValue = 30000 * (10 / 100) = 3000
    expect(prospecting.weightedValue).toBe(3000);

    const qualification = result.stages.find((s) => s.name === 'Qualification')!;
    expect(qualification.recordCount).toBe(1);
    expect(qualification.totalValue).toBe(50000);
    // weightedValue = 50000 * (25 / 100) = 12500
    expect(qualification.weightedValue).toBe(12500);
  });

  it('calculates totals for open deals', async () => {
    seedPipeline();
    seedStages();

    seedRecord('rec-1', 'stage-prospecting', 10000, 5);
    seedRecord('rec-2', 'stage-qualification', 40000, 3);

    const result = await getPipelineSummary(TENANT_ID, PIPELINE_ID, OWNER_ID);

    expect(result.totals.openDeals).toBe(2);
    expect(result.totals.totalOpenValue).toBe(50000);
    expect(result.totals.avgDealSize).toBe(25000);
  });

  it('counts overdue records per stage', async () => {
    seedPipeline();
    seedStages();

    // Prospecting has expected_days=14, this record is 20 days in → overdue
    seedRecord('rec-overdue', 'stage-prospecting', 5000, 20);
    // This record is only 5 days in → not overdue
    seedRecord('rec-ok', 'stage-prospecting', 8000, 5);

    const result = await getPipelineSummary(TENANT_ID, PIPELINE_ID, OWNER_ID);

    const prospecting = result.stages.find((s) => s.name === 'Prospecting')!;
    expect(prospecting.overdueCount).toBe(1);
  });

  it('includes all tenant records regardless of ownerId', async () => {
    seedPipeline();
    seedStages();

    seedRecord('rec-mine', 'stage-prospecting', 10000, 5, OWNER_ID);
    seedRecord('rec-other', 'stage-prospecting', 20000, 5, 'other-user');

    const result = await getPipelineSummary(TENANT_ID, PIPELINE_ID, OWNER_ID);

    const prospecting = result.stages.find((s) => s.name === 'Prospecting')!;
    expect(prospecting.recordCount).toBe(2);
    expect(prospecting.totalValue).toBe(30000);
  });

  it('counts wonThisMonth and lostThisMonth from stage history', async () => {
    // Pin "now" to mid-month so seedHistory's small daysAgo offsets land
    // inside the same calendar month as Date.now(). Without this, runs on
    // the 1st or 2nd of any month bleed into the previous month and
    // wonThisMonth comes back as 0.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T12:00:00Z'));
    try {
      seedPipeline();
      seedStages();

      // Record that was moved to won this month
      seedRecord('rec-won', 'stage-won', 50000, 2);
      seedHistory('h-won', 'rec-won', 'stage-prospecting', 'stage-won', 1, 5);

      // Record that was moved to lost this month
      seedRecord('rec-lost', 'stage-lost', 10000, 3);
      seedHistory('h-lost', 'rec-lost', 'stage-prospecting', 'stage-lost', 2, 3);

      const result = await getPipelineSummary(TENANT_ID, PIPELINE_ID, OWNER_ID);

      expect(result.totals.wonThisMonth).toBe(1);
      expect(result.totals.wonValueThisMonth).toBe(50000);
      expect(result.totals.lostThisMonth).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('excludes won/lost records from open deal totals', async () => {
    seedPipeline();
    seedStages();

    seedRecord('rec-open', 'stage-prospecting', 30000, 5);
    seedRecord('rec-won', 'stage-won', 80000, 2);

    const result = await getPipelineSummary(TENANT_ID, PIPELINE_ID, OWNER_ID);

    expect(result.totals.openDeals).toBe(1);
    expect(result.totals.totalOpenValue).toBe(30000);
  });

  it('includes records without pipeline_id that match the object type', async () => {
    seedPipeline();
    seedStages();

    // Record with pipeline_id set
    seedRecord('rec-assigned', 'stage-prospecting', 10000, 5, OWNER_ID, PIPELINE_ID);
    // Record without pipeline_id (created before auto-assignment)
    seedRecord('rec-unassigned', 'stage-prospecting', 20000, 3, OWNER_ID, null);

    const result = await getPipelineSummary(TENANT_ID, PIPELINE_ID, OWNER_ID);

    const prospecting = result.stages.find((s) => s.name === 'Prospecting')!;
    expect(prospecting.recordCount).toBe(2);
    expect(prospecting.totalValue).toBe(30000);
    expect(result.totals.openDeals).toBe(2);
    expect(result.totals.totalOpenValue).toBe(30000);
  });

  it('resolves stage from field_values.stage when current_stage_id is not set', async () => {
    seedPipeline();
    seedStages();

    // Record with no current_stage_id but field_values.stage matching a stage name
    const enteredAt = new Date(Date.now() - 5 * 86400 * 1000);
    fakeRecords.set('rec-fv-stage', {
      id: 'rec-fv-stage',
      pipeline_id: PIPELINE_ID,
      object_id: OBJECT_ID,
      current_stage_id: null,
      stage_entered_at: enteredAt.toISOString(),
      field_values: { value: 15000, stage: 'Qualification' },
      owner_id: OWNER_ID,
      name: 'Record with stage field',
    });

    const result = await getPipelineSummary(TENANT_ID, PIPELINE_ID, OWNER_ID);

    const qualification = result.stages.find((s) => s.name === 'Qualification')!;
    expect(qualification.recordCount).toBe(1);
    expect(qualification.totalValue).toBe(15000);
  });

  it('uses per-record probability from field_values when available', async () => {
    seedPipeline();
    seedStages();

    // Record with per-record probability set to 50 (stage default is 10 for Prospecting)
    const enteredAt = new Date(Date.now() - 5 * 86400 * 1000);
    fakeRecords.set('rec-prob', {
      id: 'rec-prob',
      pipeline_id: PIPELINE_ID,
      object_id: OBJECT_ID,
      current_stage_id: 'stage-prospecting',
      stage_entered_at: enteredAt.toISOString(),
      field_values: { value: 20000, probability: 50 },
      owner_id: OWNER_ID,
      name: 'Record with probability',
    });

    const result = await getPipelineSummary(TENANT_ID, PIPELINE_ID, OWNER_ID);

    const prospecting = result.stages.find((s) => s.name === 'Prospecting')!;
    expect(prospecting.totalValue).toBe(20000);
    // weightedValue = 20000 * (50 / 100) = 10000 (not 2000 from stage default 10%)
    expect(prospecting.weightedValue).toBe(10000);
  });

  it('extracts value from alternative field names (amount, deal_value)', async () => {
    seedPipeline();
    seedStages();

    // Record using "amount" instead of "value"
    const enteredAt = new Date(Date.now() - 3 * 86400 * 1000);
    fakeRecords.set('rec-amount', {
      id: 'rec-amount',
      pipeline_id: PIPELINE_ID,
      object_id: OBJECT_ID,
      current_stage_id: 'stage-prospecting',
      stage_entered_at: enteredAt.toISOString(),
      field_values: { amount: 35000 },
      owner_id: OWNER_ID,
      name: 'Record with amount',
    });

    const result = await getPipelineSummary(TENANT_ID, PIPELINE_ID, OWNER_ID);

    const prospecting = result.stages.find((s) => s.name === 'Prospecting')!;
    expect(prospecting.totalValue).toBe(35000);
  });
});

describe('getPipelineVelocity', () => {
  beforeEach(() => {
    fakePipelines.clear();
    fakeStages.clear();
    fakeRecords.clear();
    fakeStageHistory.clear();
  });

  it('throws NOT_FOUND if pipeline does not exist', async () => {
    await expect(getPipelineVelocity(TENANT_ID, 'nonexistent', OWNER_ID, '30d')).rejects.toThrow(
      'Pipeline not found',
    );
  });

  it('throws VALIDATION_ERROR for invalid period', async () => {
    seedPipeline();
    await expect(getPipelineVelocity(TENANT_ID, PIPELINE_ID, OWNER_ID, 'invalid')).rejects.toThrow(
      'period must be one of',
    );
  });

  it('returns velocity with entered/exited counts from stage history', async () => {
    seedPipeline();
    seedStages();

    seedRecord('rec-1', 'stage-qualification', 10000, 3);

    // rec-1 entered Prospecting 20 days ago
    seedHistory('h1', 'rec-1', null, 'stage-prospecting', 20);
    // rec-1 exited Prospecting → Qualification 10 days ago (10 days in Prospecting)
    seedHistory('h2', 'rec-1', 'stage-prospecting', 'stage-qualification', 10, 10);

    const result = await getPipelineVelocity(TENANT_ID, PIPELINE_ID, OWNER_ID, '30d');

    expect(result.period).toBe('30d');
    expect(result.stages).toHaveLength(4);

    const prospecting = result.stages.find((s) => s.name === 'Prospecting')!;
    expect(prospecting.entered).toBe(1);
    expect(prospecting.exited).toBe(1);
    expect(prospecting.avgDays).toBe(10);
    expect(prospecting.expectedDays).toBe(14);
    expect(prospecting.conversionRate).toBe(100);

    const qualification = result.stages.find((s) => s.name === 'Qualification')!;
    expect(qualification.entered).toBe(1);
    expect(qualification.exited).toBe(0);
  });

  it('accepts all valid period values', async () => {
    seedPipeline();
    seedStages();

    for (const period of ['7d', '30d', '90d', 'all']) {
      const result = await getPipelineVelocity(TENANT_ID, PIPELINE_ID, OWNER_ID, period);
      expect(result.period).toBe(period);
    }
  });
});

describe('getOverdueRecords', () => {
  beforeEach(() => {
    fakePipelines.clear();
    fakeStages.clear();
    fakeRecords.clear();
    fakeStageHistory.clear();
  });

  it('throws NOT_FOUND if pipeline does not exist', async () => {
    await expect(getOverdueRecords(TENANT_ID, 'nonexistent', OWNER_ID)).rejects.toThrow(
      'Pipeline not found',
    );
  });

  it('returns overdue records sorted by most overdue', async () => {
    seedPipeline();
    seedStages();

    // 20 days in Prospecting (expected: 14) → 6 days overdue
    seedRecord('rec-a', 'stage-prospecting', 5000, 20);
    // 30 days in Prospecting (expected: 14) → 16 days overdue
    seedRecord('rec-b', 'stage-prospecting', 15000, 30);
    // 5 days in Prospecting (expected: 14) → NOT overdue
    seedRecord('rec-ok', 'stage-prospecting', 8000, 5);

    const result = await getOverdueRecords(TENANT_ID, PIPELINE_ID, OWNER_ID);

    expect(result).toHaveLength(2);
    // Most overdue first
    expect(result[0].id).toBe('rec-b');
    expect(result[0].value).toBe(15000);
    expect(result[0].expectedDays).toBe(14);
    expect(result[0].daysInStage).toBeGreaterThan(14);
    expect(result[0].stageName).toBe('Prospecting');

    expect(result[1].id).toBe('rec-a');
  });

  it('returns empty array when no records are overdue', async () => {
    seedPipeline();
    seedStages();

    seedRecord('rec-ok', 'stage-prospecting', 8000, 5);

    const result = await getOverdueRecords(TENANT_ID, PIPELINE_ID, OWNER_ID);
    expect(result).toHaveLength(0);
  });

  it('excludes stages with no expected_days', async () => {
    seedPipeline();
    seedStages();

    // Won stage has expected_days=null, so even old records shouldn't show
    seedRecord('rec-won', 'stage-won', 50000, 100);

    const result = await getOverdueRecords(TENANT_ID, PIPELINE_ID, OWNER_ID);
    expect(result).toHaveLength(0);
  });
});
