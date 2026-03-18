import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createObjectDefinition,
  listObjectDefinitions,
  getObjectDefinitionById,
  updateObjectDefinition,
  deleteObjectDefinition,
  validateApiName,
  validateLabel,
  validatePluralLabel,
} from '../objectDefinitionService.js';

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ─── Fake DB pool ─────────────────────────────────────────────────────────────

const { fakeObjects, fakeFields, fakeRecords, fakeRelationships, fakeLayouts, fakePermissions, mockQuery, mockConnect } = vi.hoisted(() => {
  const fakeObjects = new Map<string, Record<string, unknown>>();
  const fakeFields = new Map<string, Record<string, unknown>>();
  const fakeRecords = new Map<string, Record<string, unknown>>();
  const fakeRelationships = new Map<string, Record<string, unknown>>();
  const fakeLayouts = new Map<string, Record<string, unknown>>();
  const fakePermissions = new Map<string, Record<string, unknown>>();

  const mockQuery = vi.fn(async (sql: string, params?: unknown[]) => {
    const s = sql.replace(/\s+/g, ' ').trim().toUpperCase();

    // Transaction control statements — no-ops in the fake
    if (s === 'BEGIN' || s === 'COMMIT' || s === 'ROLLBACK') {
      return { rows: [] };
    }

    // SELECT MAX(sort_order) for new object creation
    if (s.includes('MAX(SORT_ORDER)')) {
      let maxOrder = 0;
      for (const obj of fakeObjects.values()) {
        const order = (obj.sort_order as number) ?? 0;
        if (order > maxOrder) maxOrder = order;
      }
      return { rows: [{ max_sort_order: String(maxOrder) }] };
    }

    // SELECT id check for uniqueness
    if (s.startsWith('SELECT ID FROM OBJECT_DEFINITIONS WHERE API_NAME')) {
      const apiName = params![0] as string;
      const match = [...fakeObjects.values()].find((r) => r.api_name === apiName);
      if (match) return { rows: [{ id: match.id }] };
      return { rows: [] };
    }

    // INSERT INTO object_definitions
    if (s.startsWith('INSERT INTO OBJECT_DEFINITIONS')) {
      const [id, api_name, label, plural_label, description, icon, is_system, sort_order, owner_id, created_at, updated_at] = params as unknown[];
      const row: Record<string, unknown> = {
        id, api_name, label, plural_label, description, icon, is_system, sort_order, owner_id, created_at, updated_at,
      };
      fakeObjects.set(id as string, row);
      return { rows: [row] };
    }

    // INSERT INTO layout_definitions (batch insert for default layouts)
    if (s.startsWith('INSERT INTO LAYOUT_DEFINITIONS')) {
      if (params && params.length >= 14) {
        const row1: Record<string, unknown> = {
          id: params[0], object_id: params[1], name: params[2], layout_type: params[3],
          is_default: params[4], created_at: params[5], updated_at: params[6],
        };
        fakeLayouts.set(params[0] as string, row1);
        const row2: Record<string, unknown> = {
          id: params[7], object_id: params[8], name: params[9], layout_type: params[10],
          is_default: params[11], created_at: params[12], updated_at: params[13],
        };
        fakeLayouts.set(params[7] as string, row2);
      }
      return { rows: [] };
    }

    // INSERT INTO object_permissions (batch insert for default permissions)
    if (s.startsWith('INSERT INTO OBJECT_PERMISSIONS')) {
      if (params) {
        // Each permission row has 7 params: id, object_id, role, can_create, can_read, can_update, can_delete
        for (let i = 0; i + 6 < params.length; i += 7) {
          const row: Record<string, unknown> = {
            id: params[i],
            object_id: params[i + 1],
            role: params[i + 2],
            can_create: params[i + 3],
            can_read: params[i + 4],
            can_update: params[i + 5],
            can_delete: params[i + 6],
          };
          fakePermissions.set(params[i] as string, row);
        }
      }
      return { rows: [] };
    }

    // SELECT * FROM object_definitions (list all)
    if (s.includes('FROM OBJECT_DEFINITIONS OD') && s.includes('FIELD_COUNT') && s.includes('RECORD_COUNT')) {
      const rows = [...fakeObjects.values()].map((r) => {
        const fieldCount = [...fakeFields.values()].filter((f) => f.object_id === r.id).length;
        const recordCount = [...fakeRecords.values()].filter((rec) => rec.object_id === r.id).length;
        return { ...r, field_count: String(fieldCount), record_count: String(recordCount) };
      });
      return { rows };
    }

    // SELECT * FROM object_definitions WHERE id = $1
    if (s.startsWith('SELECT * FROM OBJECT_DEFINITIONS WHERE ID = $1') && !s.includes('UPDATE')) {
      const id = params![0] as string;
      const row = fakeObjects.get(id);
      if (row) return { rows: [row] };
      return { rows: [] };
    }

    // SELECT * FROM field_definitions
    if (s.startsWith('SELECT * FROM FIELD_DEFINITIONS WHERE OBJECT_ID')) {
      const objectId = params![0] as string;
      const rows = [...fakeFields.values()].filter((f) => f.object_id === objectId);
      return { rows };
    }

    // SELECT * FROM relationship_definitions
    if (s.startsWith('SELECT * FROM RELATIONSHIP_DEFINITIONS')) {
      const objectId = params![0] as string;
      const rows = [...fakeRelationships.values()].filter(
        (r) => r.source_object_id === objectId || r.target_object_id === objectId,
      );
      return { rows };
    }

    // SELECT * FROM layout_definitions WHERE object_id
    if (s.startsWith('SELECT * FROM LAYOUT_DEFINITIONS WHERE OBJECT_ID')) {
      const objectId = params![0] as string;
      const rows = [...fakeLayouts.values()].filter((l) => l.object_id === objectId);
      return { rows };
    }

    // UPDATE object_definitions
    if (s.startsWith('UPDATE OBJECT_DEFINITIONS')) {
      // Find the id — it's the last param
      const id = params![params!.length - 1] as string;
      const existing = fakeObjects.get(id);
      if (!existing) return { rows: [] };
      const updated = { ...existing, updated_at: new Date() };
      fakeObjects.set(id, updated);
      return { rows: [updated] };
    }

    // SELECT COUNT(*) AS count FROM records WHERE object_id
    if (s.includes('SELECT COUNT(*) AS COUNT FROM RECORDS WHERE OBJECT_ID')) {
      const objectId = params![0] as string;
      const count = [...fakeRecords.values()].filter((r) => r.object_id === objectId).length;
      return { rows: [{ count: String(count) }] };
    }

    // DELETE FROM object_definitions
    if (s.startsWith('DELETE FROM OBJECT_DEFINITIONS')) {
      const id = params![0] as string;
      const existed = fakeObjects.has(id);
      fakeObjects.delete(id);
      // Cascade: clean up related layouts and permissions
      for (const [key, layout] of fakeLayouts.entries()) {
        if (layout.object_id === id) fakeLayouts.delete(key);
      }
      for (const [key, perm] of fakePermissions.entries()) {
        if (perm.object_id === id) fakePermissions.delete(key);
      }
      return { rowCount: existed ? 1 : 0 };
    }

    return { rows: [] };
  });

  const mockConnect = vi.fn(async () => ({
    query: mockQuery,
    release: vi.fn(),
  }));

  return { fakeObjects, fakeFields, fakeRecords, fakeRelationships, fakeLayouts, fakePermissions, mockQuery, mockConnect };
});

vi.mock('../../db/client.js', () => ({
  pool: { query: mockQuery, connect: mockConnect },
}));

// ─── Validation tests ─────────────────────────────────────────────────────────

describe('validateApiName', () => {
  it('returns null for a valid snake_case name', () => {
    expect(validateApiName('custom_project')).toBeNull();
  });

  it('returns null for a simple 3-char name', () => {
    expect(validateApiName('abc')).toBeNull();
  });

  it('returns an error for empty string', () => {
    expect(validateApiName('')).toBe('api_name is required');
  });

  it('returns an error for undefined', () => {
    expect(validateApiName(undefined)).toBe('api_name is required');
  });

  it('returns an error for names shorter than 3 chars', () => {
    expect(validateApiName('ab')).toBe('api_name must be between 3 and 50 characters');
  });

  it('returns an error for names longer than 50 chars', () => {
    expect(validateApiName('a'.repeat(51))).toBe('api_name must be between 3 and 50 characters');
  });

  it('returns an error for uppercase characters', () => {
    expect(validateApiName('Custom_Project')).toBe(
      'api_name must be lowercase snake_case (e.g. "custom_project")',
    );
  });

  it('returns an error for names with spaces', () => {
    expect(validateApiName('custom project')).toBe(
      'api_name must be lowercase snake_case (e.g. "custom_project")',
    );
  });

  it('returns an error for names starting with underscore', () => {
    expect(validateApiName('_custom')).toBe(
      'api_name must be lowercase snake_case (e.g. "custom_project")',
    );
  });

  it('returns an error for names starting with a number', () => {
    expect(validateApiName('1custom')).toBe(
      'api_name must be lowercase snake_case (e.g. "custom_project")',
    );
  });

  it('returns an error for reserved words', () => {
    expect(validateApiName('admin')).toBe('api_name "admin" is a reserved word');
    expect(validateApiName('table')).toBe('api_name "table" is a reserved word');
    expect(validateApiName('select')).toBe('api_name "select" is a reserved word');
  });
});

describe('validateLabel', () => {
  it('returns null for a valid label', () => {
    expect(validateLabel('Custom Project')).toBeNull();
  });

  it('returns an error for an empty string', () => {
    expect(validateLabel('')).toBe('label is required');
  });

  it('returns an error for non-string values', () => {
    expect(validateLabel(undefined)).toBe('label is required');
    expect(validateLabel(null)).toBe('label is required');
  });

  it('returns an error for labels exceeding 255 characters', () => {
    expect(validateLabel('a'.repeat(256))).toBe('label must be 255 characters or fewer');
  });
});

describe('validatePluralLabel', () => {
  it('returns null for a valid plural label', () => {
    expect(validatePluralLabel('Custom Projects')).toBeNull();
  });

  it('returns an error for an empty string', () => {
    expect(validatePluralLabel('')).toBe('plural_label is required');
  });

  it('returns an error for non-string values', () => {
    expect(validatePluralLabel(undefined)).toBe('plural_label is required');
  });
});

// ─── createObjectDefinition ──────────────────────────────────────────────────

describe('createObjectDefinition', () => {
  const baseParams = {
    apiName: 'custom_project',
    label: 'Custom Project',
    pluralLabel: 'Custom Projects',
    ownerId: 'user-123',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    fakeObjects.clear();
    fakeFields.clear();
    fakeRecords.clear();
    fakeRelationships.clear();
    fakeLayouts.clear();
    fakePermissions.clear();
  });

  it('returns the created object definition', async () => {
    const result = await createObjectDefinition(baseParams);

    expect(result.apiName).toBe('custom_project');
    expect(result.label).toBe('Custom Project');
    expect(result.pluralLabel).toBe('Custom Projects');
    expect(result.isSystem).toBe(false);
    expect(result.ownerId).toBe('user-123');
  });

  it('creates with a UUID id', async () => {
    const result = await createObjectDefinition(baseParams);

    expect(result.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('auto-creates default form and list layouts', async () => {
    const result = await createObjectDefinition(baseParams);

    const objectLayouts = [...fakeLayouts.values()].filter(
      (l) => l.object_id === result.id,
    );
    expect(objectLayouts).toHaveLength(2);

    const layoutTypes = objectLayouts.map((l) => l.layout_type).sort();
    expect(layoutTypes).toEqual(['form', 'list']);
  });

  it('throws VALIDATION_ERROR for invalid api_name', async () => {
    await expect(
      createObjectDefinition({ ...baseParams, apiName: '' }),
    ).rejects.toMatchObject({
      message: 'api_name is required',
      code: 'VALIDATION_ERROR',
    });
  });

  it('throws VALIDATION_ERROR for empty label', async () => {
    await expect(
      createObjectDefinition({ ...baseParams, label: '' }),
    ).rejects.toMatchObject({
      message: 'label is required',
      code: 'VALIDATION_ERROR',
    });
  });

  it('throws VALIDATION_ERROR for empty pluralLabel', async () => {
    await expect(
      createObjectDefinition({ ...baseParams, pluralLabel: '' }),
    ).rejects.toMatchObject({
      message: 'plural_label is required',
      code: 'VALIDATION_ERROR',
    });
  });

  it('throws CONFLICT when api_name already exists', async () => {
    await createObjectDefinition(baseParams);

    await expect(
      createObjectDefinition(baseParams),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('sets optional description and icon', async () => {
    const result = await createObjectDefinition({
      ...baseParams,
      description: 'A custom project object',
      icon: 'folder',
    });

    expect(result.description).toBe('A custom project object');
    expect(result.icon).toBe('folder');
  });

  it('auto-creates default permissions for all four roles', async () => {
    const result = await createObjectDefinition(baseParams);

    const objectPerms = [...fakePermissions.values()].filter(
      (p) => p.object_id === result.id,
    );
    expect(objectPerms).toHaveLength(4);

    const roles = objectPerms.map((p) => p.role).sort();
    expect(roles).toEqual(['admin', 'manager', 'read_only', 'user']);

    const adminPerm = objectPerms.find((p) => p.role === 'admin')!;
    expect(adminPerm.can_create).toBe(true);
    expect(adminPerm.can_read).toBe(true);
    expect(adminPerm.can_update).toBe(true);
    expect(adminPerm.can_delete).toBe(true);

    const readOnlyPerm = objectPerms.find((p) => p.role === 'read_only')!;
    expect(readOnlyPerm.can_create).toBe(false);
    expect(readOnlyPerm.can_read).toBe(true);
    expect(readOnlyPerm.can_update).toBe(false);
    expect(readOnlyPerm.can_delete).toBe(false);
  });

  it('wraps creation in a transaction', async () => {
    await createObjectDefinition(baseParams);

    // Verify that pool.connect was called (transaction path)
    expect(mockConnect).toHaveBeenCalled();

    // Verify BEGIN and COMMIT were issued on the client
    const calls = mockQuery.mock.calls.map(([sql]: [string, unknown[]?]) =>
      sql.replace(/\s+/g, ' ').trim().toUpperCase(),
    );
    expect(calls).toContain('BEGIN');
    expect(calls).toContain('COMMIT');
  });
});

// ─── listObjectDefinitions ───────────────────────────────────────────────────

describe('listObjectDefinitions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakeObjects.clear();
    fakeFields.clear();
    fakeRecords.clear();
    fakeRelationships.clear();
    fakeLayouts.clear();
    fakePermissions.clear();
  });

  it('returns empty array when no objects exist', async () => {
    const result = await listObjectDefinitions();
    expect(result).toEqual([]);
  });

  it('returns objects with field and record counts', async () => {
    await createObjectDefinition({
      apiName: 'custom_one',
      label: 'Custom One',
      pluralLabel: 'Custom Ones',
      ownerId: 'user-123',
    });

    const result = await listObjectDefinitions();

    expect(result).toHaveLength(1);
    expect(result[0].apiName).toBe('custom_one');
    expect(result[0].fieldCount).toBe(0);
    expect(result[0].recordCount).toBe(0);
  });
});

// ─── getObjectDefinitionById ────────────────────────────────────────────────

describe('getObjectDefinitionById', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakeObjects.clear();
    fakeFields.clear();
    fakeRecords.clear();
    fakeRelationships.clear();
    fakeLayouts.clear();
    fakePermissions.clear();
  });

  it('returns the object with nested fields, relationships, and layouts', async () => {
    const created = await createObjectDefinition({
      apiName: 'custom_two',
      label: 'Custom Two',
      pluralLabel: 'Custom Twos',
      ownerId: 'user-123',
    });

    const result = await getObjectDefinitionById(created.id);

    expect(result).not.toBeNull();
    expect(result!.apiName).toBe('custom_two');
    expect(result!.fields).toEqual([]);
    expect(result!.relationships).toEqual([]);
    expect(result!.layouts).toHaveLength(2);
  });

  it('returns null when the object does not exist', async () => {
    const result = await getObjectDefinitionById('missing-id');
    expect(result).toBeNull();
  });
});

// ─── updateObjectDefinition ─────────────────────────────────────────────────

describe('updateObjectDefinition', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakeObjects.clear();
    fakeFields.clear();
    fakeRecords.clear();
    fakeRelationships.clear();
    fakeLayouts.clear();
    fakePermissions.clear();
  });

  it('returns the updated object definition', async () => {
    const created = await createObjectDefinition({
      apiName: 'custom_three',
      label: 'Custom Three',
      pluralLabel: 'Custom Threes',
      ownerId: 'user-123',
    });

    const result = await updateObjectDefinition(created.id, { label: 'Updated Label' });

    expect(result).toBeDefined();
  });

  it('throws NOT_FOUND when the object does not exist', async () => {
    await expect(
      updateObjectDefinition('missing-id', { label: 'Updated' }),
    ).rejects.toMatchObject({
      message: 'Object definition not found',
      code: 'NOT_FOUND',
    });
  });

  it('throws VALIDATION_ERROR when label is empty', async () => {
    const created = await createObjectDefinition({
      apiName: 'custom_four',
      label: 'Custom Four',
      pluralLabel: 'Custom Fours',
      ownerId: 'user-123',
    });

    await expect(
      updateObjectDefinition(created.id, { label: '' }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('returns unchanged object when no params are provided', async () => {
    const created = await createObjectDefinition({
      apiName: 'custom_five',
      label: 'Custom Five',
      pluralLabel: 'Custom Fives',
      ownerId: 'user-123',
    });

    const result = await updateObjectDefinition(created.id, {});

    expect(result.apiName).toBe('custom_five');
  });
});

// ─── deleteObjectDefinition ─────────────────────────────────────────────────

describe('deleteObjectDefinition', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakeObjects.clear();
    fakeFields.clear();
    fakeRecords.clear();
    fakeRelationships.clear();
    fakeLayouts.clear();
    fakePermissions.clear();
  });

  it('deletes the object successfully', async () => {
    const created = await createObjectDefinition({
      apiName: 'custom_six',
      label: 'Custom Six',
      pluralLabel: 'Custom Sixes',
      ownerId: 'user-123',
    });

    await expect(deleteObjectDefinition(created.id)).resolves.toBeUndefined();
  });

  it('throws NOT_FOUND when the object does not exist', async () => {
    await expect(
      deleteObjectDefinition('missing-id'),
    ).rejects.toMatchObject({
      message: 'Object definition not found',
      code: 'NOT_FOUND',
    });
  });

  it('throws DELETE_BLOCKED when the object is a system object', async () => {
    // Manually insert a system object
    const id = 'system-obj-id';
    fakeObjects.set(id, {
      id,
      api_name: 'account',
      label: 'Account',
      plural_label: 'Accounts',
      description: null,
      icon: null,
      is_system: true,
      owner_id: 'SYSTEM',
      created_at: new Date(),
      updated_at: new Date(),
    });

    await expect(
      deleteObjectDefinition(id),
    ).rejects.toMatchObject({
      message: 'Cannot delete system objects',
      code: 'DELETE_BLOCKED',
    });
  });

  it('throws DELETE_BLOCKED when records exist for the object', async () => {
    const created = await createObjectDefinition({
      apiName: 'custom_seven',
      label: 'Custom Seven',
      pluralLabel: 'Custom Sevens',
      ownerId: 'user-123',
    });

    // Simulate a record existing for this object
    fakeRecords.set('record-1', {
      id: 'record-1',
      object_id: created.id,
      name: 'Test Record',
      field_values: {},
      owner_id: 'user-123',
      created_at: new Date(),
      updated_at: new Date(),
    });

    await expect(
      deleteObjectDefinition(created.id),
    ).rejects.toMatchObject({
      message: 'Delete all records first',
      code: 'DELETE_BLOCKED',
    });
  });

  it('cascades permission deletion when object is deleted', async () => {
    const created = await createObjectDefinition({
      apiName: 'custom_eight',
      label: 'Custom Eight',
      pluralLabel: 'Custom Eights',
      ownerId: 'user-123',
    });

    // Verify permissions were created
    const permsBefore = [...fakePermissions.values()].filter(
      (p) => p.object_id === created.id,
    );
    expect(permsBefore).toHaveLength(4);

    await deleteObjectDefinition(created.id);

    // Verify permissions were cleaned up (simulating ON DELETE CASCADE)
    const permsAfter = [...fakePermissions.values()].filter(
      (p) => p.object_id === created.id,
    );
    expect(permsAfter).toHaveLength(0);
  });
});
