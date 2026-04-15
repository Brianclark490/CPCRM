import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  validateFieldValue,
  validateFieldValues,
  evaluateFormula,
  escapeLikePattern,
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
    // Normalise whitespace and strip identifier-quoting double quotes so the
    // same pattern matches raw-pg SQL and Kysely-generated SQL.  See the
    // matching note in pipelineService.test.ts (Phase 2 Kysely pilot): the
    // quoting is a syntactic detail of how Kysely emits identifiers and
    // treating it as part of an "unchanged test" requirement would mean
    // asserting on the SQL serialiser rather than on service behaviour.
    // See also recordService.kysely-sql.test.ts for explicit SQL-shape
    // assertions that this relaxation does not relax.
    const s = sql.replace(/\s+/g, ' ').replace(/"/g, '').trim().toUpperCase();

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
      // Kysely's pg driver uses `command` to decide whether to surface
      // `numAffectedRows` for INSERT/UPDATE/DELETE/MERGE, and reads `rows`
      // unconditionally.  Raw-pg is happy without either for DELETE, so
      // we return both so the same mock covers both paths.
      return { command: 'DELETE', rowCount: existed ? 1 : 0, rows: [] };
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

    it('accepts http URL', () => {
      const fd = makeFieldDef({ fieldType: 'url' });
      expect(validateFieldValue(fd, 'http://example.com')).toBeNull();
    });

    it('rejects invalid URL', () => {
      const fd = makeFieldDef({ fieldType: 'url', label: 'Website' });
      expect(validateFieldValue(fd, 'not-a-url')).toBe("Field 'Website' must be a valid URL");
    });

    it('rejects javascript: protocol', () => {
      const fd = makeFieldDef({ fieldType: 'url', label: 'Website' });
      expect(validateFieldValue(fd, 'javascript:alert(1)')).toBe("Field 'Website' must use http or https protocol");
    });

    it('rejects data: protocol', () => {
      const fd = makeFieldDef({ fieldType: 'url', label: 'Link' });
      expect(validateFieldValue(fd, 'data:text/html,<h1>hi</h1>')).toBe("Field 'Link' must use http or https protocol");
    });

    it('rejects ftp: protocol', () => {
      const fd = makeFieldDef({ fieldType: 'url', label: 'Ref' });
      expect(validateFieldValue(fd, 'ftp://files.example.com/doc')).toBe("Field 'Ref' must use http or https protocol");
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

    it('skips choice validation when pipeline_managed is true', () => {
      const fd = makeFieldDef({
        fieldType: 'dropdown',
        label: 'Stage',
        options: { pipeline_managed: true, choices: ['Prospecting', 'Qualification'] },
      });
      expect(validateFieldValue(fd, 'Custom Stage')).toBeNull();
    });

    it('still validates type for pipeline_managed dropdown', () => {
      const fd = makeFieldDef({
        fieldType: 'dropdown',
        label: 'Stage',
        options: { pipeline_managed: true },
      });
      expect(validateFieldValue(fd, 123)).toBe("Field 'Stage' must be a string");
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

  describe('formula', () => {
    it('returns null for any value (formula fields skip validation)', () => {
      const fd = makeFieldDef({ fieldType: 'formula', options: { expression: '{a} + {b}' } });
      expect(validateFieldValue(fd, 42)).toBeNull();
      expect(validateFieldValue(fd, 'anything')).toBeNull();
      expect(validateFieldValue(fd, null)).toBeNull();
    });
  });
});

// ─── Tests: validateFieldValues ─────────────────────────────────────────────

describe('validateFieldValues', () => {
  const fieldDefs: FieldDefinitionRow[] = [
    makeFieldDef({ apiName: 'name', label: 'Name', fieldType: 'text', required: true }),
    makeFieldDef({ apiName: 'email', label: 'Email', fieldType: 'email', required: false }),
  ];

  it('passes when all required fields are present and returns data', () => {
    const result = validateFieldValues({ name: 'Test' }, fieldDefs, false);
    expect(result).toEqual({ name: 'Test' });
  });

  it('throws when a required field is missing (create)', () => {
    expect(() =>
      validateFieldValues({}, fieldDefs, false),
    ).toThrow("Field 'Name' is required");
  });

  it('throws with fieldErrors on validation failure', () => {
    try {
      validateFieldValues({}, fieldDefs, false);
      expect.unreachable('should have thrown');
    } catch (err: unknown) {
      const e = err as Error & { code: string; fieldErrors?: Record<string, string> };
      expect(e.code).toBe('VALIDATION_ERROR');
      expect(e.fieldErrors).toBeDefined();
      expect(e.fieldErrors!.name).toBe("Field 'Name' is required");
    }
  });

  it('does not check required on partial update', () => {
    const result = validateFieldValues({ email: 'test@example.com' }, fieldDefs, true);
    expect(result).toEqual({ email: 'test@example.com' });
  });

  it('strips unknown fields from result', () => {
    const result = validateFieldValues({ name: 'Test', unknown_field: 'value' }, fieldDefs, false);
    expect(result).toEqual({ name: 'Test' });
    expect(result).not.toHaveProperty('unknown_field');
  });

  it('throws on invalid field value', () => {
    expect(() =>
      validateFieldValues({ name: 'Test', email: 'not-an-email' }, fieldDefs, false),
    ).toThrow(/email/i);
  });

  it('throws with per-field errors for invalid values', () => {
    try {
      validateFieldValues({ name: 'Test', email: 'not-an-email' }, fieldDefs, false);
      expect.unreachable('should have thrown');
    } catch (err: unknown) {
      const e = err as Error & { fieldErrors?: Record<string, string> };
      expect(e.fieldErrors).toBeDefined();
      expect(e.fieldErrors!.email).toMatch(/email/i);
    }
  });

  it('skips required check for formula fields', () => {
    const defsWithFormula: FieldDefinitionRow[] = [
      makeFieldDef({ apiName: 'name', label: 'Name', fieldType: 'text', required: true }),
      makeFieldDef({ apiName: 'win_rate', label: 'Win Rate', fieldType: 'formula', required: true, options: { expression: '{wins} / {total}' } }),
    ];
    const result = validateFieldValues({ name: 'Test' }, defsWithFormula, false);
    expect(result).toEqual({ name: 'Test' });
  });

  it('coerces string numbers to numbers for number fields', () => {
    const numDefs: FieldDefinitionRow[] = [
      makeFieldDef({ apiName: 'amount', label: 'Amount', fieldType: 'number', required: true }),
    ];
    const result = validateFieldValues({ amount: '123' }, numDefs, false);
    expect(result.amount).toBe(123);
  });

  it('coerces string numbers to numbers for currency fields', () => {
    const currDefs: FieldDefinitionRow[] = [
      makeFieldDef({ apiName: 'price', label: 'Price', fieldType: 'currency', required: true }),
    ];
    const result = validateFieldValues({ price: '49.99' }, currDefs, false);
    expect(result.price).toBe(49.99);
  });
});

// ─── Tests: evaluateFormula ─────────────────────────────────────────────────

describe('evaluateFormula', () => {
  it('evaluates a simple addition', () => {
    expect(evaluateFormula('{a} + {b}', { a: 10, b: 20 })).toBe(30);
  });

  it('evaluates a simple subtraction', () => {
    expect(evaluateFormula('{a} - {b}', { a: 50, b: 20 })).toBe(30);
  });

  it('evaluates multiplication', () => {
    expect(evaluateFormula('{price} * {quantity}', { price: 10.5, quantity: 3 })).toBeCloseTo(31.5);
  });

  it('evaluates division', () => {
    expect(evaluateFormula('{a} / {b}', { a: 100, b: 4 })).toBe(25);
  });

  it('evaluates percentage calculation', () => {
    const result = evaluateFormula('({won} / {total}) * 100', { won: 30, total: 100 });
    expect(result).toBe(30);
  });

  it('handles operator precedence correctly', () => {
    // 2 + 3 * 4 = 14 (not 20)
    expect(evaluateFormula('{a} + {b} * {c}', { a: 2, b: 3, c: 4 })).toBe(14);
  });

  it('handles parentheses correctly', () => {
    // (2 + 3) * 4 = 20
    expect(evaluateFormula('({a} + {b}) * {c}', { a: 2, b: 3, c: 4 })).toBe(20);
  });

  it('handles numeric literals', () => {
    expect(evaluateFormula('{price} * 1.15', { price: 100 })).toBeCloseTo(115);
  });

  it('returns null when a referenced field is missing', () => {
    expect(evaluateFormula('{a} + {b}', { a: 10 })).toBeNull();
  });

  it('returns null when a referenced field is empty string', () => {
    expect(evaluateFormula('{a} + {b}', { a: 10, b: '' })).toBeNull();
  });

  it('returns null when a referenced field is non-numeric', () => {
    expect(evaluateFormula('{a} + {b}', { a: 10, b: 'hello' })).toBeNull();
  });

  it('returns null for division by zero', () => {
    expect(evaluateFormula('{a} / {b}', { a: 10, b: 0 })).toBeNull();
  });

  it('handles negative numbers from fields', () => {
    expect(evaluateFormula('{a} + {b}', { a: -5, b: 10 })).toBe(5);
  });

  it('handles unary negation', () => {
    expect(evaluateFormula('-{a} + {b}', { a: 5, b: 10 })).toBe(5);
  });

  it('handles complex nested expression', () => {
    // (10 + 20) / (5 * 2) = 30 / 10 = 3
    const result = evaluateFormula('({a} + {b}) / ({c} * {d})', { a: 10, b: 20, c: 5, d: 2 });
    expect(result).toBe(3);
  });

  it('handles string numeric values from field_values', () => {
    expect(evaluateFormula('{a} + {b}', { a: '10', b: '20' })).toBe(30);
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
      limit: 20,
      offset: 0,
    });

    expect(result.offset).toBe(0);
    expect(result.limit).toBe(20);
    expect(result.object.apiName).toBe('account');
    expect(Array.isArray(result.data)).toBe(true);
  });

  it('throws NOT_FOUND for unknown object type', async () => {
    await expect(
      listRecords({ tenantId: TENANT_ID, apiName: 'nonexistent', ownerId: 'user-123', limit: 20, offset: 0 }),
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

// ─── Tests: escapeLikePattern ───────────────────────────────────────────────

describe('escapeLikePattern', () => {
  it('returns the input unchanged when no special chars', () => {
    expect(escapeLikePattern('hello world')).toBe('hello world');
  });

  it('escapes % characters', () => {
    expect(escapeLikePattern('100%')).toBe('100\\%');
  });

  it('escapes _ characters', () => {
    expect(escapeLikePattern('user_name')).toBe('user\\_name');
  });

  it('escapes \\ characters', () => {
    expect(escapeLikePattern('back\\slash')).toBe('back\\\\slash');
  });

  it('escapes multiple special characters', () => {
    expect(escapeLikePattern('50%_off\\deal')).toBe('50\\%\\_off\\\\deal');
  });

  it('handles empty string', () => {
    expect(escapeLikePattern('')).toBe('');
  });
});

// ─── Tests: prototype pollution protection ──────────────────────────────────

describe('prototype pollution protection', () => {
  beforeEach(() => {
    fakeRecords.clear();
    mockQuery.mockClear();
  });

  it('strips __proto__ from field values on create', async () => {
    // JSON.parse produces a real enumerable __proto__ property, matching
    // what express.json() would deliver from malicious input.
    const maliciousInput = JSON.parse('{"name":"Acme Corp","__proto__":{"polluted":true}}') as Record<string, unknown>;
    const result = await createRecord(
      TENANT_ID,
      'account',
      maliciousInput,
      'user-123',
    );

    expect(result.fieldValues).not.toHaveProperty('__proto__');
    expect(Object.getPrototypeOf(result.fieldValues)).toBe(Object.prototype);
  });

  it('strips constructor key from field values on create', async () => {
    const result = await createRecord(
      TENANT_ID,
      'account',
      { name: 'Acme Corp', constructor: 'attack' },
      'user-123',
    );

    expect(result.fieldValues).not.toHaveProperty('constructor');
  });
});
