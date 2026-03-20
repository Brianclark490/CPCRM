import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  validateFieldValue,
  validateFieldValues,
  createRecord,
  listRecords,
  getRecord,
  updateRecord,
  deleteRecord,
} from '../recordService.js';
import type { FieldDefinitionRow } from '../recordService.js';

const TENANT_ID = 'test-tenant-001';

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ─── Fake DB pool ─────────────────────────────────────────────────────────────

const { fakeRecords, mockQuery, mockConnect } = vi.hoisted(() => {
  const fakeRecords = new Map<string, Record<string, unknown>>();

  const mockQuery = vi.fn(async (sql: string, params?: unknown[]) => {
    const s = sql.replace(/\s+/g, ' ').trim().toUpperCase();

    // resolveObjectByApiName
    if (s.startsWith('SELECT * FROM OBJECT_DEFINITIONS WHERE API_NAME')) {
      const apiName = params![0] as string;
      if (apiName === 'account') {
        return {
          rows: [{
            id: 'obj-account-id',
            api_name: 'account',
            label: 'Account',
            plural_label: 'Accounts',
            is_system: true,
            name_field_id: 'field-name-id',
            name_template: null,
            owner_id: 'SYSTEM',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }],
        };
      }
      return { rows: [] };
    }

    // getFieldDefinitions
    if (s.startsWith('SELECT * FROM FIELD_DEFINITIONS WHERE OBJECT_ID')) {
      return {
        rows: [
          {
            id: 'field-name-id',
            object_id: 'obj-account-id',
            api_name: 'name',
            label: 'Name',
            field_type: 'text',
            required: true,
            options: { max_length: 200 },
            sort_order: 1,
            is_system: true,
          },
          {
            id: 'field-email-id',
            object_id: 'obj-account-id',
            api_name: 'email',
            label: 'Email',
            field_type: 'email',
            required: false,
            options: {},
            sort_order: 5,
            is_system: true,
          },
          {
            id: 'field-phone-id',
            object_id: 'obj-account-id',
            api_name: 'phone',
            label: 'Phone',
            field_type: 'phone',
            required: false,
            options: {},
            sort_order: 4,
            is_system: true,
          },
          {
            id: 'field-website-id',
            object_id: 'obj-account-id',
            api_name: 'website',
            label: 'Website',
            field_type: 'url',
            required: false,
            options: {},
            sort_order: 3,
            is_system: true,
          },
          {
            id: 'field-notes-id',
            object_id: 'obj-account-id',
            api_name: 'notes',
            label: 'Notes',
            field_type: 'textarea',
            required: false,
            options: {},
            sort_order: 12,
            is_system: true,
          },
        ],
      };
    }

    // BEGIN / COMMIT / ROLLBACK (transaction support)
    if (s === 'BEGIN' || s === 'COMMIT' || s === 'ROLLBACK') {
      return { rows: [] };
    }

    // INSERT INTO records
    if (s.startsWith('INSERT INTO RECORDS')) {
      const [id, _tenant_id, object_id, name, field_values, owner_id, owner_name, updated_by, updated_by_name, created_at, updated_at] =
        params as unknown[];
      const row: Record<string, unknown> = {
        id, object_id, name, field_values: JSON.parse(field_values as string), owner_id, owner_name, updated_by, updated_by_name, created_at, updated_at,
      };
      fakeRecords.set(id as string, row);
      return { rows: [row] };
    }

    // SELECT * FROM records WHERE id = $1 (re-fetch after insert)
    if (s.startsWith('SELECT * FROM RECORDS WHERE ID = $1') && !s.includes('OBJECT_ID')) {
      const id = params![0] as string;
      const record = fakeRecords.get(id);
      if (record) return { rows: [record] };
      return { rows: [] };
    }

    // SELECT COUNT (list records count)
    if (s.startsWith('SELECT COUNT(*)')) {
      return { rows: [{ total: String(fakeRecords.size) }] };
    }

    // SELECT * FROM records r WHERE (list records)
    if (s.includes('FROM RECORDS R') && s.includes('LIMIT')) {
      return { rows: [...fakeRecords.values()] };
    }

    // SELECT * FROM records WHERE id (get single record)
    if (s.startsWith('SELECT * FROM RECORDS WHERE ID')) {
      const id = params![0] as string;
      const record = fakeRecords.get(id);
      if (record) return { rows: [record] };
      return { rows: [] };
    }

    // SELECT rd.* relationship lookup
    if (s.includes('FROM RELATIONSHIP_DEFINITIONS RD')) {
      return { rows: [] };
    }

    // UPDATE records
    if (s.startsWith('UPDATE RECORDS')) {
      const recordId = params![5] as string;
      const existing = fakeRecords.get(recordId);
      if (existing) {
        const updated = {
          ...existing,
          name: params![0],
          field_values: JSON.parse(params![1] as string),
          updated_at: params![2],
          updated_by: params![3],
          updated_by_name: params![4],
        };
        fakeRecords.set(recordId, updated);
        return { rows: [updated] };
      }
      return { rows: [] };
    }

    // DELETE FROM records
    if (s.startsWith('DELETE FROM RECORDS')) {
      const id = params![0] as string;
      const existed = fakeRecords.has(id);
      fakeRecords.delete(id);
      return { rowCount: existed ? 1 : 0 };
    }

    return { rows: [] };
  });

  const mockClient = {
    query: mockQuery,
    release: vi.fn(),
  };

  const mockConnect = vi.fn(async () => mockClient);

  return { fakeRecords, mockQuery, mockConnect };
});

vi.mock('../../db/client.js', () => ({
  pool: { query: mockQuery, connect: mockConnect },
}));

// Mock the stageMovementService to prevent circular dependency issues
const { mockAssignDefaultPipeline } = vi.hoisted(() => {
  const mockAssignDefaultPipeline = vi.fn(async () => false);
  return { mockAssignDefaultPipeline };
});

vi.mock('../stageMovementService.js', () => ({
  assignDefaultPipeline: mockAssignDefaultPipeline,
}));

// ─── Test helpers ────────────────────────────────────────────────────────────

function makeFieldDef(overrides: Partial<FieldDefinitionRow> = {}): FieldDefinitionRow {
  return {
    id: 'field-id',
    objectId: 'obj-id',
    apiName: 'test_field',
    label: 'Test Field',
    fieldType: 'text',
    required: false,
    options: {},
    sortOrder: 1,
    ...overrides,
  };
}

// ─── Tests: validateFieldValue ──────────────────────────────────────────────

describe('validateFieldValue', () => {
  it('returns null for null/undefined values', () => {
    const fd = makeFieldDef({ fieldType: 'text' });
    expect(validateFieldValue(fd, null)).toBeNull();
    expect(validateFieldValue(fd, undefined)).toBeNull();
  });

  describe('text', () => {
    it('accepts valid string', () => {
      const fd = makeFieldDef({ fieldType: 'text' });
      expect(validateFieldValue(fd, 'hello')).toBeNull();
    });

    it('rejects non-string', () => {
      const fd = makeFieldDef({ fieldType: 'text', label: 'Name' });
      expect(validateFieldValue(fd, 123)).toBe("Field 'Name' must be a string");
    });

    it('rejects string exceeding max_length', () => {
      const fd = makeFieldDef({ fieldType: 'text', label: 'Name', options: { max_length: 5 } });
      expect(validateFieldValue(fd, 'toolong')).toBe("Field 'Name' must be 5 characters or fewer");
    });
  });

  describe('textarea', () => {
    it('accepts any string', () => {
      const fd = makeFieldDef({ fieldType: 'textarea' });
      expect(validateFieldValue(fd, 'A very long text...')).toBeNull();
    });

    it('rejects non-string', () => {
      const fd = makeFieldDef({ fieldType: 'textarea', label: 'Notes' });
      expect(validateFieldValue(fd, 42)).toBe("Field 'Notes' must be a string");
    });
  });

  describe('number', () => {
    it('accepts valid number', () => {
      const fd = makeFieldDef({ fieldType: 'number' });
      expect(validateFieldValue(fd, 42)).toBeNull();
    });

    it('accepts numeric string', () => {
      const fd = makeFieldDef({ fieldType: 'number' });
      expect(validateFieldValue(fd, '42')).toBeNull();
    });

    it('rejects non-number', () => {
      const fd = makeFieldDef({ fieldType: 'number', label: 'Amount' });
      expect(validateFieldValue(fd, 'abc')).toBe("Field 'Amount' must be a valid number");
    });

    it('rejects value below min', () => {
      const fd = makeFieldDef({ fieldType: 'number', label: 'Score', options: { min: 0 } });
      expect(validateFieldValue(fd, -5)).toBe("Field 'Score' must be at least 0");
    });

    it('rejects value above max', () => {
      const fd = makeFieldDef({ fieldType: 'number', label: 'Score', options: { max: 100 } });
      expect(validateFieldValue(fd, 150)).toBe("Field 'Score' must be at most 100");
    });
  });

  describe('currency', () => {
    it('accepts valid number', () => {
      const fd = makeFieldDef({ fieldType: 'currency' });
      expect(validateFieldValue(fd, 99.99)).toBeNull();
    });

    it('rejects non-number', () => {
      const fd = makeFieldDef({ fieldType: 'currency', label: 'Price' });
      expect(validateFieldValue(fd, 'free')).toBe("Field 'Price' must be a valid number");
    });
  });

  describe('date', () => {
    it('accepts valid ISO date', () => {
      const fd = makeFieldDef({ fieldType: 'date' });
      expect(validateFieldValue(fd, '2025-01-15')).toBeNull();
    });

    it('rejects invalid date format', () => {
      const fd = makeFieldDef({ fieldType: 'date', label: 'Due Date' });
      expect(validateFieldValue(fd, '15/01/2025')).toBe("Field 'Due Date' must be a valid date (YYYY-MM-DD)");
    });
  });

  describe('datetime', () => {
    it('accepts valid ISO datetime', () => {
      const fd = makeFieldDef({ fieldType: 'datetime' });
      expect(validateFieldValue(fd, '2025-01-15T10:30:00Z')).toBeNull();
    });

    it('rejects invalid datetime', () => {
      const fd = makeFieldDef({ fieldType: 'datetime', label: 'Timestamp' });
      expect(validateFieldValue(fd, 'not-a-date')).toBe("Field 'Timestamp' must be a valid datetime");
    });
  });

  describe('email', () => {
    it('accepts valid email', () => {
      const fd = makeFieldDef({ fieldType: 'email' });
      expect(validateFieldValue(fd, 'user@example.com')).toBeNull();
    });

    it('rejects invalid email', () => {
      const fd = makeFieldDef({ fieldType: 'email', label: 'Email' });
      expect(validateFieldValue(fd, 'not-an-email')).toBe("Field 'Email' must be a valid email");
    });

    it('completes quickly for a crafted ReDoS input', () => {
      const fd = makeFieldDef({ fieldType: 'email', label: 'Email' });
      const redosInput = 'a@' + 'a.'.repeat(50) + '!';
      const start = Date.now();
      validateFieldValue(fd, redosInput);
      expect(Date.now() - start).toBeLessThan(500);
    });
  });

  describe('phone', () => {
    it('accepts any string', () => {
      const fd = makeFieldDef({ fieldType: 'phone' });
      expect(validateFieldValue(fd, '+1 555-123-4567')).toBeNull();
    });

    it('rejects non-string', () => {
      const fd = makeFieldDef({ fieldType: 'phone', label: 'Phone' });
      expect(validateFieldValue(fd, 12345)).toBe("Field 'Phone' must be a string");
    });
  });

  describe('url', () => {
    it('accepts valid URL', () => {
      const fd = makeFieldDef({ fieldType: 'url' });
      expect(validateFieldValue(fd, 'https://example.com')).toBeNull();
    });

    it('rejects invalid URL', () => {
      const fd = makeFieldDef({ fieldType: 'url', label: 'Website' });
      expect(validateFieldValue(fd, 'not-a-url')).toBe("Field 'Website' must be a valid URL");
    });
  });

  describe('boolean', () => {
    it('accepts true', () => {
      const fd = makeFieldDef({ fieldType: 'boolean' });
      expect(validateFieldValue(fd, true)).toBeNull();
    });

    it('accepts false', () => {
      const fd = makeFieldDef({ fieldType: 'boolean' });
      expect(validateFieldValue(fd, false)).toBeNull();
    });

    it('rejects non-boolean', () => {
      const fd = makeFieldDef({ fieldType: 'boolean', label: 'Active' });
      expect(validateFieldValue(fd, 'yes')).toBe("Field 'Active' must be true or false");
    });
  });

  describe('dropdown', () => {
    it('accepts valid choice', () => {
      const fd = makeFieldDef({
        fieldType: 'dropdown',
        options: { choices: ['active', 'inactive'] },
      });
      expect(validateFieldValue(fd, 'active')).toBeNull();
    });

    it('rejects invalid choice', () => {
      const fd = makeFieldDef({
        fieldType: 'dropdown',
        label: 'Status',
        options: { choices: ['active', 'inactive'] },
      });
      expect(validateFieldValue(fd, 'unknown')).toBe(
        "Field 'Status' must be one of: active, inactive",
      );
    });
  });

  describe('multi_select', () => {
    it('accepts valid array of choices', () => {
      const fd = makeFieldDef({
        fieldType: 'multi_select',
        options: { choices: ['red', 'green', 'blue'] },
      });
      expect(validateFieldValue(fd, ['red', 'blue'])).toBeNull();
    });

    it('rejects non-array', () => {
      const fd = makeFieldDef({
        fieldType: 'multi_select',
        label: 'Tags',
        options: { choices: ['a', 'b'] },
      });
      expect(validateFieldValue(fd, 'a')).toBe("Field 'Tags' must be an array");
    });

    it('rejects array with invalid choice', () => {
      const fd = makeFieldDef({
        fieldType: 'multi_select',
        label: 'Tags',
        options: { choices: ['a', 'b'] },
      });
      expect(validateFieldValue(fd, ['a', 'c'])).toContain("Field 'Tags' contains invalid choice");
    });
  });
});

// ─── Tests: validateFieldValues ─────────────────────────────────────────────

describe('validateFieldValues', () => {
  const fieldDefs: FieldDefinitionRow[] = [
    makeFieldDef({ apiName: 'name', label: 'Name', fieldType: 'text', required: true }),
    makeFieldDef({ apiName: 'email', label: 'Email', fieldType: 'email', required: false }),
  ];

  it('passes when all required fields are present', () => {
    expect(() =>
      validateFieldValues({ name: 'Test' }, fieldDefs, false),
    ).not.toThrow();
  });

  it('throws when a required field is missing (create)', () => {
    expect(() =>
      validateFieldValues({}, fieldDefs, false),
    ).toThrow("Field 'Name' is required");
  });

  it('does not check required on partial update', () => {
    expect(() =>
      validateFieldValues({ email: 'test@example.com' }, fieldDefs, true),
    ).not.toThrow();
  });

  it('silently ignores unknown fields', () => {
    expect(() =>
      validateFieldValues({ name: 'Test', unknown_field: 'value' }, fieldDefs, false),
    ).not.toThrow();
  });

  it('throws on invalid field value', () => {
    expect(() =>
      validateFieldValues({ name: 'Test', email: 'not-an-email' }, fieldDefs, false),
    ).toThrow("Field 'Email' must be a valid email");
  });
});

// ─── Tests: createRecord ────────────────────────────────────────────────────

describe('createRecord', () => {
  beforeEach(() => {
    fakeRecords.clear();
    mockQuery.mockClear();
  });

  it('creates a record and returns it with field labels', async () => {
    const result = await createRecord(TENANT_ID, 'account', { name: 'Acme Corp' }, 'user-123');

    expect(result.name).toBe('Acme Corp');
    expect(result.ownerId).toBe('user-123');
    expect(result.fields).toBeDefined();
    expect(result.fields.length).toBeGreaterThan(0);
  });

  it('throws VALIDATION_ERROR when required field is missing', async () => {
    await expect(
      createRecord(TENANT_ID, 'account', { email: 'test@example.com' }, 'user-123'),
    ).rejects.toThrow("Field 'Name' is required");
  });

  it('throws NOT_FOUND when object type does not exist', async () => {
    await expect(
      createRecord(TENANT_ID, 'nonexistent', { name: 'Test' }, 'user-123'),
    ).rejects.toThrow("Object type 'nonexistent' not found");
  });

  it('silently ignores unknown fields', async () => {
    const result = await createRecord(
      TENANT_ID,
      'account',
      { name: 'Acme Corp', unknown_field: 'value' },
      'user-123',
    );

    expect(result.fieldValues).not.toHaveProperty('unknown_field');
  });
});

// ─── Tests: listRecords ─────────────────────────────────────────────────────

describe('listRecords', () => {
  beforeEach(() => {
    fakeRecords.clear();
    mockQuery.mockClear();
  });

  it('returns paginated records with object definition', async () => {
    const result = await listRecords({
      tenantId: TENANT_ID,
      apiName: 'account',
      ownerId: 'user-123',
      page: 1,
      limit: 20,
    });

    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
    expect(result.object.apiName).toBe('account');
    expect(Array.isArray(result.data)).toBe(true);
  });

  it('throws NOT_FOUND for unknown object type', async () => {
    await expect(
      listRecords({ tenantId: TENANT_ID, apiName: 'nonexistent', ownerId: 'user-123', page: 1, limit: 20 }),
    ).rejects.toThrow("Object type 'nonexistent' not found");
  });
});

// ─── Tests: getRecord ───────────────────────────────────────────────────────

describe('getRecord', () => {
  beforeEach(() => {
    fakeRecords.clear();
    mockQuery.mockClear();
  });

  it('throws NOT_FOUND when record does not exist', async () => {
    await expect(
      getRecord(TENANT_ID, 'account', 'missing-id', 'user-123'),
    ).rejects.toThrow('Record not found');
  });

  it('returns record with relationships when found', async () => {
    fakeRecords.set('rec-1', {
      id: 'rec-1',
      object_id: 'obj-account-id',
      name: 'Acme Corp',
      field_values: { name: 'Acme Corp' },
      owner_id: 'user-123',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const result = await getRecord(TENANT_ID, 'account', 'rec-1', 'user-123');

    expect(result.name).toBe('Acme Corp');
    expect(result.relationships).toBeDefined();
    expect(Array.isArray(result.relationships)).toBe(true);
  });
});

// ─── Tests: updateRecord ────────────────────────────────────────────────────

describe('updateRecord', () => {
  beforeEach(() => {
    fakeRecords.clear();
    mockQuery.mockClear();
  });

  it('throws NOT_FOUND when record does not exist', async () => {
    await expect(
      updateRecord(TENANT_ID, 'account', 'missing-id', { name: 'Updated' }, 'user-123'),
    ).rejects.toThrow('Record not found');
  });

  it('updates an existing record', async () => {
    fakeRecords.set('rec-1', {
      id: 'rec-1',
      object_id: 'obj-account-id',
      name: 'Old Name',
      field_values: { name: 'Old Name', email: 'old@example.com' },
      owner_id: 'user-123',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const result = await updateRecord(
      TENANT_ID,
      'account',
      'rec-1',
      { name: 'New Name' },
      'user-123',
    );

    expect(result.name).toBe('New Name');
    expect(result.fieldValues.name).toBe('New Name');
    // Original email should be preserved
    expect(result.fieldValues.email).toBe('old@example.com');
  });
});

// ─── Tests: deleteRecord ────────────────────────────────────────────────────

describe('deleteRecord', () => {
  beforeEach(() => {
    fakeRecords.clear();
    mockQuery.mockClear();
  });

  it('throws NOT_FOUND when record does not exist', async () => {
    await expect(
      deleteRecord(TENANT_ID, 'account', 'missing-id', 'user-123'),
    ).rejects.toThrow('Record not found');
  });

  it('deletes an existing record', async () => {
    fakeRecords.set('rec-1', {
      id: 'rec-1',
      object_id: 'obj-account-id',
      name: 'Acme Corp',
      field_values: { name: 'Acme Corp' },
      owner_id: 'user-123',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    await expect(
      deleteRecord(TENANT_ID, 'account', 'rec-1', 'user-123'),
    ).resolves.toBeUndefined();

    expect(fakeRecords.has('rec-1')).toBe(false);
  });
});
