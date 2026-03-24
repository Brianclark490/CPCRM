import { pool } from '../db/client.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SalesTarget {
  id: string;
  tenant_id: string;
  target_type: 'business' | 'team' | 'user';
  target_entity_id: string | null;
  period_type: 'monthly' | 'quarterly' | 'annual';
  period_start: string;
  period_end: string;
  target_value: number;
  currency: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateTargetParams {
  targetType: string;
  targetEntityId?: string | null;
  periodType: string;
  periodStart: string;
  periodEnd: string;
  targetValue: number;
  currency?: string;
  createdBy?: string | null;
}

export interface TargetWithActual extends SalesTarget {
  actual: number;
  percentage: number;
}

export interface UserTargetSummary {
  name: string;
  target: number;
  actual: number;
  percentage: number;
}

export interface TeamTargetSummary {
  name: string;
  target: number;
  actual: number;
  percentage: number;
  users: UserTargetSummary[];
}

export type PaceStatus = 'on_track' | 'at_risk' | 'behind';

export interface TargetSummaryResponse {
  period: {
    type: string;
    label: string;
  };
  business: {
    target: number;
    actual: number;
    percentage: number;
    pace: PaceStatus;
    currency: string;
  };
  teams: TeamTargetSummary[];
}

export interface UserTargetResponse {
  userId: string;
  name: string;
  target: number;
  actual: number;
  percentage: number;
  currency: string;
  period: string;
}

// ─── Validation helpers ───────────────────────────────────────────────────────

const VALID_TARGET_TYPES = ['business', 'team', 'user'] as const;
const VALID_PERIOD_TYPES = ['monthly', 'quarterly', 'annual'] as const;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function createServiceError(message: string, code: string): Error {
  const err = new Error(message) as Error & { code: string };
  err.code = code;
  return err;
}

function validateTargetParams(params: CreateTargetParams): void {
  if (!params.targetType || !VALID_TARGET_TYPES.includes(params.targetType as typeof VALID_TARGET_TYPES[number])) {
    throw createServiceError(
      `target_type must be one of: ${VALID_TARGET_TYPES.join(', ')}`,
      'VALIDATION_ERROR',
    );
  }

  if (!params.periodType || !VALID_PERIOD_TYPES.includes(params.periodType as typeof VALID_PERIOD_TYPES[number])) {
    throw createServiceError(
      `period_type must be one of: ${VALID_PERIOD_TYPES.join(', ')}`,
      'VALIDATION_ERROR',
    );
  }

  if (!params.periodStart || !ISO_DATE_RE.test(params.periodStart)) {
    throw createServiceError('period_start must be a valid ISO date (YYYY-MM-DD)', 'VALIDATION_ERROR');
  }

  if (!params.periodEnd || !ISO_DATE_RE.test(params.periodEnd)) {
    throw createServiceError('period_end must be a valid ISO date (YYYY-MM-DD)', 'VALIDATION_ERROR');
  }

  if (new Date(params.periodEnd) <= new Date(params.periodStart)) {
    throw createServiceError('period_end must be after period_start', 'VALIDATION_ERROR');
  }

  if (params.targetValue === undefined || params.targetValue === null || isNaN(params.targetValue) || params.targetValue < 0) {
    throw createServiceError('target_value must be a non-negative number', 'VALIDATION_ERROR');
  }

  if (params.targetType !== 'business' && !params.targetEntityId) {
    throw createServiceError(
      'target_entity_id is required for team and user targets',
      'VALIDATION_ERROR',
    );
  }

  if (params.currency && (typeof params.currency !== 'string' || params.currency.length !== 3)) {
    throw createServiceError('currency must be a 3-letter ISO code', 'VALIDATION_ERROR');
  }
}

// ─── CRUD operations ──────────────────────────────────────────────────────────

/**
 * Creates or updates (upsert) a sales target. If a target already exists for
 * the same tenant/type/entity/period_start, updates the existing row.
 */
export async function upsertTarget(
  tenantId: string,
  params: CreateTargetParams,
): Promise<SalesTarget> {
  validateTargetParams(params);

  const result = await pool.query(
    `INSERT INTO sales_targets (tenant_id, target_type, target_entity_id, period_type, period_start, period_end, target_value, currency, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (tenant_id, target_type, target_entity_id, period_start)
     DO UPDATE SET
       period_end = EXCLUDED.period_end,
       target_value = EXCLUDED.target_value,
       currency = EXCLUDED.currency,
       period_type = EXCLUDED.period_type,
       updated_at = NOW()
     RETURNING *`,
    [
      tenantId,
      params.targetType,
      params.targetEntityId ?? null,
      params.periodType,
      params.periodStart,
      params.periodEnd,
      params.targetValue,
      params.currency ?? 'GBP',
      params.createdBy ?? null,
    ],
  );

  return mapRow(result.rows[0]);
}

/**
 * Lists all targets for a tenant, optionally filtered by period.
 */
export async function listTargets(
  tenantId: string,
  periodStart?: string,
  periodEnd?: string,
): Promise<SalesTarget[]> {
  let query = 'SELECT * FROM sales_targets WHERE tenant_id = $1';
  const queryParams: unknown[] = [tenantId];

  if (periodStart) {
    queryParams.push(periodStart);
    query += ` AND period_start >= $${queryParams.length}`;
  }

  if (periodEnd) {
    queryParams.push(periodEnd);
    query += ` AND period_end <= $${queryParams.length}`;
  }

  query += ' ORDER BY period_start DESC, target_type ASC';

  const result = await pool.query(query, queryParams);
  return result.rows.map(mapRow);
}

/**
 * Deletes a sales target by ID, scoped to tenant.
 */
export async function deleteTarget(tenantId: string, targetId: string): Promise<void> {
  const result = await pool.query(
    'DELETE FROM sales_targets WHERE id = $1 AND tenant_id = $2',
    [targetId, tenantId],
  );

  if (result.rowCount === 0) {
    throw createServiceError('Target not found', 'NOT_FOUND');
  }
}

// ─── Actuals calculation ──────────────────────────────────────────────────────

/**
 * Calculates the actual closed-won revenue for a given tenant and period.
 * Optionally scoped to a specific owner (user targets).
 */
export async function calculateActual(
  tenantId: string,
  periodStart: string,
  periodEnd: string,
  ownerId?: string,
): Promise<number> {
  let query = `
    SELECT COALESCE(SUM(
      (r.field_values->>'value')::decimal
    ), 0) as actual
    FROM records r
    JOIN object_definitions od ON r.object_id = od.id
    JOIN stage_definitions sd ON r.current_stage_id = sd.id
    WHERE od.api_name = 'opportunity'
      AND r.tenant_id = $1
      AND sd.stage_type = 'won'
      AND r.updated_at >= $2
      AND r.updated_at < $3`;

  const queryParams: unknown[] = [tenantId, periodStart, periodEnd];

  if (ownerId) {
    queryParams.push(ownerId);
    query += ` AND r.owner_id = $${queryParams.length}`;
  }

  const result = await pool.query(query, queryParams);
  return parseFloat(result.rows[0]?.actual ?? '0');
}

/**
 * Calculates the pace status for a target based on the percentage achieved
 * relative to time elapsed in the period.
 *
 * Formula: pace = percentage / (days_elapsed / total_days_in_period)
 * Classifications: on_track (>90%), at_risk (70-90%), behind (<70%)
 */
export function calculatePace(
  percentage: number,
  periodStart: string,
  periodEnd: string,
): PaceStatus {
  const now = new Date();
  const start = new Date(periodStart);
  const end = new Date(periodEnd);

  const totalDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
  if (totalDays <= 0) return 'behind';

  const daysElapsed = Math.max(0, (now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  const timeRatio = daysElapsed / totalDays;

  // If no time has elapsed yet, the period hasn't started
  if (timeRatio <= 0) return 'on_track';

  const pace = percentage / (timeRatio * 100);

  if (pace > 0.9) return 'on_track';
  if (pace >= 0.7) return 'at_risk';
  return 'behind';
}

// ─── Summary endpoint ─────────────────────────────────────────────────────────

/**
 * Builds the full target summary for the current period (auto-detected or
 * explicitly provided via periodStart/periodEnd).
 */
export async function getTargetSummary(
  tenantId: string,
  periodStart?: string,
  periodEnd?: string,
): Promise<TargetSummaryResponse> {
  // Default to current quarter if no period provided
  const now = new Date();
  const currentQuarter = Math.floor(now.getMonth() / 3);
  const defaultStart = periodStart ?? new Date(now.getFullYear(), currentQuarter * 3, 1).toISOString().split('T')[0];
  const defaultEnd = periodEnd ?? new Date(now.getFullYear(), currentQuarter * 3 + 3, 1).toISOString().split('T')[0];

  const periodLabel = formatPeriodLabel(defaultStart, defaultEnd);

  // Fetch all targets for this period
  const targetsResult = await pool.query(
    `SELECT * FROM sales_targets
     WHERE tenant_id = $1
       AND period_start <= $2
       AND period_end >= $3
     ORDER BY target_type ASC`,
    [tenantId, defaultEnd, defaultStart],
  );

  const targets = targetsResult.rows.map(mapRow);

  // Separate by type
  const businessTargets = targets.filter((t) => t.target_type === 'business');
  const teamTargets = targets.filter((t) => t.target_type === 'team');
  const userTargets = targets.filter((t) => t.target_type === 'user');

  // Calculate business-level actual
  const businessActual = await calculateActual(tenantId, defaultStart, defaultEnd);
  const businessTargetValue = businessTargets.reduce((sum, t) => sum + t.target_value, 0);

  // Build team summaries
  const teams: TeamTargetSummary[] = [];

  for (const teamTarget of teamTargets) {
    // Get team name from records
    const teamName = await getRecordName(teamTarget.target_entity_id);

    // Find user targets for this team
    const teamUsers = await getTeamUserTargets(
      tenantId,
      teamTarget.target_entity_id!,
      userTargets,
      defaultStart,
      defaultEnd,
    );

    const teamActual = teamUsers.reduce((sum, u) => sum + u.actual, 0);

    teams.push({
      name: teamName ?? 'Unknown Team',
      target: teamTarget.target_value,
      actual: teamActual,
      percentage: teamTarget.target_value > 0 ? Math.round((teamActual / teamTarget.target_value) * 100) : 0,
      users: teamUsers,
    });
  }

  // Include standalone user targets (not part of any team target)
  const teamEntityIds = new Set(teamTargets.map((t) => t.target_entity_id));
  const standaloneUsers = userTargets.filter(
    (ut) => !teamEntityIds.has(ut.target_entity_id),
  );

  if (standaloneUsers.length > 0) {
    const standaloneUserSummaries: UserTargetSummary[] = [];
    for (const ut of standaloneUsers) {
      const userName = await getRecordName(ut.target_entity_id);
      const userActual = await calculateActualForUserRecord(tenantId, ut.target_entity_id!, defaultStart, defaultEnd);
      standaloneUserSummaries.push({
        name: userName ?? 'Unknown User',
        target: ut.target_value,
        actual: userActual,
        percentage: ut.target_value > 0 ? Math.round((userActual / ut.target_value) * 100) : 0,
      });
    }

    if (standaloneUserSummaries.length > 0) {
      teams.push({
        name: 'Unassigned',
        target: standaloneUsers.reduce((sum, u) => sum + u.target_value, 0),
        actual: standaloneUserSummaries.reduce((sum, u) => sum + u.actual, 0),
        percentage: 0,
        users: standaloneUserSummaries,
      });

      const unassignedTeam = teams[teams.length - 1];
      unassignedTeam.percentage = unassignedTeam.target > 0
        ? Math.round((unassignedTeam.actual / unassignedTeam.target) * 100)
        : 0;
    }
  }

  const currency = businessTargets[0]?.currency ?? teamTargets[0]?.currency ?? userTargets[0]?.currency ?? 'GBP';

  const businessPercentage = businessTargetValue > 0 ? Math.round((businessActual / businessTargetValue) * 100) : 0;

  // Detect period type from targets or infer from the date range
  const periodType = businessTargets[0]?.period_type
    ?? teamTargets[0]?.period_type
    ?? userTargets[0]?.period_type
    ?? inferPeriodType(defaultStart, defaultEnd);

  return {
    period: {
      type: periodType,
      label: periodLabel,
    },
    business: {
      target: businessTargetValue,
      actual: businessActual,
      percentage: businessPercentage,
      pace: calculatePace(businessPercentage, defaultStart, defaultEnd),
      currency,
    },
    teams,
  };
}

// ─── User target endpoint ─────────────────────────────────────────────────────

/**
 * Gets a specific user's target + actuals for the current period.
 */
export async function getUserTarget(
  tenantId: string,
  userId: string,
  periodStart?: string,
  periodEnd?: string,
): Promise<UserTargetResponse> {
  const now = new Date();
  const currentQuarter = Math.floor(now.getMonth() / 3);
  const defaultStart = periodStart ?? new Date(now.getFullYear(), currentQuarter * 3, 1).toISOString().split('T')[0];
  const defaultEnd = periodEnd ?? new Date(now.getFullYear(), currentQuarter * 3 + 3, 1).toISOString().split('T')[0];

  // Find the user record by looking up records that have a descope_user_id matching userId
  const userRecordResult = await pool.query(
    `SELECT r.id, r.name FROM records r
     JOIN object_definitions od ON r.object_id = od.id
     WHERE od.api_name = 'user'
       AND r.tenant_id = $1
       AND r.field_values->>'descope_user_id' = $2
     LIMIT 1`,
    [tenantId, userId],
  );

  const userRecord = userRecordResult.rows[0] as { id: string; name: string } | undefined;

  // Try to find a target using the user record ID
  let target: SalesTarget | undefined;
  if (userRecord) {
    const targetResult = await pool.query(
      `SELECT * FROM sales_targets
       WHERE tenant_id = $1
         AND target_type = 'user'
         AND target_entity_id = $2
         AND period_start <= $3
         AND period_end >= $4
       LIMIT 1`,
      [tenantId, userRecord.id, defaultEnd, defaultStart],
    );
    target = targetResult.rows[0] ? mapRow(targetResult.rows[0]) : undefined;
  }

  // Calculate actual using owner_id (Descope user ID on records)
  const actual = await calculateActual(tenantId, defaultStart, defaultEnd, userId);
  const targetValue = target?.target_value ?? 0;

  return {
    userId,
    name: userRecord?.name ?? 'Unknown User',
    target: targetValue,
    actual,
    percentage: targetValue > 0 ? Math.round((actual / targetValue) * 100) : 0,
    currency: target?.currency ?? 'GBP',
    period: formatPeriodLabel(defaultStart, defaultEnd),
  };
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function mapRow(row: Record<string, unknown>): SalesTarget {
  return {
    id: row.id as string,
    tenant_id: row.tenant_id as string,
    target_type: row.target_type as SalesTarget['target_type'],
    target_entity_id: (row.target_entity_id as string) ?? null,
    period_type: row.period_type as SalesTarget['period_type'],
    period_start: formatDate(row.period_start),
    period_end: formatDate(row.period_end),
    target_value: parseFloat(String(row.target_value)),
    currency: (row.currency as string) ?? 'GBP',
    created_by: (row.created_by as string) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function formatDate(val: unknown): string {
  if (val instanceof Date) {
    return val.toISOString().split('T')[0];
  }
  return String(val);
}

function formatPeriodLabel(start: string, end: string): string {
  const startDate = new Date(start);
  const endDate = new Date(end);

  // Check if it's a quarter
  const startMonth = startDate.getMonth();
  const endMonth = endDate.getMonth();
  const year = startDate.getFullYear();

  if (startMonth % 3 === 0 && (endMonth - startMonth === 3 || (endMonth === 0 && endDate.getFullYear() === year + 1))) {
    const quarter = Math.floor(startMonth / 3) + 1;
    return `Q${quarter} ${year}`;
  }

  // Check if it's a full year
  if (startMonth === 0 && endMonth === 0 && endDate.getFullYear() === year + 1) {
    return `${year}`;
  }

  // Check if it's a single month
  if (endDate.getTime() === new Date(year, startMonth + 1, 1).getTime()) {
    return startDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  }

  return `${start} – ${end}`;
}

function inferPeriodType(start: string, end: string): string {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const startMonth = startDate.getMonth();
  const endMonth = endDate.getMonth();
  const year = startDate.getFullYear();

  // Full year
  if (startMonth === 0 && endMonth === 0 && endDate.getFullYear() === year + 1) {
    return 'annual';
  }

  // Quarter
  if (startMonth % 3 === 0 && (endMonth - startMonth === 3 || (endMonth === 0 && endDate.getFullYear() === year + 1))) {
    return 'quarterly';
  }

  // Single month
  if (endDate.getTime() === new Date(year, startMonth + 1, 1).getTime()) {
    return 'monthly';
  }

  return 'quarterly';
}

async function getRecordName(recordId: string | null): Promise<string | null> {
  if (!recordId) return null;

  const result = await pool.query(
    'SELECT name FROM records WHERE id = $1',
    [recordId],
  );

  return (result.rows[0]?.name as string) ?? null;
}

/**
 * Calculates actual closed-won revenue for a user identified by their User
 * record ID (not their Descope user ID). First resolves the descope_user_id
 * from the user record, then queries opportunities by owner_id.
 */
async function calculateActualForUserRecord(
  tenantId: string,
  userRecordId: string,
  periodStart: string,
  periodEnd: string,
): Promise<number> {
  // Resolve descope_user_id from the user record
  const userResult = await pool.query(
    `SELECT r.field_values->>'descope_user_id' as descope_user_id
     FROM records r
     JOIN object_definitions od ON r.object_id = od.id
     WHERE r.id = $1 AND od.api_name = 'user'`,
    [userRecordId],
  );

  const descopeUserId = userResult.rows[0]?.descope_user_id as string | undefined;
  if (!descopeUserId) {
    return 0;
  }

  return calculateActual(tenantId, periodStart, periodEnd, descopeUserId);
}

/**
 * Finds user targets associated with a team and calculates their actuals.
 * Team membership is determined by the user record's team field matching the team record ID.
 */
async function getTeamUserTargets(
  tenantId: string,
  teamRecordId: string,
  allUserTargets: SalesTarget[],
  periodStart: string,
  periodEnd: string,
): Promise<UserTargetSummary[]> {
  // Find user records that belong to this team
  const teamUsersResult = await pool.query(
    `SELECT r.id, r.name, r.field_values->>'descope_user_id' as descope_user_id
     FROM records r
     JOIN object_definitions od ON r.object_id = od.id
     WHERE od.api_name = 'user'
       AND r.tenant_id = $1
       AND r.field_values->>'team_id' = $2`,
    [tenantId, teamRecordId],
  );

  const userSummaries: UserTargetSummary[] = [];

  for (const userRow of teamUsersResult.rows) {
    const userRecordId = userRow.id as string;
    const userName = userRow.name as string;
    const descopeUserId = userRow.descope_user_id as string | undefined;

    // Find the matching target
    const userTarget = allUserTargets.find(
      (ut) => ut.target_entity_id === userRecordId,
    );

    const actual = descopeUserId
      ? await calculateActual(tenantId, periodStart, periodEnd, descopeUserId)
      : 0;

    const targetValue = userTarget?.target_value ?? 0;

    userSummaries.push({
      name: userName,
      target: targetValue,
      actual,
      percentage: targetValue > 0 ? Math.round((actual / targetValue) * 100) : 0,
    });
  }

  return userSummaries;
}
