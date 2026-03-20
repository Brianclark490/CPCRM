import { describe, it, expect, vi, beforeEach } from 'vitest';

const TENANT_ID = 'test-tenant-001';

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ─── Fake DB pool ─────────────────────────────────────────────────────────────

const {
  fakeObjects,
  fakePipelines,
  fakeStages,
  fakeGates,
  fakeRecords,
  mockQuery,
} = vi.hoisted(() => {
  const fakeObjects = new Map<string, Record<string, unknown>>();
  const fakePipelines = new Map<string, Record<string, unknown>>();
  const fakeStages = new Map<string, Record<string, unknown>>();
  const fakeGates = new Map<string, Record<string, unknown>>();
  const fakeRecords = new Map<string, Record<string, unknown>>();

  const mockQuery = vi.fn(async (sql: string, params?: unknown[]) => {
    const s = sql.replace(/\s+/g, ' ').trim().toUpperCase();

    // SELECT id FROM object_definitions WHERE id = $1
    if (s.startsWith('SELECT ID FROM OBJECT_DEFINITIONS WHERE ID')) {
      const id = params![0] as string;
      const row = fakeObjects.get(id);
      if (row) return { rows: [{ id: row.id }] };
      return { rows: [] };
    }

    // SELECT id FROM pipeline_definitions WHERE api_name = $1
    if (s.startsWith('SELECT ID FROM PIPELINE_DEFINITIONS WHERE API_NAME')) {
      const apiName = params![0] as string;
      const match = [...fakePipelines.values()].find((r) => r.api_name === apiName);
      if (match) return { rows: [{ id: match.id }] };
      return { rows: [] };
    }

    // SELECT id FROM pipeline_definitions WHERE object_id = $1
    if (s.startsWith('SELECT ID FROM PIPELINE_DEFINITIONS WHERE OBJECT_ID')) {
      const objectId = params![0] as string;
      const rows = [...fakePipelines.values()].filter((r) => r.object_id === objectId);
      return { rows: rows.map((r) => ({ id: r.id })) };
    }

    // INSERT INTO pipeline_definitions
    if (s.startsWith('INSERT INTO PIPELINE_DEFINITIONS')) {
      const [id, _tenant_id, object_id, name, api_name, description, is_default, is_system, owner_id, created_at, updated_at] = params as unknown[];
      const row: Record<string, unknown> = {
        id, object_id, name, api_name, description, is_default, is_system, owner_id, created_at, updated_at,
      };
      fakePipelines.set(id as string, row);
      return { rows: [row] };
    }

    // INSERT INTO stage_definitions (batch insert for 2 terminal stages)
    if (s.startsWith('INSERT INTO STAGE_DEFINITIONS') && params && params.length >= 20) {
      const row1: Record<string, unknown> = {
        id: params[0], tenant_id: params[1], pipeline_id: params[2], name: params[3], api_name: params[4],
        sort_order: params[5], stage_type: params[6], colour: params[7],
        default_probability: params[8], created_at: params[9],
        expected_days: null, description: null,
      };
      fakeStages.set(params[0] as string, row1);
      const row2: Record<string, unknown> = {
        id: params[10], tenant_id: params[11], pipeline_id: params[12], name: params[13], api_name: params[14],
        sort_order: params[15], stage_type: params[16], colour: params[17],
        default_probability: params[18], created_at: params[19],
        expected_days: null, description: null,
      };
      fakeStages.set(params[10] as string, row2);
      return { rows: [row1, row2] };
    }

    // INSERT INTO stage_definitions (single stage)
    if (s.startsWith('INSERT INTO STAGE_DEFINITIONS') && params && params.length === 12) {
      const [id, _tenant_id, pipeline_id, name, api_name, sort_order, stage_type, colour, default_probability, expected_days, description, created_at] = params as unknown[];
      const row: Record<string, unknown> = {
        id, pipeline_id, name, api_name, sort_order, stage_type, colour,
        default_probability, expected_days, description, created_at,
      };
      fakeStages.set(id as string, row);
      return { rows: [row] };
    }

    // SELECT * FROM stage_definitions WHERE pipeline_id = $1 AND tenant_id = $2 ORDER BY sort_order
    if (s.includes('FROM STAGE_DEFINITIONS WHERE PIPELINE_ID') && s.includes('ORDER BY SORT_ORDER')) {
      const pipelineId = params![0] as string;
      const rows = [...fakeStages.values()]
        .filter((r) => r.pipeline_id === pipelineId)
        .sort((a, b) => (a.sort_order as number) - (b.sort_order as number));
      return { rows };
    }

    // SELECT * FROM stage_definitions WHERE pipeline_id = $1 (without order — for reorder listing)
    if (s.startsWith('SELECT * FROM STAGE_DEFINITIONS WHERE PIPELINE_ID = $1') && !s.includes('ORDER BY') && !s.includes('API_NAME')) {
      const pipelineId = params![0] as string;
      const rows = [...fakeStages.values()].filter((r) => r.pipeline_id === pipelineId);
      return { rows };
    }

    // SELECT * FROM pipeline_definitions WHERE id = $1
    if (s.startsWith('SELECT * FROM PIPELINE_DEFINITIONS WHERE ID = $1')) {
      const id = params![0] as string;
      const row = fakePipelines.get(id);
      if (row) return { rows: [row] };
      return { rows: [] };
    }

    // SELECT ID FROM PIPELINE_DEFINITIONS WHERE ID = $1
    if (s.startsWith('SELECT ID FROM PIPELINE_DEFINITIONS WHERE ID = $1')) {
      const id = params![0] as string;
      const row = fakePipelines.get(id);
      if (row) return { rows: [{ id: row.id }] };
      return { rows: [] };
    }

    // SELECT * FROM pipeline_definitions WHERE tenant_id = $1 ORDER BY (list all)
    if (s.startsWith('SELECT * FROM PIPELINE_DEFINITIONS WHERE TENANT_ID') && s.includes('ORDER BY')) {
      const rows = [...fakePipelines.values()].sort((a, b) => {
        if (a.is_system && !b.is_system) return -1;
        if (!a.is_system && b.is_system) return 1;
        return 0;
      });
      return { rows };
    }

    // SELECT * FROM stage_gates WHERE stage_id = ANY($1)
    if (s.includes('STAGE_GATES') && s.includes('ANY')) {
      const stageIds = params![0] as string[];
      const rows = [...fakeGates.values()].filter((g) => stageIds.includes(g.stage_id as string));
      return { rows };
    }

    // UPDATE pipeline_definitions
    if (s.startsWith('UPDATE PIPELINE_DEFINITIONS')) {
      const id = params![params!.length - 2] as string;
      const existing = fakePipelines.get(id);
      if (!existing) return { rows: [] };
      const updated = { ...existing, updated_at: new Date() };
      fakePipelines.set(id, updated);
      return { rows: [updated] };
    }

    // SELECT COUNT(*) AS COUNT FROM RECORDS WHERE PIPELINE_ID
    if (s.includes('COUNT') && s.includes('RECORDS') && s.includes('PIPELINE_ID')) {
      const pipelineId = params![0] as string;
      const count = [...fakeRecords.values()].filter((r) => r.pipeline_id === pipelineId).length;
      return { rows: [{ count: String(count) }] };
    }

    // SELECT COUNT(*) AS COUNT FROM RECORDS WHERE CURRENT_STAGE_ID
    if (s.includes('COUNT') && s.includes('RECORDS') && s.includes('CURRENT_STAGE_ID')) {
      const stageId = params![0] as string;
      const count = [...fakeRecords.values()].filter((r) => r.current_stage_id === stageId).length;
      return { rows: [{ count: String(count) }] };
    }

    // SELECT COUNT(*) AS COUNT FROM STAGE_DEFINITIONS WHERE PIPELINE_ID AND STAGE_TYPE
    if (s.includes('COUNT') && s.includes('STAGE_DEFINITIONS') && s.includes('STAGE_TYPE')) {
      const pipelineId = params![0] as string;
      const stageType = params![1] as string;
      const count = [...fakeStages.values()].filter(
        (st) => st.pipeline_id === pipelineId && st.stage_type === stageType,
      ).length;
      return { rows: [{ count: String(count) }] };
    }

    // DELETE FROM pipeline_definitions WHERE id = $1
    if (s.startsWith('DELETE FROM PIPELINE_DEFINITIONS')) {
      const id = params![0] as string;
      fakePipelines.delete(id);
      // cascade: delete stages
      for (const [key, stage] of fakeStages.entries()) {
        if (stage.pipeline_id === id) fakeStages.delete(key);
      }
      return { rowCount: 1 };
    }

    // SELECT * FROM stage_definitions WHERE id = $1 AND pipeline_id = $2
    if (s.startsWith('SELECT * FROM STAGE_DEFINITIONS WHERE ID = $1 AND PIPELINE_ID')) {
      const stageId = params![0] as string;
      const pipelineId = params![1] as string;
      const row = fakeStages.get(stageId);
      if (row && row.pipeline_id === pipelineId) return { rows: [row] };
      return { rows: [] };
    }

    // SELECT ID FROM STAGE_DEFINITIONS WHERE PIPELINE_ID = $1 AND API_NAME = $2
    if (s.startsWith('SELECT ID FROM STAGE_DEFINITIONS WHERE PIPELINE_ID') && s.includes('API_NAME')) {
      const pipelineId = params![0] as string;
      const apiName = params![1] as string;
      const match = [...fakeStages.values()].find(
        (st) => st.pipeline_id === pipelineId && st.api_name === apiName,
      );
      if (match) return { rows: [{ id: match.id }] };
      return { rows: [] };
    }

    // SELECT id, stage_type FROM stage_definitions WHERE pipeline_id = $1
    if (s.startsWith('SELECT ID, STAGE_TYPE FROM STAGE_DEFINITIONS WHERE PIPELINE_ID')) {
      const pipelineId = params![0] as string;
      const rows = [...fakeStages.values()]
        .filter((st) => st.pipeline_id === pipelineId)
        .map((st) => ({ id: st.id, stage_type: st.stage_type }));
      return { rows };
    }

    // UPDATE stage_definitions SET sort_order = sort_order + 1 WHERE pipeline_id AND sort_order >=
    // (must come before the simpler sort_order check below)
    if (s.includes('SORT_ORDER = SORT_ORDER + 1') && s.includes('STAGE_DEFINITIONS')) {
      const pipelineId = params![0] as string;
      const minSort = params![1] as number;
      for (const [key, stage] of fakeStages.entries()) {
        if (stage.pipeline_id === pipelineId && (stage.sort_order as number) >= minSort) {
          stage.sort_order = (stage.sort_order as number) + 1;
          fakeStages.set(key, stage);
        }
      }
      return { rowCount: 0 };
    }

    // UPDATE stage_definitions SET sort_order = $1 WHERE id = $2 AND pipeline_id = $3
    if (s.startsWith('UPDATE STAGE_DEFINITIONS SET SORT_ORDER')) {
      const sortOrder = params![0] as number;
      const stageId = params![1] as string;
      const pipelineId = params![2] as string;
      const stage = fakeStages.get(stageId);
      if (stage && stage.pipeline_id === pipelineId) {
        stage.sort_order = sortOrder;
        fakeStages.set(stageId, stage);
      }
      return { rowCount: 1 };
    }

    // UPDATE stage_definitions SET ... (general update for stage)
    if (s.startsWith('UPDATE STAGE_DEFINITIONS SET')) {
      const stageId = params![params!.length - 3] as string;
      const pipelineId = params![params!.length - 2] as string;
      const existing = fakeStages.get(stageId);
      if (!existing || existing.pipeline_id !== pipelineId) return { rows: [] };
      const updated = { ...existing };
      fakeStages.set(stageId, updated);
      return { rows: [updated] };
    }

    // DELETE FROM stage_definitions WHERE id = $1 AND pipeline_id = $2
    if (s.startsWith('DELETE FROM STAGE_DEFINITIONS')) {
      const stageId = params![0] as string;
      fakeStages.delete(stageId);
      return { rowCount: 1 };
    }

    return { rows: [] };
  });

  return { fakeObjects, fakePipelines, fakeStages, fakeGates, fakeRecords, mockQuery };
});

vi.mock('../../db/client.js', () => ({
  pool: { query: mockQuery },
}));

const {
  createPipeline,
  listPipelines,
  getPipelineById,
  updatePipeline,
  deletePipeline,
  createStage,
  updateStage,
  deleteStage,
  reorderStages,
  validatePipelineApiName,
  validatePipelineName,
  validateStageApiName,
  validateStageName,
  validateStageType,
} = await import('../pipelineService.js');

// ─── Setup ───────────────────────────────────────────────────────────────────

function seedObject(id = 'obj-1') {
  fakeObjects.set(id, {
    id,
    api_name: 'opportunity',
    label: 'Opportunity',
    plural_label: 'Opportunities',
    is_system: true,
    owner_id: 'SYSTEM',
    created_at: new Date(),
    updated_at: new Date(),
  });
}

// ─── Validation tests ─────────────────────────────────────────────────────────

describe('validatePipelineApiName', () => {
  it('returns null for a valid snake_case name', () => {
    expect(validatePipelineApiName('sales_pipeline')).toBeNull();
  });

  it('returns an error for empty string', () => {
    expect(validatePipelineApiName('')).toBe('api_name is required');
  });

  it('returns an error for undefined', () => {
    expect(validatePipelineApiName(undefined)).toBe('api_name is required');
  });

  it('returns an error for names shorter than 3 chars', () => {
    expect(validatePipelineApiName('ab')).toBe('api_name must be between 3 and 100 characters');
  });

  it('returns an error for uppercase characters', () => {
    expect(validatePipelineApiName('Sales_Pipeline')).toBe(
      'api_name must be lowercase snake_case (e.g. "sales_pipeline")',
    );
  });
});

describe('validatePipelineName', () => {
  it('returns null for a valid name', () => {
    expect(validatePipelineName('Sales Pipeline')).toBeNull();
  });

  it('returns an error for empty string', () => {
    expect(validatePipelineName('')).toBe('name is required');
  });
});

describe('validateStageApiName', () => {
  it('returns null for a valid snake_case name', () => {
    expect(validateStageApiName('prospecting')).toBeNull();
  });

  it('returns an error for empty string', () => {
    expect(validateStageApiName('')).toBe('api_name is required');
  });
});

describe('validateStageName', () => {
  it('returns null for a valid name', () => {
    expect(validateStageName('Prospecting')).toBeNull();
  });

  it('returns an error for empty string', () => {
    expect(validateStageName('')).toBe('name is required');
  });
});

describe('validateStageType', () => {
  it('returns null for valid types', () => {
    expect(validateStageType('open')).toBeNull();
    expect(validateStageType('won')).toBeNull();
    expect(validateStageType('lost')).toBeNull();
  });

  it('returns an error for empty string', () => {
    expect(validateStageType('')).toBe('stage_type is required');
  });

  it('returns an error for invalid types', () => {
    expect(validateStageType('invalid')).toBe('stage_type must be one of: open, won, lost');
  });
});

// ─── createPipeline ──────────────────────────────────────────────────────────

describe('createPipeline', () => {
  const baseParams = {
    name: 'Custom Pipeline',
    apiName: 'custom_pipeline',
    objectId: 'obj-1',
    ownerId: 'user-123',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    fakeObjects.clear();
    fakePipelines.clear();
    fakeStages.clear();
    fakeGates.clear();
    fakeRecords.clear();
    seedObject();
  });

  it('returns the created pipeline with terminal stages', async () => {
    const result = await createPipeline(TENANT_ID, baseParams);

    expect(result.name).toBe('Custom Pipeline');
    expect(result.apiName).toBe('custom_pipeline');
    expect(result.objectId).toBe('obj-1');
    expect(result.isSystem).toBe(false);
    expect(result.stages).toHaveLength(2);
    expect(result.stages[0].stageType).toBe('won');
    expect(result.stages[0].name).toBe('Closed Won');
    expect(result.stages[1].stageType).toBe('lost');
    expect(result.stages[1].name).toBe('Closed Lost');
  });

  it('sets isDefault to true for first pipeline on object', async () => {
    const result = await createPipeline(TENANT_ID, baseParams);
    expect(result.isDefault).toBe(true);
  });

  it('sets isDefault to false for subsequent pipelines on same object', async () => {
    await createPipeline(TENANT_ID, baseParams);
    const second = await createPipeline(TENANT_ID, {
      ...baseParams,
      name: 'Second Pipeline',
      apiName: 'second_pipeline',
    });
    expect(second.isDefault).toBe(false);
  });

  it('throws VALIDATION_ERROR for empty name', async () => {
    await expect(
      createPipeline(TENANT_ID, { ...baseParams, name: '' }),
    ).rejects.toMatchObject({
      message: 'name is required',
      code: 'VALIDATION_ERROR',
    });
  });

  it('throws VALIDATION_ERROR for invalid api_name', async () => {
    await expect(
      createPipeline(TENANT_ID, { ...baseParams, apiName: '' }),
    ).rejects.toMatchObject({
      message: 'api_name is required',
      code: 'VALIDATION_ERROR',
    });
  });

  it('throws NOT_FOUND when object_id does not exist', async () => {
    await expect(
      createPipeline(TENANT_ID, { ...baseParams, objectId: 'missing' }),
    ).rejects.toMatchObject({
      message: 'Object definition not found',
      code: 'NOT_FOUND',
    });
  });

  it('throws CONFLICT when api_name already exists', async () => {
    await createPipeline(TENANT_ID, baseParams);
    await expect(
      createPipeline(TENANT_ID, baseParams),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });
});

// ─── listPipelines ──────────────────────────────────────────────────────────

describe('listPipelines', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakeObjects.clear();
    fakePipelines.clear();
    fakeStages.clear();
    fakeGates.clear();
    fakeRecords.clear();
    seedObject();
  });

  it('returns empty array when no pipelines exist', async () => {
    const result = await listPipelines(TENANT_ID);
    expect(result).toEqual([]);
  });

  it('returns all pipelines', async () => {
    await createPipeline(TENANT_ID, {
      name: 'Test Pipeline',
      apiName: 'test_pipeline',
      objectId: 'obj-1',
      ownerId: 'user-123',
    });

    const result = await listPipelines(TENANT_ID);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Test Pipeline');
  });
});

// ─── getPipelineById ─────────────────────────────────────────────────────────

describe('getPipelineById', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakeObjects.clear();
    fakePipelines.clear();
    fakeStages.clear();
    fakeGates.clear();
    fakeRecords.clear();
    seedObject();
  });

  it('returns pipeline with stages and gates', async () => {
    const created = await createPipeline(TENANT_ID, {
      name: 'Test Pipeline',
      apiName: 'test_pipeline',
      objectId: 'obj-1',
      ownerId: 'user-123',
    });

    const result = await getPipelineById(TENANT_ID, created.id);

    expect(result).not.toBeNull();
    expect(result!.name).toBe('Test Pipeline');
    expect(result!.stages).toHaveLength(2);
    expect(result!.stages[0].gates).toBeDefined();
  });

  it('returns null when pipeline does not exist', async () => {
    const result = await getPipelineById(TENANT_ID, 'missing-id');
    expect(result).toBeNull();
  });
});

// ─── updatePipeline ──────────────────────────────────────────────────────────

describe('updatePipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakeObjects.clear();
    fakePipelines.clear();
    fakeStages.clear();
    fakeGates.clear();
    fakeRecords.clear();
    seedObject();
  });

  it('returns the updated pipeline', async () => {
    const created = await createPipeline(TENANT_ID, {
      name: 'Test Pipeline',
      apiName: 'test_pipeline',
      objectId: 'obj-1',
      ownerId: 'user-123',
    });

    const result = await updatePipeline(TENANT_ID, created.id, { name: 'Updated Name' });
    expect(result).toBeDefined();
  });

  it('throws NOT_FOUND when pipeline does not exist', async () => {
    await expect(
      updatePipeline(TENANT_ID, 'missing-id', { name: 'Updated' }),
    ).rejects.toMatchObject({
      message: 'Pipeline not found',
      code: 'NOT_FOUND',
    });
  });

  it('throws VALIDATION_ERROR when name is empty', async () => {
    const created = await createPipeline(TENANT_ID, {
      name: 'Test Pipeline',
      apiName: 'test_pipeline',
      objectId: 'obj-1',
      ownerId: 'user-123',
    });

    await expect(
      updatePipeline(TENANT_ID, created.id, { name: '' }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('returns unchanged pipeline when no params are provided', async () => {
    const created = await createPipeline(TENANT_ID, {
      name: 'Test Pipeline',
      apiName: 'test_pipeline',
      objectId: 'obj-1',
      ownerId: 'user-123',
    });

    const result = await updatePipeline(TENANT_ID, created.id, {});
    expect(result.name).toBe('Test Pipeline');
  });
});

// ─── deletePipeline ──────────────────────────────────────────────────────────

describe('deletePipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakeObjects.clear();
    fakePipelines.clear();
    fakeStages.clear();
    fakeGates.clear();
    fakeRecords.clear();
    seedObject();
  });

  it('deletes the pipeline successfully', async () => {
    const created = await createPipeline(TENANT_ID, {
      name: 'Test Pipeline',
      apiName: 'test_pipeline',
      objectId: 'obj-1',
      ownerId: 'user-123',
    });

    await expect(deletePipeline(TENANT_ID, created.id)).resolves.toBeUndefined();
  });

  it('throws NOT_FOUND when pipeline does not exist', async () => {
    await expect(
      deletePipeline(TENANT_ID, 'missing-id'),
    ).rejects.toMatchObject({
      message: 'Pipeline not found',
      code: 'NOT_FOUND',
    });
  });

  it('throws DELETE_BLOCKED when pipeline is a system pipeline', async () => {
    const id = 'system-pipe-id';
    fakePipelines.set(id, {
      id,
      object_id: 'obj-1',
      name: 'Sales Pipeline',
      api_name: 'sales_pipeline',
      is_default: true,
      is_system: true,
      owner_id: 'SYSTEM',
      created_at: new Date(),
      updated_at: new Date(),
    });

    await expect(
      deletePipeline(TENANT_ID, id),
    ).rejects.toMatchObject({
      message: 'Cannot delete system pipelines',
      code: 'DELETE_BLOCKED',
    });
  });

  it('throws DELETE_BLOCKED when records exist using the pipeline', async () => {
    const created = await createPipeline(TENANT_ID, {
      name: 'Test Pipeline',
      apiName: 'test_pipeline',
      objectId: 'obj-1',
      ownerId: 'user-123',
    });

    fakeRecords.set('record-1', {
      id: 'record-1',
      object_id: 'obj-1',
      pipeline_id: created.id,
      current_stage_id: null,
      name: 'Test Record',
      field_values: {},
      owner_id: 'user-123',
    });

    await expect(
      deletePipeline(TENANT_ID, created.id),
    ).rejects.toMatchObject({
      message: 'Cannot delete pipeline with existing records',
      code: 'DELETE_BLOCKED',
    });
  });
});

// ─── createStage ─────────────────────────────────────────────────────────────

describe('createStage', () => {
  let pipelineId: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    fakeObjects.clear();
    fakePipelines.clear();
    fakeStages.clear();
    fakeGates.clear();
    fakeRecords.clear();
    seedObject();

    const pipeline = await createPipeline(TENANT_ID, {
      name: 'Test Pipeline',
      apiName: 'test_pipeline',
      objectId: 'obj-1',
      ownerId: 'user-123',
    });
    pipelineId = pipeline.id;
  });

  it('creates a stage successfully', async () => {
    const result = await createStage(TENANT_ID, pipelineId, {
      name: 'Discovery',
      apiName: 'discovery',
      stageType: 'open',
      colour: 'blue',
    });

    expect(result.name).toBe('Discovery');
    expect(result.apiName).toBe('discovery');
    expect(result.stageType).toBe('open');
    expect(result.colour).toBe('blue');
  });

  it('throws VALIDATION_ERROR for empty name', async () => {
    await expect(
      createStage(TENANT_ID, pipelineId, {
        name: '',
        apiName: 'test_stage',
        stageType: 'open',
        colour: 'blue',
      }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('throws VALIDATION_ERROR for invalid stage_type', async () => {
    await expect(
      createStage(TENANT_ID, pipelineId, {
        name: 'Test',
        apiName: 'test_stage',
        stageType: 'invalid',
        colour: 'blue',
      }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('throws VALIDATION_ERROR for empty colour', async () => {
    await expect(
      createStage(TENANT_ID, pipelineId, {
        name: 'Test',
        apiName: 'test_stage',
        stageType: 'open',
        colour: '',
      }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('throws NOT_FOUND when pipeline does not exist', async () => {
    await expect(
      createStage(TENANT_ID, 'missing-pipe', {
        name: 'Test',
        apiName: 'test_stage',
        stageType: 'open',
        colour: 'blue',
      }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('throws CONFLICT when api_name already exists on pipeline', async () => {
    await createStage(TENANT_ID, pipelineId, {
      name: 'Discovery',
      apiName: 'discovery',
      stageType: 'open',
      colour: 'blue',
    });

    await expect(
      createStage(TENANT_ID, pipelineId, {
        name: 'Discovery 2',
        apiName: 'discovery',
        stageType: 'open',
        colour: 'green',
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });
});

// ─── updateStage ─────────────────────────────────────────────────────────────

describe('updateStage', () => {
  let pipelineId: string;
  let stageId: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    fakeObjects.clear();
    fakePipelines.clear();
    fakeStages.clear();
    fakeGates.clear();
    fakeRecords.clear();
    seedObject();

    const pipeline = await createPipeline(TENANT_ID, {
      name: 'Test Pipeline',
      apiName: 'test_pipeline',
      objectId: 'obj-1',
      ownerId: 'user-123',
    });
    pipelineId = pipeline.id;

    const stage = await createStage(TENANT_ID, pipelineId, {
      name: 'Discovery',
      apiName: 'discovery',
      stageType: 'open',
      colour: 'blue',
    });
    stageId = stage.id;
  });

  it('returns the updated stage', async () => {
    const result = await updateStage(TENANT_ID, pipelineId, stageId, { name: 'Updated' });
    expect(result).toBeDefined();
  });

  it('throws NOT_FOUND when pipeline does not exist', async () => {
    await expect(
      updateStage(TENANT_ID, 'missing-pipe', stageId, { name: 'Updated' }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('throws NOT_FOUND when stage does not exist', async () => {
    await expect(
      updateStage(TENANT_ID, pipelineId, 'missing-stage', { name: 'Updated' }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('throws VALIDATION_ERROR for empty name', async () => {
    await expect(
      updateStage(TENANT_ID, pipelineId, stageId, { name: '' }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('throws VALIDATION_ERROR for invalid stage_type', async () => {
    await expect(
      updateStage(TENANT_ID, pipelineId, stageId, { stageType: 'invalid' }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('returns unchanged stage when no params are provided', async () => {
    const result = await updateStage(TENANT_ID, pipelineId, stageId, {});
    expect(result.name).toBe('Discovery');
  });
});

// ─── deleteStage ─────────────────────────────────────────────────────────────

describe('deleteStage', () => {
  let pipelineId: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    fakeObjects.clear();
    fakePipelines.clear();
    fakeStages.clear();
    fakeGates.clear();
    fakeRecords.clear();
    seedObject();

    const pipeline = await createPipeline(TENANT_ID, {
      name: 'Test Pipeline',
      apiName: 'test_pipeline',
      objectId: 'obj-1',
      ownerId: 'user-123',
    });
    pipelineId = pipeline.id;
  });

  it('deletes a stage successfully', async () => {
    const stage = await createStage(TENANT_ID, pipelineId, {
      name: 'Discovery',
      apiName: 'discovery',
      stageType: 'open',
      colour: 'blue',
    });

    await expect(deleteStage(TENANT_ID, pipelineId, stage.id)).resolves.toBeUndefined();
  });

  it('throws NOT_FOUND when pipeline does not exist', async () => {
    await expect(
      deleteStage(TENANT_ID, 'missing-pipe', 'some-stage'),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('throws NOT_FOUND when stage does not exist', async () => {
    await expect(
      deleteStage(TENANT_ID, pipelineId, 'missing-stage'),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('throws DELETE_BLOCKED when records are in the stage', async () => {
    const stage = await createStage(TENANT_ID, pipelineId, {
      name: 'Discovery',
      apiName: 'discovery',
      stageType: 'open',
      colour: 'blue',
    });

    fakeRecords.set('record-1', {
      id: 'record-1',
      object_id: 'obj-1',
      pipeline_id: pipelineId,
      current_stage_id: stage.id,
      name: 'Test Record',
      field_values: {},
      owner_id: 'user-123',
    });

    await expect(
      deleteStage(TENANT_ID, pipelineId, stage.id),
    ).rejects.toMatchObject({
      message: 'Cannot delete stage with existing records',
      code: 'DELETE_BLOCKED',
    });
  });

  it('throws DELETE_BLOCKED when deleting the last won stage', async () => {
    const wonStages = [...fakeStages.values()].filter(
      (s) => s.pipeline_id === pipelineId && s.stage_type === 'won',
    );
    expect(wonStages).toHaveLength(1);

    await expect(
      deleteStage(TENANT_ID, pipelineId, wonStages[0].id as string),
    ).rejects.toMatchObject({
      message: 'Cannot delete the last won stage',
      code: 'DELETE_BLOCKED',
    });
  });

  it('throws DELETE_BLOCKED when deleting the last lost stage', async () => {
    const lostStages = [...fakeStages.values()].filter(
      (s) => s.pipeline_id === pipelineId && s.stage_type === 'lost',
    );
    expect(lostStages).toHaveLength(1);

    await expect(
      deleteStage(TENANT_ID, pipelineId, lostStages[0].id as string),
    ).rejects.toMatchObject({
      message: 'Cannot delete the last lost stage',
      code: 'DELETE_BLOCKED',
    });
  });

  it('throws DELETE_BLOCKED when deleting from system pipeline', async () => {
    const sysPipeId = 'sys-pipe-id';
    fakePipelines.set(sysPipeId, {
      id: sysPipeId,
      object_id: 'obj-1',
      name: 'System Pipeline',
      api_name: 'system_pipeline',
      is_default: true,
      is_system: true,
      owner_id: 'SYSTEM',
      created_at: new Date(),
      updated_at: new Date(),
    });
    const sysStageId = 'sys-stage-id';
    fakeStages.set(sysStageId, {
      id: sysStageId,
      pipeline_id: sysPipeId,
      name: 'System Stage',
      api_name: 'system_stage',
      sort_order: 0,
      stage_type: 'open',
      colour: 'blue',
      created_at: new Date(),
    });

    await expect(
      deleteStage(TENANT_ID, sysPipeId, sysStageId),
    ).rejects.toMatchObject({
      message: 'Cannot delete stages from system pipelines',
      code: 'DELETE_BLOCKED',
    });
  });
});

// ─── reorderStages ──────────────────────────────────────────────────────────

describe('reorderStages', () => {
  let pipelineId: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    fakeObjects.clear();
    fakePipelines.clear();
    fakeStages.clear();
    fakeGates.clear();
    fakeRecords.clear();
    seedObject();

    const pipeline = await createPipeline(TENANT_ID, {
      name: 'Test Pipeline',
      apiName: 'test_pipeline',
      objectId: 'obj-1',
      ownerId: 'user-123',
    });
    pipelineId = pipeline.id;
  });

  it('reorders stages successfully', async () => {
    const stage = await createStage(TENANT_ID, pipelineId, {
      name: 'Discovery',
      apiName: 'discovery',
      stageType: 'open',
      colour: 'blue',
    });

    const allStages = [...fakeStages.values()].filter((s) => s.pipeline_id === pipelineId);
    const wonStage = allStages.find((s) => s.stage_type === 'won');
    const lostStage = allStages.find((s) => s.stage_type === 'lost');

    const result = await reorderStages(TENANT_ID, pipelineId, [
      stage.id,
      wonStage!.id as string,
      lostStage!.id as string,
    ]);

    expect(result).toHaveLength(3);
  });

  it('throws NOT_FOUND when pipeline does not exist', async () => {
    await expect(
      reorderStages(TENANT_ID, 'missing-pipe', ['s1']),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('throws VALIDATION_ERROR for empty stage_ids', async () => {
    await expect(
      reorderStages(TENANT_ID, pipelineId, []),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('throws VALIDATION_ERROR when stage_id does not belong to pipeline', async () => {
    await expect(
      reorderStages(TENANT_ID, pipelineId, ['not-a-stage']),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('throws VALIDATION_ERROR when won/lost stages are not at the end', async () => {
    const stage = await createStage(TENANT_ID, pipelineId, {
      name: 'Discovery',
      apiName: 'discovery',
      stageType: 'open',
      colour: 'blue',
    });

    const allStages = [...fakeStages.values()].filter((s) => s.pipeline_id === pipelineId);
    const wonStage = allStages.find((s) => s.stage_type === 'won');
    const lostStage = allStages.find((s) => s.stage_type === 'lost');

    // Try to put won before open
    await expect(
      reorderStages(TENANT_ID, pipelineId, [
        wonStage!.id as string,
        stage.id,
        lostStage!.id as string,
      ]),
    ).rejects.toMatchObject({
      message: 'Won/lost stages must remain at the end of the pipeline',
      code: 'VALIDATION_ERROR',
    });
  });
});
