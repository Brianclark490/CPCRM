import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SeedResult } from '../seedDefaultObjects.js';

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ─── Fake DB state ────────────────────────────────────────────────────────────

interface FakeRow { id: string; [key: string]: unknown }

const { fakeDb, mockQuery, mockConnect, clearFakeDb, capturedQueries } = vi.hoisted(() => {
  const objects = new Map<string, FakeRow>();
  const fields = new Map<string, FakeRow>();
  const relationships = new Map<string, FakeRow>();
  const layouts = new Map<string, FakeRow>();
  const layoutFields = new Map<string, FakeRow>();
  const leadConversionMappings = new Map<string, FakeRow>();
  const pipelines = new Map<string, FakeRow>();
  const stages = new Map<string, FakeRow>();
  const stageGates = new Map<string, FakeRow>();

  const fakeDb = {
    objects, fields, relationships, layouts, layoutFields,
    leadConversionMappings, pipelines, stages, stageGates,
  };

  interface CapturedQuery { sql: string; params: unknown[] }
  const capturedQueries: CapturedQuery[] = [];

  function clearFakeDb() {
    objects.clear();
    fields.clear();
    relationships.clear();
    layouts.clear();
    layoutFields.clear();
    leadConversionMappings.clear();
    pipelines.clear();
    stages.clear();
    stageGates.clear();
    capturedQueries.length = 0;
  }

  function normalise(sql: string): string {
    return sql.replace(/\s+/g, ' ').replace(/"/g, '').trim().toUpperCase();
  }

  function extractInsertRow(sql: string, params: unknown[]): Record<string, unknown> {
    const normalized = sql.replace(/\s+/g, ' ').replace(/"/g, '').trim();
    const match = normalized.match(/INSERT INTO \w+ \(([^)]+)\)/i);
    if (!match) return {};
    const columns = match[1].split(',').map((c) => c.trim().toLowerCase());
    const row: Record<string, unknown> = {};
    columns.forEach((col, i) => { row[col] = params[i]; });
    return row;
  }

  function runQuery(rawSql: string, params: unknown[]) {
    capturedQueries.push({ sql: rawSql, params });
    const s = normalise(rawSql);

    if (s === 'BEGIN' || s === 'COMMIT' || s === 'ROLLBACK') return { rows: [] };
    if (s.startsWith('SELECT SET_CONFIG')) return { rows: [] };

    // ── INSERT INTO object_definitions ──
    if (s.startsWith('INSERT INTO OBJECT_DEFINITIONS')) {
      const row = extractInsertRow(rawSql, params);
      const existing = [...objects.values()].find(
        (o) => o.tenant_id === row.tenant_id && o.api_name === row.api_name,
      );
      if (existing) return { rows: [] };
      objects.set(row.id as string, { ...row, id: row.id as string });
      return { rows: [{ id: row.id }] };
    }

    // ── SELECT ... FROM object_definitions WHERE api_name IN (...) ──
    if (s.includes('FROM OBJECT_DEFINITIONS') && !s.startsWith('INSERT') && !s.startsWith('UPDATE') && s.includes('IN (')) {
      const tenantId = params[params.length - 1] as string;
      const apiNames = params.slice(0, -1) as string[];
      const rows = [...objects.values()]
        .filter((o) => apiNames.includes(o.api_name as string) && o.tenant_id === tenantId)
        .map((o) => ({ id: o.id, api_name: o.api_name }));
      return { rows };
    }

    // ── INSERT INTO field_definitions ──
    if (s.startsWith('INSERT INTO FIELD_DEFINITIONS')) {
      const row = extractInsertRow(rawSql, params);
      const existing = [...fields.values()].find(
        (f) => f.tenant_id === row.tenant_id && f.object_id === row.object_id && f.api_name === row.api_name,
      );
      if (existing) return { rows: [] };
      fields.set(row.id as string, { ...row, id: row.id as string });
      return { rows: [{ id: row.id }] };
    }

    // ── SELECT fd.id ... FROM field_definitions fd JOIN object_definitions od ──
    if (s.includes('FROM FIELD_DEFINITIONS') && s.includes('JOIN OBJECT_DEFINITIONS')) {
      const tenantId = params[params.length - 1] as string;
      const apiNames = params.slice(0, -1) as string[];
      const rows: { id: string; object_api_name: string; api_name: string }[] = [];
      for (const field of fields.values()) {
        if (field.tenant_id !== tenantId) continue;
        const obj = [...objects.values()].find((o) => o.id === field.object_id);
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

    // ── INSERT INTO relationship_definitions ──
    if (s.startsWith('INSERT INTO RELATIONSHIP_DEFINITIONS')) {
      const row = extractInsertRow(rawSql, params);
      const existing = [...relationships.values()].find(
        (r) => r.tenant_id === row.tenant_id && r.source_object_id === row.source_object_id && r.api_name === row.api_name,
      );
      if (existing) return { rows: [] };
      relationships.set(row.id as string, { ...row, id: row.id as string });
      return { rows: [{ id: row.id }] };
    }

    // ── INSERT INTO layout_definitions ──
    if (s.startsWith('INSERT INTO LAYOUT_DEFINITIONS')) {
      const row = extractInsertRow(rawSql, params);
      const existing = [...layouts.values()].find(
        (l) => l.tenant_id === row.tenant_id && l.object_id === row.object_id && l.name === row.name,
      );
      if (existing) return { rows: [] };
      layouts.set(row.id as string, { ...row, id: row.id as string });
      return { rows: [{ id: row.id }] };
    }

    // ── SELECT ld.id ... FROM layout_definitions ld JOIN object_definitions od ──
    if (s.includes('FROM LAYOUT_DEFINITIONS') && s.includes('JOIN OBJECT_DEFINITIONS')) {
      const tenantId = params[params.length - 1] as string;
      const apiNames = params.slice(0, -1) as string[];
      const rows: { id: string; object_api_name: string; name: string }[] = [];
      for (const layout of layouts.values()) {
        if (layout.tenant_id !== tenantId) continue;
        const obj = [...objects.values()].find((o) => o.id === layout.object_id);
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

    // ── INSERT INTO layout_fields ──
    if (s.startsWith('INSERT INTO LAYOUT_FIELDS')) {
      const row = extractInsertRow(rawSql, params);
      const existing = [...layoutFields.values()].find(
        (lf) => lf.tenant_id === row.tenant_id && lf.layout_id === row.layout_id && lf.field_id === row.field_id,
      );
      if (existing) return { rows: [] };
      layoutFields.set(row.id as string, { ...row, id: row.id as string });
      return { rows: [{ id: row.id }] };
    }

    // ── INSERT INTO lead_conversion_mappings ──
    if (s.startsWith('INSERT INTO LEAD_CONVERSION_MAPPINGS')) {
      const row = extractInsertRow(rawSql, params);
      const existing = [...leadConversionMappings.values()].find(
        (m) =>
          m.tenant_id === row.tenant_id &&
          m.lead_field_api_name === row.lead_field_api_name &&
          m.target_object === row.target_object &&
          m.target_field_api_name === row.target_field_api_name,
      );
      if (existing) return { rows: [] };
      leadConversionMappings.set(row.id as string, { ...row, id: row.id as string });
      return { rows: [{ id: row.id }] };
    }

    // ── INSERT INTO pipeline_definitions ──
    if (s.startsWith('INSERT INTO PIPELINE_DEFINITIONS')) {
      const row = extractInsertRow(rawSql, params);
      const existing = [...pipelines.values()].find(
        (p) => p.tenant_id === row.tenant_id && p.object_id === row.object_id && p.api_name === row.api_name,
      );
      if (existing) return { rows: [] };
      pipelines.set(row.id as string, { ...row, id: row.id as string });
      return { rows: [{ id: row.id }] };
    }

    // ── SELECT ... FROM pipeline_definitions WHERE api_name IN (...) ──
    if (s.includes('FROM PIPELINE_DEFINITIONS') && !s.startsWith('INSERT') && s.includes('IN (')) {
      const tenantId = params[params.length - 1] as string;
      const apiNames = params.slice(0, -1) as string[];
      const rows = [...pipelines.values()]
        .filter((p) => apiNames.includes(p.api_name as string) && p.tenant_id === tenantId)
        .map((p) => ({ id: p.id, api_name: p.api_name }));
      return { rows };
    }

    // ── INSERT INTO stage_definitions ──
    if (s.startsWith('INSERT INTO STAGE_DEFINITIONS')) {
      const row = extractInsertRow(rawSql, params);
      const existing = [...stages.values()].find(
        (st) => st.tenant_id === row.tenant_id && st.pipeline_id === row.pipeline_id && st.api_name === row.api_name,
      );
      if (existing) return { rows: [] };
      stages.set(row.id as string, { ...row, id: row.id as string });
      return { rows: [{ id: row.id }] };
    }

    // ── SELECT sd.id ... FROM stage_definitions sd JOIN pipeline_definitions pd ──
    if (s.includes('FROM STAGE_DEFINITIONS') && s.includes('JOIN PIPELINE_DEFINITIONS')) {
      const tenantId = params[params.length - 1] as string;
      const pipelineIds = params.slice(0, -1) as string[];
      const rows: { id: string; api_name: string; pipeline_api_name: string }[] = [];
      for (const stage of stages.values()) {
        if (stage.tenant_id !== tenantId) continue;
        if (!pipelineIds.includes(stage.pipeline_id as string)) continue;
        const pipeline = [...pipelines.values()].find((p) => p.id === stage.pipeline_id);
        if (pipeline) {
          rows.push({
            id: stage.id,
            api_name: stage.api_name as string,
            pipeline_api_name: pipeline.api_name as string,
          });
        }
      }
      return { rows };
    }

    // ── INSERT INTO stage_gates ──
    if (s.startsWith('INSERT INTO STAGE_GATES')) {
      const row = extractInsertRow(rawSql, params);
      const existing = [...stageGates.values()].find(
        (g) => g.tenant_id === row.tenant_id && g.stage_id === row.stage_id && g.field_id === row.field_id,
      );
      if (existing) return { rows: [] };
      stageGates.set(row.id as string, { ...row, id: row.id as string });
      return { rows: [{ id: row.id }] };
    }

    // ── UPDATE object_definitions (name_field_id / name_template) ──
    if (s.startsWith('UPDATE OBJECT_DEFINITIONS')) {
      return { rows: [] };
    }

    return { rows: [] };
  }

  function normaliseCall(sqlOrQuery: unknown, paramsArg?: unknown[]) {
    if (typeof sqlOrQuery === 'string') {
      return { sql: sqlOrQuery, params: paramsArg ?? [] };
    }
    const q = sqlOrQuery as { text: string; values?: unknown[] };
    return { sql: q.text, params: q.values ?? [] };
  }

  const mockQuery = vi.fn(async (sqlOrQuery: unknown, paramsArg?: unknown[]) => {
    const { sql, params } = normaliseCall(sqlOrQuery, paramsArg);
    return runQuery(sql, params);
  });

  const mockConnect = vi.fn(async () => ({
    query: vi.fn(async (sqlOrQuery: unknown, paramsArg?: unknown[]) => {
      const { sql, params } = normaliseCall(sqlOrQuery, paramsArg);
      return runQuery(sql, params);
    }),
    release: vi.fn(),
  }));

  return { fakeDb, mockQuery, mockConnect, clearFakeDb, capturedQueries };
});

vi.mock('../../db/client.js', () => ({
  pool: { query: mockQuery, connect: mockConnect },
}));

const { seedDefaultObjects, SEED_COUNTS } = await import('../seedDefaultObjects.js');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalise(sql: string): string {
  return sql.replace(/\s+/g, ' ').replace(/"/g, '').trim().toUpperCase();
}

function dataQueries() {
  return capturedQueries.filter((q) => {
    const s = normalise(q.sql);
    return (
      s !== 'BEGIN' &&
      s !== 'COMMIT' &&
      s !== 'ROLLBACK' &&
      !s.startsWith('RESET ') &&
      !s.startsWith('SELECT SET_CONFIG')
    );
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('seedDefaultObjects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearFakeDb();
  });

  it('creates all 11 object definitions on a fresh database', async () => {
    const result = await seedDefaultObjects('tenant-1', 'owner-1');

    expect(result.objectsCreated).toBe(SEED_COUNTS.objects);
    expect(result.objectsSkipped).toBe(0);
    expect(fakeDb.objects.size).toBe(11);
  });

  it('creates all field definitions', async () => {
    const result = await seedDefaultObjects('tenant-1', 'owner-1');

    expect(result.fieldsCreated).toBe(SEED_COUNTS.fields);
    expect(result.fieldsSkipped).toBe(0);
    expect(fakeDb.fields.size).toBe(SEED_COUNTS.fields);
  });

  it('creates all relationship definitions', async () => {
    const result = await seedDefaultObjects('tenant-1', 'owner-1');

    expect(result.relationshipsCreated).toBe(SEED_COUNTS.relationships);
    expect(result.relationshipsSkipped).toBe(0);
    expect(fakeDb.relationships.size).toBe(SEED_COUNTS.relationships);
  });

  it('creates all layout definitions', async () => {
    const result = await seedDefaultObjects('tenant-1', 'owner-1');

    expect(result.layoutsCreated).toBe(SEED_COUNTS.layouts);
    expect(result.layoutsSkipped).toBe(0);
    expect(fakeDb.layouts.size).toBe(SEED_COUNTS.layouts);
  });

  it('creates all layout fields', async () => {
    const result = await seedDefaultObjects('tenant-1', 'owner-1');

    expect(result.layoutFieldsCreated).toBe(SEED_COUNTS.layoutFields);
    expect(result.layoutFieldsSkipped).toBe(0);
    expect(fakeDb.layoutFields.size).toBe(SEED_COUNTS.layoutFields);
  });

  it('creates all lead conversion mappings', async () => {
    const result = await seedDefaultObjects('tenant-1', 'owner-1');

    expect(result.leadConversionMappingsCreated).toBe(SEED_COUNTS.leadConversionMappings);
    expect(result.leadConversionMappingsSkipped).toBe(0);
    expect(fakeDb.leadConversionMappings.size).toBe(SEED_COUNTS.leadConversionMappings);
  });

  it('is idempotent — re-running skips all existing data', async () => {
    const first = await seedDefaultObjects('tenant-1', 'owner-1');
    expect(first.objectsCreated).toBe(11);

    const second = await seedDefaultObjects('tenant-1', 'owner-1');

    expect(second.objectsCreated).toBe(0);
    expect(second.objectsSkipped).toBe(11);
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
    expect(second.pipelinesCreated).toBe(0);
    expect(second.pipelinesSkipped).toBe(SEED_COUNTS.pipelines);
    expect(second.stagesCreated).toBe(0);
    expect(second.stagesSkipped).toBe(SEED_COUNTS.stages);
    expect(second.stageGatesCreated).toBe(0);
    expect(second.stageGatesSkipped).toBe(SEED_COUNTS.stageGates);
  });

  it('passes the tenantId and ownerId to object definitions', async () => {
    await seedDefaultObjects('my-tenant', 'my-owner');

    const accountObj = [...fakeDb.objects.values()].find((o) => o.api_name === 'account');
    expect(accountObj).toBeDefined();
    expect(accountObj!.owner_id).toBe('my-owner');
    expect(accountObj!.tenant_id).toBe('my-tenant');
  });

  it('uses parameterised queries for all inserts', async () => {
    await seedDefaultObjects('tenant-1', 'owner-1');

    const inserts = dataQueries().filter((q) =>
      normalise(q.sql).startsWith('INSERT INTO'),
    );
    for (const q of inserts) {
      expect(q.params.length).toBeGreaterThan(0);
      expect(Array.isArray(q.params)).toBe(true);
    }
  });

  it('returns correct total counts matching seed data constants', async () => {
    const result = await seedDefaultObjects('tenant-1', 'owner-1');

    const totalCreated = (key: keyof SeedResult) => result[key];
    expect(totalCreated('objectsCreated')).toBe(11);
    expect(totalCreated('fieldsCreated')).toBe(94);
    expect(totalCreated('relationshipsCreated')).toBe(19);
    expect(totalCreated('layoutsCreated')).toBe(22);
    expect(totalCreated('leadConversionMappingsCreated')).toBe(15);
    expect(totalCreated('pipelinesCreated')).toBe(SEED_COUNTS.pipelines);
    expect(totalCreated('stagesCreated')).toBe(SEED_COUNTS.stages);
    expect(totalCreated('stageGatesCreated')).toBe(SEED_COUNTS.stageGates);
  });

  it('creates all 11 objects with the expected api_names', async () => {
    await seedDefaultObjects('tenant-1', 'owner-1');

    const expectedApiNames = [
      'account', 'contact', 'lead', 'opportunity', 'activity',
      'next_action', 'agreement', 'note', 'file', 'user', 'team',
    ];
    const actualApiNames = [...fakeDb.objects.values()]
      .map((o) => o.api_name as string)
      .sort();
    expect(actualApiNames).toEqual([...expectedApiNames].sort());
  });

  it('creates fields with correct types and options', async () => {
    await seedDefaultObjects('tenant-1', 'owner-1');

    const findField = (objectApiName: string, fieldApiName: string) => {
      return [...fakeDb.fields.values()].find((f) => {
        const obj = [...fakeDb.objects.values()].find((o) => o.id === f.object_id);
        return obj?.api_name === objectApiName && f.api_name === fieldApiName;
      });
    };

    const accountName = findField('account', 'name');
    expect(accountName).toBeDefined();
    expect(accountName!.field_type).toBe('text');
    expect(JSON.parse(accountName!.options as string)).toEqual({ max_length: 255 });

    const leadStatus = findField('lead', 'status');
    expect(leadStatus).toBeDefined();
    expect(leadStatus!.field_type).toBe('dropdown');
    const statusOptions = JSON.parse(leadStatus!.options as string);
    expect(statusOptions.choices).toEqual(
      expect.arrayContaining(['New', 'Contacted', 'Qualified', 'Unqualified', 'Converted']),
    );

    const oppValue = findField('opportunity', 'value');
    expect(oppValue).toBeDefined();
    expect(oppValue!.field_type).toBe('currency');
    expect(JSON.parse(oppValue!.options as string)).toEqual({ min: 0, precision: 2 });

    const contactEmail = findField('contact', 'email');
    expect(contactEmail).toBeDefined();
    expect(contactEmail!.field_type).toBe('email');

    const activityDueDate = findField('activity', 'due_date');
    expect(activityDueDate).toBeDefined();
    expect(activityDueDate!.field_type).toBe('datetime');
  });

  it('creates relationships between correct objects', async () => {
    await seedDefaultObjects('tenant-1', 'owner-1');

    const getApiName = (objectId: string) => {
      const obj = [...fakeDb.objects.values()].find((o) => o.id === objectId);
      return obj?.api_name;
    };

    const oppAcct = [...fakeDb.relationships.values()].find((r) => r.api_name === 'opportunity_account');
    expect(oppAcct).toBeDefined();
    expect(getApiName(oppAcct!.source_object_id as string)).toBe('opportunity');
    expect(getApiName(oppAcct!.target_object_id as string)).toBe('account');

    const contactAcct = [...fakeDb.relationships.values()].find((r) => r.api_name === 'contact_account');
    expect(contactAcct).toBeDefined();
    expect(getApiName(contactAcct!.source_object_id as string)).toBe('contact');
    expect(getApiName(contactAcct!.target_object_id as string)).toBe('account');

    const nextActionOpp = [...fakeDb.relationships.values()].find((r) => r.api_name === 'next_action_opportunity');
    expect(nextActionOpp).toBeDefined();
    expect(getApiName(nextActionOpp!.source_object_id as string)).toBe('next_action');
    expect(getApiName(nextActionOpp!.target_object_id as string)).toBe('opportunity');

    const agreementAcct = [...fakeDb.relationships.values()].find((r) => r.api_name === 'agreement_account');
    expect(agreementAcct).toBeDefined();
    expect(getApiName(agreementAcct!.source_object_id as string)).toBe('agreement');
    expect(getApiName(agreementAcct!.target_object_id as string)).toBe('account');

    const fileAgreement = [...fakeDb.relationships.values()].find((r) => r.api_name === 'file_agreement');
    expect(fileAgreement).toBeDefined();
    expect(getApiName(fileAgreement!.source_object_id as string)).toBe('file');
    expect(getApiName(fileAgreement!.target_object_id as string)).toBe('agreement');
  });

  it('creates layouts with correct sections and field arrangement', async () => {
    await seedDefaultObjects('tenant-1', 'owner-1');

    const accountFormLayout = [...fakeDb.layouts.values()].find((l) => {
      const obj = [...fakeDb.objects.values()].find((o) => o.id === l.object_id);
      return obj?.api_name === 'account' && l.name === 'Default form';
    });
    expect(accountFormLayout).toBeDefined();

    const accountFormFields = [...fakeDb.layoutFields.values()]
      .filter((lf) => lf.layout_id === accountFormLayout!.id);
    expect(accountFormFields.length).toBe(16);

    const sortOrders = accountFormFields
      .map((lf) => lf.sort_order as number)
      .sort((a, b) => a - b);
    expect(sortOrders[0]).toBe(1);
    const uniqueSortOrders = new Set(sortOrders);
    expect(uniqueSortOrders.size).toBe(sortOrders.length);

    const sections = new Set(accountFormFields.map((lf) => lf.section));
    expect(sections.size).toBe(4);

    for (const lf of accountFormFields) {
      expect(['half', 'full']).toContain(lf.width);
    }

    const leadFormLayout = [...fakeDb.layouts.values()].find((l) => {
      const obj = [...fakeDb.objects.values()].find((o) => o.id === l.object_id);
      return obj?.api_name === 'lead' && l.name === 'Default Form';
    });
    expect(leadFormLayout).toBeDefined();
    const leadFormFields = [...fakeDb.layoutFields.values()]
      .filter((lf) => lf.layout_id === leadFormLayout!.id);
    const leadSectionLabels = new Set(
      leadFormFields.map((lf) => lf.section_label).filter((l) => l !== null),
    );
    expect(leadSectionLabels).toContain('Contact Info');
    expect(leadSectionLabels).toContain('Company');
    expect(leadSectionLabels).toContain('Lead Details');
  });

  it('creates independent copies for different tenants', async () => {
    const resultA = await seedDefaultObjects('tenant-a', 'owner-a');
    expect(resultA.objectsCreated).toBe(SEED_COUNTS.objects);

    const resultB = await seedDefaultObjects('tenant-b', 'owner-b');
    expect(resultB.objectsCreated).toBe(SEED_COUNTS.objects);
    expect(resultB.fieldsCreated).toBe(SEED_COUNTS.fields);
    expect(resultB.relationshipsCreated).toBe(SEED_COUNTS.relationships);
    expect(resultB.layoutsCreated).toBe(SEED_COUNTS.layouts);
    expect(resultB.layoutFieldsCreated).toBe(SEED_COUNTS.layoutFields);
    expect(resultB.leadConversionMappingsCreated).toBe(SEED_COUNTS.leadConversionMappings);
    expect(resultB.pipelinesCreated).toBe(SEED_COUNTS.pipelines);
    expect(resultB.stagesCreated).toBe(SEED_COUNTS.stages);
    expect(resultB.stageGatesCreated).toBe(SEED_COUNTS.stageGates);

    expect(fakeDb.objects.size).toBe(SEED_COUNTS.objects * 2);

    const tenantAAccounts = [...fakeDb.objects.values()].filter(
      (o) => o.api_name === 'account' && o.tenant_id === 'tenant-a',
    );
    const tenantBAccounts = [...fakeDb.objects.values()].filter(
      (o) => o.api_name === 'account' && o.tenant_id === 'tenant-b',
    );
    expect(tenantAAccounts.length).toBe(1);
    expect(tenantBAccounts.length).toBe(1);
    expect(tenantAAccounts[0].id).not.toBe(tenantBAccounts[0].id);
  });

  it('includes tenant_id in all INSERT statements', async () => {
    await seedDefaultObjects('tenant-1', 'owner-1');

    for (const q of dataQueries()) {
      const upper = normalise(q.sql);
      if (upper.startsWith('INSERT INTO') && !upper.includes('UPDATE')) {
        expect(upper).toContain('TENANT_ID');
      }
    }
  });

  it('marks only essential identity fields as system', async () => {
    await seedDefaultObjects('tenant-1', 'owner-1');

    const findField = (objectApiName: string, fieldApiName: string) => {
      return [...fakeDb.fields.values()].find((f) => {
        const obj = [...fakeDb.objects.values()].find((o) => o.id === f.object_id);
        return obj?.api_name === objectApiName && f.api_name === fieldApiName;
      });
    };

    // System fields
    expect(findField('account', 'name')!.is_system).toBe(true);
    expect(findField('contact', 'first_name')!.is_system).toBe(true);
    expect(findField('contact', 'last_name')!.is_system).toBe(true);
    expect(findField('opportunity', 'name')!.is_system).toBe(true);
    expect(findField('opportunity', 'stage')!.is_system).toBe(true);
    expect(findField('user', 'email')!.is_system).toBe(true);
    expect(findField('user', 'display_name')!.is_system).toBe(true);

    // Non-system fields
    expect(findField('account', 'type')!.is_system).toBe(false);
    expect(findField('account', 'industry')!.is_system).toBe(false);
    expect(findField('account', 'website')!.is_system).toBe(false);
    expect(findField('account', 'description')!.is_system).toBe(false);
    expect(findField('contact', 'email')!.is_system).toBe(false);
    expect(findField('contact', 'phone')!.is_system).toBe(false);
    expect(findField('opportunity', 'value')!.is_system).toBe(false);
    expect(findField('opportunity', 'description')!.is_system).toBe(false);
  });
});
