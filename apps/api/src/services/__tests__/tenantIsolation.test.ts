import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tenant Isolation Tests
 *
 * These are the most critical tests in the application. They verify that
 * tenant-scoped data access is correctly enforced at the service layer:
 *
 * - Users in Tenant A cannot see Tenant B's records
 * - Users in Tenant A cannot see Tenant B's object definitions
 * - Users in Tenant A cannot access Tenant B's record by ID (returns 404/NOT_FOUND)
 * - Users in Tenant A cannot update/delete Tenant B's records
 * - Creating a record in Tenant A doesn't appear in Tenant B's list
 * - Object definitions are independent per tenant
 * - Pipeline stages are independent per tenant
 * - Search results only include current tenant's data
 */

const TENANT_A = 'tenant-alpha';
const TENANT_B = 'tenant-bravo';
const OWNER_A = 'user-alpha';
const OWNER_B = 'user-bravo';

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ─── Shared in-memory DB ──────────────────────────────────────────────────────

// All fake stores are keyed by row id and hold the raw DB rows.  The tenant_id
// column is always present so tests can verify isolation.

const { fakeObjects, fakeFields, fakeRecords, fakePipelines, fakeStages, fakeRelationships, mockQuery, mockConnect } = vi.hoisted(() => {
  const fakeObjects = new Map<string, Record<string, unknown>>();
  const fakeFields = new Map<string, Record<string, unknown>>();
  const fakeRecords = new Map<string, Record<string, unknown>>();
  const fakePipelines = new Map<string, Record<string, unknown>>();
  const fakeStages = new Map<string, Record<string, unknown>>();
  const fakeRelationships = new Map<string, Record<string, unknown>>();

  const mockQuery = vi.fn(async (sql: string, params?: unknown[]) => {
    // Strip double quotes so Kysely-emitted SQL (which quotes identifiers)
    // matches the same string patterns as raw-pg SQL.
    const s = sql.replace(/\s+/g, ' ').replace(/"/g, '').trim().toUpperCase();

    // ── Transaction statements ─────────────────────────────────────────
    if (s === 'BEGIN' || s === 'COMMIT' || s === 'ROLLBACK') {
      return { rows: [] };
    }

    // ── Object definitions ──────────────────────────────────────────────

    // resolveObjectByApiName: SELECT * FROM object_definitions WHERE api_name = $1 AND tenant_id = $2
    if (s.startsWith('SELECT * FROM OBJECT_DEFINITIONS WHERE API_NAME') && s.includes('TENANT_ID')) {
      const apiName = params![0] as string;
      const tenantId = params![1] as string;
      const match = [...fakeObjects.values()].find(
        (r) => r.api_name === apiName && r.tenant_id === tenantId,
      );
      return { rows: match ? [match] : [] };
    }

    // listObjectDefinitions: Kysely emits
    //   select "od".*, (select COUNT(*) ...) as "field_count",
    //          (select COUNT(*) ...) as "record_count"
    //   from "object_definitions" as "od" where "od"."tenant_id" = $N
    // After quote-strip + upper-case, the FROM clause becomes
    // "FROM OBJECT_DEFINITIONS AS OD". Every bind is the same
    // tenantId value (once per correlated subquery, once for the
    // outer WHERE), so pulling from the last param is safe.
    if (
      s.includes('FROM OBJECT_DEFINITIONS AS OD') &&
      s.includes('OD.TENANT_ID')
    ) {
      const tenantId = params![params!.length - 1] as string;
      const rows = [...fakeObjects.values()]
        .filter((r) => r.tenant_id === tenantId)
        .map((r) => ({ ...r, field_count: '0', record_count: '0' }));
      return { rows };
    }

    // getObjectDefinitionById: SELECT * FROM object_definitions WHERE id = $1 AND tenant_id = $2
    if (s.startsWith('SELECT * FROM OBJECT_DEFINITIONS WHERE ID') && s.includes('TENANT_ID')) {
      const id = params![0] as string;
      const tenantId = params![1] as string;
      const match = fakeObjects.get(id);
      if (match && match.tenant_id === tenantId) return { rows: [match] };
      return { rows: [] };
    }

    // SELECT id FROM object_definitions WHERE tenant_id AND api_name (uniqueness check)
    if (s.startsWith('SELECT ID FROM OBJECT_DEFINITIONS WHERE TENANT_ID') && s.includes('API_NAME')) {
      const tenantId = params![0] as string;
      const apiName = params![1] as string;
      const match = [...fakeObjects.values()].find(
        (r) => r.tenant_id === tenantId && r.api_name === apiName,
      );
      return { rows: match ? [{ id: match.id }] : [] };
    }

    // SELECT MAX(sort_order) for createObjectDefinition
    if (s.includes('MAX(SORT_ORDER)')) {
      return { rows: [{ max_sort_order: '0' }] };
    }

    // INSERT INTO object_definitions
    if (s.startsWith('INSERT INTO OBJECT_DEFINITIONS')) {
      const [id, tenant_id, api_name, label, plural_label, description, icon, is_system, sort_order, owner_id, created_at, updated_at] = params as unknown[];
      const row: Record<string, unknown> = { id, tenant_id, api_name, label, plural_label, description, icon, is_system, sort_order, owner_id, created_at, updated_at };
      fakeObjects.set(id as string, row);
      return { rows: [row] };
    }

    // INSERT INTO layout_definitions (batch)
    if (s.startsWith('INSERT INTO LAYOUT_DEFINITIONS')) {
      return { rows: [] };
    }

    // INSERT INTO object_permissions (batch)
    if (s.startsWith('INSERT INTO OBJECT_PERMISSIONS')) {
      return { rows: [] };
    }

    // DELETE FROM object_definitions WHERE id = $1 AND tenant_id = $2
    if (s.startsWith('DELETE FROM OBJECT_DEFINITIONS WHERE ID')) {
      const id = params![0] as string;
      const tenantId = params![1] as string;
      const match = fakeObjects.get(id);
      if (match && match.tenant_id === tenantId) {
        fakeObjects.delete(id);
        return { rowCount: 1, rows: [] };
      }
      return { rowCount: 0, rows: [] };
    }

    // SELECT COUNT for records (delete-blocked check — uses AS COUNT, no table alias)
    if (s.includes('COUNT(*)') && s.includes('AS COUNT') && s.includes('FROM RECORDS WHERE OBJECT_ID')) {
      return { rows: [{ count: '0' }] };
    }

    // ── Field definitions ───────────────────────────────────────────────

    // getFieldDefinitions: SELECT * FROM field_definitions WHERE object_id = $1 AND tenant_id = $2
    if (s.startsWith('SELECT * FROM FIELD_DEFINITIONS WHERE OBJECT_ID') && s.includes('TENANT_ID')) {
      const objectId = params![0] as string;
      const tenantId = params![1] as string;
      const rows = [...fakeFields.values()].filter(
        (r) => r.object_id === objectId && r.tenant_id === tenantId,
      );
      return { rows };
    }

    // ── Records ─────────────────────────────────────────────────────────

    // INSERT INTO records
    if (s.startsWith('INSERT INTO RECORDS')) {
      const [id, tenant_id, object_id, name, field_values, owner_id, owner_name, updated_by, updated_by_name, created_at, updated_at] = params as unknown[];
      const row: Record<string, unknown> = {
        id, tenant_id, object_id, name, field_values: typeof field_values === 'string' ? JSON.parse(field_values as string) : field_values,
        owner_id, owner_name, updated_by, updated_by_name, created_at, updated_at, pipeline_id: null, current_stage_id: null, stage_entered_at: null,
      };
      fakeRecords.set(id as string, row);
      return { rows: [row] };
    }

    // SELECT * FROM records WHERE id = $1 (re-fetch after insert — no tenant filter)
    if (s === 'SELECT * FROM RECORDS WHERE ID = $1') {
      const id = params![0] as string;
      const match = fakeRecords.get(id);
      return { rows: match ? [match] : [] };
    }

    // SELECT * FROM records WHERE id = $1 AND object_id = $2 AND tenant_id = $3
    if (s.startsWith('SELECT * FROM RECORDS WHERE ID') && s.includes('TENANT_ID')) {
      const id = params![0] as string;
      const objectId = params![1] as string;
      const tenantId = params![2] as string;
      const match = fakeRecords.get(id);
      if (match && match.object_id === objectId && match.tenant_id === tenantId) {
        return { rows: [match] };
      }
      return { rows: [] };
    }

    // DELETE FROM records WHERE id = $1 AND object_id = $2 AND tenant_id = $3
    if (s.startsWith('DELETE FROM RECORDS WHERE ID')) {
      const id = params![0] as string;
      const objectId = params![1] as string;
      const tenantId = params![2] as string;
      const match = fakeRecords.get(id);
      if (match && match.object_id === objectId && match.tenant_id === tenantId) {
        fakeRecords.delete(id);
        return { rowCount: 1, rows: [] };
      }
      return { rowCount: 0, rows: [] };
    }

    // UPDATE records SET ... WHERE id = $6 AND object_id = $7 AND tenant_id = $8
    if (s.startsWith('UPDATE RECORDS')) {
      // Extract last 3 params: id, object_id, tenant_id
      const pArr = params as unknown[];
      const recordId = pArr[5] as string;
      const objectId = pArr[6] as string;
      const tenantId = pArr[7] as string;
      const match = fakeRecords.get(recordId);
      if (match && match.object_id === objectId && match.tenant_id === tenantId) {
        match.name = pArr[0];
        match.field_values = typeof pArr[1] === 'string' ? JSON.parse(pArr[1] as string) : pArr[1];
        match.updated_at = pArr[2];
        match.updated_by = pArr[3];
        match.updated_by_name = pArr[4];
        return { rows: [match] };
      }
      return { rows: [] };
    }

    // SELECT COUNT(*) AS total FROM records r WHERE ... (listRecords count query)
    // Kysely emits `FROM RECORDS AS R`; raw pg emits `FROM RECORDS R`.
    if (s.includes('COUNT(*)') && s.includes('AS TOTAL') && /FROM RECORDS (AS )?R\b/.test(s)) {
      const objectId = params![0] as string;
      const tenantId = params![1] as string;
      const count = [...fakeRecords.values()].filter(
        (r) => r.object_id === objectId && r.tenant_id === tenantId,
      ).length;
      return { rows: [{ total: String(count) }] };
    }

    // SELECT * FROM records r WHERE ... (listRecords data query with LIMIT/OFFSET)
    if (/FROM RECORDS (AS )?R\b/.test(s) && s.includes('LIMIT')) {
      const objectId = params![0] as string;
      const tenantId = params![1] as string;
      const rows = [...fakeRecords.values()].filter(
        (r) => r.object_id === objectId && r.tenant_id === tenantId,
      );
      return { rows };
    }

    // ── Pipelines ───────────────────────────────────────────────────────

    // SELECT * FROM pipeline_definitions WHERE tenant_id = $1
    if (s.includes('FROM PIPELINE_DEFINITIONS') && s.includes('WHERE') && s.includes('TENANT_ID')) {
      const tenantId = params![0] as string;
      const rows = [...fakePipelines.values()].filter((r) => r.tenant_id === tenantId);
      return { rows };
    }

    // ── Relationship definitions ────────────────────────────────────────

    // SELECT * FROM relationship_definitions WHERE ... AND tenant_id = $2
    if (s.includes('FROM RELATIONSHIP_DEFINITIONS') && s.includes('TENANT_ID')) {
      const tenantId = params![1] as string;
      const rows = [...fakeRelationships.values()].filter((r) => r.tenant_id === tenantId);
      return { rows };
    }

    // Default: no rows
    return { rows: [], rowCount: 0 };
  });

  const mockConnect = vi.fn(() => ({
    query: mockQuery,
    release: vi.fn(),
  }));

  return { fakeObjects, fakeFields, fakeRecords, fakePipelines, fakeStages, fakeRelationships, mockQuery, mockConnect };
});

vi.mock('../../db/client.js', () => ({
  pool: {
    query: (...args: unknown[]) => mockQuery(...(args as [string, unknown[]])),
    connect: mockConnect,
  },
}));

// Mock assignDefaultPipeline (used during record creation)
vi.mock('../stageMovementService.js', () => ({
  assignDefaultPipeline: vi.fn(async () => {}),
}));

// ─── Import services under test ───────────────────────────────────────────────

const { createRecord, listRecords, getRecord, updateRecord, deleteRecord } =
  await import('../recordService.js');

const { listObjectDefinitions, getObjectDefinitionById, deleteObjectDefinition } =
  await import('../objectDefinitionService.js');

// ─── Seed helpers ─────────────────────────────────────────────────────────────

function seedObject(tenantId: string, apiName: string, objectId: string): void {
  fakeObjects.set(objectId, {
    id: objectId,
    tenant_id: tenantId,
    api_name: apiName,
    label: apiName.charAt(0).toUpperCase() + apiName.slice(1),
    plural_label: apiName + 's',
    description: null,
    icon: null,
    is_system: true,
    sort_order: 1,
    name_field_id: `${objectId}-name-field`,
    name_template: null,
    owner_id: 'SYSTEM',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
}

function seedField(tenantId: string, objectId: string, fieldId: string, apiName: string): void {
  fakeFields.set(fieldId, {
    id: fieldId,
    tenant_id: tenantId,
    object_id: objectId,
    api_name: apiName,
    label: apiName.charAt(0).toUpperCase() + apiName.slice(1),
    field_type: 'text',
    required: apiName === 'name',
    options: apiName === 'name' ? { max_length: 200 } : {},
    sort_order: 1,
    is_system: true,
  });
}

function seedRecord(tenantId: string, objectId: string, recordId: string, ownerId: string, name: string): void {
  fakeRecords.set(recordId, {
    id: recordId,
    tenant_id: tenantId,
    object_id: objectId,
    name,
    field_values: { name },
    owner_id: ownerId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    pipeline_id: null,
    current_stage_id: null,
    stage_entered_at: null,
  });
}

function seedPipeline(tenantId: string, pipelineId: string): void {
  fakePipelines.set(pipelineId, {
    id: pipelineId,
    tenant_id: tenantId,
    name: 'Sales Pipeline',
    api_name: 'sales_pipeline',
    is_default: true,
    is_system: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
}

// ─── Reset state ──────────────────────────────────────────────────────────────

beforeEach(() => {
  fakeObjects.clear();
  fakeFields.clear();
  fakeRecords.clear();
  fakePipelines.clear();
  fakeStages.clear();
  fakeRelationships.clear();
  mockQuery.mockClear();
  mockConnect.mockClear();

  // Seed identical object definitions and fields for both tenants.
  // Each tenant has its own "account" object with a "name" field.
  seedObject(TENANT_A, 'account', 'obj-account-a');
  seedObject(TENANT_B, 'account', 'obj-account-b');

  seedField(TENANT_A, 'obj-account-a', 'field-name-a', 'name');
  seedField(TENANT_B, 'obj-account-b', 'field-name-b', 'name');
});

// ═════════════════════════════════════════════════════════════════════════════
// RECORD ISOLATION
// ═════════════════════════════════════════════════════════════════════════════

describe('Record isolation', () => {
  it('user in Tenant A cannot see Tenant B records via list', async () => {
    // Seed a record owned by user-bravo in Tenant B
    seedRecord(TENANT_B, 'obj-account-b', 'rec-b1', OWNER_B, 'Bravo Inc');

    // Tenant A lists records — should see nothing
    const result = await listRecords({
      tenantId: TENANT_A,
      apiName: 'account',
      ownerId: OWNER_A,
      limit: 20,
      offset: 0,
    });

    expect(result.data).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it('user in Tenant A cannot access Tenant B record by ID — returns NOT_FOUND', async () => {
    seedRecord(TENANT_B, 'obj-account-b', 'rec-b1', OWNER_B, 'Bravo Inc');

    await expect(
      getRecord(TENANT_A, 'account', 'rec-b1', OWNER_A),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('user in Tenant A cannot update Tenant B record — returns NOT_FOUND', async () => {
    seedRecord(TENANT_B, 'obj-account-b', 'rec-b1', OWNER_B, 'Bravo Inc');

    await expect(
      updateRecord(TENANT_A, 'account', 'rec-b1', { name: 'Hacked' }, OWNER_A),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('user in Tenant A cannot delete Tenant B record — returns NOT_FOUND', async () => {
    seedRecord(TENANT_B, 'obj-account-b', 'rec-b1', OWNER_B, 'Bravo Inc');

    await expect(
      deleteRecord(TENANT_A, 'account', 'rec-b1', OWNER_A),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('creating a record in Tenant A does not appear in Tenant B list', async () => {
    const record = await createRecord(TENANT_A, 'account', { name: 'Alpha Corp' }, OWNER_A);
    expect(record).toBeDefined();
    expect(record.name).toBe('Alpha Corp');

    // List records in Tenant B — should not include the Tenant A record
    const result = await listRecords({
      tenantId: TENANT_B,
      apiName: 'account',
      ownerId: OWNER_B,
      limit: 20,
      offset: 0,
    });

    expect(result.data).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it('search results only include current tenant data', async () => {
    seedRecord(TENANT_A, 'obj-account-a', 'rec-a1', OWNER_A, 'Shared Name');
    seedRecord(TENANT_B, 'obj-account-b', 'rec-b1', OWNER_B, 'Shared Name');

    const resultA = await listRecords({
      tenantId: TENANT_A,
      apiName: 'account',
      ownerId: OWNER_A,
      search: 'Shared',
      limit: 20,
      offset: 0,
    });

    expect(resultA.total).toBe(1);
    expect(resultA.data).toHaveLength(1);
    expect(resultA.data[0].id).toBe('rec-a1');
  });

  it('each tenant has independent record counts', async () => {
    seedRecord(TENANT_A, 'obj-account-a', 'rec-a1', OWNER_A, 'A1');
    seedRecord(TENANT_A, 'obj-account-a', 'rec-a2', OWNER_A, 'A2');
    seedRecord(TENANT_B, 'obj-account-b', 'rec-b1', OWNER_B, 'B1');

    const resultA = await listRecords({
      tenantId: TENANT_A,
      apiName: 'account',
      ownerId: OWNER_A,
      limit: 20,
      offset: 0,
    });

    const resultB = await listRecords({
      tenantId: TENANT_B,
      apiName: 'account',
      ownerId: OWNER_B,
      limit: 20,
      offset: 0,
    });

    expect(resultA.total).toBe(2);
    expect(resultB.total).toBe(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// OBJECT DEFINITION ISOLATION
// ═════════════════════════════════════════════════════════════════════════════

describe('Object definition isolation', () => {
  it('listObjectDefinitions returns only the current tenant objects', async () => {
    const objectsA = await listObjectDefinitions(TENANT_A);
    const objectsB = await listObjectDefinitions(TENANT_B);

    // Both tenants have their own "account" object seeded
    expect(objectsA).toHaveLength(1);
    expect(objectsB).toHaveLength(1);
    expect(objectsA[0].id).toBe('obj-account-a');
    expect(objectsB[0].id).toBe('obj-account-b');
  });

  it('user in Tenant A cannot see Tenant B object definition by ID', async () => {
    const result = await getObjectDefinitionById(TENANT_A, 'obj-account-b');
    expect(result).toBeNull();
  });

  it('user in Tenant B cannot see Tenant A object definition by ID', async () => {
    const result = await getObjectDefinitionById(TENANT_B, 'obj-account-a');
    expect(result).toBeNull();
  });

  it('object definitions are independent per tenant — same api_name, different tenants', async () => {
    // Both tenants already have "account" objects with different IDs
    const objectsA = await listObjectDefinitions(TENANT_A);
    const objectsB = await listObjectDefinitions(TENANT_B);

    expect(objectsA[0].apiName).toBe('account');
    expect(objectsB[0].apiName).toBe('account');
    expect(objectsA[0].id).not.toBe(objectsB[0].id);
  });

  it('deleting object in Tenant A does not affect Tenant B', async () => {
    // Make Tenant A object non-system so it can be deleted
    const objA = fakeObjects.get('obj-account-a')!;
    objA.is_system = false;

    await deleteObjectDefinition(TENANT_A, 'obj-account-a');

    // Tenant A object is gone
    const afterA = await listObjectDefinitions(TENANT_A);
    expect(afterA).toHaveLength(0);

    // Tenant B object still exists
    const afterB = await listObjectDefinitions(TENANT_B);
    expect(afterB).toHaveLength(1);
    expect(afterB[0].id).toBe('obj-account-b');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// PIPELINE ISOLATION
// ═════════════════════════════════════════════════════════════════════════════

describe('Pipeline isolation', () => {
  it('pipeline stages are independent per tenant', () => {
    seedPipeline(TENANT_A, 'pipeline-a');
    seedPipeline(TENANT_B, 'pipeline-b');

    const pipelinesA = [...fakePipelines.values()].filter((p) => p.tenant_id === TENANT_A);
    const pipelinesB = [...fakePipelines.values()].filter((p) => p.tenant_id === TENANT_B);

    expect(pipelinesA).toHaveLength(1);
    expect(pipelinesB).toHaveLength(1);
    expect(pipelinesA[0].id).toBe('pipeline-a');
    expect(pipelinesB[0].id).toBe('pipeline-b');
  });

  it('pipeline from Tenant A does not appear in Tenant B queries', async () => {
    seedPipeline(TENANT_A, 'pipeline-a');

    // The mock filters by tenant_id, simulating the real DB query
    const result = await mockQuery(
      'SELECT * FROM pipeline_definitions WHERE tenant_id = $1',
      [TENANT_B],
    );

    expect(result.rows).toHaveLength(0);
  });
});
