import { describe, it, expect } from 'vitest';
import { validateWithZod } from '../fieldValueSchema.js';
import type { FieldDefinitionRow } from '../recordService.js';

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

// ─── Tests: validateWithZod ─────────────────────────────────────────────────

describe('validateWithZod', () => {
  // ── Text fields ──────────────────────────────────────────────────────────

  describe('text fields', () => {
    it('accepts valid string', () => {
      const defs = [makeFieldDef({ apiName: 'name', fieldType: 'text', required: true })];
      const result = validateWithZod({ name: 'Hello' }, defs);
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.name).toBe('Hello');
    });

    it('enforces max_length', () => {
      const defs = [makeFieldDef({ apiName: 'name', label: 'Name', fieldType: 'text', required: true, options: { max_length: 5 } })];
      const result = validateWithZod({ name: 'toolong' }, defs);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.fieldErrors.name).toMatch(/5/);
      }
    });

    it('rejects non-string', () => {
      const defs = [makeFieldDef({ apiName: 'name', label: 'Name', fieldType: 'text', required: true })];
      const result = validateWithZod({ name: 123 }, defs);
      expect(result.success).toBe(false);
    });
  });

  // ── Textarea fields ──────────────────────────────────────────────────────

  describe('textarea fields', () => {
    it('accepts any string', () => {
      const defs = [makeFieldDef({ apiName: 'notes', fieldType: 'textarea' })];
      const result = validateWithZod({ notes: 'A very long text...' }, defs);
      expect(result.success).toBe(true);
    });

    it('rejects non-string', () => {
      const defs = [makeFieldDef({ apiName: 'notes', label: 'Notes', fieldType: 'textarea' })];
      const result = validateWithZod({ notes: 42 }, defs);
      expect(result.success).toBe(false);
    });
  });

  // ── Number fields ────────────────────────────────────────────────────────

  describe('number fields', () => {
    it('accepts valid number', () => {
      const defs = [makeFieldDef({ apiName: 'amount', fieldType: 'number', required: true })];
      const result = validateWithZod({ amount: 42 }, defs);
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.amount).toBe(42);
    });

    it('coerces string to number', () => {
      const defs = [makeFieldDef({ apiName: 'amount', fieldType: 'number', required: true })];
      const result = validateWithZod({ amount: '123' }, defs);
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.amount).toBe(123);
    });

    it('coerces string decimal to number', () => {
      const defs = [makeFieldDef({ apiName: 'amount', fieldType: 'number', required: true })];
      const result = validateWithZod({ amount: '99.5' }, defs);
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.amount).toBe(99.5);
    });

    it('rejects non-numeric string', () => {
      const defs = [makeFieldDef({ apiName: 'amount', label: 'Amount', fieldType: 'number', required: true })];
      const result = validateWithZod({ amount: 'abc' }, defs);
      expect(result.success).toBe(false);
    });

    it('enforces min constraint', () => {
      const defs = [makeFieldDef({ apiName: 'score', label: 'Score', fieldType: 'number', required: true, options: { min: 0 } })];
      const result = validateWithZod({ score: -5 }, defs);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.fieldErrors.score).toMatch(/at least 0/);
    });

    it('enforces max constraint', () => {
      const defs = [makeFieldDef({ apiName: 'score', label: 'Score', fieldType: 'number', required: true, options: { max: 100 } })];
      const result = validateWithZod({ score: 150 }, defs);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.fieldErrors.score).toMatch(/100/);
    });
  });

  // ── Currency fields ──────────────────────────────────────────────────────

  describe('currency fields', () => {
    it('accepts valid number', () => {
      const defs = [makeFieldDef({ apiName: 'price', fieldType: 'currency', required: true })];
      const result = validateWithZod({ price: 49.99 }, defs);
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.price).toBe(49.99);
    });

    it('coerces string to number', () => {
      const defs = [makeFieldDef({ apiName: 'price', fieldType: 'currency', required: true })];
      const result = validateWithZod({ price: '49.99' }, defs);
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.price).toBe(49.99);
    });

    it('defaults min to 0', () => {
      const defs = [makeFieldDef({ apiName: 'price', label: 'Price', fieldType: 'currency', required: true })];
      const result = validateWithZod({ price: -10 }, defs);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.fieldErrors.price).toMatch(/at least 0/);
    });

    it('rejects non-numeric', () => {
      const defs = [makeFieldDef({ apiName: 'price', label: 'Price', fieldType: 'currency', required: true })];
      const result = validateWithZod({ price: 'free' }, defs);
      expect(result.success).toBe(false);
    });
  });

  // ── Date fields ──────────────────────────────────────────────────────────

  describe('date fields', () => {
    it('accepts valid ISO date', () => {
      const defs = [makeFieldDef({ apiName: 'due', fieldType: 'date', required: true })];
      const result = validateWithZod({ due: '2025-01-15' }, defs);
      expect(result.success).toBe(true);
    });

    it('rejects invalid date format', () => {
      const defs = [makeFieldDef({ apiName: 'due', label: 'Due Date', fieldType: 'date', required: true })];
      const result = validateWithZod({ due: '15/01/2025' }, defs);
      expect(result.success).toBe(false);
    });

    it('rejects non-string', () => {
      const defs = [makeFieldDef({ apiName: 'due', label: 'Due Date', fieldType: 'date', required: true })];
      const result = validateWithZod({ due: 12345 }, defs);
      expect(result.success).toBe(false);
    });
  });

  // ── Datetime fields ──────────────────────────────────────────────────────

  describe('datetime fields', () => {
    it('accepts valid ISO datetime', () => {
      const defs = [makeFieldDef({ apiName: 'ts', fieldType: 'datetime', required: true })];
      const result = validateWithZod({ ts: '2025-01-15T10:30:00Z' }, defs);
      expect(result.success).toBe(true);
    });

    it('rejects invalid datetime', () => {
      const defs = [makeFieldDef({ apiName: 'ts', label: 'Timestamp', fieldType: 'datetime', required: true })];
      const result = validateWithZod({ ts: 'not-a-date' }, defs);
      expect(result.success).toBe(false);
    });
  });

  // ── Email fields ─────────────────────────────────────────────────────────

  describe('email fields', () => {
    it('accepts valid email', () => {
      const defs = [makeFieldDef({ apiName: 'email', fieldType: 'email', required: true })];
      const result = validateWithZod({ email: 'user@example.com' }, defs);
      expect(result.success).toBe(true);
    });

    it('rejects invalid email', () => {
      const defs = [makeFieldDef({ apiName: 'email', label: 'Email', fieldType: 'email', required: true })];
      const result = validateWithZod({ email: 'not-an-email' }, defs);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.fieldErrors.email).toMatch(/email/i);
    });
  });

  // ── Phone fields ─────────────────────────────────────────────────────────

  describe('phone fields', () => {
    it('accepts any string', () => {
      const defs = [makeFieldDef({ apiName: 'phone', fieldType: 'phone', required: true })];
      const result = validateWithZod({ phone: '+1 555-123-4567' }, defs);
      expect(result.success).toBe(true);
    });

    it('rejects non-string', () => {
      const defs = [makeFieldDef({ apiName: 'phone', label: 'Phone', fieldType: 'phone', required: true })];
      const result = validateWithZod({ phone: 12345 }, defs);
      expect(result.success).toBe(false);
    });
  });

  // ── URL fields ───────────────────────────────────────────────────────────

  describe('url fields', () => {
    it('accepts valid https URL', () => {
      const defs = [makeFieldDef({ apiName: 'site', fieldType: 'url', required: true })];
      const result = validateWithZod({ site: 'https://example.com' }, defs);
      expect(result.success).toBe(true);
    });

    it('accepts valid http URL', () => {
      const defs = [makeFieldDef({ apiName: 'site', fieldType: 'url', required: true })];
      const result = validateWithZod({ site: 'http://example.com' }, defs);
      expect(result.success).toBe(true);
    });

    it('rejects invalid URL', () => {
      const defs = [makeFieldDef({ apiName: 'site', label: 'Website', fieldType: 'url', required: true })];
      const result = validateWithZod({ site: 'not-a-url' }, defs);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.fieldErrors.site).toMatch(/URL/i);
    });
  });

  // ── Boolean fields ───────────────────────────────────────────────────────

  describe('boolean fields', () => {
    it('accepts true/false', () => {
      const defs = [makeFieldDef({ apiName: 'active', fieldType: 'boolean', required: true })];
      expect(validateWithZod({ active: true }, defs).success).toBe(true);
      expect(validateWithZod({ active: false }, defs).success).toBe(true);
    });

    it('rejects non-boolean', () => {
      const defs = [makeFieldDef({ apiName: 'active', label: 'Active', fieldType: 'boolean', required: true })];
      const result = validateWithZod({ active: 'yes' }, defs);
      expect(result.success).toBe(false);
    });
  });

  // ── Dropdown fields ──────────────────────────────────────────────────────

  describe('dropdown fields', () => {
    it('accepts valid choice', () => {
      const defs = [makeFieldDef({ apiName: 'status', fieldType: 'dropdown', required: true, options: { choices: ['Open', 'Closed'] } })];
      const result = validateWithZod({ status: 'Open' }, defs);
      expect(result.success).toBe(true);
    });

    it('rejects invalid choice', () => {
      const defs = [makeFieldDef({ apiName: 'status', label: 'Status', fieldType: 'dropdown', required: true, options: { choices: ['Open', 'Closed'] } })];
      const result = validateWithZod({ status: 'Pending' }, defs);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.fieldErrors.status).toMatch(/one of/);
    });

    it('allows any string for pipeline_managed dropdowns', () => {
      const defs = [makeFieldDef({ apiName: 'stage', fieldType: 'dropdown', required: true, options: { pipeline_managed: true } })];
      const result = validateWithZod({ stage: 'AnyStage' }, defs);
      expect(result.success).toBe(true);
    });
  });

  // ── Multi-select fields ──────────────────────────────────────────────────

  describe('multi_select fields', () => {
    it('accepts valid array of choices', () => {
      const defs = [makeFieldDef({ apiName: 'tags', fieldType: 'multi_select', options: { choices: ['A', 'B', 'C'] } })];
      const result = validateWithZod({ tags: ['A', 'B'] }, defs);
      expect(result.success).toBe(true);
    });

    it('rejects invalid choice in array', () => {
      const defs = [makeFieldDef({ apiName: 'tags', label: 'Tags', fieldType: 'multi_select', options: { choices: ['A', 'B'] } })];
      const result = validateWithZod({ tags: ['A', 'X'] }, defs);
      expect(result.success).toBe(false);
    });

    it('rejects non-array', () => {
      const defs = [makeFieldDef({ apiName: 'tags', label: 'Tags', fieldType: 'multi_select', options: { choices: ['A'] } })];
      const result = validateWithZod({ tags: 'A' }, defs);
      expect(result.success).toBe(false);
    });
  });

  // ── Required fields ──────────────────────────────────────────────────────

  describe('required fields', () => {
    it('fails when a required field is missing on create', () => {
      const defs = [makeFieldDef({ apiName: 'name', label: 'Name', fieldType: 'text', required: true })];
      const result = validateWithZod({}, defs, false);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.fieldErrors.name).toMatch(/required/i);
    });

    it('does not require fields on partial update', () => {
      const defs = [makeFieldDef({ apiName: 'name', label: 'Name', fieldType: 'text', required: true })];
      const result = validateWithZod({}, defs, true);
      expect(result.success).toBe(true);
    });

    it('allows optional fields to be omitted', () => {
      const defs = [
        makeFieldDef({ apiName: 'name', fieldType: 'text', required: true }),
        makeFieldDef({ apiName: 'email', fieldType: 'email', required: false }),
      ];
      const result = validateWithZod({ name: 'Test' }, defs, false);
      expect(result.success).toBe(true);
    });

    it('allows optional fields to be null', () => {
      const defs = [
        makeFieldDef({ apiName: 'name', fieldType: 'text', required: true }),
        makeFieldDef({ apiName: 'email', fieldType: 'email', required: false }),
      ];
      const result = validateWithZod({ name: 'Test', email: null }, defs, false);
      expect(result.success).toBe(true);
    });
  });

  // ── Formula fields ───────────────────────────────────────────────────────

  describe('formula fields', () => {
    it('skips formula fields even when required', () => {
      const defs = [
        makeFieldDef({ apiName: 'name', fieldType: 'text', required: true }),
        makeFieldDef({ apiName: 'win_rate', fieldType: 'formula', required: true, options: { expression: '{wins} / {total}' } }),
      ];
      const result = validateWithZod({ name: 'Test' }, defs, false);
      expect(result.success).toBe(true);
    });
  });

  // ── Unknown field stripping ──────────────────────────────────────────────

  describe('unknown field stripping', () => {
    it('strips fields not in definitions', () => {
      const defs = [makeFieldDef({ apiName: 'name', fieldType: 'text', required: true })];
      const result = validateWithZod({ name: 'Test', unknown_field: 'value', another: 123 }, defs, false);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({ name: 'Test' });
        expect(result.data).not.toHaveProperty('unknown_field');
        expect(result.data).not.toHaveProperty('another');
      }
    });
  });

  // ── Multiple field errors ────────────────────────────────────────────────

  describe('multiple field errors', () => {
    it('reports errors for multiple invalid fields', () => {
      const defs = [
        makeFieldDef({ apiName: 'name', label: 'Name', fieldType: 'text', required: true }),
        makeFieldDef({ apiName: 'email', label: 'Email', fieldType: 'email', required: true }),
        makeFieldDef({ apiName: 'score', label: 'Score', fieldType: 'number', required: true, options: { min: 0 } }),
      ];
      const result = validateWithZod({ email: 'bad', score: -5 }, defs, false);
      expect(result.success).toBe(false);
      if (!result.success) {
        // At least two errors (name missing, email invalid or score below min)
        expect(Object.keys(result.fieldErrors).length).toBeGreaterThanOrEqual(2);
      }
    });
  });
});
