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
  const pipelines = new Map<string, FakeRow>();
  const stages = new Map<string, FakeRow>();
  const stageGates = new Map<string, FakeRow>();

  function clear() {
    objects.clear();
    fields.clear();
    relationships.clear();
    layouts.clear();
    layoutFields.clear();
    leadConversionMappings.clear();
    pipelines.clear();
    stages.clear();
    stageGates.clear();
  }

  return { objects, fields, relationships, layouts, layoutFields, leadConversionMappings, pipelines, stages, stageGates, clear };
}

// ─── Mock client ──────────────────────────────────────────────────────────────

function createMockClient(db: ReturnType<typeof createFakeDb>) {
  const queryFn = vi.fn(async (sql: string, params?: unknown[]) => {
    const s = sql.replace(/\s+/g, ' ').trim().toUpperCase();

    // INSERT INTO object_definitions ... ON CONFLICT ... RETURNING id
    if (s.startsWith('INSERT INTO OBJECT_DEFINITIONS')) {
      const [id, apiName, label, pluralLabel, description, icon, ownerId, tenantId] = params as string[];
      // Check for conflict on (tenant_id, api_name)
      const existing = [...db.objects.values()].find((o) => o.tenant_id === tenantId && o.api_name === apiName);
      if (existing) return { rows: [] };
      const row: FakeRow = { id, api_name: apiName, label, plural_label: pluralLabel, description, icon, is_system: true, owner_id: ownerId, tenant_id: tenantId };
      db.objects.set(id, row);
      return { rows: [{ id }] };
    }

    // SELECT id, api_name FROM object_definitions WHERE api_name = ANY($1) AND tenant_id = $2
    if (s.includes('FROM OBJECT_DEFINITIONS') && s.includes('ANY')) {
      const apiNames = params![0] as string[];
      const tenantId = params![1] as string;
      const rows = [...db.objects.values()]
        .filter((o) => apiNames.includes(o.api_name as string) && o.tenant_id === tenantId)
        .map((o) => ({ id: o.id, api_name: o.api_name }));
      return { rows };
    }

    // INSERT INTO field_definitions ... ON CONFLICT ... RETURNING id
    if (s.startsWith('INSERT INTO FIELD_DEFINITIONS')) {
      const [id, objectId, apiName, label, fieldType, required, options, sortOrder, isSystem, tenantId] = params as unknown[];
      const existing = [...db.fields.values()].find(
        (f) => f.tenant_id === tenantId && f.object_id === objectId && f.api_name === apiName,
      );
      if (existing) return { rows: [] };
      const row: FakeRow = { id: id as string, object_id: objectId, api_name: apiName, label, field_type: fieldType, required, options, sort_order: sortOrder, is_system: isSystem, tenant_id: tenantId };
      db.fields.set(id as string, row);
      return { rows: [{ id }] };
    }

    // SELECT fd.id, od.api_name ... FROM field_definitions fd JOIN object_definitions od ... AND fd.tenant_id = $2
    if (s.includes('FROM FIELD_DEFINITIONS FD') && s.includes('JOIN OBJECT_DEFINITIONS OD')) {
      const apiNames = params![0] as string[];
      const tenantId = params![1] as string;
      const rows: { id: string; object_api_name: string; api_name: string }[] = [];
      for (const field of db.fields.values()) {
        if (field.tenant_id !== tenantId) continue;
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
      const [id, sourceObjectId, targetObjectId, relationshipType, apiName, , , , tenantId] = params as string[];
      const existing = [...db.relationships.values()].find(
        (r) => r.tenant_id === tenantId && r.source_object_id === sourceObjectId && r.api_name === apiName,
      );
      if (existing) return { rows: [] };
      const row: FakeRow = { id, source_object_id: sourceObjectId, target_object_id: targetObjectId, relationship_type: relationshipType, api_name: apiName, tenant_id: tenantId };
      db.relationships.set(id, row);
      return { rows: [{ id }] };
    }

    // INSERT INTO layout_definitions ... ON CONFLICT ... RETURNING id
    if (s.startsWith('INSERT INTO LAYOUT_DEFINITIONS')) {
      const [id, objectId, name, , tenantId] = params as string[];
      const existing = [...db.layouts.values()].find(
        (l) => l.tenant_id === tenantId && l.object_id === objectId && l.name === name,
      );
      if (existing) return { rows: [] };
      const row: FakeRow = { id, object_id: objectId, name, tenant_id: tenantId };
      db.layouts.set(id, row);
      return { rows: [{ id }] };
    }

    // SELECT ld.id, od.api_name ... FROM layout_definitions ld JOIN object_definitions od ... AND ld.tenant_id = $2
    if (s.includes('FROM LAYOUT_DEFINITIONS LD') && s.includes('JOIN OBJECT_DEFINITIONS OD')) {
      const apiNames = params![0] as string[];
      const tenantId = params![1] as string;
      const rows: { id: string; object_api_name: string; name: string }[] = [];
      for (const layout of db.layouts.values()) {
        if (layout.tenant_id !== tenantId) continue;
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
      const [id, layoutId, fieldId, section, sectionLabel, sortOrder, width, tenantId] = params as unknown[];
      const existing = [...db.layoutFields.values()].find(
        (lf) => lf.tenant_id === tenantId && lf.layout_id === layoutId && lf.field_id === fieldId,
      );
      if (existing) return { rows: [] };
      const row: FakeRow = { id: id as string, layout_id: layoutId, field_id: fieldId, section, section_label: sectionLabel, sort_order: sortOrder, width, tenant_id: tenantId };
      db.layoutFields.set(id as string, row);
      return { rows: [{ id }] };
    }

    // INSERT INTO lead_conversion_mappings ... ON CONFLICT ... RETURNING id
    if (s.startsWith('INSERT INTO LEAD_CONVERSION_MAPPINGS')) {
      const [id, leadFieldApiName, targetObject, targetFieldApiName, tenantId] = params as string[];
      const existing = [...db.leadConversionMappings.values()].find(
        (m) =>
          m.tenant_id === tenantId &&
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
        tenant_id: tenantId,
      };
      db.leadConversionMappings.set(id, row);
      return { rows: [{ id }] };
    }

    // INSERT INTO pipeline_definitions ... ON CONFLICT ... RETURNING id
    if (s.startsWith('INSERT INTO PIPELINE_DEFINITIONS')) {
      const [id, tenantId, objectId, name, apiName, , isSystem, ownerId] = params as unknown[];
      const existing = [...db.pipelines.values()].find(
        (p) => p.tenant_id === tenantId && p.object_id === objectId && p.api_name === apiName,
      );
      if (existing) return { rows: [] };
      const row: FakeRow = { id: id as string, tenant_id: tenantId, object_id: objectId, name, api_name: apiName, is_system: isSystem, owner_id: ownerId };
      db.pipelines.set(id as string, row);
      return { rows: [{ id }] };
    }

    // SELECT id, api_name FROM pipeline_definitions WHERE api_name = ANY($1) AND tenant_id = $2
    if (s.includes('FROM PIPELINE_DEFINITIONS') && s.includes('ANY')) {
      const apiNames = params![0] as string[];
      const tenantId = params![1] as string;
      const rows = [...db.pipelines.values()]
        .filter((p) => apiNames.includes(p.api_name as string) && p.tenant_id === tenantId)
        .map((p) => ({ id: p.id, api_name: p.api_name }));
      return { rows };
    }

    // INSERT INTO stage_definitions ... ON CONFLICT ... RETURNING id
    if (s.startsWith('INSERT INTO STAGE_DEFINITIONS')) {
      const [id, tenantId, pipelineId, name, apiName, sortOrder, stageType, colour, defaultProbability, expectedDays] = params as unknown[];
      const existing = [...db.stages.values()].find(
        (st) => st.tenant_id === tenantId && st.pipeline_id === pipelineId && st.api_name === apiName,
      );
      if (existing) return { rows: [] };
      const row: FakeRow = { id: id as string, tenant_id: tenantId, pipeline_id: pipelineId, name, api_name: apiName, sort_order: sortOrder, stage_type: stageType, colour, default_probability: defaultProbability, expected_days: expectedDays };
      db.stages.set(id as string, row);
      return { rows: [{ id }] };
    }

    // SELECT sd.id, sd.api_name, pd.api_name AS pipeline_api_name FROM stage_definitions sd JOIN pipeline_definitions pd ...
    if (s.includes('FROM STAGE_DEFINITIONS SD') && s.includes('JOIN PIPELINE_DEFINITIONS PD')) {
      const pipelineIds = params![0] as string[];
      const tenantId = params![1] as string;
      const rows: { id: string; api_name: string; pipeline_api_name: string }[] = [];
      for (const stage of db.stages.values()) {
        if (stage.tenant_id !== tenantId) continue;
        if (!pipelineIds.includes(stage.pipeline_id as string)) continue;
        const pipeline = [...db.pipelines.values()].find((p) => p.id === stage.pipeline_id);
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

    // INSERT INTO stage_gates ... ON CONFLICT ... RETURNING id
    if (s.startsWith('INSERT INTO STAGE_GATES')) {
      const [id, tenantId, stageId, fieldId, gateType, gateValue, errorMessage] = params as unknown[];
      const existing = [...db.stageGates.values()].find(
        (g) => g.tenant_id === tenantId && g.stage_id === stageId && g.field_id === fieldId,
      );
      if (existing) return { rows: [] };
      const row: FakeRow = { id: id as string, tenant_id: tenantId, stage_id: stageId, field_id: fieldId, gate_type: gateType, gate_value: gateValue, error_message: errorMessage };
      db.stageGates.set(id as string, row);
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

  it('creates all 11 object definitions on a fresh database', async () => {
    const result = await seedWithClient(client, 'tenant-1', 'owner-1');

    expect(result.objectsCreated).toBe(SEED_COUNTS.objects);
    expect(result.objectsSkipped).toBe(0);
    expect(db.objects.size).toBe(11);
  });

  it('creates all field definitions', async () => {
    const result = await seedWithClient(client, 'tenant-1', 'owner-1');

    expect(result.fieldsCreated).toBe(SEED_COUNTS.fields);
    expect(result.fieldsSkipped).toBe(0);
    expect(db.fields.size).toBe(SEED_COUNTS.fields);
  });

  it('creates all relationship definitions', async () => {
    const result = await seedWithClient(client, 'tenant-1', 'owner-1');

    expect(result.relationshipsCreated).toBe(SEED_COUNTS.relationships);
    expect(result.relationshipsSkipped).toBe(0);
    expect(db.relationships.size).toBe(SEED_COUNTS.relationships);
  });

  it('creates all layout definitions', async () => {
    const result = await seedWithClient(client, 'tenant-1', 'owner-1');

    expect(result.layoutsCreated).toBe(SEED_COUNTS.layouts);
    expect(result.layoutsSkipped).toBe(0);
    expect(db.layouts.size).toBe(SEED_COUNTS.layouts);
  });

  it('creates all layout fields', async () => {
    const result = await seedWithClient(client, 'tenant-1', 'owner-1');

    expect(result.layoutFieldsCreated).toBe(SEED_COUNTS.layoutFields);
    expect(result.layoutFieldsSkipped).toBe(0);
    expect(db.layoutFields.size).toBe(SEED_COUNTS.layoutFields);
  });

  it('creates all lead conversion mappings', async () => {
    const result = await seedWithClient(client, 'tenant-1', 'owner-1');

    expect(result.leadConversionMappingsCreated).toBe(SEED_COUNTS.leadConversionMappings);
    expect(result.leadConversionMappingsSkipped).toBe(0);
    expect(db.leadConversionMappings.size).toBe(SEED_COUNTS.leadConversionMappings);
  });

  it('is idempotent — re-running skips all existing data', async () => {
    // First run — everything created
    const first = await seedWithClient(client, 'tenant-1', 'owner-1');
    expect(first.objectsCreated).toBe(11);

    // Second run — everything skipped
    const second = await seedWithClient(client, 'tenant-1', 'owner-1');

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
    await seedWithClient(client, 'my-tenant', 'my-owner');

    const accountObj = [...db.objects.values()].find((o) => o.api_name === 'account');
    expect(accountObj).toBeDefined();
    expect(accountObj!.owner_id).toBe('my-owner');
    expect(accountObj!.tenant_id).toBe('my-tenant');
  });

  it('uses parameterised queries for all inserts', async () => {
    await seedWithClient(client, 'tenant-1', 'owner-1');

    // Every call should include params
    for (const call of client.query.mock.calls) {
      const [, params] = call as [string, unknown[]?];
      expect(params).toBeDefined();
      expect(Array.isArray(params)).toBe(true);
    }
  });

  it('returns correct total counts matching seed data constants', async () => {
    const result = await seedWithClient(client, 'tenant-1', 'owner-1');

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
    await seedWithClient(client, 'tenant-1', 'owner-1');

    const expectedApiNames = [
      'account', 'contact', 'lead', 'opportunity', 'activity',
      'next_action', 'agreement', 'note', 'file', 'user', 'team',
    ];
    const actualApiNames = [...db.objects.values()]
      .map((o) => o.api_name as string)
      .sort();
    expect(actualApiNames).toEqual([...expectedApiNames].sort());
  });

  it('creates fields with correct types and options', async () => {
    await seedWithClient(client, 'tenant-1', 'owner-1');

    const findField = (objectApiName: string, fieldApiName: string) => {
      return [...db.fields.values()].find((f) => {
        const obj = [...db.objects.values()].find((o) => o.id === f.object_id);
        return obj?.api_name === objectApiName && f.api_name === fieldApiName;
      });
    };

    // Account name is a required text field with max_length
    const accountName = findField('account', 'name');
    expect(accountName).toBeDefined();
    expect(accountName!.field_type).toBe('text');
    expect(JSON.parse(accountName!.options as string)).toEqual({ max_length: 255 });

    // Lead status is a required dropdown with choices
    const leadStatus = findField('lead', 'status');
    expect(leadStatus).toBeDefined();
    expect(leadStatus!.field_type).toBe('dropdown');
    const statusOptions = JSON.parse(leadStatus!.options as string);
    expect(statusOptions.choices).toEqual(
      expect.arrayContaining(['New', 'Contacted', 'Qualified', 'Unqualified', 'Converted']),
    );

    // Opportunity value is currency with precision
    const oppValue = findField('opportunity', 'value');
    expect(oppValue).toBeDefined();
    expect(oppValue!.field_type).toBe('currency');
    expect(JSON.parse(oppValue!.options as string)).toEqual({ min: 0, precision: 2 });

    // Contact email is an email field
    const contactEmail = findField('contact', 'email');
    expect(contactEmail).toBeDefined();
    expect(contactEmail!.field_type).toBe('email');

    // Activity due_date is a datetime field
    const activityDueDate = findField('activity', 'due_date');
    expect(activityDueDate).toBeDefined();
    expect(activityDueDate!.field_type).toBe('datetime');
  });

  it('creates relationships between correct objects', async () => {
    await seedWithClient(client, 'tenant-1', 'owner-1');

    const getApiName = (objectId: string) => {
      const obj = [...db.objects.values()].find((o) => o.id === objectId);
      return obj?.api_name;
    };

    // opportunity_account: opportunity → account
    const oppAcct = [...db.relationships.values()].find((r) => r.api_name === 'opportunity_account');
    expect(oppAcct).toBeDefined();
    expect(getApiName(oppAcct!.source_object_id as string)).toBe('opportunity');
    expect(getApiName(oppAcct!.target_object_id as string)).toBe('account');

    // contact_account: contact → account
    const contactAcct = [...db.relationships.values()].find((r) => r.api_name === 'contact_account');
    expect(contactAcct).toBeDefined();
    expect(getApiName(contactAcct!.source_object_id as string)).toBe('contact');
    expect(getApiName(contactAcct!.target_object_id as string)).toBe('account');

    // next_action_opportunity: next_action → opportunity
    const nextActionOpp = [...db.relationships.values()].find((r) => r.api_name === 'next_action_opportunity');
    expect(nextActionOpp).toBeDefined();
    expect(getApiName(nextActionOpp!.source_object_id as string)).toBe('next_action');
    expect(getApiName(nextActionOpp!.target_object_id as string)).toBe('opportunity');

    // agreement_account: agreement → account
    const agreementAcct = [...db.relationships.values()].find((r) => r.api_name === 'agreement_account');
    expect(agreementAcct).toBeDefined();
    expect(getApiName(agreementAcct!.source_object_id as string)).toBe('agreement');
    expect(getApiName(agreementAcct!.target_object_id as string)).toBe('account');

    // file_agreement: file → agreement
    const fileAgreement = [...db.relationships.values()].find((r) => r.api_name === 'file_agreement');
    expect(fileAgreement).toBeDefined();
    expect(getApiName(fileAgreement!.source_object_id as string)).toBe('file');
    expect(getApiName(fileAgreement!.target_object_id as string)).toBe('agreement');
  });

  it('creates layouts with correct sections and field arrangement', async () => {
    await seedWithClient(client, 'tenant-1', 'owner-1');

    // Find account "Default form" layout
    const accountFormLayout = [...db.layouts.values()].find((l) => {
      const obj = [...db.objects.values()].find((o) => o.id === l.object_id);
      return obj?.api_name === 'account' && l.name === 'Default form';
    });
    expect(accountFormLayout).toBeDefined();

    // Get layout fields for account form
    const accountFormFields = [...db.layoutFields.values()]
      .filter((lf) => lf.layout_id === accountFormLayout!.id);
    expect(accountFormFields.length).toBe(16);

    // Verify sort orders start at 1 and are unique
    const sortOrders = accountFormFields
      .map((lf) => lf.sort_order as number)
      .sort((a, b) => a - b);
    expect(sortOrders[0]).toBe(1);
    const uniqueSortOrders = new Set(sortOrders);
    expect(uniqueSortOrders.size).toBe(sortOrders.length);

    // Verify multiple sections exist (Details, Contact info, Address, Additional)
    const sections = new Set(accountFormFields.map((lf) => lf.section));
    expect(sections.size).toBe(4);

    // Verify width values are valid
    for (const lf of accountFormFields) {
      expect(['half', 'full']).toContain(lf.width);
    }

    // Verify lead "Default Form" has expected section labels
    const leadFormLayout = [...db.layouts.values()].find((l) => {
      const obj = [...db.objects.values()].find((o) => o.id === l.object_id);
      return obj?.api_name === 'lead' && l.name === 'Default Form';
    });
    expect(leadFormLayout).toBeDefined();
    const leadFormFields = [...db.layoutFields.values()]
      .filter((lf) => lf.layout_id === leadFormLayout!.id);
    const leadSectionLabels = new Set(
      leadFormFields.map((lf) => lf.section_label).filter((l) => l !== null),
    );
    expect(leadSectionLabels).toContain('Contact Info');
    expect(leadSectionLabels).toContain('Company');
    expect(leadSectionLabels).toContain('Lead Details');
  });

  it('creates independent copies for different tenants', async () => {
    // Seed for tenant-a
    const resultA = await seedWithClient(client, 'tenant-a', 'owner-a');
    expect(resultA.objectsCreated).toBe(SEED_COUNTS.objects);

    // Seed for tenant-b — should create a full independent copy
    const resultB = await seedWithClient(client, 'tenant-b', 'owner-b');
    expect(resultB.objectsCreated).toBe(SEED_COUNTS.objects);
    expect(resultB.fieldsCreated).toBe(SEED_COUNTS.fields);
    expect(resultB.relationshipsCreated).toBe(SEED_COUNTS.relationships);
    expect(resultB.layoutsCreated).toBe(SEED_COUNTS.layouts);
    expect(resultB.layoutFieldsCreated).toBe(SEED_COUNTS.layoutFields);
    expect(resultB.leadConversionMappingsCreated).toBe(SEED_COUNTS.leadConversionMappings);
    expect(resultB.pipelinesCreated).toBe(SEED_COUNTS.pipelines);
    expect(resultB.stagesCreated).toBe(SEED_COUNTS.stages);
    expect(resultB.stageGatesCreated).toBe(SEED_COUNTS.stageGates);

    // Both tenants' objects exist in the DB
    expect(db.objects.size).toBe(SEED_COUNTS.objects * 2);

    // Verify tenant isolation — each tenant has its own 'account' object
    const tenantAAccounts = [...db.objects.values()].filter(
      (o) => o.api_name === 'account' && o.tenant_id === 'tenant-a',
    );
    const tenantBAccounts = [...db.objects.values()].filter(
      (o) => o.api_name === 'account' && o.tenant_id === 'tenant-b',
    );
    expect(tenantAAccounts.length).toBe(1);
    expect(tenantBAccounts.length).toBe(1);
    expect(tenantAAccounts[0].id).not.toBe(tenantBAccounts[0].id);
  });

  it('includes tenant_id in all INSERT statements', async () => {
    await seedWithClient(client, 'tenant-1', 'owner-1');

    for (const call of client.query.mock.calls) {
      const [sql] = call as [string, unknown[]?];
      const upper = sql.replace(/\s+/g, ' ').trim().toUpperCase();
      if (upper.startsWith('INSERT INTO') && !upper.includes('UPDATE')) {
        expect(upper).toContain('TENANT_ID');
      }
    }
  });

  it('marks only essential identity fields as system', async () => {
    await seedWithClient(client, 'tenant-1', 'owner-1');

    const findField = (objectApiName: string, fieldApiName: string) => {
      return [...db.fields.values()].find((f) => {
        const obj = [...db.objects.values()].find((o) => o.id === f.object_id);
        return obj?.api_name === objectApiName && f.api_name === fieldApiName;
      });
    };

    // System fields — essential identity fields
    expect(findField('account', 'name')!.is_system).toBe(true);
    expect(findField('contact', 'first_name')!.is_system).toBe(true);
    expect(findField('contact', 'last_name')!.is_system).toBe(true);
    expect(findField('opportunity', 'name')!.is_system).toBe(true);
    expect(findField('opportunity', 'stage')!.is_system).toBe(true);
    expect(findField('user', 'email')!.is_system).toBe(true);
    expect(findField('user', 'display_name')!.is_system).toBe(true);

    // Non-system fields — configurable and deletable by admins
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
