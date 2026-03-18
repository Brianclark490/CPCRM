import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createRelationshipDefinition,
  listRelationshipDefinitions,
  deleteRelationshipDefinition,
  validateRelationshipApiName,
  validateRelationshipLabel,
  validateRelationshipType,
} from '../relationshipDefinitionService.js';

const TENANT_ID = 'test-tenant-001';

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ─── Fake DB pool ─────────────────────────────────────────────────────────────

const { fakeObjects, fakeRelationships, mockQuery } = vi.hoisted(() => {
  const fakeObjects = new Map<string, Record<string, unknown>>();
  const fakeRelationships = new Map<string, Record<string, unknown>>();

  const mockQuery = vi.fn(async (sql: string, params?: unknown[]) => {
    const s = sql.replace(/\s+/g, ' ').trim().toUpperCase();

    // SELECT id FROM object_definitions WHERE id = $1
    if (s.startsWith('SELECT ID FROM OBJECT_DEFINITIONS WHERE ID')) {
      const id = params![0] as string;
      const row = fakeObjects.get(id);
      if (row) return { rows: [{ id: row.id }] };
      return { rows: [] };
    }

    // SELECT id FROM relationship_definitions WHERE source_object_id = $1 AND api_name = $2
    if (s.startsWith('SELECT ID FROM RELATIONSHIP_DEFINITIONS WHERE SOURCE_OBJECT_ID') && s.includes('API_NAME')) {
      const sourceObjectId = params![0] as string;
      const apiName = params![1] as string;
      const match = [...fakeRelationships.values()].find(
        (r) => r.source_object_id === sourceObjectId && r.api_name === apiName,
      );
      if (match) return { rows: [{ id: match.id }] };
      return { rows: [] };
    }

    // INSERT INTO relationship_definitions
    if (s.startsWith('INSERT INTO RELATIONSHIP_DEFINITIONS')) {
      const [id, source_object_id, target_object_id, relationship_type, api_name, label, reverse_label, required, created_at] = params as unknown[];
      const row: Record<string, unknown> = {
        id, source_object_id, target_object_id, relationship_type, api_name, label, reverse_label, required, created_at,
      };
      fakeRelationships.set(id as string, row);
      return { rows: [row] };
    }

    // SELECT rd.*, src.label ... (list relationships with joins)
    if (s.includes('FROM RELATIONSHIP_DEFINITIONS RD') && s.includes('JOIN OBJECT_DEFINITIONS SRC') && s.includes('JOIN OBJECT_DEFINITIONS TGT') && s.includes('WHERE RD.SOURCE_OBJECT_ID = $1 OR RD.TARGET_OBJECT_ID = $1')) {
      const objectId = params![0] as string;
      const rows = [...fakeRelationships.values()]
        .filter((r) => r.source_object_id === objectId || r.target_object_id === objectId)
        .map((r) => {
          const src = fakeObjects.get(r.source_object_id as string);
          const tgt = fakeObjects.get(r.target_object_id as string);
          return {
            ...r,
            source_object_api_name: src?.api_name ?? '',
            source_object_label: src?.label ?? '',
            source_object_plural_label: src?.plural_label ?? '',
            target_object_api_name: tgt?.api_name ?? '',
            target_object_label: tgt?.label ?? '',
            target_object_plural_label: tgt?.plural_label ?? '',
          };
        });
      return { rows };
    }

    // SELECT rd.*, src.is_system ... (delete check with system flag)
    if (s.includes('FROM RELATIONSHIP_DEFINITIONS RD') && s.includes('JOIN OBJECT_DEFINITIONS SRC') && s.includes('JOIN OBJECT_DEFINITIONS TGT') && s.includes('WHERE RD.ID = $1')) {
      const id = params![0] as string;
      const rel = fakeRelationships.get(id);
      if (!rel) return { rows: [] };
      const src = fakeObjects.get(rel.source_object_id as string);
      const tgt = fakeObjects.get(rel.target_object_id as string);
      return {
        rows: [{
          ...rel,
          source_is_system: src?.is_system ?? false,
          target_is_system: tgt?.is_system ?? false,
        }],
      };
    }

    // DELETE FROM relationship_definitions WHERE id = $1
    if (s.startsWith('DELETE FROM RELATIONSHIP_DEFINITIONS WHERE ID')) {
      const id = params![0] as string;
      const existed = fakeRelationships.has(id);
      fakeRelationships.delete(id);
      return { rowCount: existed ? 1 : 0 };
    }

    return { rows: [] };
  });

  return { fakeObjects, fakeRelationships, mockQuery };
});

vi.mock('../../db/client.js', () => ({
  pool: { query: mockQuery },
}));

// ─── Test helpers ────────────────────────────────────────────────────────────

function seedObjects() {
  fakeObjects.set('obj-account', {
    id: 'obj-account',
    api_name: 'account',
    label: 'Account',
    plural_label: 'Accounts',
    is_system: true,
    owner_id: 'SYSTEM',
  });
  fakeObjects.set('obj-opportunity', {
    id: 'obj-opportunity',
    api_name: 'opportunity',
    label: 'Opportunity',
    plural_label: 'Opportunities',
    is_system: true,
    owner_id: 'SYSTEM',
  });
  fakeObjects.set('obj-custom', {
    id: 'obj-custom',
    api_name: 'custom_project',
    label: 'Custom Project',
    plural_label: 'Custom Projects',
    is_system: false,
    owner_id: 'user-123',
  });
  fakeObjects.set('obj-custom-2', {
    id: 'obj-custom-2',
    api_name: 'custom_task',
    label: 'Custom Task',
    plural_label: 'Custom Tasks',
    is_system: false,
    owner_id: 'user-123',
  });
}

// ─── Validation tests ─────────────────────────────────────────────────────────

describe('validateRelationshipApiName', () => {
  it('returns null for a valid snake_case name', () => {
    expect(validateRelationshipApiName('opportunity_account')).toBeNull();
  });

  it('returns an error for empty string', () => {
    expect(validateRelationshipApiName('')).toBe('api_name is required');
  });

  it('returns an error for names shorter than 3 chars', () => {
    expect(validateRelationshipApiName('ab')).toBe('api_name must be between 3 and 100 characters');
  });

  it('returns an error for uppercase characters', () => {
    expect(validateRelationshipApiName('Opportunity_Account')).toBe(
      'api_name must be lowercase snake_case (e.g. "opportunity_account")',
    );
  });
});

describe('validateRelationshipLabel', () => {
  it('returns null for a valid label', () => {
    expect(validateRelationshipLabel('Account')).toBeNull();
  });

  it('returns an error for empty string', () => {
    expect(validateRelationshipLabel('')).toBe('label is required');
  });

  it('returns an error for labels exceeding 255 characters', () => {
    expect(validateRelationshipLabel('a'.repeat(256))).toBe('label must be 255 characters or fewer');
  });
});

describe('validateRelationshipType', () => {
  it('returns null for lookup', () => {
    expect(validateRelationshipType('lookup')).toBeNull();
  });

  it('returns null for parent_child', () => {
    expect(validateRelationshipType('parent_child')).toBeNull();
  });

  it('returns an error for empty string', () => {
    expect(validateRelationshipType('')).toBe('relationship_type is required');
  });

  it('returns an error for invalid type', () => {
    expect(validateRelationshipType('many_to_many')).toBe(
      'relationship_type must be one of: lookup, parent_child',
    );
  });
});

// ─── createRelationshipDefinition ────────────────────────────────────────────

describe('createRelationshipDefinition', () => {
  const baseParams = {
    sourceObjectId: 'obj-custom',
    targetObjectId: 'obj-account',
    relationshipType: 'lookup',
    apiName: 'project_account',
    label: 'Account',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    fakeObjects.clear();
    fakeRelationships.clear();
    seedObjects();
  });

  it('creates a lookup relationship', async () => {
    const result = await createRelationshipDefinition(TENANT_ID, baseParams);

    expect(result.sourceObjectId).toBe('obj-custom');
    expect(result.targetObjectId).toBe('obj-account');
    expect(result.relationshipType).toBe('lookup');
    expect(result.apiName).toBe('project_account');
    expect(result.label).toBe('Account');
    expect(result.required).toBe(false);
  });

  it('creates a parent_child relationship', async () => {
    const result = await createRelationshipDefinition(TENANT_ID, {
      ...baseParams,
      relationshipType: 'parent_child',
    });

    expect(result.relationshipType).toBe('parent_child');
  });

  it('sets optional reverse_label and required', async () => {
    const result = await createRelationshipDefinition(TENANT_ID, {
      ...baseParams,
      reverseLabel: 'Projects',
      required: true,
    });

    expect(result.reverseLabel).toBe('Projects');
    expect(result.required).toBe(true);
  });

  it('creates with a UUID id', async () => {
    const result = await createRelationshipDefinition(TENANT_ID, baseParams);

    expect(result.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('throws VALIDATION_ERROR for missing source_object_id', async () => {
    await expect(
      createRelationshipDefinition(TENANT_ID, { ...baseParams, sourceObjectId: '' }),
    ).rejects.toMatchObject({
      message: 'source_object_id is required',
      code: 'VALIDATION_ERROR',
    });
  });

  it('throws VALIDATION_ERROR for missing target_object_id', async () => {
    await expect(
      createRelationshipDefinition(TENANT_ID, { ...baseParams, targetObjectId: '' }),
    ).rejects.toMatchObject({
      message: 'target_object_id is required',
      code: 'VALIDATION_ERROR',
    });
  });

  it('throws VALIDATION_ERROR for invalid api_name', async () => {
    await expect(
      createRelationshipDefinition(TENANT_ID, { ...baseParams, apiName: '' }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('throws VALIDATION_ERROR for empty label', async () => {
    await expect(
      createRelationshipDefinition(TENANT_ID, { ...baseParams, label: '' }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('throws VALIDATION_ERROR for invalid relationship_type', async () => {
    await expect(
      createRelationshipDefinition(TENANT_ID, { ...baseParams, relationshipType: 'many_to_many' }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('throws NOT_FOUND when source object does not exist', async () => {
    await expect(
      createRelationshipDefinition(TENANT_ID, { ...baseParams, sourceObjectId: 'missing-obj' }),
    ).rejects.toMatchObject({
      message: 'Source object definition not found',
      code: 'NOT_FOUND',
    });
  });

  it('throws NOT_FOUND when target object does not exist', async () => {
    await expect(
      createRelationshipDefinition(TENANT_ID, { ...baseParams, targetObjectId: 'missing-obj' }),
    ).rejects.toMatchObject({
      message: 'Target object definition not found',
      code: 'NOT_FOUND',
    });
  });

  it('throws CONFLICT when api_name already exists on source object', async () => {
    await createRelationshipDefinition(TENANT_ID, baseParams);

    await expect(
      createRelationshipDefinition(TENANT_ID, baseParams),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });
});

// ─── listRelationshipDefinitions ─────────────────────────────────────────────

describe('listRelationshipDefinitions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakeObjects.clear();
    fakeRelationships.clear();
    seedObjects();
  });

  it('returns empty array when no relationships exist', async () => {
    const result = await listRelationshipDefinitions(TENANT_ID, 'obj-custom');
    expect(result).toEqual([]);
  });

  it('returns relationships where object is the source', async () => {
    await createRelationshipDefinition(TENANT_ID, {
      sourceObjectId: 'obj-custom',
      targetObjectId: 'obj-account',
      relationshipType: 'lookup',
      apiName: 'project_account',
      label: 'Account',
    });

    const result = await listRelationshipDefinitions(TENANT_ID, 'obj-custom');

    expect(result).toHaveLength(1);
    expect(result[0].apiName).toBe('project_account');
    expect(result[0].targetObjectApiName).toBe('account');
    expect(result[0].targetObjectLabel).toBe('Account');
    expect(result[0].targetObjectPluralLabel).toBe('Accounts');
  });

  it('returns relationships where object is the target', async () => {
    await createRelationshipDefinition(TENANT_ID, {
      sourceObjectId: 'obj-custom',
      targetObjectId: 'obj-account',
      relationshipType: 'lookup',
      apiName: 'project_account',
      label: 'Account',
    });

    const result = await listRelationshipDefinitions(TENANT_ID, 'obj-account');

    expect(result).toHaveLength(1);
    expect(result[0].sourceObjectApiName).toBe('custom_project');
    expect(result[0].sourceObjectLabel).toBe('Custom Project');
    expect(result[0].sourceObjectPluralLabel).toBe('Custom Projects');
  });

  it('includes source and target object metadata', async () => {
    await createRelationshipDefinition(TENANT_ID, {
      sourceObjectId: 'obj-custom',
      targetObjectId: 'obj-account',
      relationshipType: 'lookup',
      apiName: 'project_account',
      label: 'Account',
      reverseLabel: 'Projects',
    });

    const result = await listRelationshipDefinitions(TENANT_ID, 'obj-custom');

    expect(result[0]).toHaveProperty('sourceObjectApiName');
    expect(result[0]).toHaveProperty('sourceObjectLabel');
    expect(result[0]).toHaveProperty('sourceObjectPluralLabel');
    expect(result[0]).toHaveProperty('targetObjectApiName');
    expect(result[0]).toHaveProperty('targetObjectLabel');
    expect(result[0]).toHaveProperty('targetObjectPluralLabel');
  });

  it('throws NOT_FOUND when object does not exist', async () => {
    await expect(
      listRelationshipDefinitions(TENANT_ID, 'missing-obj'),
    ).rejects.toMatchObject({
      message: 'Object definition not found',
      code: 'NOT_FOUND',
    });
  });
});

// ─── deleteRelationshipDefinition ────────────────────────────────────────────

describe('deleteRelationshipDefinition', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakeObjects.clear();
    fakeRelationships.clear();
    seedObjects();
  });

  it('deletes a custom relationship successfully', async () => {
    const rel = await createRelationshipDefinition(TENANT_ID, {
      sourceObjectId: 'obj-custom',
      targetObjectId: 'obj-account',
      relationshipType: 'lookup',
      apiName: 'project_account',
      label: 'Account',
    });

    await expect(deleteRelationshipDefinition(TENANT_ID, rel.id)).resolves.toBeUndefined();
    expect(fakeRelationships.has(rel.id)).toBe(false);
  });

  it('throws NOT_FOUND when relationship does not exist', async () => {
    await expect(
      deleteRelationshipDefinition(TENANT_ID, 'missing-rel-id'),
    ).rejects.toMatchObject({
      message: 'Relationship definition not found',
      code: 'NOT_FOUND',
    });
  });

  it('throws DELETE_BLOCKED for system relationships (both objects are system)', async () => {
    // Manually create a system relationship (opportunity→account)
    fakeRelationships.set('system-rel', {
      id: 'system-rel',
      source_object_id: 'obj-opportunity',
      target_object_id: 'obj-account',
      relationship_type: 'lookup',
      api_name: 'opportunity_account',
      label: 'Account',
      reverse_label: 'Opportunities',
      required: false,
      created_at: new Date(),
    });

    await expect(
      deleteRelationshipDefinition(TENANT_ID, 'system-rel'),
    ).rejects.toMatchObject({
      message: 'Cannot delete system relationships',
      code: 'DELETE_BLOCKED',
    });
  });

  it('allows deleting a relationship between custom and system objects', async () => {
    const rel = await createRelationshipDefinition(TENANT_ID, {
      sourceObjectId: 'obj-custom',
      targetObjectId: 'obj-opportunity',
      relationshipType: 'lookup',
      apiName: 'project_opportunity',
      label: 'Opportunity',
    });

    await expect(deleteRelationshipDefinition(TENANT_ID, rel.id)).resolves.toBeUndefined();
  });
});
