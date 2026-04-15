import { sql } from 'kysely';
import { logger } from '../lib/logger.js';
import { db } from '../db/kysely.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StageSummary {
  id: string;
  name: string;
  stageType: string;
  recordCount: number;
  totalValue: number;
  weightedValue: number;
  avgDaysInStage: number;
  overdueCount: number;
}

export interface PipelineTotals {
  openDeals: number;
  totalOpenValue: number;
  totalWeightedValue: number;
  avgDealSize: number;
  wonThisMonth: number;
  wonValueThisMonth: number;
  lostThisMonth: number;
}

export interface PipelineSummaryResponse {
  pipeline: { id: string; name: string };
  stages: StageSummary[];
  totals: PipelineTotals;
}

export interface StageVelocity {
  name: string;
  entered: number;
  exited: number;
  avgDays: number;
  expectedDays: number | null;
  conversionRate: number;
}

export interface PipelineVelocityResponse {
  period: string;
  stages: StageVelocity[];
  overallConversion: number;
  avgDaysToClose: number;
}

export interface OverdueRecord {
  id: string;
  name: string;
  value: number | null;
  daysInStage: number;
  expectedDays: number;
  stageName: string;
  ownerId: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function throwNotFoundError(message: string): never {
  const err = new Error(message) as Error & { code: string };
  err.code = 'NOT_FOUND';
  throw err;
}

function throwValidationError(message: string): never {
  const err = new Error(message) as Error & { code: string };
  err.code = 'VALIDATION_ERROR';
  throw err;
}

const ALLOWED_PERIODS = new Set(['7d', '30d', '90d', 'all']);

function periodToDays(period: string): number | null {
  switch (period) {
    case '7d':
      return 7;
    case '30d':
      return 30;
    case '90d':
      return 90;
    case 'all':
      return null;
    default:
      return null;
  }
}

async function resolvePipeline(
  tenantId: string,
  pipelineId: string,
): Promise<{ id: string; name: string; objectId: string }> {
  const row = await db
    .selectFrom('pipeline_definitions')
    .select(['id', 'name', 'object_id'])
    .where('id', '=', pipelineId)
    .where('tenant_id', '=', tenantId)
    .executeTakeFirst();

  if (!row) {
    throwNotFoundError('Pipeline not found');
  }

  return { id: row.id, name: row.name, objectId: row.object_id };
}

/**
 * Extract a numeric value from field_values, checking multiple common field
 * names (value, amount, deal_value) to match the kanban board's extraction
 * logic.
 */
function extractRecordValue(fv: Record<string, unknown>): number {
  const v = fv.value ?? fv.amount ?? fv.deal_value;
  if (v === null || v === undefined) return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

/**
 * Resolve which pipeline stage a record belongs to, using the same priority
 * as the kanban board's resolveStageForRecord:
 *   1. field_values.stage matches a stage name/api_name
 *   2. current_stage_id matches a known stage
 *   3. Fall back to the first open stage
 */
function resolveRecordStage(
  record: Record<string, unknown>,
  stageById: Map<string, Record<string, unknown>>,
  stageByName: Map<string, Record<string, unknown>>,
  firstOpenStage: Record<string, unknown> | null,
): Record<string, unknown> | null {
  const fv = (record.field_values ?? {}) as Record<string, unknown>;
  const stageField = fv.stage;
  if (typeof stageField === 'string' && stageField.trim()) {
    const matched = stageByName.get(stageField.trim().toLowerCase());
    if (matched) return matched;
  }

  if (record.current_stage_id) {
    const direct = stageById.get(record.current_stage_id as string);
    if (direct) return direct;
  }

  return firstOpenStage;
}

// ─── Service functions ───────────────────────────────────────────────────────

/**
 * Returns per-stage aggregates and pipeline totals for a given pipeline.
 *
 * Record-level access: all records in the tenant are included so that
 * analytics match the kanban board display.
 *
 * @throws {Error} NOT_FOUND — pipeline does not exist
 */
export async function getPipelineSummary(
  tenantId: string,
  pipelineId: string,
  ownerId: string,
): Promise<PipelineSummaryResponse> {
  const pipeline = await resolvePipeline(tenantId, pipelineId);

  // Fetch all stages for this pipeline (include api_name for field_values.stage resolution)
  const stageRows = await db
    .selectFrom('stage_definitions')
    .select([
      'id',
      'name',
      'api_name',
      'stage_type',
      'default_probability',
      'expected_days',
    ])
    .where('pipeline_id', '=', pipelineId)
    .where('tenant_id', '=', tenantId)
    .orderBy('sort_order', 'asc')
    .execute();

  const stages = stageRows as unknown as Array<Record<string, unknown>>;

  // Build stage lookup maps for resolving field_values.stage (same logic as kanban board)
  const stageById = new Map<string, Record<string, unknown>>();
  const stageByName = new Map<string, Record<string, unknown>>();
  for (const stage of stages) {
    stageById.set(stage.id as string, stage);
    if (stage.name) stageByName.set((stage.name as string).toLowerCase(), stage);
    if (stage.api_name) stageByName.set((stage.api_name as string).toLowerCase(), stage);
  }
  const firstOpenStage = stages.find((s) => (s.stage_type as string) === 'open') ?? null;

  // Fetch all records belonging to this pipeline, including records that
  // belong to the pipeline's object type but have not yet been explicitly
  // assigned a pipeline_id (created before auto-assignment was working).
  // Scoped to tenant — not owner — so analytics match the kanban board
  // which shows all tenant records.
  const recordRows = await db
    .selectFrom('records')
    .select(['id', 'field_values', 'current_stage_id', 'stage_entered_at'])
    .where('tenant_id', '=', tenantId)
    .where((eb) =>
      eb.or([
        eb('pipeline_id', '=', pipelineId),
        eb.and([
          eb('object_id', '=', pipeline.objectId),
          eb('pipeline_id', 'is', null),
        ]),
      ]),
    )
    .execute();

  const records = recordRows as unknown as Array<Record<string, unknown>>;

  // Calculate per-stage aggregates in application code (mirrors kanban board logic)
  const stageAggregates = new Map<
    string,
    { recordCount: number; totalValue: number; weightedValue: number; totalDays: number; overdueCount: number }
  >();

  for (const record of records) {
    const stage = resolveRecordStage(record, stageById, stageByName, firstOpenStage);
    if (!stage) continue;

    const stageId = stage.id as string;
    const fv = (record.field_values ?? {}) as Record<string, unknown>;
    const value = extractRecordValue(fv);

    // Per-record probability with fallback to stage default_probability
    const recordProb = fv.probability !== null && fv.probability !== undefined
      ? Number(fv.probability)
      : NaN;
    const probability = !isNaN(recordProb)
      ? recordProb
      : ((stage.default_probability as number | null) ?? 0);
    const weighted = value * (probability / 100);

    // Days in stage
    const enteredAt = record.stage_entered_at
      ? new Date(record.stage_entered_at as string)
      : null;
    const daysInStage = enteredAt
      ? (Date.now() - enteredAt.getTime()) / (86400 * 1000)
      : 0;

    // Overdue check
    const expectedDays = stage.expected_days as number | null;
    const isOverdue = expectedDays !== null && enteredAt !== null && daysInStage > expectedDays;

    const current = stageAggregates.get(stageId) ?? {
      recordCount: 0,
      totalValue: 0,
      weightedValue: 0,
      totalDays: 0,
      overdueCount: 0,
    };
    current.recordCount += 1;
    current.totalValue += value;
    current.weightedValue += weighted;
    current.totalDays += daysInStage;
    if (isOverdue) current.overdueCount += 1;
    stageAggregates.set(stageId, current);
  }

  // Build stage summaries
  const stageSummaries: StageSummary[] = stages.map((stage) => {
    const agg = stageAggregates.get(stage.id as string);
    return {
      id: stage.id as string,
      name: stage.name as string,
      stageType: stage.stage_type as string,
      recordCount: agg?.recordCount ?? 0,
      totalValue: agg?.totalValue ?? 0,
      weightedValue: Math.round(agg?.weightedValue ?? 0),
      avgDaysInStage: agg && agg.recordCount > 0
        ? Math.round(agg.totalDays / agg.recordCount)
        : 0,
      overdueCount: agg?.overdueCount ?? 0,
    };
  });

  // Compute totals
  const openStages = stageSummaries.filter((s) => s.stageType === 'open');
  const openDeals = openStages.reduce((sum, s) => sum + s.recordCount, 0);
  const totalOpenValue = openStages.reduce((sum, s) => sum + s.totalValue, 0);
  const totalWeightedValue = openStages.reduce((sum, s) => sum + s.weightedValue, 0);
  const avgDealSize = openDeals > 0 ? Math.round(totalOpenValue / openDeals) : 0;

  // Won/lost this month from stage_history
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const wonRow = await db
    .selectFrom('stage_history as sh')
    .innerJoin('stage_definitions as sd', 'sd.id', 'sh.to_stage_id')
    .innerJoin('records as r', 'r.id', 'sh.record_id')
    .where('sh.pipeline_id', '=', pipelineId)
    .where('r.tenant_id', '=', tenantId)
    .where('sd.stage_type', '=', 'won')
    .where('sh.changed_at', '>=', monthStart)
    .select([
      sql<number>`COUNT(DISTINCT sh.record_id)::int`.as('won_count'),
      sql<string>`COALESCE(SUM(COALESCE((r.field_values->>'value')::numeric, (r.field_values->>'amount')::numeric, (r.field_values->>'deal_value')::numeric, 0)), 0)`.as(
        'won_value',
      ),
    ])
    .executeTakeFirstOrThrow();

  const wonThisMonth = Number(wonRow.won_count) || 0;
  const wonValueThisMonth = Number(wonRow.won_value) || 0;

  const lostRow = await db
    .selectFrom('stage_history as sh')
    .innerJoin('stage_definitions as sd', 'sd.id', 'sh.to_stage_id')
    .innerJoin('records as r', 'r.id', 'sh.record_id')
    .where('sh.pipeline_id', '=', pipelineId)
    .where('r.tenant_id', '=', tenantId)
    .where('sd.stage_type', '=', 'lost')
    .where('sh.changed_at', '>=', monthStart)
    .select(sql<number>`COUNT(DISTINCT sh.record_id)::int`.as('lost_count'))
    .executeTakeFirstOrThrow();

  const lostThisMonth = Number(lostRow.lost_count) || 0;

  logger.info({ pipelineId, ownerId }, 'Pipeline summary generated');

  return {
    pipeline: { id: pipeline.id, name: pipeline.name },
    stages: stageSummaries,
    totals: {
      openDeals,
      totalOpenValue,
      totalWeightedValue,
      avgDealSize,
      wonThisMonth,
      wonValueThisMonth,
      lostThisMonth,
    },
  };
}

/**
 * Returns stage-by-stage conversion metrics for a pipeline.
 *
 * Record-level access: all stage_history entries for records within the
 * tenant's pipeline are included.
 *
 * @throws {Error} NOT_FOUND — pipeline does not exist
 * @throws {Error} VALIDATION_ERROR — invalid period parameter
 */
export async function getPipelineVelocity(
  tenantId: string,
  pipelineId: string,
  ownerId: string,
  period: string,
): Promise<PipelineVelocityResponse> {
  if (!ALLOWED_PERIODS.has(period)) {
    throwValidationError(`period must be one of: ${[...ALLOWED_PERIODS].join(', ')}`);
  }

  const pipeline = await resolvePipeline(tenantId, pipelineId);
  void pipeline; // used for validation only

  // Fetch stages
  const stageRows = await db
    .selectFrom('stage_definitions')
    .select(['id', 'name', 'stage_type', 'expected_days'])
    .where('pipeline_id', '=', pipelineId)
    .where('tenant_id', '=', tenantId)
    .orderBy('sort_order', 'asc')
    .execute();

  const stages = stageRows as unknown as Array<Record<string, unknown>>;

  const days = periodToDays(period);
  const cutoffDate =
    days !== null ? new Date(Date.now() - days * 86400 * 1000) : null;

  // Entered: count of records that transitioned INTO each stage
  const enteredRows = await db
    .selectFrom('stage_history as sh')
    .innerJoin('records as r', 'r.id', 'sh.record_id')
    .where('sh.pipeline_id', '=', pipelineId)
    .where('r.tenant_id', '=', tenantId)
    .$if(cutoffDate !== null, (qb) => qb.where('sh.changed_at', '>=', cutoffDate!))
    .select([
      'sh.to_stage_id as stage_id',
      sql<number>`COUNT(*)::int`.as('entered'),
    ])
    .groupBy('sh.to_stage_id')
    .execute();

  const enteredByStage = new Map<string, number>();
  for (const row of enteredRows as unknown as Array<Record<string, unknown>>) {
    enteredByStage.set(row.stage_id as string, row.entered as number);
  }

  // Exited: count of records that transitioned FROM each stage + avg days
  const exitedRows = await db
    .selectFrom('stage_history as sh')
    .innerJoin('records as r', 'r.id', 'sh.record_id')
    .where('sh.pipeline_id', '=', pipelineId)
    .where('r.tenant_id', '=', tenantId)
    .where('sh.from_stage_id', 'is not', null)
    .$if(cutoffDate !== null, (qb) => qb.where('sh.changed_at', '>=', cutoffDate!))
    .select([
      'sh.from_stage_id as stage_id',
      sql<number>`COUNT(*)::int`.as('exited'),
      sql<string>`COALESCE(AVG(sh.days_in_previous_stage), 0)`.as('avg_days'),
    ])
    .groupBy('sh.from_stage_id')
    .execute();

  const exitedByStage = new Map<string, { exited: number; avgDays: number }>();
  for (const row of exitedRows as unknown as Array<Record<string, unknown>>) {
    exitedByStage.set(row.stage_id as string, {
      exited: row.exited as number,
      avgDays: Math.round(Number(row.avg_days)),
    });
  }

  // Build stage velocity entries
  const stageVelocities: StageVelocity[] = stages.map((stage) => {
    const entered = enteredByStage.get(stage.id as string) ?? 0;
    const exitInfo = exitedByStage.get(stage.id as string);
    const exited = exitInfo?.exited ?? 0;
    const avgDays = exitInfo?.avgDays ?? 0;
    const conversionRate = entered > 0 ? Math.round((exited / entered) * 100) : 0;

    return {
      name: stage.name as string,
      entered,
      exited,
      avgDays,
      expectedDays: (stage.expected_days as number | null) ?? null,
      conversionRate,
    };
  });

  // Overall conversion: records that reached won stage / records that entered first open stage
  const wonStageIds = stages
    .filter((s) => (s.stage_type as string) === 'won')
    .map((s) => s.id as string);

  const openStageIds = stages
    .filter((s) => (s.stage_type as string) === 'open')
    .map((s) => s.id as string);

  let overallConversion = 0;

  if (openStageIds.length > 0 && wonStageIds.length > 0) {
    const firstOpenStageId = openStageIds[0];
    const firstEntered = enteredByStage.get(firstOpenStageId) ?? 0;
    const totalWonEntered = wonStageIds.reduce(
      (sum, id) => sum + (enteredByStage.get(id) ?? 0),
      0,
    );
    overallConversion = firstEntered > 0
      ? Math.round((totalWonEntered / firstEntered) * 100)
      : 0;
  }

  // Avg days to close: average total duration from first stage entry to won stage
  const subquery = db
    .selectFrom('stage_history as sh_won')
    .innerJoin('stage_definitions as sd_won', 'sd_won.id', 'sh_won.to_stage_id')
    .innerJoin('records as r', 'r.id', 'sh_won.record_id')
    .innerJoin('stage_history as sh_first', (join) =>
      join
        .onRef('sh_first.record_id', '=', 'sh_won.record_id')
        .onRef('sh_first.pipeline_id', '=', 'sh_won.pipeline_id'),
    )
    .where('sh_won.pipeline_id', '=', pipelineId)
    .where('r.tenant_id', '=', tenantId)
    .where('sd_won.stage_type', '=', 'won')
    .$if(cutoffDate !== null, (qb) =>
      qb.where('sh_won.changed_at', '>=', cutoffDate!),
    )
    .select([
      'sh_won.record_id',
      sql<number>`EXTRACT(EPOCH FROM (sh_won.changed_at - MIN(sh_first.changed_at))) / 86400`.as(
        'duration_days',
      ),
    ])
    .groupBy(['sh_won.record_id', 'sh_won.changed_at']);

  const avgRow = await db
    .selectFrom(subquery.as('sub'))
    .select(sql<number>`COALESCE(AVG(duration_days), 0)`.as('avg_days'))
    .executeTakeFirstOrThrow();

  const avgDaysToClose = Math.round(avgRow.avg_days || 0);

  logger.info({ pipelineId, ownerId, period }, 'Pipeline velocity generated');

  return {
    period,
    stages: stageVelocities,
    overallConversion,
    avgDaysToClose,
  };
}

/**
 * Returns records that have exceeded their stage's expected_days threshold.
 *
 * Record-level access: all records in the tenant are included so that
 * analytics match the kanban board display.
 *
 * @throws {Error} NOT_FOUND — pipeline does not exist
 */
export async function getOverdueRecords(
  tenantId: string,
  pipelineId: string,
  ownerId: string,
): Promise<OverdueRecord[]> {
  const pipeline = await resolvePipeline(tenantId, pipelineId);

  const rows = await db
    .selectFrom('records as r')
    .innerJoin('stage_definitions as sd', 'sd.id', 'r.current_stage_id')
    .where('r.tenant_id', '=', tenantId)
    .where('r.current_stage_id', 'is not', null)
    .where('sd.expected_days', 'is not', null)
    .where('r.stage_entered_at', 'is not', null)
    .where((eb) =>
      eb.or([
        eb('r.pipeline_id', '=', pipelineId),
        eb.and([
          eb('r.object_id', '=', pipeline.objectId),
          eb('r.pipeline_id', 'is', null),
        ]),
      ]),
    )
    .where(
      sql<boolean>`EXTRACT(EPOCH FROM (NOW() - r.stage_entered_at)) / 86400 > sd.expected_days`,
    )
    .select([
      'r.id',
      'r.name',
      sql<string | null>`COALESCE((r.field_values->>'value')::numeric, (r.field_values->>'amount')::numeric, (r.field_values->>'deal_value')::numeric)`.as(
        'value',
      ),
      sql<number>`EXTRACT(EPOCH FROM (NOW() - r.stage_entered_at)) / 86400`.as(
        'days_in_stage',
      ),
      'sd.expected_days',
      'sd.name as stage_name',
      'r.owner_id',
    ])
    .orderBy(
      sql`(EXTRACT(EPOCH FROM (NOW() - r.stage_entered_at)) / 86400 - sd.expected_days)`,
      'desc',
    )
    .execute();

  logger.info({ pipelineId, ownerId, count: rows.length }, 'Overdue records fetched');

  return (rows as unknown as Array<Record<string, unknown>>).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    value: row.value !== null && row.value !== undefined ? Number(row.value) : null,
    daysInStage: Math.round(Number(row.days_in_stage)),
    expectedDays: row.expected_days as number,
    stageName: row.stage_name as string,
    ownerId: row.owner_id as string,
  }));
}
