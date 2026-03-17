import { describe, it, expect, vi, beforeEach } from 'vitest';
import { seedWithClient, SEED_COUNTS } from '../seedDefaultObjects.js';
import type { SeedResult } from '../seedDefaultObjects.js';

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ─── Fake DB state ────────────────────────────────────────────────────────────

interface FakeRow { id: string; [key: string]: unknown }

function createFakeDb() {
  const objects = new Map<string, FakeRow>();
  const fields = new Map<string, FakeRow>();
  const relationships = new Map<string, FakeRow>();
  const layouts = new Map<string, FakeRow>();
  const layoutFields = new Map<string, FakeRow>();
  const leadConversionMappings = new Map<string, FakeRow>();

  function clear() {
    objects.clear();
    fields.clear();
    relationships.clear();
    layouts.clear();
    layoutFields.clear();
    leadConversionMappings.clear();
  }

  return { objects, fields, relationships, layouts, layoutFields, leadConversionMappings, clear };
}

// ─── Mock client ──────────────────────────────────────────────────────────────

function createMockClient(db: ReturnType<typeof createFakeDb>) {
  const queryFn = vi.fn(async (sql: string, params?: unknown[]) => {
    const s = sql.replace(/\s+/g, ' ').trim().toUpperCase();

    // INSERT INTO object_definitions ... ON CONFLICT ... RETURNING id
    if (s.startsWith('INSERT INTO OBJECT_DEFINITIONS')) {
      const [id, apiName, label, pluralLabel, description, icon, ownerId] = params as string[];
      // Check for conflict on api_name
      const existing = [...db.objects.values()].find((o) => o.api_name === apiName);
      if (existing) return { rows: [] };
      const row: FakeRow = { id, api_name: apiName, label, plural_label: pluralLabel, description, icon, is_system: true, owner_id: ownerId };
      db.objects.set(id, row);
      return { rows: [{ id }] };
    }

    // SELECT id, api_name FROM object_definitions WHERE api_name = ANY($1)
    if (s.includes('FROM OBJECT_DEFINITIONS') && s.includes('ANY')) {
      const apiNames = params![0] as string[];
      const rows = [...db.objects.values()]
        .filter((o) => apiNames.includes(o.api_name as string))
        .map((o) => ({ id: o.id, api_name: o.api_name }));
      return { rows };
    }

    // INSERT INTO field_definitions ... ON CONFLICT ... RETURNING id
    if (s.startsWith('INSERT INTO FIELD_DEFINITIONS')) {
      const [id, objectId, apiName] = params as string[];
      const existing = [...db.fields.values()].find(
        (f) => f.object_id === objectId && f.api_name === apiName,
      );
      if (existing) return { rows: [] };
      const row: FakeRow = { id, object_id: objectId, api_name: apiName };
      db.fields.set(id, row);
      return { rows: [{ id }] };
    }

    // SELECT fd.id, od.api_name ... FROM field_definitions fd JOIN object_definitions od
    if (s.includes('FROM FIELD_DEFINITIONS FD') && s.includes('JOIN OBJECT_DEFINITIONS OD')) {
      const apiNames = params![0] as string[];
      const rows: { id: string; object_api_name: string; api_name: string }[] = [];
      for (const field of db.fields.values()) {
        const obj = db.objects.get(field.object_id as string) ??
          [...db.objects.values()].find((o) => o.id === field.object_id);
        if (obj && apiNames.includes(obj.api_name as string)) {
          rows.push({
            id: field.id,
            object_api_name: obj.api_name as string,
            api_name: field.api_name as string,
          });
        }
      }
      return { rows };
    }

    // INSERT INTO relationship_definitions ... ON CONFLICT ... RETURNING id
    if (s.startsWith('INSERT INTO RELATIONSHIP_DEFINITIONS')) {
      const [id, sourceObjectId, , , apiName] = params as string[];
      const existing = [...db.relationships.values()].find(
        (r) => r.source_object_id === sourceObjectId && r.api_name === apiName,
      );
      if (existing) return { rows: [] };
      const row: FakeRow = { id, source_object_id: sourceObjectId, api_name: apiName };
      db.relationships.set(id, row);
      return { rows: [{ id }] };
    }

    // INSERT INTO layout_definitions ... ON CONFLICT ... RETURNING id
    if (s.startsWith('INSERT INTO LAYOUT_DEFINITIONS')) {
      const [id, objectId, name] = params as string[];
      const existing = [...db.layouts.values()].find(
        (l) => l.object_id === objectId && l.name === name,
      );
      if (existing) return { rows: [] };
      const row: FakeRow = { id, object_id: objectId, name };
      db.layouts.set(id, row);
      return { rows: [{ id }] };
    }

    // SELECT ld.id, od.api_name ... FROM layout_definitions ld JOIN object_definitions od
    if (s.includes('FROM LAYOUT_DEFINITIONS LD') && s.includes('JOIN OBJECT_DEFINITIONS OD')) {
      const apiNames = params![0] as string[];
      const rows: { id: string; object_api_name: string; name: string }[] = [];
      for (const layout of db.layouts.values()) {
        const obj = db.objects.get(layout.object_id as string) ??
          [...db.objects.values()].find((o) => o.id === layout.object_id);
        if (obj && apiNames.includes(obj.api_name as string)) {
          rows.push({
            id: layout.id,
            object_api_name: obj.api_name as string,
            name: layout.name as string,
          });
        }
      }
      return { rows };
    }

    // INSERT INTO layout_fields ... ON CONFLICT ... RETURNING id
    if (s.startsWith('INSERT INTO LAYOUT_FIELDS')) {
      const [id, layoutId, fieldId] = params as string[];
      const existing = [...db.layoutFields.values()].find(
        (lf) => lf.layout_id === layoutId && lf.field_id === fieldId,
      );
      if (existing) return { rows: [] };
      const row: FakeRow = { id, layout_id: layoutId, field_id: fieldId };
      db.layoutFields.set(id, row);
      return { rows: [{ id }] };
    }

    // INSERT INTO lead_conversion_mappings ... ON CONFLICT ... RETURNING id
    if (s.startsWith('INSERT INTO LEAD_CONVERSION_MAPPINGS')) {
      const [id, leadFieldApiName, targetObject, targetFieldApiName] = params as string[];
      const existing = [...db.leadConversionMappings.values()].find(
        (m) =>
          m.lead_field_api_name === leadFieldApiName &&
          m.target_object === targetObject &&
          m.target_field_api_name === targetFieldApiName,
      );
      if (existing) return { rows: [] };
      const row: FakeRow = {
        id,
        lead_field_api_name: leadFieldApiName,
        target_object: targetObject,
        target_field_api_name: targetFieldApiName,
      };
      db.leadConversionMappings.set(id, row);
      return { rows: [{ id }] };
    }

    return { rows: [] };
  });

  return { query: queryFn };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('seedDefaultObjects', () => {
  const db = createFakeDb();
  let client: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    db.clear();
    client = createMockClient(db);
  });

  it('creates all 9 object definitions on a fresh database', async () => {
    const result = await seedWithClient(client, 'tenant-1');

    expect(result.objectsCreated).toBe(SEED_COUNTS.objects);
    expect(result.objectsSkipped).toBe(0);
    expect(db.objects.size).toBe(9);
  });

  it('creates all field definitions', async () => {
    const result = await seedWithClient(client, 'tenant-1');

    expect(result.fieldsCreated).toBe(SEED_COUNTS.fields);
    expect(result.fieldsSkipped).toBe(0);
    expect(db.fields.size).toBe(SEED_COUNTS.fields);
  });

  it('creates all relationship definitions', async () => {
    const result = await seedWithClient(client, 'tenant-1');

    expect(result.relationshipsCreated).toBe(SEED_COUNTS.relationships);
    expect(result.relationshipsSkipped).toBe(0);
    expect(db.relationships.size).toBe(SEED_COUNTS.relationships);
  });

  it('creates all layout definitions', async () => {
    const result = await seedWithClient(client, 'tenant-1');

    expect(result.layoutsCreated).toBe(SEED_COUNTS.layouts);
    expect(result.layoutsSkipped).toBe(0);
    expect(db.layouts.size).toBe(SEED_COUNTS.layouts);
  });

  it('creates all layout fields', async () => {
    const result = await seedWithClient(client, 'tenant-1');

    expect(result.layoutFieldsCreated).toBe(SEED_COUNTS.layoutFields);
    expect(result.layoutFieldsSkipped).toBe(0);
    expect(db.layoutFields.size).toBe(SEED_COUNTS.layoutFields);
  });

  it('creates all lead conversion mappings', async () => {
    const result = await seedWithClient(client, 'tenant-1');

    expect(result.leadConversionMappingsCreated).toBe(SEED_COUNTS.leadConversionMappings);
    expect(result.leadConversionMappingsSkipped).toBe(0);
    expect(db.leadConversionMappings.size).toBe(SEED_COUNTS.leadConversionMappings);
  });

  it('is idempotent — re-running skips all existing data', async () => {
    // First run — everything created
    const first = await seedWithClient(client, 'tenant-1');
    expect(first.objectsCreated).toBe(9);

    // Second run — everything skipped
    const second = await seedWithClient(client, 'tenant-1');

    expect(second.objectsCreated).toBe(0);
    expect(second.objectsSkipped).toBe(9);
    expect(second.fieldsCreated).toBe(0);
    expect(second.fieldsSkipped).toBe(SEED_COUNTS.fields);
    expect(second.relationshipsCreated).toBe(0);
    expect(second.relationshipsSkipped).toBe(SEED_COUNTS.relationships);
    expect(second.layoutsCreated).toBe(0);
    expect(second.layoutsSkipped).toBe(SEED_COUNTS.layouts);
    expect(second.layoutFieldsCreated).toBe(0);
    expect(second.layoutFieldsSkipped).toBe(SEED_COUNTS.layoutFields);
    expect(second.leadConversionMappingsCreated).toBe(0);
    expect(second.leadConversionMappingsSkipped).toBe(SEED_COUNTS.leadConversionMappings);
  });

  it('passes the ownerId to object definitions', async () => {
    await seedWithClient(client, 'my-tenant');

    const accountObj = [...db.objects.values()].find((o) => o.api_name === 'account');
    expect(accountObj).toBeDefined();
    expect(accountObj!.owner_id).toBe('my-tenant');
  });

  it('uses parameterised queries for all inserts', async () => {
    await seedWithClient(client, 'tenant-1');

    // Every call should include params
    for (const call of client.query.mock.calls) {
      const [, params] = call as [string, unknown[]?];
      expect(params).toBeDefined();
      expect(Array.isArray(params)).toBe(true);
    }
  });

  it('returns correct total counts matching seed data constants', async () => {
    const result = await seedWithClient(client, 'tenant-1');

    const totalCreated = (key: keyof SeedResult) => result[key];
    expect(totalCreated('objectsCreated')).toBe(9);
    expect(totalCreated('fieldsCreated')).toBe(84);
    expect(totalCreated('relationshipsCreated')).toBe(16);
    expect(totalCreated('layoutsCreated')).toBe(18);
    expect(totalCreated('leadConversionMappingsCreated')).toBe(15);
  });
});
