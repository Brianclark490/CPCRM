import { describe, it, expect, vi, beforeEach } from 'vitest';

const TENANT_ID = 'test-tenant-001';

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ─── Fake DB pool ─────────────────────────────────────────────────────────────

const { fakeRecordRelationships, fakeRecords, fakeRelationshipDefs, mockQuery } = vi.hoisted(() => {
  const fakeRecordRelationships = new Map<string, Record<string, unknown>>();
  const fakeRecords = new Map<string, Record<string, unknown>>();
  const fakeRelationshipDefs = new Map<string, Record<string, unknown>>();

  const mockQuery = vi.fn(async (sql: string, params?: unknown[]) => {
    const s = sql.replace(/\s+/g, ' ').trim().toUpperCase();

    // SELECT id, object_id FROM records WHERE id = $1 AND tenant_id = $2
    if (s.startsWith('SELECT ID, OBJECT_ID FROM RECORDS')) {
      const id = params![0] as string;
      const record = fakeRecords.get(id);
      if (record) {
        return { rows: [record] };
      }
      return { rows: [] };
    }

    // SELECT id FROM records WHERE id = $1 AND tenant_id = $2
    if (s.startsWith('SELECT ID FROM RECORDS')) {
      const id = params![0] as string;
      const record = fakeRecords.get(id);
      if (record) {
        return { rows: [record] };
      }
      return { rows: [] };
    }

    // SELECT * FROM relationship_definitions WHERE id = $1
    if (s.startsWith('SELECT * FROM RELATIONSHIP_DEFINITIONS')) {
      const id = params![0] as string;
      const rel = fakeRelationshipDefs.get(id);
      if (rel) return { rows: [rel] };
      return { rows: [] };
    }

    // SELECT id FROM record_relationships WHERE relationship_id AND source_record_id AND target_record_id (duplicate check)
    if (s.includes('FROM RECORD_RELATIONSHIPS') && s.includes('SOURCE_RECORD_ID = $2') && s.includes('TARGET_RECORD_ID = $3')) {
      const relId = params![0] as string;
      const sourceId = params![1] as string;
      const targetId = params![2] as string;
      for (const rr of fakeRecordRelationships.values()) {
        if (rr.relationship_id === relId && rr.source_record_id === sourceId && rr.target_record_id === targetId) {
          return { rows: [rr] };
        }
      }
      return { rows: [] };
    }

    // SELECT id FROM record_relationships WHERE relationship_id AND source_record_id (parent check)
    if (s.includes('FROM RECORD_RELATIONSHIPS') && s.includes('RELATIONSHIP_ID = $1') && s.includes('SOURCE_RECORD_ID = $2') && !s.includes('TARGET_RECORD_ID')) {
      const relId = params![0] as string;
      const sourceId = params![1] as string;
      const matches = [];
      for (const rr of fakeRecordRelationships.values()) {
        if (rr.relationship_id === relId && rr.source_record_id === sourceId) {
          matches.push(rr);
        }
      }
      return { rows: matches };
    }

    // INSERT INTO record_relationships
    if (s.startsWith('INSERT INTO RECORD_RELATIONSHIPS')) {
      const [id, _tenant_id, relationship_id, source_record_id, target_record_id, created_at] = params as unknown[];
      const row: Record<string, unknown> = {
        id, relationship_id, source_record_id, target_record_id, created_at,
      };
      fakeRecordRelationships.set(id as string, row);
      return { rows: [row] };
    }

    // SELECT id FROM record_relationships WHERE id AND (source OR target)
    if (s.includes('FROM RECORD_RELATIONSHIPS') && s.includes('ID = $1') && s.includes('SOURCE_RECORD_ID = $2 OR TARGET_RECORD_ID = $2')) {
      const id = params![0] as string;
      const recordId = params![1] as string;
      const rr = fakeRecordRelationships.get(id);
      if (rr && (rr.source_record_id === recordId || rr.target_record_id === recordId)) {
        return { rows: [rr] };
      }
      return { rows: [] };
    }

    // DELETE FROM record_relationships WHERE id = $1
    if (s.startsWith('DELETE FROM RECORD_RELATIONSHIPS')) {
      const id = params![0] as string;
      fakeRecordRelationships.delete(id);
      return { rowCount: 1 };
    }

    // SELECT id FROM object_definitions WHERE api_name = $1
    if (s.includes('FROM OBJECT_DEFINITIONS WHERE API_NAME')) {
      const apiName = params![0] as string;
      if (apiName === 'account') {
        return { rows: [{ id: 'obj-account-id' }] };
      }
      if (apiName === 'opportunity') {
        return { rows: [{ id: 'obj-opportunity-id' }] };
      }
      return { rows: [] };
    }

    // COUNT for related records
    if (s.includes('COUNT(*)') && s.includes('RELATED')) {
      return { rows: [{ total: '0' }] };
    }

    // SELECT related records
    if (s.includes('RELATED') && s.includes('LIMIT')) {
      return { rows: [] };
    }

    return { rows: [] };
  });

  return { fakeRecordRelationships, fakeRecords, fakeRelationshipDefs, mockQuery };
});

vi.mock('../../db/client.js', () => ({
  pool: { query: mockQuery },
}));

const { linkRecords, unlinkRecords, getRelatedRecords } = await import(
  '../recordRelationshipService.js'
);

// ─── Tests: linkRecords ─────────────────────────────────────────────────────

describe('linkRecords', () => {
  beforeEach(() => {
    fakeRecordRelationships.clear();
    fakeRecords.clear();
    fakeRelationshipDefs.clear();
    mockQuery.mockClear();
  });

  function seedData() {
    fakeRecords.set('rec-opp-1', {
      id: 'rec-opp-1',
      object_id: 'obj-opportunity-id',
      owner_id: 'user-123',
    });
    fakeRecords.set('rec-acct-1', {
      id: 'rec-acct-1',
      object_id: 'obj-account-id',
      owner_id: 'user-123',
    });
    fakeRelationshipDefs.set('rel-lookup-1', {
      id: 'rel-lookup-1',
      source_object_id: 'obj-opportunity-id',
      target_object_id: 'obj-account-id',
      relationship_type: 'lookup',
      api_name: 'opportunity_account',
      label: 'Account',
    });
    fakeRelationshipDefs.set('rel-parent-1', {
      id: 'rel-parent-1',
      source_object_id: 'obj-opportunity-id',
      target_object_id: 'obj-account-id',
      relationship_type: 'parent_child',
      api_name: 'opportunity_parent_account',
      label: 'Parent Account',
    });
  }

  it('creates a link between two records', async () => {
    seedData();

    const result = await linkRecords(TENANT_ID, 'rec-opp-1', 'rel-lookup-1', 'rec-acct-1', 'user-123');

    expect(result.relationshipId).toBe('rel-lookup-1');
    expect(result.sourceRecordId).toBe('rec-opp-1');
    expect(result.targetRecordId).toBe('rec-acct-1');
    expect(result.id).toBeDefined();
  });

  it('throws NOT_FOUND when source record does not exist', async () => {
    seedData();

    await expect(
      linkRecords(TENANT_ID, 'missing-id', 'rel-lookup-1', 'rec-acct-1', 'user-123'),
    ).rejects.toThrow('Source record not found');
  });

  it('throws NOT_FOUND when target record does not exist', async () => {
    seedData();

    await expect(
      linkRecords(TENANT_ID, 'rec-opp-1', 'rel-lookup-1', 'missing-id', 'user-123'),
    ).rejects.toThrow('Target record not found');
  });

  it('throws NOT_FOUND when relationship definition does not exist', async () => {
    seedData();

    await expect(
      linkRecords(TENANT_ID, 'rec-opp-1', 'missing-rel', 'rec-acct-1', 'user-123'),
    ).rejects.toThrow('Relationship definition not found');
  });

  it('throws VALIDATION_ERROR when source record type does not match', async () => {
    seedData();
    // Set source record to account type (should be opportunity for this relationship)
    fakeRecords.set('rec-opp-1', {
      id: 'rec-opp-1',
      object_id: 'obj-account-id',
      owner_id: 'user-123',
    });

    await expect(
      linkRecords(TENANT_ID, 'rec-opp-1', 'rel-lookup-1', 'rec-acct-1', 'user-123'),
    ).rejects.toThrow('Source record object type does not match relationship source object');
  });

  it('throws VALIDATION_ERROR when target record type does not match', async () => {
    seedData();
    // Set target record to opportunity type (should be account for this relationship)
    fakeRecords.set('rec-acct-1', {
      id: 'rec-acct-1',
      object_id: 'obj-opportunity-id',
      owner_id: 'user-123',
    });

    await expect(
      linkRecords(TENANT_ID, 'rec-opp-1', 'rel-lookup-1', 'rec-acct-1', 'user-123'),
    ).rejects.toThrow('Target record object type does not match relationship target object');
  });

  it('throws CONFLICT when duplicate link exists', async () => {
    seedData();
    fakeRecordRelationships.set('existing-link', {
      id: 'existing-link',
      relationship_id: 'rel-lookup-1',
      source_record_id: 'rec-opp-1',
      target_record_id: 'rec-acct-1',
    });

    await expect(
      linkRecords(TENANT_ID, 'rec-opp-1', 'rel-lookup-1', 'rec-acct-1', 'user-123'),
    ).rejects.toThrow('This relationship link already exists');
  });

  it('allows multiple links for lookup relationships', async () => {
    seedData();
    fakeRecords.set('rec-acct-2', {
      id: 'rec-acct-2',
      object_id: 'obj-account-id',
      owner_id: 'user-123',
    });

    // First link
    await linkRecords(TENANT_ID, 'rec-opp-1', 'rel-lookup-1', 'rec-acct-1', 'user-123');

    // Second link should succeed for lookup
    const result = await linkRecords(TENANT_ID, 'rec-opp-1', 'rel-lookup-1', 'rec-acct-2', 'user-123');
    expect(result.targetRecordId).toBe('rec-acct-2');
  });

  it('throws CONFLICT for parent_child when parent already exists', async () => {
    seedData();
    fakeRecords.set('rec-acct-2', {
      id: 'rec-acct-2',
      object_id: 'obj-account-id',
      owner_id: 'user-123',
    });

    // First parent_child link
    await linkRecords(TENANT_ID, 'rec-opp-1', 'rel-parent-1', 'rec-acct-1', 'user-123');

    // Second parent_child link should fail
    await expect(
      linkRecords(TENANT_ID, 'rec-opp-1', 'rel-parent-1', 'rec-acct-2', 'user-123'),
    ).rejects.toThrow('This record already has a parent for this relationship');
  });

  it('throws VALIDATION_ERROR when relationship_id is empty', async () => {
    await expect(
      linkRecords(TENANT_ID, 'rec-1', '', 'rec-2', 'user-123'),
    ).rejects.toThrow('relationship_id is required');
  });

  it('throws VALIDATION_ERROR when target_record_id is empty', async () => {
    await expect(
      linkRecords(TENANT_ID, 'rec-1', 'rel-1', '', 'user-123'),
    ).rejects.toThrow('target_record_id is required');
  });
});

// ─── Tests: unlinkRecords ───────────────────────────────────────────────────

describe('unlinkRecords', () => {
  beforeEach(() => {
    fakeRecordRelationships.clear();
    fakeRecords.clear();
    mockQuery.mockClear();
  });

  it('removes a record link', async () => {
    fakeRecords.set('rec-1', { id: 'rec-1', owner_id: 'user-123' });
    fakeRecordRelationships.set('link-1', {
      id: 'link-1',
      source_record_id: 'rec-1',
      target_record_id: 'rec-2',
    });

    await expect(unlinkRecords(TENANT_ID, 'rec-1', 'link-1', 'user-123')).resolves.toBeUndefined();
    expect(fakeRecordRelationships.has('link-1')).toBe(false);
  });

  it('throws NOT_FOUND when record does not exist', async () => {
    await expect(
      unlinkRecords(TENANT_ID, 'missing-id', 'link-1', 'user-123'),
    ).rejects.toThrow('Record not found');
  });

  it('throws NOT_FOUND when link does not exist', async () => {
    fakeRecords.set('rec-1', { id: 'rec-1', owner_id: 'user-123' });

    await expect(
      unlinkRecords(TENANT_ID, 'rec-1', 'missing-link', 'user-123'),
    ).rejects.toThrow('Relationship link not found');
  });

  it('throws NOT_FOUND when link does not involve the record', async () => {
    fakeRecords.set('rec-1', { id: 'rec-1', owner_id: 'user-123' });
    fakeRecordRelationships.set('link-1', {
      id: 'link-1',
      source_record_id: 'rec-other',
      target_record_id: 'rec-other-2',
    });

    await expect(
      unlinkRecords(TENANT_ID, 'rec-1', 'link-1', 'user-123'),
    ).rejects.toThrow('Relationship link not found');
  });
});

// ─── Tests: getRelatedRecords ───────────────────────────────────────────────

describe('getRelatedRecords', () => {
  beforeEach(() => {
    fakeRecords.clear();
    mockQuery.mockClear();
  });

  it('throws NOT_FOUND when record does not exist', async () => {
    await expect(
      getRelatedRecords(TENANT_ID, 'missing-id', 'account', 'user-123', 20, 0),
    ).rejects.toThrow('Record not found');
  });

  it('throws NOT_FOUND when object type does not exist', async () => {
    fakeRecords.set('rec-1', { id: 'rec-1', owner_id: 'user-123', object_id: 'obj-1' });

    await expect(
      getRelatedRecords(TENANT_ID, 'rec-1', 'nonexistent', 'user-123', 20, 0),
    ).rejects.toThrow("Object type 'nonexistent' not found");
  });

  it('returns empty result for records with no relationships', async () => {
    fakeRecords.set('rec-1', { id: 'rec-1', owner_id: 'user-123', object_id: 'obj-1' });

    const result = await getRelatedRecords(TENANT_ID, 'rec-1', 'account', 'user-123', 20, 0);

    expect(result.data).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.offset).toBe(0);
    expect(result.limit).toBe(20);
  });
});
