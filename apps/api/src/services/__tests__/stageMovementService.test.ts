import { describe, it, expect, vi, beforeEach } from 'vitest';

const TENANT_ID = 'test-tenant-001';

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ─── Fake DB state ──────────────────────────────────────────────────────────
//
// NOTE (Phase 3b Kysely migration, issue #445): the service is now on
// Kysely. The mock below therefore matches Kysely-emitted SQL. Identifier
// quoting is stripped by the normaliser, matching the pattern used by
// pipelineService.test.ts. The 20+ test bodies further down are kept
// semantically unchanged — only this mock router is updated.
//
// A dedicated Kysely SQL regression suite lives next door:
//   apps/api/src/services/__tests__/stageMovementService.kysely-sql.test.ts

const {
  fakeRecords,
  fakeStages,
  fakePipelines,
  fakeGates,
  mockQuery,
  mockConnect,
  stageHistoryInserts,
} = vi.hoisted(() => {
  const fakeRecords = new Map<string, Record<string, unknown>>();
  const fakeStages = new Map<string, Record<string, unknown>>();
  const fakePipelines = new Map<string, Record<string, unknown>>();
  const fakeGates = new Map<string, Record<string, unknown>>();
  // Counter of stage_history INSERTs seen across all query channels
  // (pool.query + any checked-out client), so tests can assert that
  // history was written regardless of which channel Kysely chose.
  const stageHistoryInserts: { count: number } = { count: 0 };

  function runQuery(sql: string, params?: unknown[]) {
    // Strip identifier quotes and normalise whitespace so pattern-matching
    // is quote-agnostic (Kysely wraps identifiers in "…").
    const s = sql.replace(/\s+/g, ' ').replace(/"/g, '').trim().toUpperCase();

    // Transaction control
    if (s === 'BEGIN' || s === 'COMMIT' || s === 'ROLLBACK') {
      return { rows: [] };
    }

    // Object definitions lookup
    if (s.startsWith('SELECT ID FROM OBJECT_DEFINITIONS WHERE API_NAME')) {
      const apiName = params![0] as string;
      if (apiName === 'opportunity') {
        return { rows: [{ id: 'obj-opportunity-id' }] };
      }
      return { rows: [] };
    }

    // Record lookup by id, object_id, tenant_id (moveRecordStage step 2)
    if (
      s.startsWith('SELECT * FROM RECORDS WHERE ID') &&
      s.includes('OBJECT_ID') &&
      s.includes('TENANT_ID')
    ) {
      const id = params![0] as string;
      const objectId = params![1] as string;
      const record = fakeRecords.get(id);
      if (record && record.object_id === objectId) {
        return { rows: [record] };
      }
      return { rows: [] };
    }

    // Stage lookup by id and pipeline_id and tenant_id
    if (
      s.startsWith('SELECT * FROM STAGE_DEFINITIONS WHERE ID') &&
      s.includes('PIPELINE_ID')
    ) {
      const stageId = params![0] as string;
      const pipelineId = params![1] as string;
      const stage = fakeStages.get(stageId);
      if (stage && stage.pipeline_id === pipelineId) {
        return { rows: [stage] };
      }
      return { rows: [] };
    }

    // Target stage lookup joined with parent pipeline to project
    // pipeline_definitions.object_id (for cross-object validation).
    if (
      s.includes('FROM STAGE_DEFINITIONS') &&
      s.includes('JOIN PIPELINE_DEFINITIONS') &&
      s.includes('PIPELINE_OBJECT_ID')
    ) {
      const stageId = params![0] as string;
      const stage = fakeStages.get(stageId);
      if (stage) {
        const pipeline = fakePipelines.get(stage.pipeline_id as string);
        return {
          rows: [
            {
              ...stage,
              pipeline_object_id: pipeline?.object_id ?? null,
            },
          ],
        };
      }
      return { rows: [] };
    }

    // Stage lookup by id + tenant_id (target stage, legacy path)
    if (s.startsWith('SELECT * FROM STAGE_DEFINITIONS WHERE ID')) {
      const stageId = params![0] as string;
      const stage = fakeStages.get(stageId);
      if (stage) return { rows: [stage] };
      return { rows: [] };
    }

    // Stage gates query with field metadata (JOIN field_definitions).
    // Kysely emits the alias form: FROM STAGE_GATES AS SG INNER JOIN
    // FIELD_DEFINITIONS AS FD ON FD.ID = SG.FIELD_ID WHERE SG.STAGE_ID = $1
    // AND SG.TENANT_ID = $2.
    if (
      s.includes('FROM STAGE_GATES') &&
      s.includes('JOIN FIELD_DEFINITIONS')
    ) {
      const stageId = params![0] as string;
      const gates = [...fakeGates.values()].filter((g) => g.stage_id === stageId);
      return { rows: gates };
    }

    // Insert into stage_history
    if (s.startsWith('INSERT INTO STAGE_HISTORY')) {
      stageHistoryInserts.count += 1;
      return { rows: [] };
    }

    // UPDATE records in moveRecordStage:
    //   set current_stage_id, stage_entered_at, field_values, updated_at
    //   where id, object_id, tenant_id returning *
    // params: [targetStageId, stage_entered_at, fieldValuesJson, updated_at,
    //          recordId, objectId, tenantId]
    if (
      s.startsWith('UPDATE RECORDS') &&
      s.includes('CURRENT_STAGE_ID') &&
      s.includes('FIELD_VALUES') &&
      !s.includes('PIPELINE_ID') &&
      s.includes('RETURNING')
    ) {
      const targetStageId = params![0] as string;
      const fieldValuesJson = params![2] as string;
      const recordId = params![4] as string;
      const record = fakeRecords.get(recordId);
      if (record) {
        const updated = {
          ...record,
          current_stage_id: targetStageId,
          field_values: JSON.parse(fieldValuesJson),
          stage_entered_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        fakeRecords.set(recordId, updated);
        return { rows: [updated] };
      }
      return { rows: [] };
    }

    // Default pipeline lookup (is_default = true)
    if (
      s.includes('FROM PIPELINE_DEFINITIONS') &&
      s.includes('OBJECT_ID') &&
      s.includes('IS_DEFAULT')
    ) {
      const objectId = params![0] as string;
      const pipeline = [...fakePipelines.values()].find(
        (p) => p.object_id === objectId && p.is_default === true,
      );
      if (pipeline) return { rows: [pipeline] };
      return { rows: [] };
    }

    // All stages for a pipeline (used by assignDefaultPipeline). Projects
    // specific columns and orders by sort_order ASC.
    if (
      s.includes('FROM STAGE_DEFINITIONS') &&
      s.includes('PIPELINE_ID') &&
      s.includes('ORDER BY SORT_ORDER ASC')
    ) {
      const pipelineId = params![0] as string;
      const stages = [...fakeStages.values()]
        .filter((st) => st.pipeline_id === pipelineId)
        .sort((a, b) => (a.sort_order as number) - (b.sort_order as number));
      return { rows: stages };
    }

    // Select pipeline columns for re-read after auto-assignment
    if (
      s.startsWith('SELECT PIPELINE_ID, CURRENT_STAGE_ID, STAGE_ENTERED_AT FROM RECORDS WHERE ID')
    ) {
      const id = params![0] as string;
      const record = fakeRecords.get(id);
      if (record) return { rows: [record] };
      return { rows: [] };
    }

    // Select field_values for pipeline assignment
    if (s.startsWith('SELECT FIELD_VALUES FROM RECORDS WHERE ID')) {
      const id = params![0] as string;
      const record = fakeRecords.get(id);
      if (record) return { rows: [{ field_values: record.field_values }] };
      return { rows: [] };
    }

    // UPDATE records in assignDefaultPipeline (with field_values):
    //   set pipeline_id, current_stage_id, stage_entered_at, field_values
    //   where id = $5
    // params: [pipelineId, stageId, now, fieldValuesJson, recordId]
    if (
      s.startsWith('UPDATE RECORDS') &&
      s.includes('PIPELINE_ID') &&
      s.includes('FIELD_VALUES')
    ) {
      const pipelineId = params![0] as string;
      const stageId = params![1] as string;
      const fieldValuesJson = params![3] as string;
      const recordId = params![4] as string;
      const record = fakeRecords.get(recordId);
      if (record) {
        const updated = {
          ...record,
          pipeline_id: pipelineId,
          current_stage_id: stageId,
          stage_entered_at: new Date().toISOString(),
          field_values: JSON.parse(fieldValuesJson),
        };
        fakeRecords.set(recordId, updated);
      }
      return { rows: [] };
    }

    // UPDATE records in assignDefaultPipeline (without field_values):
    //   set pipeline_id, current_stage_id, stage_entered_at where id = $4
    // params: [pipelineId, stageId, now, recordId]
    if (s.startsWith('UPDATE RECORDS') && s.includes('PIPELINE_ID')) {
      const pipelineId = params![0] as string;
      const stageId = params![1] as string;
      const recordId = params![3] as string;
      const record = fakeRecords.get(recordId);
      if (record) {
        const updated = {
          ...record,
          pipeline_id: pipelineId,
          current_stage_id: stageId,
          stage_entered_at: new Date().toISOString(),
        };
        fakeRecords.set(recordId, updated);
      }
      return { rows: [] };
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

  return {
    fakeRecords,
    fakeStages,
    fakePipelines,
    fakeGates,
    mockQuery,
    mockConnect,
    stageHistoryInserts,
  };
});

vi.mock('../../db/client.js', () => ({
  pool: { query: mockQuery, connect: mockConnect },
}));

const { moveRecordStage, assignDefaultPipeline } = await import('../stageMovementService.js');
const { db } = await import('../../db/kysely.js');

// ─── Test data helpers ──────────────────────────────────────────────────────

function seedPipelineAndStages(): void {
  fakePipelines.set('pipeline-1', {
    id: 'pipeline-1',
    object_id: 'obj-opportunity-id',
    name: 'Sales Pipeline',
    is_default: true,
  });

  fakeStages.set('stage-prospect', {
    id: 'stage-prospect',
    pipeline_id: 'pipeline-1',
    name: 'Prospecting',
    api_name: 'prospecting',
    sort_order: 0,
    stage_type: 'open',
    default_probability: 10,
  });

  fakeStages.set('stage-qualification', {
    id: 'stage-qualification',
    pipeline_id: 'pipeline-1',
    name: 'Qualification',
    api_name: 'qualification',
    sort_order: 1,
    stage_type: 'open',
    default_probability: 25,
  });

  fakeStages.set('stage-proposal', {
    id: 'stage-proposal',
    pipeline_id: 'pipeline-1',
    name: 'Proposal',
    api_name: 'proposal',
    sort_order: 2,
    stage_type: 'open',
    default_probability: 60,
  });

  fakeStages.set('stage-won', {
    id: 'stage-won',
    pipeline_id: 'pipeline-1',
    name: 'Closed Won',
    api_name: 'closed_won',
    sort_order: 3,
    stage_type: 'won',
    default_probability: 100,
  });

  fakeStages.set('stage-lost', {
    id: 'stage-lost',
    pipeline_id: 'pipeline-1',
    name: 'Closed Lost',
    api_name: 'closed_lost',
    sort_order: 4,
    stage_type: 'lost',
    default_probability: 0,
  });
}

function seedRecord(): void {
  fakeRecords.set('rec-1', {
    id: 'rec-1',
    object_id: 'obj-opportunity-id',
    name: 'Test Opportunity',
    field_values: { name: 'Test Opportunity', value: 50000, close_date: '2026-06-15' },
    owner_id: 'user-123',
    pipeline_id: 'pipeline-1',
    current_stage_id: 'stage-prospect',
    stage_entered_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
}

// ─── Tests: moveRecordStage ─────────────────────────────────────────────────

describe('moveRecordStage', () => {
  beforeEach(() => {
    fakeRecords.clear();
    fakeStages.clear();
    fakePipelines.clear();
    fakeGates.clear();
    stageHistoryInserts.count = 0;
    mockQuery.mockClear();
    mockConnect.mockClear();
  });

  it('moves record forward when no gates exist', async () => {
    seedPipelineAndStages();
    seedRecord();

    const result = await moveRecordStage(TENANT_ID, 'opportunity', 'rec-1', 'stage-qualification', 'user-123');

    expect(result.currentStageId).toBe('stage-qualification');
    expect(result.fieldValues.probability).toBe(25);
  });

  it('moves record backward without gate checks', async () => {
    seedPipelineAndStages();
    seedRecord();

    // Put record at qualification first
    fakeRecords.get('rec-1')!.current_stage_id = 'stage-qualification';

    const result = await moveRecordStage(TENANT_ID, 'opportunity', 'rec-1', 'stage-prospect', 'user-123');

    expect(result.currentStageId).toBe('stage-prospect');
  });

  it('throws GATE_VALIDATION_FAILED when forward gates fail', async () => {
    seedPipelineAndStages();
    seedRecord();

    // Remove required field values from the record
    fakeRecords.get('rec-1')!.field_values = { name: 'Test Opportunity' };

    // Add a gate on the qualification stage
    fakeGates.set('gate-1', {
      stage_id: 'stage-qualification',
      field_id: 'field-value-id',
      field_api_name: 'value',
      field_label: 'Deal Value',
      field_type: 'currency',
      gate_type: 'required',
      gate_value: null,
      error_message: 'Deal value is required',
    });

    try {
      await moveRecordStage(TENANT_ID, 'opportunity', 'rec-1', 'stage-qualification', 'user-123');
      expect.fail('Should have thrown');
    } catch (err: unknown) {
      const error = err as Error & { code: string; failures: Array<{ field: string; gate: string }> };
      expect(error.code).toBe('GATE_VALIDATION_FAILED');
      expect(error.failures).toHaveLength(1);
      expect(error.failures[0].field).toBe('value');
      expect(error.failures[0].gate).toBe('required');
    }
  });

  it('skips gate checks when moving backward', async () => {
    seedPipelineAndStages();
    seedRecord();

    // Put record at proposal
    fakeRecords.get('rec-1')!.current_stage_id = 'stage-proposal';

    // Add a gate on the qualification stage (should be skipped for backward moves)
    fakeGates.set('gate-1', {
      stage_id: 'stage-qualification',
      field_id: 'field-value-id',
      field_api_name: 'value',
      field_label: 'Deal Value',
      field_type: 'currency',
      gate_type: 'required',
      gate_value: null,
      error_message: 'Deal value is required',
    });

    // Remove the value to make the gate fail
    fakeRecords.get('rec-1')!.field_values = { name: 'Test Opportunity' };

    // Moving backward should skip gates
    const result = await moveRecordStage(TENANT_ID, 'opportunity', 'rec-1', 'stage-qualification', 'user-123');
    expect(result.currentStageId).toBe('stage-qualification');
  });

  it('validates gates when moving to won/lost stage', async () => {
    seedPipelineAndStages();
    seedRecord();

    // Add a gate on the won stage
    fakeGates.set('gate-won-1', {
      stage_id: 'stage-won',
      field_id: 'field-value-id',
      field_api_name: 'value',
      field_label: 'Deal Value',
      field_type: 'currency',
      gate_type: 'required',
      gate_value: null,
      error_message: null,
    });

    // Record has value so gate should pass
    const result = await moveRecordStage(TENANT_ID, 'opportunity', 'rec-1', 'stage-won', 'user-123');
    expect(result.currentStageId).toBe('stage-won');
    expect(result.fieldValues.probability).toBe(100);
  });

  it('throws NOT_FOUND when record does not exist', async () => {
    seedPipelineAndStages();

    await expect(
      moveRecordStage(TENANT_ID, 'opportunity', 'nonexistent', 'stage-qualification', 'user-123'),
    ).rejects.toThrow('Record not found');
  });

  it('throws NOT_FOUND when object type does not exist', async () => {
    await expect(
      moveRecordStage(TENANT_ID, 'nonexistent', 'rec-1', 'stage-qualification', 'user-123'),
    ).rejects.toThrow("Object type 'nonexistent' not found");
  });

  it('throws VALIDATION_ERROR when target stage is in a different pipeline', async () => {
    seedPipelineAndStages();
    seedRecord();

    // Second pipeline for the SAME object — exercises the cross-pipeline
    // rejection path (not the cross-object one).
    fakePipelines.set('pipeline-2', {
      id: 'pipeline-2',
      object_id: 'obj-opportunity-id',
      name: 'Other Pipeline',
      is_default: false,
    });

    // Add a stage in a different pipeline
    fakeStages.set('stage-other', {
      id: 'stage-other',
      pipeline_id: 'pipeline-2',
      name: 'Other Stage',
      sort_order: 0,
      stage_type: 'open',
      default_probability: null,
    });

    await expect(
      moveRecordStage(TENANT_ID, 'opportunity', 'rec-1', 'stage-other', 'user-123'),
    ).rejects.toThrow('Target stage does not belong to the same pipeline');
  });

  it('throws VALIDATION_ERROR when record is already in the target stage', async () => {
    seedPipelineAndStages();
    seedRecord();

    await expect(
      moveRecordStage(TENANT_ID, 'opportunity', 'rec-1', 'stage-prospect', 'user-123'),
    ).rejects.toThrow('Record is already in this stage');
  });

  it('adopts target stage pipeline and moves record when record has no pipeline', async () => {
    seedPipelineAndStages();

    fakeRecords.set('rec-no-pipeline', {
      id: 'rec-no-pipeline',
      object_id: 'obj-opportunity-id',
      name: 'No Pipeline',
      field_values: { value: 50000 },
      owner_id: 'user-123',
      pipeline_id: null,
      current_stage_id: null,
      stage_entered_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const result = await moveRecordStage(TENANT_ID, 'opportunity', 'rec-no-pipeline', 'stage-qualification', 'user-123');

    expect(result.currentStageId).toBe('stage-qualification');
    expect(result.pipelineId).toBe('pipeline-1');
  });

  it('adopts the target stage pipeline even when a sibling pipeline is also default', async () => {
    // Regression: when multiple pipelines for an object are marked
    // is_default=true the legacy `assignDefaultPipeline` lookup could
    // pick a different pipeline than the one the user chose a stage
    // from, producing a cross-pipeline 400. Picking the target stage's
    // pipeline directly avoids the ambiguity.
    seedPipelineAndStages();

    // Second default pipeline for the same object, with its own stages.
    fakePipelines.set('pipeline-2', {
      id: 'pipeline-2',
      object_id: 'obj-opportunity-id',
      name: 'Sales Pipeline 2',
      is_default: true,
    });
    fakeStages.set('stage-p2-prospect', {
      id: 'stage-p2-prospect',
      pipeline_id: 'pipeline-2',
      name: 'Prospecting',
      api_name: 'prospecting',
      sort_order: 0,
      stage_type: 'open',
      default_probability: 10,
    });
    fakeStages.set('stage-p2-qualification', {
      id: 'stage-p2-qualification',
      pipeline_id: 'pipeline-2',
      name: 'Qualification',
      api_name: 'qualification',
      sort_order: 1,
      stage_type: 'open',
      default_probability: 25,
    });

    fakeRecords.set('rec-no-pipeline', {
      id: 'rec-no-pipeline',
      object_id: 'obj-opportunity-id',
      name: 'No Pipeline',
      field_values: { value: 50000 },
      owner_id: 'user-123',
      pipeline_id: null,
      current_stage_id: null,
      stage_entered_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // User picks a stage from pipeline-2 — the record should adopt pipeline-2.
    const result = await moveRecordStage(
      TENANT_ID,
      'opportunity',
      'rec-no-pipeline',
      'stage-p2-qualification',
      'user-123',
    );

    expect(result.currentStageId).toBe('stage-p2-qualification');
    expect(result.pipelineId).toBe('pipeline-2');
  });

  it('rejects move when target stage belongs to a different object type', async () => {
    // Regression: adopting the target stage's pipeline must still reject
    // cross-object moves — a record for object A cannot be moved to a
    // stage whose parent pipeline belongs to object B.
    seedPipelineAndStages();

    // Foreign pipeline for a different object.
    fakePipelines.set('pipeline-other', {
      id: 'pipeline-other',
      object_id: 'obj-contact-id',
      name: 'Contact Pipeline',
      is_default: true,
    });
    fakeStages.set('stage-foreign', {
      id: 'stage-foreign',
      pipeline_id: 'pipeline-other',
      name: 'Foreign',
      api_name: 'foreign',
      sort_order: 0,
      stage_type: 'open',
      default_probability: 0,
    });

    fakeRecords.set('rec-no-pipeline', {
      id: 'rec-no-pipeline',
      object_id: 'obj-opportunity-id',
      name: 'No Pipeline',
      field_values: {},
      owner_id: 'user-123',
      pipeline_id: null,
      current_stage_id: null,
      stage_entered_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    try {
      await moveRecordStage(
        TENANT_ID,
        'opportunity',
        'rec-no-pipeline',
        'stage-foreign',
        'user-123',
      );
      expect.fail('Should have thrown');
    } catch (err: unknown) {
      const error = err as Error & {
        code: string;
        details?: Record<string, unknown>;
      };
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.message).toMatch(/different object type/i);
      expect(error.details?.recordObjectId).toBe('obj-opportunity-id');
      expect(error.details?.targetStagePipelineObjectId).toBe('obj-contact-id');
    }
  });

  it('applies default_probability on stage entry', async () => {
    seedPipelineAndStages();
    seedRecord();

    const result = await moveRecordStage(TENANT_ID, 'opportunity', 'rec-1', 'stage-qualification', 'user-123');

    expect(result.fieldValues.probability).toBe(25);
  });

  it('evaluates min_value gate correctly', async () => {
    seedPipelineAndStages();
    seedRecord();

    // Set value below minimum
    fakeRecords.get('rec-1')!.field_values = { name: 'Test', value: -5 };

    fakeGates.set('gate-min', {
      stage_id: 'stage-qualification',
      field_id: 'field-value-id',
      field_api_name: 'value',
      field_label: 'Deal Value',
      field_type: 'currency',
      gate_type: 'min_value',
      gate_value: '0',
      error_message: 'Deal value must be set',
    });

    try {
      await moveRecordStage(TENANT_ID, 'opportunity', 'rec-1', 'stage-qualification', 'user-123');
      expect.fail('Should have thrown');
    } catch (err: unknown) {
      const error = err as Error & { code: string; failures: Array<{ gate: string }> };
      expect(error.code).toBe('GATE_VALIDATION_FAILED');
      expect(error.failures[0].gate).toBe('min_value');
    }
  });

  it('evaluates specific_value gate correctly', async () => {
    seedPipelineAndStages();
    seedRecord();

    // Set status to wrong value
    fakeRecords.get('rec-1')!.field_values = { name: 'Test', value: 50000, status: 'draft' };

    fakeGates.set('gate-specific', {
      stage_id: 'stage-qualification',
      field_id: 'field-status-id',
      field_api_name: 'status',
      field_label: 'Status',
      field_type: 'dropdown',
      gate_type: 'specific_value',
      gate_value: 'qualified',
      error_message: null,
      field_options: { choices: ['draft', 'qualified', 'disqualified'] },
    });

    try {
      await moveRecordStage(TENANT_ID, 'opportunity', 'rec-1', 'stage-qualification', 'user-123');
      expect.fail('Should have thrown');
    } catch (err: unknown) {
      const error = err as Error & { code: string; failures: Array<{ field: string; gate: string; message: string }> };
      expect(error.code).toBe('GATE_VALIDATION_FAILED');
      expect(error.failures).toHaveLength(1);
      expect(error.failures[0].field).toBe('status');
      expect(error.failures[0].gate).toBe('specific_value');
      expect(error.failures[0].message).toContain('must be "qualified"');
    }
  });

  it('passes specific_value gate when value matches', async () => {
    seedPipelineAndStages();
    seedRecord();

    fakeRecords.get('rec-1')!.field_values = { name: 'Test', value: 50000, status: 'qualified' };

    fakeGates.set('gate-specific', {
      stage_id: 'stage-qualification',
      field_id: 'field-status-id',
      field_api_name: 'status',
      field_label: 'Status',
      field_type: 'dropdown',
      gate_type: 'specific_value',
      gate_value: 'qualified',
      error_message: null,
      field_options: { choices: ['draft', 'qualified', 'disqualified'] },
    });

    const result = await moveRecordStage(TENANT_ID, 'opportunity', 'rec-1', 'stage-qualification', 'user-123');
    expect(result.currentStageId).toBe('stage-qualification');
  });

  it('tracks stage_history when moving between stages', async () => {
    seedPipelineAndStages();
    seedRecord();

    await moveRecordStage(TENANT_ID, 'opportunity', 'rec-1', 'stage-qualification', 'user-123');

    // The mock router counts every INSERT INTO stage_history it sees,
    // whether it comes through pool.query or a checked-out transaction
    // client. moveRecordStage must emit exactly one such insert.
    expect(stageHistoryInserts.count).toBe(1);
  });

  it('evaluates multiple gates on the same stage', async () => {
    seedPipelineAndStages();
    seedRecord();

    // Remove both required field values
    fakeRecords.get('rec-1')!.field_values = { name: 'Test' };

    fakeGates.set('gate-req-value', {
      stage_id: 'stage-qualification',
      field_id: 'field-value-id',
      field_api_name: 'value',
      field_label: 'Deal Value',
      field_type: 'currency',
      gate_type: 'required',
      gate_value: null,
      error_message: 'Deal value is required',
    });

    fakeGates.set('gate-req-date', {
      stage_id: 'stage-qualification',
      field_id: 'field-date-id',
      field_api_name: 'close_date',
      field_label: 'Close Date',
      field_type: 'date',
      gate_type: 'required',
      gate_value: null,
      error_message: 'Close date is required',
    });

    try {
      await moveRecordStage(TENANT_ID, 'opportunity', 'rec-1', 'stage-qualification', 'user-123');
      expect.fail('Should have thrown');
    } catch (err: unknown) {
      const error = err as Error & { code: string; failures: Array<{ field: string; gate: string }> };
      expect(error.code).toBe('GATE_VALIDATION_FAILED');
      expect(error.failures).toHaveLength(2);
      expect(error.failures.map((f: { field: string }) => f.field)).toContain('value');
      expect(error.failures.map((f: { field: string }) => f.field)).toContain('close_date');
    }
  });

  it('passes min_value gate when value meets minimum', async () => {
    seedPipelineAndStages();
    seedRecord();

    fakeRecords.get('rec-1')!.field_values = { name: 'Test', value: 1000 };

    fakeGates.set('gate-min', {
      stage_id: 'stage-qualification',
      field_id: 'field-value-id',
      field_api_name: 'value',
      field_label: 'Deal Value',
      field_type: 'currency',
      gate_type: 'min_value',
      gate_value: '500',
      error_message: null,
    });

    const result = await moveRecordStage(TENANT_ID, 'opportunity', 'rec-1', 'stage-qualification', 'user-123');
    expect(result.currentStageId).toBe('stage-qualification');
  });
});

// ─── Tests: assignDefaultPipeline ───────────────────────────────────────────

describe('assignDefaultPipeline', () => {
  beforeEach(() => {
    fakeRecords.clear();
    fakeStages.clear();
    fakePipelines.clear();
    fakeGates.clear();
    mockQuery.mockClear();
  });

  it('returns false when no default pipeline exists', async () => {
    const result = await assignDefaultPipeline(db, 'rec-1', 'obj-no-pipeline', 'user-123');
    expect(result).toBe(false);
  });

  it('assigns pipeline and first stage when default pipeline exists', async () => {
    seedPipelineAndStages();
    fakeRecords.set('rec-new', {
      id: 'rec-new',
      object_id: 'obj-opportunity-id',
      name: 'New Opportunity',
      field_values: { name: 'New Opportunity' },
      owner_id: 'user-123',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const result = await assignDefaultPipeline(db, 'rec-new', 'obj-opportunity-id', 'user-123');

    expect(result).toBe(true);
    const record = fakeRecords.get('rec-new')!;
    expect(record.pipeline_id).toBe('pipeline-1');
    expect(record.current_stage_id).toBe('stage-prospect');
  });
});
