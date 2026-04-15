import { describe, it, expect, vi, beforeEach } from 'vitest';

const TENANT_ID = 'test-tenant-001';

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ─── Fake DB pool ─────────────────────────────────────────────────────────────
//
// NOTE (Phase 3b Kysely migration, issue #445): the service is now on
// Kysely. The mock below matches Kysely-emitted SQL — identifier
// quoting is stripped by the normaliser, matching the pattern used by
// stageMovementService.test.ts and pipelineAnalyticsService.test.ts.
//
// A dedicated Kysely SQL regression suite lives next door:
//   apps/api/src/services/__tests__/stageGateService.kysely-sql.test.ts

const {
  fakeStages,
  fakePipelines,
  fakeObjects,
  fakeFields,
  fakeGates,
  mockQuery,
  mockConnect,
} = vi.hoisted(() => {
  const fakeStages = new Map<string, Record<string, unknown>>();
  const fakePipelines = new Map<string, Record<string, unknown>>();
  const fakeObjects = new Map<string, Record<string, unknown>>();
  const fakeFields = new Map<string, Record<string, unknown>>();
  const fakeGates = new Map<string, Record<string, unknown>>();

  function runQuery(sql: string, params?: unknown[]) {
    // Strip identifier quotes and normalise whitespace so pattern-matching
    // is quote-agnostic (Kysely wraps identifiers in "…").
    const s = sql.replace(/\s+/g, ' ').replace(/"/g, '').trim().toUpperCase();

    // stage_definitions INNER JOIN pipeline_definitions (resolveStageAndObject)
    if (
      s.includes('FROM STAGE_DEFINITIONS AS SD') &&
      s.includes('JOIN PIPELINE_DEFINITIONS AS PD')
    ) {
      const stageId = params![0] as string;
      const stage = fakeStages.get(stageId);
      if (!stage) return { rows: [] };
      const pipeline = fakePipelines.get(stage.pipeline_id as string);
      if (!pipeline) return { rows: [] };
      return {
        rows: [
          {
            stage_id: stage.id,
            pipeline_id: pipeline.id,
            object_id: pipeline.object_id,
          },
        ],
      };
    }

    // SELECT id, field_type, label, options FROM field_definitions WHERE id = $1 AND tenant_id = $2
    //   (getFieldInfo — all four projected columns)
    if (
      s.includes('FROM FIELD_DEFINITIONS') &&
      s.includes('FIELD_TYPE') &&
      s.includes('LABEL') &&
      s.includes('OPTIONS')
    ) {
      const fieldId = params![0] as string;
      const field = fakeFields.get(fieldId);
      if (!field) return { rows: [] };
      return {
        rows: [
          {
            id: field.id,
            field_type: field.field_type,
            label: field.label,
            options: field.options,
          },
        ],
      };
    }

    // SELECT id FROM field_definitions WHERE id = $1 AND object_id = $2 AND tenant_id = $3
    //   (fieldBelongsToObject)
    if (
      s.includes('FROM FIELD_DEFINITIONS') &&
      s.includes('SELECT ID') &&
      s.includes('OBJECT_ID')
    ) {
      const fieldId = params![0] as string;
      const objectId = params![1] as string;
      const field = fakeFields.get(fieldId);
      if (field && field.object_id === objectId) return { rows: [{ id: field.id }] };
      return { rows: [] };
    }

    // SELECT id FROM stage_gates WHERE stage_id = $1 AND field_id = $2 AND tenant_id = $3
    //   (duplicate check in createStageGate)
    if (
      s.includes('FROM STAGE_GATES') &&
      !s.includes('AS SG') &&
      s.includes('SELECT ID') &&
      s.includes('FIELD_ID')
    ) {
      const stageId = params![0] as string;
      const fieldId = params![1] as string;
      const match = [...fakeGates.values()].find(
        (g) => g.stage_id === stageId && g.field_id === fieldId,
      );
      if (match) return { rows: [{ id: match.id }] };
      return { rows: [] };
    }

    // INSERT INTO stage_gates (columns...) VALUES (...)
    //   Kysely emits columns in the order supplied in .values({...}).
    //   Param order mirrors: id, tenant_id, stage_id, field_id, gate_type, gate_value, error_message
    if (s.startsWith('INSERT INTO STAGE_GATES')) {
      const [id, tenant_id, stage_id, field_id, gate_type, gate_value, error_message] =
        params as unknown[];
      const row: Record<string, unknown> = {
        id,
        tenant_id,
        stage_id,
        field_id,
        gate_type,
        gate_value,
        error_message,
      };
      fakeGates.set(id as string, row);
      return { rows: [row] };
    }

    // SELECT sg.*, fd.label, fd.field_type FROM stage_gates AS sg
    //   INNER JOIN field_definitions AS fd ... WHERE sg.id = $1 AND sg.tenant_id = $2
    if (
      s.includes('FROM STAGE_GATES AS SG') &&
      s.includes('JOIN FIELD_DEFINITIONS AS FD') &&
      s.includes('SG.ID =')
    ) {
      const gateId = params![0] as string;
      const gate = fakeGates.get(gateId);
      if (!gate) return { rows: [] };
      const field = fakeFields.get(gate.field_id as string);
      if (!field) return { rows: [] };
      return {
        rows: [
          {
            id: gate.id,
            stage_id: gate.stage_id,
            field_id: gate.field_id,
            gate_type: gate.gate_type,
            gate_value: gate.gate_value,
            error_message: gate.error_message,
            field_label: field.label,
            field_type: field.field_type,
          },
        ],
      };
    }

    // Same join, list variant: WHERE sg.stage_id = $1 AND sg.tenant_id = $2 ORDER BY sg.id
    if (
      s.includes('FROM STAGE_GATES AS SG') &&
      s.includes('JOIN FIELD_DEFINITIONS AS FD') &&
      s.includes('SG.STAGE_ID =')
    ) {
      const stageId = params![0] as string;
      const gates = [...fakeGates.values()].filter((g) => g.stage_id === stageId);
      const rows = gates.map((g) => {
        const field = fakeFields.get(g.field_id as string);
        return {
          id: g.id,
          stage_id: g.stage_id,
          field_id: g.field_id,
          gate_type: g.gate_type,
          gate_value: g.gate_value,
          error_message: g.error_message,
          field_label: field?.label ?? 'Unknown',
          field_type: field?.field_type ?? 'text',
        };
      });
      return { rows };
    }

    // SELECT * FROM stage_gates WHERE id = $1 AND stage_id = $2 AND tenant_id = $3
    //   (updateStageGate existing gate lookup — selectAll, no alias)
    if (
      s.startsWith('SELECT * FROM STAGE_GATES') &&
      s.includes('STAGE_ID')
    ) {
      const gateId = params![0] as string;
      const stageId = params![1] as string;
      const gate = fakeGates.get(gateId);
      if (gate && gate.stage_id === stageId) return { rows: [gate] };
      return { rows: [] };
    }

    // SELECT id FROM stage_gates WHERE id = $1 AND stage_id = $2 AND tenant_id = $3
    //   (deleteStageGate existence check)
    if (
      s.startsWith('SELECT ID FROM STAGE_GATES') &&
      s.includes('STAGE_ID')
    ) {
      const gateId = params![0] as string;
      const stageId = params![1] as string;
      const gate = fakeGates.get(gateId);
      if (gate && gate.stage_id === stageId) return { rows: [{ id: gate.id }] };
      return { rows: [] };
    }

    // UPDATE stage_gates SET ... WHERE id = $N AND stage_id = $N+1 AND tenant_id = $N+2
    //   Kysely emits SET clauses in the order of the object keys (insertion
    //   order). updateStageGate builds `updates` in a fixed order:
    //     gate_type → gate_value → error_message
    //   so the bound params come in that order followed by id, stage_id, tenant_id.
    if (s.startsWith('UPDATE STAGE_GATES SET')) {
      let paramIdx = 0;
      const updateOrder: Array<'gate_type' | 'gate_value' | 'error_message'> = [];
      if (s.includes('GATE_TYPE =')) updateOrder.push('gate_type');
      if (s.includes('GATE_VALUE =')) updateOrder.push('gate_value');
      if (s.includes('ERROR_MESSAGE =')) updateOrder.push('error_message');
      const gateId = params![paramIdx + updateOrder.length] as string;
      const stageId = params![paramIdx + updateOrder.length + 1] as string;
      const gate = fakeGates.get(gateId);
      if (gate && gate.stage_id === stageId) {
        for (const col of updateOrder) {
          gate[col] = params![paramIdx++];
        }
        fakeGates.set(gateId, gate);
        return { rows: [gate] };
      }
      return { rows: [] };
    }

    // DELETE FROM stage_gates WHERE id = $1 AND stage_id = $2 AND tenant_id = $3
    if (s.startsWith('DELETE FROM STAGE_GATES')) {
      const gateId = params![0] as string;
      const stageId = params![1] as string;
      const gate = fakeGates.get(gateId);
      if (gate && gate.stage_id === stageId) {
        fakeGates.delete(gateId);
        return { rowCount: 1 };
      }
      return { rowCount: 0 };
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
    fakeStages,
    fakePipelines,
    fakeObjects,
    fakeFields,
    fakeGates,
    mockQuery,
    mockConnect,
  };
});

vi.mock('../../db/client.js', () => ({
  pool: { query: mockQuery, connect: mockConnect },
}));

import {
  listStageGates,
  createStageGate,
  updateStageGate,
  deleteStageGate,
} from '../stageGateService.js';

// ─── Test helpers ────────────────────────────────────────────────────────────

function seedPipeline(pipelineId: string, objectId: string) {
  fakeObjects.set(objectId, { id: objectId });
  fakePipelines.set(pipelineId, { id: pipelineId, object_id: objectId });
}

function seedStage(stageId: string, pipelineId: string) {
  fakeStages.set(stageId, { id: stageId, pipeline_id: pipelineId });
}

function seedField(fieldId: string, objectId: string, overrides: Record<string, unknown> = {}) {
  fakeFields.set(fieldId, {
    id: fieldId,
    object_id: objectId,
    api_name: 'test_field',
    label: 'Test Field',
    field_type: 'text',
    options: {},
    ...overrides,
  });
}

function seedGate(gateId: string, stageId: string, fieldId: string, overrides: Record<string, unknown> = {}) {
  fakeGates.set(gateId, {
    id: gateId,
    stage_id: stageId,
    field_id: fieldId,
    gate_type: 'required',
    gate_value: null,
    error_message: null,
    ...overrides,
  });
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  fakeStages.clear();
  fakePipelines.clear();
  fakeObjects.clear();
  fakeFields.clear();
  fakeGates.clear();
  mockQuery.mockClear();
});

// ─── listStageGates ─────────────────────────────────────────────────────────

describe('listStageGates', () => {
  it('returns gates with field metadata for a valid stage', async () => {
    seedPipeline('pipe-1', 'obj-1');
    seedStage('stage-1', 'pipe-1');
    seedField('field-1', 'obj-1', { label: 'Value', field_type: 'currency' });
    seedGate('gate-1', 'stage-1', 'field-1', { error_message: 'Value is required' });

    const gates = await listStageGates(TENANT_ID, 'stage-1');

    expect(gates).toHaveLength(1);
    expect(gates[0]).toEqual({
      id: 'gate-1',
      stageId: 'stage-1',
      field: { id: 'field-1', label: 'Value', fieldType: 'currency' },
      gateType: 'required',
      gateValue: null,
      errorMessage: 'Value is required',
    });
  });

  it('returns empty array when stage has no gates', async () => {
    seedPipeline('pipe-1', 'obj-1');
    seedStage('stage-1', 'pipe-1');

    const gates = await listStageGates(TENANT_ID, 'stage-1');
    expect(gates).toHaveLength(0);
  });

  it('throws NOT_FOUND when stage does not exist', async () => {
    await expect(listStageGates(TENANT_ID, 'nonexistent')).rejects.toThrow('Stage not found');
  });
});

// ─── createStageGate ────────────────────────────────────────────────────────

describe('createStageGate', () => {
  it('creates a gate with required type', async () => {
    seedPipeline('pipe-1', 'obj-1');
    seedStage('stage-1', 'pipe-1');
    seedField('field-1', 'obj-1', { label: 'Value', field_type: 'currency' });

    const gate = await createStageGate(TENANT_ID, 'stage-1', {
      fieldId: 'field-1',
      gateType: 'required',
      errorMessage: 'Deal value is required',
    });

    expect(gate.stageId).toBe('stage-1');
    expect(gate.field.id).toBe('field-1');
    expect(gate.field.label).toBe('Value');
    expect(gate.field.fieldType).toBe('currency');
    expect(gate.gateType).toBe('required');
    expect(gate.gateValue).toBeNull();
    expect(gate.errorMessage).toBe('Deal value is required');
  });

  it('creates a gate with min_value type on a number field', async () => {
    seedPipeline('pipe-1', 'obj-1');
    seedStage('stage-1', 'pipe-1');
    seedField('field-1', 'obj-1', { label: 'Amount', field_type: 'number' });

    const gate = await createStageGate(TENANT_ID, 'stage-1', {
      fieldId: 'field-1',
      gateType: 'min_value',
      gateValue: '100',
    });

    expect(gate.gateType).toBe('min_value');
    expect(gate.gateValue).toBe('100');
  });

  it('creates a gate with min_value type on a currency field', async () => {
    seedPipeline('pipe-1', 'obj-1');
    seedStage('stage-1', 'pipe-1');
    seedField('field-1', 'obj-1', { label: 'Deal Value', field_type: 'currency' });

    const gate = await createStageGate(TENANT_ID, 'stage-1', {
      fieldId: 'field-1',
      gateType: 'min_value',
      gateValue: '0',
    });

    expect(gate.gateType).toBe('min_value');
  });

  it('creates a gate with specific_value type on a dropdown field', async () => {
    seedPipeline('pipe-1', 'obj-1');
    seedStage('stage-1', 'pipe-1');
    seedField('field-1', 'obj-1', {
      label: 'Status',
      field_type: 'dropdown',
      options: { choices: ['active', 'inactive'] },
    });

    const gate = await createStageGate(TENANT_ID, 'stage-1', {
      fieldId: 'field-1',
      gateType: 'specific_value',
      gateValue: 'active',
    });

    expect(gate.gateType).toBe('specific_value');
    expect(gate.gateValue).toBe('active');
  });

  it('throws VALIDATION_ERROR when field_id is missing', async () => {
    seedPipeline('pipe-1', 'obj-1');
    seedStage('stage-1', 'pipe-1');

    await expect(
      createStageGate(TENANT_ID, 'stage-1', { fieldId: '', gateType: 'required' }),
    ).rejects.toThrow('field_id is required');
  });

  it('throws VALIDATION_ERROR when gate_type is missing', async () => {
    seedPipeline('pipe-1', 'obj-1');
    seedStage('stage-1', 'pipe-1');

    await expect(
      createStageGate(TENANT_ID, 'stage-1', { fieldId: 'field-1', gateType: '' }),
    ).rejects.toThrow('gate_type is required');
  });

  it('throws VALIDATION_ERROR for invalid gate_type', async () => {
    seedPipeline('pipe-1', 'obj-1');
    seedStage('stage-1', 'pipe-1');

    await expect(
      createStageGate(TENANT_ID, 'stage-1', { fieldId: 'field-1', gateType: 'invalid' }),
    ).rejects.toThrow('gate_type must be one of');
  });

  it('throws NOT_FOUND when stage does not exist', async () => {
    await expect(
      createStageGate(TENANT_ID, 'nonexistent', { fieldId: 'field-1', gateType: 'required' }),
    ).rejects.toThrow('Stage not found');
  });

  it('throws NOT_FOUND when field does not exist', async () => {
    seedPipeline('pipe-1', 'obj-1');
    seedStage('stage-1', 'pipe-1');

    await expect(
      createStageGate(TENANT_ID, 'stage-1', { fieldId: 'nonexistent', gateType: 'required' }),
    ).rejects.toThrow('Field not found');
  });

  it('throws VALIDATION_ERROR when field belongs to a different object', async () => {
    seedPipeline('pipe-1', 'obj-1');
    seedStage('stage-1', 'pipe-1');
    seedField('field-1', 'obj-OTHER', { label: 'Other Field' });

    await expect(
      createStageGate(TENANT_ID, 'stage-1', { fieldId: 'field-1', gateType: 'required' }),
    ).rejects.toThrow('Field does not belong to the same object as the pipeline');
  });

  it('throws CONFLICT for duplicate gate on same field and stage', async () => {
    seedPipeline('pipe-1', 'obj-1');
    seedStage('stage-1', 'pipe-1');
    seedField('field-1', 'obj-1');
    seedGate('gate-1', 'stage-1', 'field-1');

    await expect(
      createStageGate(TENANT_ID, 'stage-1', { fieldId: 'field-1', gateType: 'required' }),
    ).rejects.toThrow('A gate already exists for this field on this stage');
  });

  it('throws VALIDATION_ERROR when min_value used on non-numeric field', async () => {
    seedPipeline('pipe-1', 'obj-1');
    seedStage('stage-1', 'pipe-1');
    seedField('field-1', 'obj-1', { label: 'Name', field_type: 'text' });

    await expect(
      createStageGate(TENANT_ID, 'stage-1', { fieldId: 'field-1', gateType: 'min_value', gateValue: '100' }),
    ).rejects.toThrow('min_value gate type requires a number or currency field');
  });

  it('throws VALIDATION_ERROR when min_value gate_value is not a number', async () => {
    seedPipeline('pipe-1', 'obj-1');
    seedStage('stage-1', 'pipe-1');
    seedField('field-1', 'obj-1', { label: 'Amount', field_type: 'number' });

    await expect(
      createStageGate(TENANT_ID, 'stage-1', { fieldId: 'field-1', gateType: 'min_value', gateValue: 'abc' }),
    ).rejects.toThrow('gate_value must be a number for min_value gate type');
  });

  it('throws VALIDATION_ERROR when min_value has no gate_value', async () => {
    seedPipeline('pipe-1', 'obj-1');
    seedStage('stage-1', 'pipe-1');
    seedField('field-1', 'obj-1', { label: 'Amount', field_type: 'number' });

    await expect(
      createStageGate(TENANT_ID, 'stage-1', { fieldId: 'field-1', gateType: 'min_value' }),
    ).rejects.toThrow('gate_value is required for min_value gate type');
  });

  it('throws VALIDATION_ERROR when specific_value used on non-dropdown field', async () => {
    seedPipeline('pipe-1', 'obj-1');
    seedStage('stage-1', 'pipe-1');
    seedField('field-1', 'obj-1', { label: 'Name', field_type: 'text' });

    await expect(
      createStageGate(TENANT_ID, 'stage-1', { fieldId: 'field-1', gateType: 'specific_value', gateValue: 'test' }),
    ).rejects.toThrow('specific_value gate type requires a dropdown field');
  });

  it('throws VALIDATION_ERROR when specific_value is not in dropdown choices', async () => {
    seedPipeline('pipe-1', 'obj-1');
    seedStage('stage-1', 'pipe-1');
    seedField('field-1', 'obj-1', {
      label: 'Status',
      field_type: 'dropdown',
      options: { choices: ['active', 'inactive'] },
    });

    await expect(
      createStageGate(TENANT_ID, 'stage-1', {
        fieldId: 'field-1',
        gateType: 'specific_value',
        gateValue: 'unknown',
      }),
    ).rejects.toThrow('gate_value "unknown" is not a valid choice');
  });
});

// ─── updateStageGate ────────────────────────────────────────────────────────

describe('updateStageGate', () => {
  it('updates error_message on an existing gate', async () => {
    seedPipeline('pipe-1', 'obj-1');
    seedStage('stage-1', 'pipe-1');
    seedField('field-1', 'obj-1', { label: 'Value', field_type: 'currency' });
    seedGate('gate-1', 'stage-1', 'field-1');

    const gate = await updateStageGate(TENANT_ID, 'stage-1', 'gate-1', {
      errorMessage: 'Updated message',
    });

    expect(gate.id).toBe('gate-1');
    expect(gate.errorMessage).toBe('Updated message');
  });

  it('updates gate_type from required to min_value on numeric field', async () => {
    seedPipeline('pipe-1', 'obj-1');
    seedStage('stage-1', 'pipe-1');
    seedField('field-1', 'obj-1', { label: 'Amount', field_type: 'number' });
    seedGate('gate-1', 'stage-1', 'field-1');

    const gate = await updateStageGate(TENANT_ID, 'stage-1', 'gate-1', {
      gateType: 'min_value',
      gateValue: '50',
    });

    expect(gate.gateType).toBe('min_value');
    expect(gate.gateValue).toBe('50');
  });

  it('returns existing gate when no params provided', async () => {
    seedPipeline('pipe-1', 'obj-1');
    seedStage('stage-1', 'pipe-1');
    seedField('field-1', 'obj-1', { label: 'Value', field_type: 'currency' });
    seedGate('gate-1', 'stage-1', 'field-1', { error_message: 'Original' });

    const gate = await updateStageGate(TENANT_ID, 'stage-1', 'gate-1', {});

    expect(gate.id).toBe('gate-1');
  });

  it('throws NOT_FOUND when stage does not exist', async () => {
    await expect(
      updateStageGate(TENANT_ID, 'nonexistent', 'gate-1', { errorMessage: 'test' }),
    ).rejects.toThrow('Stage not found');
  });

  it('throws NOT_FOUND when gate does not exist', async () => {
    seedPipeline('pipe-1', 'obj-1');
    seedStage('stage-1', 'pipe-1');

    await expect(
      updateStageGate(TENANT_ID, 'stage-1', 'nonexistent', { errorMessage: 'test' }),
    ).rejects.toThrow('Stage gate not found');
  });

  it('throws VALIDATION_ERROR for invalid gate_type', async () => {
    seedPipeline('pipe-1', 'obj-1');
    seedStage('stage-1', 'pipe-1');
    seedField('field-1', 'obj-1', { label: 'Value', field_type: 'currency' });
    seedGate('gate-1', 'stage-1', 'field-1');

    await expect(
      updateStageGate(TENANT_ID, 'stage-1', 'gate-1', { gateType: 'invalid' }),
    ).rejects.toThrow('gate_type must be one of');
  });

  it('throws VALIDATION_ERROR when changing to min_value on non-numeric field', async () => {
    seedPipeline('pipe-1', 'obj-1');
    seedStage('stage-1', 'pipe-1');
    seedField('field-1', 'obj-1', { label: 'Name', field_type: 'text' });
    seedGate('gate-1', 'stage-1', 'field-1');

    await expect(
      updateStageGate(TENANT_ID, 'stage-1', 'gate-1', { gateType: 'min_value', gateValue: '100' }),
    ).rejects.toThrow('min_value gate type requires a number or currency field');
  });
});

// ─── deleteStageGate ────────────────────────────────────────────────────────

describe('deleteStageGate', () => {
  it('deletes an existing gate', async () => {
    seedPipeline('pipe-1', 'obj-1');
    seedStage('stage-1', 'pipe-1');
    seedField('field-1', 'obj-1');
    seedGate('gate-1', 'stage-1', 'field-1');

    await deleteStageGate(TENANT_ID, 'stage-1', 'gate-1');

    expect(fakeGates.has('gate-1')).toBe(false);
  });

  it('throws NOT_FOUND when stage does not exist', async () => {
    await expect(deleteStageGate(TENANT_ID, 'nonexistent', 'gate-1')).rejects.toThrow('Stage not found');
  });

  it('throws NOT_FOUND when gate does not exist', async () => {
    seedPipeline('pipe-1', 'obj-1');
    seedStage('stage-1', 'pipe-1');

    await expect(deleteStageGate(TENANT_ID, 'stage-1', 'nonexistent')).rejects.toThrow('Stage gate not found');
  });
});
