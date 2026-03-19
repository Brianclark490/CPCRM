import { describe, it, expect, vi, beforeEach } from 'vitest';

const TENANT_ID = 'test-tenant-001';

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ─── Fake DB state ──────────────────────────────────────────────────────────

const { fakeRecords, fakeStages, fakePipelines, fakeGates, mockQuery, mockConnect } = vi.hoisted(() => {
  const fakeRecords = new Map<string, Record<string, unknown>>();
  const fakeStages = new Map<string, Record<string, unknown>>();
  const fakePipelines = new Map<string, Record<string, unknown>>();
  const fakeGates = new Map<string, Record<string, unknown>>();

  const mockQuery = vi.fn(async (sql: string, params?: unknown[]) => {
    const s = sql.replace(/\s+/g, ' ').trim().toUpperCase();

    // Transaction statements
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

    // Record lookup by id, object_id, owner_id
    if (s.startsWith('SELECT * FROM RECORDS WHERE ID') && s.includes('OBJECT_ID') && s.includes('OWNER_ID')) {
      const id = params![0] as string;
      const objectId = params![1] as string;
      const ownerId = params![2] as string;
      const record = fakeRecords.get(id);
      if (record && record.object_id === objectId && record.owner_id === ownerId) {
        return { rows: [record] };
      }
      return { rows: [] };
    }

    // Stage lookup by id and pipeline_id
    if (s.startsWith('SELECT * FROM STAGE_DEFINITIONS WHERE ID') && s.includes('PIPELINE_ID')) {
      const stageId = params![0] as string;
      const pipelineId = params![1] as string;
      const stage = fakeStages.get(stageId);
      if (stage && stage.pipeline_id === pipelineId) {
        return { rows: [stage] };
      }
      return { rows: [] };
    }

    // Stage lookup by id only
    if (s.startsWith('SELECT * FROM STAGE_DEFINITIONS WHERE ID')) {
      const stageId = params![0] as string;
      const stage = fakeStages.get(stageId);
      if (stage) return { rows: [stage] };
      return { rows: [] };
    }

    // Stage gates query with field metadata
    if (s.includes('FROM STAGE_GATES SG') && s.includes('JOIN FIELD_DEFINITIONS FD')) {
      const stageId = params![0] as string;
      const gates = [...fakeGates.values()].filter((g) => g.stage_id === stageId);
      return { rows: gates };
    }

    // Insert stage_history
    if (s.startsWith('INSERT INTO STAGE_HISTORY')) {
      return { rows: [] };
    }

    // Update records for move-stage (does NOT set pipeline_id)
    if (s.startsWith('UPDATE RECORDS') && s.includes('CURRENT_STAGE_ID') && !s.includes('PIPELINE_ID')) {
      const targetStageId = params![0] as string;
      const fieldValuesJson = params![1] as string;
      const recordId = params![2] as string;
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

    // Default pipeline lookup
    if (s.includes('FROM PIPELINE_DEFINITIONS WHERE OBJECT_ID') && s.includes('IS_DEFAULT')) {
      const objectId = params![0] as string;
      const pipeline = [...fakePipelines.values()].find(
        (p) => p.object_id === objectId && p.is_default === true,
      );
      if (pipeline) return { rows: [pipeline] };
      return { rows: [] };
    }

    // First open stage lookup
    if (s.includes('FROM STAGE_DEFINITIONS') && s.includes("STAGE_TYPE = 'OPEN'") && s.includes('LIMIT 1')) {
      const pipelineId = params![0] as string;
      const openStages = [...fakeStages.values()]
        .filter((st) => st.pipeline_id === pipelineId && st.stage_type === 'open')
        .sort((a, b) => (a.sort_order as number) - (b.sort_order as number));
      if (openStages.length > 0) return { rows: [openStages[0]] };
      return { rows: [] };
    }

    // Select pipeline columns for re-read after auto-assignment
    if (s.startsWith('SELECT PIPELINE_ID, CURRENT_STAGE_ID, STAGE_ENTERED_AT FROM RECORDS WHERE ID')) {
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

    // Update records for pipeline assignment (with field_values)
    if (s.startsWith('UPDATE RECORDS') && s.includes('PIPELINE_ID') && s.includes('FIELD_VALUES')) {
      const pipelineId = params![0] as string;
      const stageId = params![1] as string;
      const fieldValuesJson = params![2] as string;
      const recordId = params![3] as string;
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

    // Update records for pipeline assignment (without field_values)
    if (s.startsWith('UPDATE RECORDS') && s.includes('PIPELINE_ID')) {
      const pipelineId = params![0] as string;
      const stageId = params![1] as string;
      const recordId = params![2] as string;
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
  });

  const mockClient = {
    query: mockQuery,
    release: vi.fn(),
  };

  const mockConnect = vi.fn(async () => mockClient);

  return { fakeRecords, fakeStages, fakePipelines, fakeGates, mockQuery, mockConnect };
});

vi.mock('../../db/client.js', () => ({
  pool: { query: mockQuery, connect: mockConnect },
}));

const { moveRecordStage, assignDefaultPipeline } = await import('../stageMovementService.js');

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
    sort_order: 0,
    stage_type: 'open',
    default_probability: 10,
  });

  fakeStages.set('stage-qualification', {
    id: 'stage-qualification',
    pipeline_id: 'pipeline-1',
    name: 'Qualification',
    sort_order: 1,
    stage_type: 'open',
    default_probability: 25,
  });

  fakeStages.set('stage-proposal', {
    id: 'stage-proposal',
    pipeline_id: 'pipeline-1',
    name: 'Proposal',
    sort_order: 2,
    stage_type: 'open',
    default_probability: 60,
  });

  fakeStages.set('stage-won', {
    id: 'stage-won',
    pipeline_id: 'pipeline-1',
    name: 'Closed Won',
    sort_order: 3,
    stage_type: 'won',
    default_probability: 100,
  });

  fakeStages.set('stage-lost', {
    id: 'stage-lost',
    pipeline_id: 'pipeline-1',
    name: 'Closed Lost',
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

  it('auto-assigns default pipeline and moves record when record has no pipeline', async () => {
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

  it('throws VALIDATION_ERROR when record has no pipeline and no default pipeline exists', async () => {
    // Only seed stages, not the pipeline — so assignDefaultPipeline returns false
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

    await expect(
      moveRecordStage(TENANT_ID, 'opportunity', 'rec-no-pipeline', 'stage-qualification', 'user-123'),
    ).rejects.toThrow('Record is not assigned to a pipeline');
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
    const client = { query: mockQuery, release: vi.fn() } as unknown as import('pg').PoolClient;
    const result = await assignDefaultPipeline(client, 'rec-1', 'obj-no-pipeline', 'user-123');
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

    const client = { query: mockQuery, release: vi.fn() } as unknown as import('pg').PoolClient;
    const result = await assignDefaultPipeline(client, 'rec-new', 'obj-opportunity-id', 'user-123');

    expect(result).toBe(true);
    const record = fakeRecords.get('rec-new')!;
    expect(record.pipeline_id).toBe('pipeline-1');
    expect(record.current_stage_id).toBe('stage-prospect');
  });
});
