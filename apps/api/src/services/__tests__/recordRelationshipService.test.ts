import { describe, it, expect, vi, beforeEach } from 'vitest';

const TENANT_ID = 'test-tenant-001';

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ─── Fake DB pool ─────────────────────────────────────────────────────────────
//
// Kysely drives the service now, so the mock must be quote-agnostic
// (Kysely emits quoted identifiers) and must route through
// `pool.connect()` in addition to `pool.query()` — PostgresDialect
// acquires a client per query via connect().

const {
  fakeRecordRelationships,
  fakeRecords,
  fakeRelationshipDefs,
  mockQuery,
  mockConnect,
} = vi.hoisted(() => {
  const fakeRecordRelationships = new Map<string, Record<string, unknown>>();
  const fakeRecords = new Map<string, Record<string, unknown>>();
  const fakeRelationshipDefs = new Map<string, Record<string, unknown>>();

  function normalise(sql: string): string {
    return sql.replace(/\s+/g, ' ').replace(/"/g, '').trim().toUpperCase();
  }

  async function handleQuery(rawSql: string, params: unknown[] | undefined) {
    const s = normalise(rawSql);

    // Transaction control + RLS preamble — no-ops for the mock.
    if (s === 'BEGIN' || s === 'COMMIT' || s === 'ROLLBACK') {
      return { rows: [] };
    }
    if (s.startsWith('SELECT SET_CONFIG')) {
      return { rows: [] };
    }

    // getRelatedRecords count + data queries over the UNION subquery
    // aliased `related`. These match before the generic
    // record_relationships matchers below so that the nested
    // `FROM record_relationships as rr` inside the subquery doesn't
    // get mis-routed to the duplicate / parent / unlink handlers.
    if (s.includes('COUNT(*)') && s.includes('AS RELATED')) {
      return { rows: [{ total: '0' }] };
    }
    if (
      s.includes('FROM RELATED') ||
      (s.includes('AS RELATED') && s.includes('LIMIT'))
    ) {
      return { rows: [] };
    }

    // SELECT id, object_id FROM records WHERE id = $1 AND tenant_id = $2
    if (
      s.startsWith('SELECT ID, OBJECT_ID FROM RECORDS') ||
      (s.startsWith('SELECT') &&
        s.includes('FROM RECORDS') &&
        s.includes('OBJECT_ID') &&
        s.includes('WHERE ID =') &&
        !s.includes('AS R') &&
        !s.includes('RECORD_RELATIONSHIPS'))
    ) {
      const id = params![0] as string;
      const record = fakeRecords.get(id);
      if (record) {
        return { rows: [record] };
      }
      return { rows: [] };
    }

    // SELECT id FROM records WHERE id = $1 AND tenant_id = $2
    if (
      s.startsWith('SELECT ID FROM RECORDS') &&
      !s.includes('OBJECT_ID')
    ) {
      const id = params![0] as string;
      const record = fakeRecords.get(id);
      if (record) {
        return { rows: [record] };
      }
      return { rows: [] };
    }

    // SELECT * FROM relationship_definitions WHERE id = $1 AND tenant_id = $2
    if (
      s.startsWith('SELECT') &&
      s.includes('FROM RELATIONSHIP_DEFINITIONS') &&
      s.includes('WHERE ID =')
    ) {
      const id = params![0] as string;
      const rel = fakeRelationshipDefs.get(id);
      if (rel) return { rows: [rel] };
      return { rows: [] };
    }

    // Duplicate check — relationship_id AND source_record_id AND target_record_id AND tenant_id
    if (
      s.includes('FROM RECORD_RELATIONSHIPS') &&
      s.includes('RELATIONSHIP_ID =') &&
      s.includes('SOURCE_RECORD_ID =') &&
      s.includes('TARGET_RECORD_ID =')
    ) {
      const relId = params![0] as string;
      const sourceId = params![1] as string;
      const targetId = params![2] as string;
      for (const rr of fakeRecordRelationships.values()) {
        if (
          rr.relationship_id === relId &&
          rr.source_record_id === sourceId &&
          rr.target_record_id === targetId
        ) {
          return { rows: [rr] };
        }
      }
      return { rows: [] };
    }

    // Parent check — relationship_id AND source_record_id (no target)
    if (
      s.includes('FROM RECORD_RELATIONSHIPS') &&
      s.includes('RELATIONSHIP_ID =') &&
      s.includes('SOURCE_RECORD_ID =') &&
      !s.includes('TARGET_RECORD_ID')
    ) {
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
    // Columns: id, tenant_id, relationship_id, source_record_id, target_record_id, created_at
    if (s.startsWith('INSERT INTO RECORD_RELATIONSHIPS')) {
      const [
        id,
        _tenantId,
        relationship_id,
        source_record_id,
        target_record_id,
        created_at,
      ] = params as unknown[];
      const row: Record<string, unknown> = {
        id,
        tenant_id: _tenantId,
        relationship_id,
        source_record_id,
        target_record_id,
        created_at,
      };
      fakeRecordRelationships.set(id as string, row);
      return { rows: [row] };
    }

    // unlinkRecords lookup: SELECT id FROM record_relationships
    // WHERE id = $1 AND tenant_id = $2 AND (source_record_id = $3 OR target_record_id = $3)
    if (
      s.startsWith('SELECT') &&
      s.includes('FROM RECORD_RELATIONSHIPS') &&
      s.includes('ID =') &&
      s.includes('SOURCE_RECORD_ID =') &&
      s.includes('TARGET_RECORD_ID =')
    ) {
      const id = params![0] as string;
      // params: [id, tenantId, sourceRecordId, sourceRecordId] — Kysely
      // binds the OR branch twice.
      const recordId = params![2] as string;
      const rr = fakeRecordRelationships.get(id);
      if (
        rr &&
        (rr.source_record_id === recordId || rr.target_record_id === recordId)
      ) {
        return { rows: [rr] };
      }
      return { rows: [] };
    }

    // DELETE FROM record_relationships WHERE id = $1 AND tenant_id = $2
    if (s.startsWith('DELETE FROM RECORD_RELATIONSHIPS')) {
      const id = params![0] as string;
      fakeRecordRelationships.delete(id);
      return { rowCount: 1 };
    }

    // SELECT id FROM object_definitions WHERE api_name = $1 AND tenant_id = $2
    if (
      s.startsWith('SELECT') &&
      s.includes('FROM OBJECT_DEFINITIONS') &&
      s.includes('API_NAME =')
    ) {
      const apiName = params![0] as string;
      if (apiName === 'account') {
        return { rows: [{ id: 'obj-account-id' }] };
      }
      if (apiName === 'opportunity') {
        return { rows: [{ id: 'obj-opportunity-id' }] };
      }
      return { rows: [] };
    }

    return { rows: [] };
  }

  const mockQuery = vi.fn(async (sql: string, params?: unknown[]) => {
    const rawSql =
      typeof sql === 'string' ? sql : (sql as { text: string }).text;
    return handleQuery(rawSql, params);
  });

  const mockConnect = vi.fn(async () => ({
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      const rawSql =
        typeof sql === 'string' ? sql : (sql as { text: string }).text;
      return handleQuery(rawSql, params);
    }),
    release: vi.fn(),
  }));

  return {
    fakeRecordRelationships,
    fakeRecords,
    fakeRelationshipDefs,
    mockQuery,
    mockConnect,
  };
});

vi.mock('../../db/client.js', () => ({
  pool: { query: mockQuery, connect: mockConnect },
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
    mockConnect.mockClear();
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
    mockConnect.mockClear();
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
    mockConnect.mockClear();
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
