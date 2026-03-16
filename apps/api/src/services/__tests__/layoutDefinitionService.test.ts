import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createLayoutDefinition,
  listLayoutDefinitions,
  getLayoutDefinitionById,
  updateLayoutDefinition,
  setLayoutFields,
  deleteLayoutDefinition,
  validateLayoutName,
  validateLayoutType,
} from '../layoutDefinitionService.js';

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ─── Fake DB pool ─────────────────────────────────────────────────────────────

const { fakeObjects, fakeLayouts, fakeLayoutFields, fakeFields, mockQuery } = vi.hoisted(() => {
  const fakeObjects = new Map<string, Record<string, unknown>>();
  const fakeLayouts = new Map<string, Record<string, unknown>>();
  const fakeLayoutFields = new Map<string, Record<string, unknown>>();
  const fakeFields = new Map<string, Record<string, unknown>>();

  const mockQuery = vi.fn(async (sql: string, params?: unknown[]) => {
    const s = sql.replace(/\s+/g, ' ').trim().toUpperCase();

    // SELECT id FROM object_definitions WHERE id = $1
    if (s.startsWith('SELECT ID FROM OBJECT_DEFINITIONS WHERE ID')) {
      const id = params![0] as string;
      const row = fakeObjects.get(id);
      if (row) return { rows: [{ id: row.id }] };
      return { rows: [] };
    }

    // SELECT id FROM layout_definitions WHERE object_id = $1 AND name = $2
    if (s.startsWith('SELECT ID FROM LAYOUT_DEFINITIONS WHERE OBJECT_ID = $1 AND NAME = $2') && !s.includes('ID != $3')) {
      const objectId = params![0] as string;
      const name = params![1] as string;
      const match = [...fakeLayouts.values()].find(
        (l) => l.object_id === objectId && l.name === name,
      );
      if (match) return { rows: [{ id: match.id }] };
      return { rows: [] };
    }

    // SELECT id FROM layout_definitions WHERE object_id = $1 AND name = $2 AND id != $3
    if (s.startsWith('SELECT ID FROM LAYOUT_DEFINITIONS WHERE OBJECT_ID = $1 AND NAME = $2 AND ID != $3')) {
      const objectId = params![0] as string;
      const name = params![1] as string;
      const excludeId = params![2] as string;
      const match = [...fakeLayouts.values()].find(
        (l) => l.object_id === objectId && l.name === name && l.id !== excludeId,
      );
      if (match) return { rows: [{ id: match.id }] };
      return { rows: [] };
    }

    // INSERT INTO layout_definitions
    if (s.startsWith('INSERT INTO LAYOUT_DEFINITIONS')) {
      const [id, object_id, name, layout_type, is_default, created_at, updated_at] = params as unknown[];
      const row: Record<string, unknown> = {
        id, object_id, name, layout_type, is_default, created_at, updated_at,
      };
      fakeLayouts.set(id as string, row);
      return { rows: [row] };
    }

    // SELECT * FROM layout_definitions WHERE object_id = $1 ORDER BY
    if (s.startsWith('SELECT * FROM LAYOUT_DEFINITIONS WHERE OBJECT_ID = $1 ORDER BY')) {
      const objectId = params![0] as string;
      const rows = [...fakeLayouts.values()]
        .filter((l) => l.object_id === objectId)
        .sort((a, b) => {
          const typeCompare = (a.layout_type as string).localeCompare(b.layout_type as string);
          if (typeCompare !== 0) return typeCompare;
          return (a.name as string).localeCompare(b.name as string);
        });
      return { rows };
    }

    // SELECT * FROM layout_definitions WHERE id = $1 AND object_id = $2
    if (s.startsWith('SELECT * FROM LAYOUT_DEFINITIONS WHERE ID = $1 AND OBJECT_ID')) {
      const layoutId = params![0] as string;
      const objectId = params![1] as string;
      const match = fakeLayouts.get(layoutId);
      if (match && match.object_id === objectId) return { rows: [match] };
      return { rows: [] };
    }

    // SELECT lf.*, fd.api_name ... FROM layout_fields lf JOIN field_definitions fd
    if (s.includes('FROM LAYOUT_FIELDS LF') && s.includes('JOIN FIELD_DEFINITIONS FD')) {
      const layoutId = params![0] as string;
      const rows = [...fakeLayoutFields.values()]
        .filter((lf) => lf.layout_id === layoutId)
        .sort((a, b) => {
          const sectionCompare = (a.section as number) - (b.section as number);
          if (sectionCompare !== 0) return sectionCompare;
          return (a.sort_order as number) - (b.sort_order as number);
        })
        .map((lf) => {
          const field = fakeFields.get(lf.field_id as string);
          return {
            ...lf,
            field_api_name: field?.api_name ?? '',
            field_label: field?.label ?? '',
            field_type: field?.field_type ?? '',
            field_required: field?.required ?? false,
            field_options: field?.options ?? {},
          };
        });
      return { rows };
    }

    // UPDATE layout_definitions SET ... (general update)
    if (s.startsWith('UPDATE LAYOUT_DEFINITIONS SET') && s.includes('RETURNING')) {
      // The layout_id and object_id are the last two params
      const layoutId = params![params!.length - 2] as string;
      const objectId = params![params!.length - 1] as string;
      const layout = fakeLayouts.get(layoutId);
      if (layout && layout.object_id === objectId) {
        const updated: Record<string, unknown> = { ...layout, updated_at: new Date() };
        let paramIdx = 0;
        if (s.includes('NAME =')) { updated.name = params![paramIdx++]; }
        if (s.includes('LAYOUT_TYPE =')) { updated.layout_type = params![paramIdx++]; }
        fakeLayouts.set(layoutId, updated);
        return { rows: [updated] };
      }
      return { rows: [] };
    }

    // UPDATE layout_definitions SET updated_at = $1 WHERE id = $2 (timestamp only)
    if (s.startsWith('UPDATE LAYOUT_DEFINITIONS SET UPDATED_AT') && !s.includes('RETURNING')) {
      const updatedAt = params![0];
      const layoutId = params![1] as string;
      const layout = fakeLayouts.get(layoutId);
      if (layout) {
        layout.updated_at = updatedAt;
      }
      return { rows: [] };
    }

    // SELECT id FROM field_definitions WHERE object_id = $1 (for field validation)
    if (s.startsWith('SELECT ID FROM FIELD_DEFINITIONS WHERE OBJECT_ID')) {
      const objectId = params![0] as string;
      const rows = [...fakeFields.values()]
        .filter((f) => f.object_id === objectId)
        .map((f) => ({ id: f.id }));
      return { rows };
    }

    // DELETE FROM layout_fields WHERE layout_id = $1
    if (s.startsWith('DELETE FROM LAYOUT_FIELDS WHERE LAYOUT_ID')) {
      const layoutId = params![0] as string;
      for (const [key, lf] of fakeLayoutFields.entries()) {
        if (lf.layout_id === layoutId) fakeLayoutFields.delete(key);
      }
      return { rows: [] };
    }

    // INSERT INTO layout_fields
    if (s.startsWith('INSERT INTO LAYOUT_FIELDS')) {
      const [id, layout_id, field_id, section, section_label, sort_order, width] = params as unknown[];
      const row: Record<string, unknown> = { id, layout_id, field_id, section, section_label, sort_order, width };
      fakeLayoutFields.set(id as string, row);
      return { rows: [row] };
    }

    // DELETE FROM layout_definitions WHERE id = $1
    if (s.startsWith('DELETE FROM LAYOUT_DEFINITIONS WHERE ID')) {
      const layoutId = params![0] as string;
      fakeLayouts.delete(layoutId);
      // Also clean up layout_fields
      for (const [key, lf] of fakeLayoutFields.entries()) {
        if (lf.layout_id === layoutId) fakeLayoutFields.delete(key);
      }
      return { rows: [] };
    }

    return { rows: [] };
  });

  return { fakeObjects, fakeLayouts, fakeLayoutFields, fakeFields, mockQuery };
});

vi.mock('../../db/client.js', () => ({
  pool: { query: mockQuery },
}));

// ─── Test helpers ────────────────────────────────────────────────────────────

function seedObject(id: string) {
  fakeObjects.set(id, {
    id,
    api_name: 'custom_test',
    label: 'Custom Test',
    plural_label: 'Custom Tests',
    description: null,
    icon: null,
    is_system: false,
    owner_id: 'user-123',
    created_at: new Date(),
    updated_at: new Date(),
  });
}

function seedLayout(id: string, objectId: string, overrides: Record<string, unknown> = {}) {
  fakeLayouts.set(id, {
    id,
    object_id: objectId,
    name: 'Default Form',
    layout_type: 'form',
    is_default: true,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
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

describe('validateLayoutName', () => {
  it('returns null for valid name', () => {
    expect(validateLayoutName('Custom Form')).toBeNull();
  });

  it('returns error for empty string', () => {
    expect(validateLayoutName('')).toBe('name is required');
  });

  it('returns error for non-string', () => {
    expect(validateLayoutName(123)).toBe('name is required');
  });

  it('returns error for name > 255 chars', () => {
    expect(validateLayoutName('a'.repeat(256))).toBe('name must be 255 characters or fewer');
  });
});

describe('validateLayoutType', () => {
  it('returns null for "form"', () => {
    expect(validateLayoutType('form')).toBeNull();
  });

  it('returns null for "list"', () => {
    expect(validateLayoutType('list')).toBeNull();
  });

  it('returns null for "detail"', () => {
    expect(validateLayoutType('detail')).toBeNull();
  });

  it('returns error for empty string', () => {
    expect(validateLayoutType('')).toBe('layout_type is required');
  });

  it('returns error for invalid type', () => {
    expect(validateLayoutType('invalid')).toBe('layout_type must be one of: form, list, detail');
  });
});

// ─── createLayoutDefinition ──────────────────────────────────────────────────

describe('createLayoutDefinition', () => {
  beforeEach(() => {
    fakeObjects.clear();
    fakeLayouts.clear();
    fakeLayoutFields.clear();
    fakeFields.clear();
    mockQuery.mockClear();
  });

  it('creates a layout on a valid object', async () => {
    seedObject('obj-1');

    const result = await createLayoutDefinition('obj-1', {
      name: 'Custom Form',
      layoutType: 'form',
    });

    expect(result.name).toBe('Custom Form');
    expect(result.layoutType).toBe('form');
    expect(result.objectId).toBe('obj-1');
    expect(result.isDefault).toBe(false);
  });

  it('throws NOT_FOUND when object does not exist', async () => {
    await expect(
      createLayoutDefinition('missing', { name: 'Test', layoutType: 'form' }),
    ).rejects.toThrow('Object definition not found');
  });

  it('throws VALIDATION_ERROR for empty name', async () => {
    seedObject('obj-1');

    await expect(
      createLayoutDefinition('obj-1', { name: '', layoutType: 'form' }),
    ).rejects.toThrow('name is required');
  });

  it('throws VALIDATION_ERROR for invalid layout_type', async () => {
    seedObject('obj-1');

    await expect(
      createLayoutDefinition('obj-1', { name: 'Test', layoutType: 'invalid' }),
    ).rejects.toThrow('layout_type must be one of');
  });

  it('throws CONFLICT when name already exists', async () => {
    seedObject('obj-1');
    seedLayout('l1', 'obj-1', { name: 'Custom Form' });

    await expect(
      createLayoutDefinition('obj-1', { name: 'Custom Form', layoutType: 'form' }),
    ).rejects.toThrow('already exists');
  });
});

// ─── listLayoutDefinitions ───────────────────────────────────────────────────

describe('listLayoutDefinitions', () => {
  beforeEach(() => {
    fakeObjects.clear();
    fakeLayouts.clear();
    fakeLayoutFields.clear();
    fakeFields.clear();
    mockQuery.mockClear();
  });

  it('returns all layouts for an object', async () => {
    seedObject('obj-1');
    seedLayout('l1', 'obj-1', { name: 'Default Form', layout_type: 'form' });
    seedLayout('l2', 'obj-1', { name: 'List View', layout_type: 'list' });

    const result = await listLayoutDefinitions('obj-1');

    expect(result).toHaveLength(2);
  });

  it('returns empty array when no layouts exist', async () => {
    seedObject('obj-1');

    const result = await listLayoutDefinitions('obj-1');

    expect(result).toHaveLength(0);
  });

  it('throws NOT_FOUND when object does not exist', async () => {
    await expect(
      listLayoutDefinitions('missing'),
    ).rejects.toThrow('Object definition not found');
  });
});

// ─── getLayoutDefinitionById ─────────────────────────────────────────────────

describe('getLayoutDefinitionById', () => {
  beforeEach(() => {
    fakeObjects.clear();
    fakeLayouts.clear();
    fakeLayoutFields.clear();
    fakeFields.clear();
    mockQuery.mockClear();
  });

  it('returns layout with field metadata', async () => {
    seedObject('obj-1');
    seedLayout('l1', 'obj-1');
    seedField('f1', 'obj-1', { api_name: 'name', label: 'Name' });
    fakeLayoutFields.set('lf1', {
      id: 'lf1',
      layout_id: 'l1',
      field_id: 'f1',
      section: 0,
      section_label: 'Basic Info',
      sort_order: 1,
      width: 'full',
    });

    const result = await getLayoutDefinitionById('obj-1', 'l1');

    expect(result.id).toBe('l1');
    expect(result.fields).toHaveLength(1);
    expect(result.fields[0].fieldApiName).toBe('name');
    expect(result.fields[0].fieldLabel).toBe('Name');
    expect(result.fields[0].sectionLabel).toBe('Basic Info');
  });

  it('throws NOT_FOUND when layout does not exist', async () => {
    seedObject('obj-1');

    await expect(
      getLayoutDefinitionById('obj-1', 'missing'),
    ).rejects.toThrow('Layout definition not found');
  });

  it('throws NOT_FOUND when object does not exist', async () => {
    await expect(
      getLayoutDefinitionById('missing', 'l1'),
    ).rejects.toThrow('Object definition not found');
  });
});

// ─── updateLayoutDefinition ──────────────────────────────────────────────────

describe('updateLayoutDefinition', () => {
  beforeEach(() => {
    fakeObjects.clear();
    fakeLayouts.clear();
    fakeLayoutFields.clear();
    fakeFields.clear();
    mockQuery.mockClear();
  });

  it('updates layout name', async () => {
    seedObject('obj-1');
    seedLayout('l1', 'obj-1');

    const result = await updateLayoutDefinition('obj-1', 'l1', { name: 'Updated Name' });

    expect(result.name).toBe('Updated Name');
  });

  it('returns existing layout when no params provided', async () => {
    seedObject('obj-1');
    seedLayout('l1', 'obj-1');

    const result = await updateLayoutDefinition('obj-1', 'l1', {});

    expect(result.name).toBe('Default Form');
  });

  it('throws NOT_FOUND when layout does not exist', async () => {
    seedObject('obj-1');

    await expect(
      updateLayoutDefinition('obj-1', 'missing', { name: 'New' }),
    ).rejects.toThrow('Layout definition not found');
  });

  it('throws VALIDATION_ERROR for empty name', async () => {
    seedObject('obj-1');
    seedLayout('l1', 'obj-1');

    await expect(
      updateLayoutDefinition('obj-1', 'l1', { name: '' }),
    ).rejects.toThrow('name is required');
  });

  it('throws CONFLICT when new name already exists on another layout', async () => {
    seedObject('obj-1');
    seedLayout('l1', 'obj-1', { name: 'Default Form' });
    seedLayout('l2', 'obj-1', { name: 'List View' });

    await expect(
      updateLayoutDefinition('obj-1', 'l2', { name: 'Default Form' }),
    ).rejects.toThrow('already exists');
  });
});

// ─── setLayoutFields ─────────────────────────────────────────────────────────

describe('setLayoutFields', () => {
  beforeEach(() => {
    fakeObjects.clear();
    fakeLayouts.clear();
    fakeLayoutFields.clear();
    fakeFields.clear();
    mockQuery.mockClear();
  });

  it('replaces all layout fields with new sections', async () => {
    seedObject('obj-1');
    seedLayout('l1', 'obj-1');
    seedField('f1', 'obj-1', { api_name: 'name', label: 'Name' });
    seedField('f2', 'obj-1', { api_name: 'email', label: 'Email' });

    const result = await setLayoutFields('obj-1', 'l1', [
      {
        label: 'Basic Info',
        fields: [
          { field_id: 'f1', width: 'full' },
          { field_id: 'f2', width: 'half' },
        ],
      },
    ]);

    expect(result.fields).toHaveLength(2);
    expect(result.fields[0].fieldApiName).toBe('name');
    expect(result.fields[0].sectionLabel).toBe('Basic Info');
    expect(result.fields[0].section).toBe(0);
    expect(result.fields[0].sortOrder).toBe(1);
    expect(result.fields[1].fieldApiName).toBe('email');
    expect(result.fields[1].sortOrder).toBe(2);
  });

  it('clears all fields when given empty sections', async () => {
    seedObject('obj-1');
    seedLayout('l1', 'obj-1');
    fakeLayoutFields.set('lf1', {
      id: 'lf1', layout_id: 'l1', field_id: 'f1', section: 0, section_label: null, sort_order: 1, width: 'full',
    });

    const result = await setLayoutFields('obj-1', 'l1', []);

    expect(result.fields).toHaveLength(0);
  });

  it('supports multiple sections', async () => {
    seedObject('obj-1');
    seedLayout('l1', 'obj-1');
    seedField('f1', 'obj-1', { api_name: 'name', label: 'Name' });
    seedField('f2', 'obj-1', { api_name: 'email', label: 'Email' });

    const result = await setLayoutFields('obj-1', 'l1', [
      {
        label: 'Section A',
        fields: [{ field_id: 'f1', width: 'full' }],
      },
      {
        label: 'Section B',
        fields: [{ field_id: 'f2', width: 'full' }],
      },
    ]);

    expect(result.fields).toHaveLength(2);
    expect(result.fields[0].section).toBe(0);
    expect(result.fields[0].sectionLabel).toBe('Section A');
    expect(result.fields[1].section).toBe(1);
    expect(result.fields[1].sectionLabel).toBe('Section B');
  });

  it('throws NOT_FOUND when layout does not exist', async () => {
    seedObject('obj-1');

    await expect(
      setLayoutFields('obj-1', 'missing', []),
    ).rejects.toThrow('Layout definition not found');
  });

  it('throws VALIDATION_ERROR when field does not belong to object', async () => {
    seedObject('obj-1');
    seedLayout('l1', 'obj-1');

    await expect(
      setLayoutFields('obj-1', 'l1', [
        { fields: [{ field_id: 'unknown-field' }] },
      ]),
    ).rejects.toThrow('does not belong to this object');
  });

  it('throws VALIDATION_ERROR for duplicate field IDs', async () => {
    seedObject('obj-1');
    seedLayout('l1', 'obj-1');
    seedField('f1', 'obj-1');

    await expect(
      setLayoutFields('obj-1', 'l1', [
        { fields: [{ field_id: 'f1' }, { field_id: 'f1' }] },
      ]),
    ).rejects.toThrow('Duplicate field IDs');
  });

  it('throws VALIDATION_ERROR when field is missing field_id', async () => {
    seedObject('obj-1');
    seedLayout('l1', 'obj-1');

    await expect(
      setLayoutFields('obj-1', 'l1', [
        { fields: [{}] },
      ]),
    ).rejects.toThrow('Each field must have a field_id');
  });

  it('accepts camelCase fieldId in field input', async () => {
    seedObject('obj-1');
    seedLayout('l1', 'obj-1');
    seedField('f1', 'obj-1', { api_name: 'name', label: 'Name' });

    const result = await setLayoutFields('obj-1', 'l1', [
      { fields: [{ fieldId: 'f1' }] },
    ]);

    expect(result.fields).toHaveLength(1);
  });
});

// ─── deleteLayoutDefinition ──────────────────────────────────────────────────

describe('deleteLayoutDefinition', () => {
  beforeEach(() => {
    fakeObjects.clear();
    fakeLayouts.clear();
    fakeLayoutFields.clear();
    fakeFields.clear();
    mockQuery.mockClear();
  });

  it('deletes a non-default layout', async () => {
    seedObject('obj-1');
    seedLayout('l1', 'obj-1', { is_default: false, name: 'Custom Form' });

    await deleteLayoutDefinition('obj-1', 'l1');

    expect(fakeLayouts.has('l1')).toBe(false);
  });

  it('throws DELETE_BLOCKED for default layouts', async () => {
    seedObject('obj-1');
    seedLayout('l1', 'obj-1', { is_default: true });

    await expect(
      deleteLayoutDefinition('obj-1', 'l1'),
    ).rejects.toThrow('Cannot delete default layouts');
  });

  it('throws NOT_FOUND when layout does not exist', async () => {
    seedObject('obj-1');

    await expect(
      deleteLayoutDefinition('obj-1', 'missing'),
    ).rejects.toThrow('Layout definition not found');
  });

  it('throws NOT_FOUND when object does not exist', async () => {
    await expect(
      deleteLayoutDefinition('missing', 'l1'),
    ).rejects.toThrow('Object definition not found');
  });
});
