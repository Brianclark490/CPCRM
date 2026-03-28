import { logger } from '../lib/logger.js';
import { pool } from '../db/client.js';

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
  const result = await pool.query(
    'SELECT id, name, object_id FROM pipeline_definitions WHERE id = $1 AND tenant_id = $2',
    [pipelineId, tenantId],
  );

  if (result.rows.length === 0) {
    throwNotFoundError('Pipeline not found');
  }

  const row = result.rows[0] as Record<string, unknown>;
  return { id: row.id as string, name: row.name as string, objectId: row.object_id as string };
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
 * Record-level access: only records owned by the specified user are included.
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
  const stagesResult = await pool.query(
    'SELECT id, name, api_name, stage_type, default_probability, expected_days FROM stage_definitions WHERE pipeline_id = $1 AND tenant_id = $2 ORDER BY sort_order ASC',
    [pipelineId, tenantId],
  );

  const stages = stagesResult.rows as Array<Record<string, unknown>>;

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
  const recordsResult = await pool.query(
    `SELECT r.id, r.field_values, r.current_stage_id, r.stage_entered_at
     FROM records r
     WHERE r.tenant_id = $1
       AND r.owner_id = $2
       AND (r.pipeline_id = $3 OR (r.object_id = $4 AND r.pipeline_id IS NULL))`,
    [tenantId, ownerId, pipelineId, pipeline.objectId],
  );

  const records = recordsResult.rows as Array<Record<string, unknown>>;

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

  const wonThisMonthResult = await pool.query(
    `SELECT
       COUNT(DISTINCT sh.record_id)::int AS won_count,
       COALESCE(SUM(
         COALESCE(
           (r.field_values->>'value')::numeric,
           (r.field_values->>'amount')::numeric,
           (r.field_values->>'deal_value')::numeric,
           0
         )
       ), 0) AS won_value
     FROM stage_history sh
     JOIN stage_definitions sd ON sd.id = sh.to_stage_id
     JOIN records r ON r.id = sh.record_id
     WHERE sh.pipeline_id = $1
       AND r.tenant_id = $2
       AND r.owner_id = $3
       AND sd.stage_type = 'won'
       AND sh.changed_at >= $4`,
    [pipelineId, tenantId, ownerId, monthStart],
  );

  const wonRow = wonThisMonthResult.rows[0] as Record<string, unknown>;
  const wonThisMonth = (wonRow.won_count as number) ?? 0;
  const wonValueThisMonth = Number(wonRow.won_value) || 0;

  const lostThisMonthResult = await pool.query(
    `SELECT COUNT(DISTINCT sh.record_id)::int AS lost_count
     FROM stage_history sh
     JOIN stage_definitions sd ON sd.id = sh.to_stage_id
     JOIN records r ON r.id = sh.record_id
     WHERE sh.pipeline_id = $1
       AND r.tenant_id = $2
       AND r.owner_id = $3
       AND sd.stage_type = 'lost'
       AND sh.changed_at >= $4`,
    [pipelineId, tenantId, ownerId, monthStart],
  );

  const lostRow = lostThisMonthResult.rows[0] as Record<string, unknown>;
  const lostThisMonth = (lostRow.lost_count as number) ?? 0;

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
  const stagesResult = await pool.query(
    'SELECT id, name, stage_type, expected_days FROM stage_definitions WHERE pipeline_id = $1 AND tenant_id = $2 ORDER BY sort_order ASC',
    [pipelineId, tenantId],
  );
  const stages = stagesResult.rows as Array<Record<string, unknown>>;

  const days = periodToDays(period);

  // Compute cutoff date as a parameter (null means no date filter)
  const cutoffDate = days !== null
    ? new Date(Date.now() - days * 86400 * 1000)
    : null;

  // Build parameterised date filter clause
  const dateFilterClause = cutoffDate !== null ? 'AND sh.changed_at >= $3' : '';
  const baseParams: unknown[] = cutoffDate !== null
    ? [pipelineId, tenantId, cutoffDate]
    : [pipelineId, tenantId];

  // Entered: count of records that transitioned INTO each stage
  const enteredResult = await pool.query(
    `SELECT
       sh.to_stage_id AS stage_id,
       COUNT(*)::int AS entered
     FROM stage_history sh
     JOIN records r ON r.id = sh.record_id
     WHERE sh.pipeline_id = $1
       AND r.tenant_id = $2
       ${dateFilterClause}
     GROUP BY sh.to_stage_id`,
    baseParams,
  );

  const enteredByStage = new Map<string, number>();
  for (const row of enteredResult.rows as Array<Record<string, unknown>>) {
    enteredByStage.set(row.stage_id as string, row.entered as number);
  }

  // Exited: count of records that transitioned FROM each stage + avg days
  const exitedResult = await pool.query(
    `SELECT
       sh.from_stage_id AS stage_id,
       COUNT(*)::int AS exited,
       COALESCE(AVG(sh.days_in_previous_stage), 0) AS avg_days
     FROM stage_history sh
     JOIN records r ON r.id = sh.record_id
     WHERE sh.pipeline_id = $1
       AND r.tenant_id = $2
       AND sh.from_stage_id IS NOT NULL
       ${dateFilterClause}
     GROUP BY sh.from_stage_id`,
    baseParams,
  );

  const exitedByStage = new Map<string, { exited: number; avgDays: number }>();
  for (const row of exitedResult.rows as Array<Record<string, unknown>>) {
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
  const wonDateFilterClause = cutoffDate !== null ? 'AND sh_won.changed_at >= $3' : '';

  const avgDaysToCloseResult = await pool.query(
    `SELECT COALESCE(AVG(duration_days), 0) AS avg_days
     FROM (
       SELECT
         sh_won.record_id,
         EXTRACT(EPOCH FROM (sh_won.changed_at - MIN(sh_first.changed_at))) / 86400 AS duration_days
       FROM stage_history sh_won
       JOIN stage_definitions sd_won ON sd_won.id = sh_won.to_stage_id
       JOIN records r ON r.id = sh_won.record_id
       JOIN stage_history sh_first ON sh_first.record_id = sh_won.record_id
         AND sh_first.pipeline_id = sh_won.pipeline_id
       WHERE sh_won.pipeline_id = $1
         AND r.tenant_id = $2
         AND sd_won.stage_type = 'won'
         ${wonDateFilterClause}
       GROUP BY sh_won.record_id, sh_won.changed_at
     ) sub`,
    baseParams,
  );

  const avgDaysToClose = Math.round(
    Number((avgDaysToCloseResult.rows[0] as Record<string, unknown>).avg_days) || 0,
  );

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
 * Record-level access: only records owned by the specified user are included.
 *
 * @throws {Error} NOT_FOUND — pipeline does not exist
 */
export async function getOverdueRecords(
  tenantId: string,
  pipelineId: string,
  ownerId: string,
): Promise<OverdueRecord[]> {
  const pipeline = await resolvePipeline(tenantId, pipelineId);

  const result = await pool.query(
    `SELECT
       r.id,
       r.name,
       COALESCE(
         (r.field_values->>'value')::numeric,
         (r.field_values->>'amount')::numeric,
         (r.field_values->>'deal_value')::numeric
       ) AS value,
       EXTRACT(EPOCH FROM (NOW() - r.stage_entered_at)) / 86400 AS days_in_stage,
       sd.expected_days,
       sd.name AS stage_name,
       r.owner_id
     FROM records r
     JOIN stage_definitions sd ON sd.id = r.current_stage_id
     WHERE (r.pipeline_id = $1 OR (r.object_id = $4 AND r.pipeline_id IS NULL))
       AND r.tenant_id = $2
       AND r.owner_id = $3
       AND r.current_stage_id IS NOT NULL
       AND sd.expected_days IS NOT NULL
       AND r.stage_entered_at IS NOT NULL
       AND EXTRACT(EPOCH FROM (NOW() - r.stage_entered_at)) / 86400 > sd.expected_days
     ORDER BY (EXTRACT(EPOCH FROM (NOW() - r.stage_entered_at)) / 86400 - sd.expected_days) DESC`,
    [pipelineId, tenantId, ownerId, pipeline.objectId],
  );

  logger.info({ pipelineId, ownerId, count: result.rows.length }, 'Overdue records fetched');

  return (result.rows as Array<Record<string, unknown>>).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    value: row.value !== null && row.value !== undefined ? Number(row.value) : null,
    daysInStage: Math.round(Number(row.days_in_stage)),
    expectedDays: row.expected_days as number,
    stageName: row.stage_name as string,
    ownerId: row.owner_id as string,
  }));
}
