import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createFieldDefinition,
  listFieldDefinitions,
  updateFieldDefinition,
  deleteFieldDefinition,
  reorderFieldDefinitions,
  validateFieldApiName,
  validateFieldLabel,
  validateFieldType,
  validateFieldOptions,
} from '../fieldDefinitionService.js';

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ─── Fake DB pool ─────────────────────────────────────────────────────────────

const { fakeObjects, fakeFields, fakeRecords, fakeLayouts, fakeLayoutFields, mockQuery } = vi.hoisted(() => {
  const fakeObjects = new Map<string, Record<string, unknown>>();
  const fakeFields = new Map<string, Record<string, unknown>>();
  const fakeRecords = new Map<string, Record<string, unknown>>();
  const fakeLayouts = new Map<string, Record<string, unknown>>();
  const fakeLayoutFields = new Map<string, Record<string, unknown>>();

  const mockQuery = vi.fn(async (sql: string, params?: unknown[]) => {
    const s = sql.replace(/\s+/g, ' ').trim().toUpperCase();

    // SELECT id FROM object_definitions WHERE id = $1
    if (s.startsWith('SELECT ID FROM OBJECT_DEFINITIONS WHERE ID')) {
      const id = params![0] as string;
      const row = fakeObjects.get(id);
      if (row) return { rows: [{ id: row.id }] };
      return { rows: [] };
    }

    // SELECT id FROM field_definitions WHERE object_id = $1 AND api_name = $2
    if (s.startsWith('SELECT ID FROM FIELD_DEFINITIONS WHERE OBJECT_ID') && s.includes('API_NAME')) {
      const objectId = params![0] as string;
      const apiName = params![1] as string;
      const match = [...fakeFields.values()].find(
        (f) => f.object_id === objectId && f.api_name === apiName,
      );
      if (match) return { rows: [{ id: match.id }] };
      return { rows: [] };
    }

    // SELECT COALESCE(MAX(sort_order), 0) AS max_sort FROM field_definitions
    if (s.includes('MAX(SORT_ORDER)') && s.includes('FIELD_DEFINITIONS')) {
      const objectId = params![0] as string;
      const fields = [...fakeFields.values()].filter((f) => f.object_id === objectId);
      const maxSort = fields.reduce((max, f) => Math.max(max, f.sort_order as number), 0);
      return { rows: [{ max_sort: String(maxSort) }] };
    }

    // SELECT COALESCE(MAX(sort_order), 0) AS max_sort FROM layout_fields
    if (s.includes('MAX(SORT_ORDER)') && s.includes('LAYOUT_FIELDS')) {
      const layoutId = params![0] as string;
      const lfs = [...fakeLayoutFields.values()].filter((lf) => lf.layout_id === layoutId);
      const maxSort = lfs.reduce((max, lf) => Math.max(max, lf.sort_order as number), 0);
      return { rows: [{ max_sort: String(maxSort) }] };
    }

    // INSERT INTO field_definitions
    if (s.startsWith('INSERT INTO FIELD_DEFINITIONS')) {
      const [id, object_id, api_name, label, field_type, description, required, default_value, options, sort_order, is_system, created_at, updated_at] = params as unknown[];
      const row: Record<string, unknown> = {
        id, object_id, api_name, label, field_type, description, required,
        default_value, options: typeof options === 'string' ? JSON.parse(options as string) : options,
        sort_order, is_system, created_at, updated_at,
      };
      fakeFields.set(id as string, row);
      return { rows: [row] };
    }

    // SELECT id FROM layout_definitions WHERE object_id AND layout_type = 'form'
    if (s.includes('FROM LAYOUT_DEFINITIONS') && s.includes('FORM') && s.includes('IS_DEFAULT')) {
      const objectId = params![0] as string;
      const match = [...fakeLayouts.values()].find(
        (l) => l.object_id === objectId && l.layout_type === 'form' && l.is_default === true,
      );
      if (match) return { rows: [{ id: match.id }] };
      return { rows: [] };
    }

    // INSERT INTO layout_fields
    if (s.startsWith('INSERT INTO LAYOUT_FIELDS')) {
      const [id, layout_id, field_id, section, sort_order, width] = params as unknown[];
      const row: Record<string, unknown> = { id, layout_id, field_id, section, sort_order, width };
      fakeLayoutFields.set(id as string, row);
      return { rows: [row] };
    }

    // SELECT * FROM field_definitions WHERE object_id = $1 ORDER BY sort_order
    if (s.startsWith('SELECT * FROM FIELD_DEFINITIONS WHERE OBJECT_ID = $1 ORDER BY')) {
      const objectId = params![0] as string;
      const rows = [...fakeFields.values()]
        .filter((f) => f.object_id === objectId)
        .sort((a, b) => (a.sort_order as number) - (b.sort_order as number));
      return { rows };
    }

    // SELECT * FROM field_definitions WHERE id = $1 AND object_id = $2
    if (s.startsWith('SELECT * FROM FIELD_DEFINITIONS WHERE ID = $1 AND OBJECT_ID')) {
      const fieldId = params![0] as string;
      const objectId = params![1] as string;
      const match = fakeFields.get(fieldId);
      if (match && match.object_id === objectId) return { rows: [match] };
      return { rows: [] };
    }

    // SELECT id FROM field_definitions WHERE object_id = $1 (for reorder)
    if (s.startsWith('SELECT ID FROM FIELD_DEFINITIONS WHERE OBJECT_ID')) {
      const objectId = params![0] as string;
      const rows = [...fakeFields.values()]
        .filter((f) => f.object_id === objectId)
        .map((f) => ({ id: f.id }));
      return { rows };
    }

    // UPDATE field_definitions SET sort_order (reorder)
    if (s.startsWith('UPDATE FIELD_DEFINITIONS SET SORT_ORDER = $1')) {
      const sortOrder = params![0] as number;
      const updatedAt = params![1] as Date;
      const fieldId = params![2] as string;
      const objectId = params![3] as string;
      const field = fakeFields.get(fieldId);
      if (field && field.object_id === objectId) {
        field.sort_order = sortOrder;
        field.updated_at = updatedAt;
      }
      return { rows: [] };
    }

    // UPDATE field_definitions SET ... (general update)
    if (s.startsWith('UPDATE FIELD_DEFINITIONS SET')) {
      // The field id and object_id are the last two params
      const fieldId = params![params!.length - 2] as string;
      const objectId = params![params!.length - 1] as string;
      const field = fakeFields.get(fieldId);
      if (field && field.object_id === objectId) {
        const updated = { ...field, updated_at: new Date() };
        // Parse SET clauses from the SQL to update fields
        // This is a simplified mock that just returns the updated row
        // In a real mock we'd parse the SQL, but the service tests
        // primarily test validation logic, not SQL generation
        let paramIdx = 0;
        if (s.includes('LABEL =')) { updated.label = params![paramIdx++]; }
        if (s.includes('FIELD_TYPE =')) { updated.field_type = params![paramIdx++]; }
        if (s.includes('DESCRIPTION =')) { updated.description = params![paramIdx++]; }
        if (s.includes('REQUIRED =')) { updated.required = params![paramIdx++]; }
        if (s.includes('DEFAULT_VALUE =')) { updated.default_value = params![paramIdx++]; }
        if (s.includes('OPTIONS =')) {
          const opts = params![paramIdx++];
          updated.options = typeof opts === 'string' ? JSON.parse(opts as string) : opts;
        }
        fakeFields.set(fieldId, updated);
        return { rows: [updated] };
      }
      return { rows: [] };
    }

    // SELECT COUNT(*) AS count FROM records WHERE object_id
    if (s.includes('SELECT COUNT(*) AS COUNT FROM RECORDS WHERE OBJECT_ID')) {
      const objectId = params![0] as string;
      const count = [...fakeRecords.values()].filter((r) => r.object_id === objectId).length;
      return { rows: [{ count: String(count) }] };
    }

    // DELETE FROM field_definitions
    if (s.startsWith('DELETE FROM FIELD_DEFINITIONS')) {
      const fieldId = params![0] as string;
      const objectId = params![1] as string;
      const field = fakeFields.get(fieldId);
      if (field && field.object_id === objectId) {
        fakeFields.delete(fieldId);
        // Also clean up layout_fields referencing this field
        for (const [key, lf] of fakeLayoutFields.entries()) {
          if (lf.field_id === fieldId) fakeLayoutFields.delete(key);
        }
      }
      return { rowCount: field ? 1 : 0 };
    }

    return { rows: [] };
  });

  return { fakeObjects, fakeFields, fakeRecords, fakeLayouts, fakeLayoutFields, mockQuery };
});

vi.mock('../../db/client.js', () => ({
  pool: { query: mockQuery },
}));

// ─── Test helpers ────────────────────────────────────────────────────────────

function seedObject(id: string, isSystem = false) {
  fakeObjects.set(id, {
    id,
    api_name: isSystem ? 'account' : 'custom_test',
    label: isSystem ? 'Account' : 'Custom Test',
    plural_label: isSystem ? 'Accounts' : 'Custom Tests',
    description: null,
    icon: null,
    is_system: isSystem,
    owner_id: isSystem ? 'SYSTEM' : 'user-123',
    created_at: new Date(),
    updated_at: new Date(),
  });
}

function seedLayout(layoutId: string, objectId: string) {
  fakeLayouts.set(layoutId, {
    id: layoutId,
    object_id: objectId,
    name: 'Default Form',
    layout_type: 'form',
    is_default: true,
    created_at: new Date(),
    updated_at: new Date(),
  });
}

function seedField(id: string, objectId: string, overrides: Record<string, unknown> = {}) {
  fakeFields.set(id, {
    id,
    object_id: objectId,
    api_name: 'test_field',
    label: 'Test Field',
    field_type: 'text',
    description: null,
    required: false,
    default_value: null,
    options: {},
    sort_order: 1,
    is_system: false,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  });
}

// ─── Validation tests ─────────────────────────────────────────────────────────

describe('validateFieldApiName', () => {
  it('returns null for valid snake_case name', () => {
    expect(validateFieldApiName('company_name')).toBeNull();
  });

  it('returns null for a simple 2-char name', () => {
    expect(validateFieldApiName('ab')).toBeNull();
  });

  it('returns error for empty string', () => {
    expect(validateFieldApiName('')).toBe('api_name is required');
  });

  it('returns error for undefined', () => {
    expect(validateFieldApiName(undefined)).toBe('api_name is required');
  });

  it('returns error for names with uppercase', () => {
    expect(validateFieldApiName('CompanyName')).toBe(
      'api_name must be lowercase snake_case (e.g. "company_name")',
    );
  });

  it('returns error for single character', () => {
    expect(validateFieldApiName('a')).toBe('api_name must be between 2 and 100 characters');
  });
});

describe('validateFieldLabel', () => {
  it('returns null for valid label', () => {
    expect(validateFieldLabel('Company Name')).toBeNull();
  });

  it('returns error for empty string', () => {
    expect(validateFieldLabel('')).toBe('label is required');
  });

  it('returns error for labels exceeding 255 characters', () => {
    expect(validateFieldLabel('a'.repeat(256))).toBe('label must be 255 characters or fewer');
  });
});

describe('validateFieldType', () => {
  it('returns null for all valid field types', () => {
    const validTypes = [
      'text', 'textarea', 'number', 'currency', 'date', 'datetime',
      'email', 'phone', 'url', 'boolean', 'dropdown', 'multi_select',
    ];
    for (const type of validTypes) {
      expect(validateFieldType(type)).toBeNull();
    }
  });

  it('returns error for empty string', () => {
    expect(validateFieldType('')).toBe('field_type is required');
  });

  it('returns error for invalid type', () => {
    expect(validateFieldType('invalid')).toMatch(/field_type must be one of/);
  });
});

describe('validateFieldOptions', () => {
  it('returns null for text with valid max_length', () => {
    expect(validateFieldOptions('text', { max_length: 200 })).toBeNull();
  });

  it('returns error for text with non-number max_length', () => {
    expect(validateFieldOptions('text', { max_length: 'abc' })).toBe('options.max_length must be a number');
  });

  it('returns null for number with valid min/max/precision', () => {
    expect(validateFieldOptions('number', { min: 0, max: 100, precision: 2 })).toBeNull();
  });

  it('returns error for number with non-number min', () => {
    expect(validateFieldOptions('number', { min: 'abc' })).toBe('options.min must be a number');
  });

  it('returns error for number with min > max', () => {
    expect(validateFieldOptions('number', { min: 100, max: 50 })).toBe(
      'options.min must be less than or equal to options.max',
    );
  });

  it('returns null for currency with valid options', () => {
    expect(validateFieldOptions('currency', { min: 0, precision: 2 })).toBeNull();
  });

  it('returns null for dropdown with valid choices', () => {
    expect(validateFieldOptions('dropdown', { choices: ['a', 'b', 'c'] })).toBeNull();
  });

  it('returns error for dropdown without choices', () => {
    expect(validateFieldOptions('dropdown', {})).toBe(
      'options.choices must be a non-empty array of strings for dropdown fields',
    );
  });

  it('returns error for dropdown with empty choices array', () => {
    expect(validateFieldOptions('dropdown', { choices: [] })).toBe(
      'options.choices must be a non-empty array of strings for dropdown fields',
    );
  });

  it('returns error for dropdown with non-string choices', () => {
    expect(validateFieldOptions('dropdown', { choices: [1, 2] })).toBe(
      'options.choices must be a non-empty array of strings for dropdown fields',
    );
  });

  it('returns error for dropdown with no options at all', () => {
    expect(validateFieldOptions('dropdown', undefined)).toBe(
      'options.choices is required for dropdown fields',
    );
  });

  it('returns error for multi_select without choices', () => {
    expect(validateFieldOptions('multi_select', undefined)).toBe(
      'options.choices is required for multi_select fields',
    );
  });

  it('returns null for multi_select with valid choices', () => {
    expect(validateFieldOptions('multi_select', { choices: ['x', 'y'] })).toBeNull();
  });

  it('returns null for boolean with no options', () => {
    expect(validateFieldOptions('boolean', undefined)).toBeNull();
  });

  it('returns null for date with no options', () => {
    expect(validateFieldOptions('date', undefined)).toBeNull();
  });
});

// ─── createFieldDefinition ──────────────────────────────────────────────────

describe('createFieldDefinition', () => {
  const objectId = 'obj-1';

  beforeEach(() => {
    vi.clearAllMocks();
    fakeObjects.clear();
    fakeFields.clear();
    fakeRecords.clear();
    fakeLayouts.clear();
    fakeLayoutFields.clear();
    seedObject(objectId);
    seedLayout('layout-1', objectId);
  });

  it('creates a field and returns it', async () => {
    const result = await createFieldDefinition(objectId, {
      apiName: 'company_name',
      label: 'Company Name',
      fieldType: 'text',
      options: { max_length: 200 },
    });

    expect(result.apiName).toBe('company_name');
    expect(result.label).toBe('Company Name');
    expect(result.fieldType).toBe('text');
    expect(result.sortOrder).toBe(1);
    expect(result.isSystem).toBe(false);
  });

  it('auto-adds field to default form layout', async () => {
    await createFieldDefinition(objectId, {
      apiName: 'company_name',
      label: 'Company Name',
      fieldType: 'text',
    });

    expect(fakeLayoutFields.size).toBe(1);
    const layoutField = [...fakeLayoutFields.values()][0];
    expect(layoutField.layout_id).toBe('layout-1');
  });

  it('increments sort_order for subsequent fields', async () => {
    await createFieldDefinition(objectId, {
      apiName: 'field_one',
      label: 'Field One',
      fieldType: 'text',
    });

    const second = await createFieldDefinition(objectId, {
      apiName: 'field_two',
      label: 'Field Two',
      fieldType: 'text',
    });

    expect(second.sortOrder).toBe(2);
  });

  it('throws NOT_FOUND when object does not exist', async () => {
    await expect(
      createFieldDefinition('missing-obj', {
        apiName: 'test_field',
        label: 'Test',
        fieldType: 'text',
      }),
    ).rejects.toMatchObject({
      message: 'Object definition not found',
      code: 'NOT_FOUND',
    });
  });

  it('throws VALIDATION_ERROR for invalid api_name', async () => {
    await expect(
      createFieldDefinition(objectId, {
        apiName: '',
        label: 'Test',
        fieldType: 'text',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('throws VALIDATION_ERROR for invalid field_type', async () => {
    await expect(
      createFieldDefinition(objectId, {
        apiName: 'test_field',
        label: 'Test',
        fieldType: 'invalid',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('throws VALIDATION_ERROR for dropdown without choices', async () => {
    await expect(
      createFieldDefinition(objectId, {
        apiName: 'status',
        label: 'Status',
        fieldType: 'dropdown',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('throws CONFLICT for duplicate api_name', async () => {
    await createFieldDefinition(objectId, {
      apiName: 'duplicate_field',
      label: 'Dup',
      fieldType: 'text',
    });

    await expect(
      createFieldDefinition(objectId, {
        apiName: 'duplicate_field',
        label: 'Dup Again',
        fieldType: 'text',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('sets required and defaultValue when provided', async () => {
    const result = await createFieldDefinition(objectId, {
      apiName: 'priority',
      label: 'Priority',
      fieldType: 'text',
      required: true,
      defaultValue: 'medium',
    });

    expect(result.required).toBe(true);
    expect(result.defaultValue).toBe('medium');
  });
});

// ─── listFieldDefinitions ───────────────────────────────────────────────────

describe('listFieldDefinitions', () => {
  const objectId = 'obj-2';

  beforeEach(() => {
    vi.clearAllMocks();
    fakeObjects.clear();
    fakeFields.clear();
    fakeRecords.clear();
    fakeLayouts.clear();
    fakeLayoutFields.clear();
    seedObject(objectId);
  });

  it('returns empty array when no fields exist', async () => {
    const result = await listFieldDefinitions(objectId);
    expect(result).toEqual([]);
  });

  it('returns fields ordered by sort_order', async () => {
    seedField('f1', objectId, { api_name: 'field_a', sort_order: 2 });
    seedField('f2', objectId, { api_name: 'field_b', sort_order: 1 });

    const result = await listFieldDefinitions(objectId);
    expect(result).toHaveLength(2);
    expect(result[0].apiName).toBe('field_b');
    expect(result[1].apiName).toBe('field_a');
  });

  it('throws NOT_FOUND when object does not exist', async () => {
    await expect(listFieldDefinitions('missing-obj')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

// ─── updateFieldDefinition ──────────────────────────────────────────────────

describe('updateFieldDefinition', () => {
  const objectId = 'obj-3';

  beforeEach(() => {
    vi.clearAllMocks();
    fakeObjects.clear();
    fakeFields.clear();
    fakeRecords.clear();
    fakeLayouts.clear();
    fakeLayoutFields.clear();
    seedObject(objectId);
  });

  it('returns the updated field', async () => {
    seedField('f1', objectId, { api_name: 'old_label' });

    const result = await updateFieldDefinition(objectId, 'f1', { label: 'New Label' });
    expect(result.label).toBe('New Label');
  });

  it('returns unchanged field when no params provided', async () => {
    seedField('f1', objectId);
    const result = await updateFieldDefinition(objectId, 'f1', {});
    expect(result.apiName).toBe('test_field');
  });

  it('throws NOT_FOUND when field does not exist', async () => {
    await expect(
      updateFieldDefinition(objectId, 'missing-field', { label: 'Updated' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('throws NOT_FOUND when object does not exist', async () => {
    await expect(
      updateFieldDefinition('missing-obj', 'f1', { label: 'Updated' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('throws VALIDATION_ERROR when changing field_type on system field', async () => {
    seedField('f1', objectId, { is_system: true });

    await expect(
      updateFieldDefinition(objectId, 'f1', { fieldType: 'number' }),
    ).rejects.toMatchObject({
      message: 'Cannot change field_type on system fields',
      code: 'VALIDATION_ERROR',
    });
  });

  it('throws VALIDATION_ERROR for invalid field_type', async () => {
    seedField('f1', objectId);

    await expect(
      updateFieldDefinition(objectId, 'f1', { fieldType: 'invalid_type' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('throws VALIDATION_ERROR for empty label', async () => {
    seedField('f1', objectId);

    await expect(
      updateFieldDefinition(objectId, 'f1', { label: '' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('includes warning when field_type changed and records exist', async () => {
    seedField('f1', objectId, { field_type: 'text' });
    fakeRecords.set('r1', { id: 'r1', object_id: objectId });

    const result = await updateFieldDefinition(objectId, 'f1', { fieldType: 'number' });
    expect(result.warning).toMatch(/field_type changed/);
  });

  it('allows updating options on system fields', async () => {
    seedField('f1', objectId, { is_system: true, field_type: 'text' });

    const result = await updateFieldDefinition(objectId, 'f1', {
      options: { max_length: 500 },
    });
    expect(result).toBeDefined();
  });
});

// ─── deleteFieldDefinition ──────────────────────────────────────────────────

describe('deleteFieldDefinition', () => {
  const objectId = 'obj-4';

  beforeEach(() => {
    vi.clearAllMocks();
    fakeObjects.clear();
    fakeFields.clear();
    fakeRecords.clear();
    fakeLayouts.clear();
    fakeLayoutFields.clear();
    seedObject(objectId);
  });

  it('deletes the field successfully', async () => {
    seedField('f1', objectId);
    await expect(deleteFieldDefinition(objectId, 'f1')).resolves.toBeUndefined();
    expect(fakeFields.has('f1')).toBe(false);
  });

  it('throws NOT_FOUND when field does not exist', async () => {
    await expect(
      deleteFieldDefinition(objectId, 'missing-field'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('throws NOT_FOUND when object does not exist', async () => {
    await expect(
      deleteFieldDefinition('missing-obj', 'f1'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('throws DELETE_BLOCKED for system fields', async () => {
    seedField('f1', objectId, { is_system: true });

    await expect(
      deleteFieldDefinition(objectId, 'f1'),
    ).rejects.toMatchObject({
      message: 'Cannot delete system fields',
      code: 'DELETE_BLOCKED',
    });
  });

  it('removes field from layout_fields when deleted', async () => {
    seedField('f1', objectId);
    fakeLayoutFields.set('lf1', {
      id: 'lf1',
      layout_id: 'layout-1',
      field_id: 'f1',
      section: 0,
      sort_order: 1,
      width: 'full',
    });

    await deleteFieldDefinition(objectId, 'f1');
    expect(fakeLayoutFields.has('lf1')).toBe(false);
  });
});

// ─── reorderFieldDefinitions ────────────────────────────────────────────────

describe('reorderFieldDefinitions', () => {
  const objectId = 'obj-5';

  beforeEach(() => {
    vi.clearAllMocks();
    fakeObjects.clear();
    fakeFields.clear();
    fakeRecords.clear();
    fakeLayouts.clear();
    fakeLayoutFields.clear();
    seedObject(objectId);
  });

  it('updates sort_order based on provided field_ids', async () => {
    seedField('f1', objectId, { api_name: 'field_a', sort_order: 1 });
    seedField('f2', objectId, { api_name: 'field_b', sort_order: 2 });

    const result = await reorderFieldDefinitions(objectId, ['f2', 'f1']);

    expect(result).toHaveLength(2);
    expect(result[0].apiName).toBe('field_a');
    expect(result[0].sortOrder).toBe(2);
    expect(result[1].apiName).toBe('field_b');
    // f2 was reordered to position 1 but returned sorted by sort_order
  });

  it('throws NOT_FOUND when object does not exist', async () => {
    await expect(
      reorderFieldDefinitions('missing-obj', ['f1']),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('throws VALIDATION_ERROR for empty field_ids', async () => {
    await expect(
      reorderFieldDefinitions(objectId, []),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('throws VALIDATION_ERROR when field_id does not belong to object', async () => {
    seedField('f1', objectId, { api_name: 'field_a' });

    await expect(
      reorderFieldDefinitions(objectId, ['f1', 'unknown-field']),
    ).rejects.toMatchObject({
      message: 'Field ID "unknown-field" does not belong to this object',
      code: 'VALIDATION_ERROR',
    });
  });
});
