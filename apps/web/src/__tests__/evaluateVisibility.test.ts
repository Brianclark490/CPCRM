import { describe, it, expect } from 'vitest';
import { evaluateVisibility } from '../components/evaluateVisibility.js';
import type { VisibilityRule } from '../components/layoutTypes.js';

describe('evaluateVisibility', () => {
  it('returns true when rule is null', () => {
    expect(evaluateVisibility(null, {})).toBe(true);
  });

  it('returns true when rule is undefined', () => {
    expect(evaluateVisibility(undefined, {})).toBe(true);
  });

  it('returns true when conditions array is empty', () => {
    const rule: VisibilityRule = { operator: 'AND', conditions: [] };
    expect(evaluateVisibility(rule, {})).toBe(true);
  });

  // ── equals / not_equals ──────────────────────────────────────────────────

  it('equals: returns true when field matches value', () => {
    const rule: VisibilityRule = {
      operator: 'AND',
      conditions: [{ field: 'status', op: 'equals', value: 'Active' }],
    };
    expect(evaluateVisibility(rule, { status: 'Active' })).toBe(true);
  });

  it('equals: returns false when field does not match', () => {
    const rule: VisibilityRule = {
      operator: 'AND',
      conditions: [{ field: 'status', op: 'equals', value: 'Active' }],
    };
    expect(evaluateVisibility(rule, { status: 'Closed' })).toBe(false);
  });

  it('not_equals: returns true when field differs from value', () => {
    const rule: VisibilityRule = {
      operator: 'AND',
      conditions: [{ field: 'status', op: 'not_equals', value: 'Closed' }],
    };
    expect(evaluateVisibility(rule, { status: 'Active' })).toBe(true);
  });

  it('not_equals: returns false when field matches value', () => {
    const rule: VisibilityRule = {
      operator: 'AND',
      conditions: [{ field: 'status', op: 'not_equals', value: 'Closed' }],
    };
    expect(evaluateVisibility(rule, { status: 'Closed' })).toBe(false);
  });

  // ── contains ─────────────────────────────────────────────────────────────

  it('contains: returns true when string value contains substring', () => {
    const rule: VisibilityRule = {
      operator: 'AND',
      conditions: [{ field: 'name', op: 'contains', value: 'Corp' }],
    };
    expect(evaluateVisibility(rule, { name: 'Acme Corp Ltd' })).toBe(true);
  });

  it('contains: returns false when string does not contain substring', () => {
    const rule: VisibilityRule = {
      operator: 'AND',
      conditions: [{ field: 'name', op: 'contains', value: 'Inc' }],
    };
    expect(evaluateVisibility(rule, { name: 'Acme Corp' })).toBe(false);
  });

  // ── empty / not_empty ────────────────────────────────────────────────────

  it('not_empty: returns true for non-empty values', () => {
    const rule: VisibilityRule = {
      operator: 'AND',
      conditions: [{ field: 'email', op: 'not_empty' }],
    };
    expect(evaluateVisibility(rule, { email: 'test@example.com' })).toBe(true);
  });

  it('not_empty: returns false for null', () => {
    const rule: VisibilityRule = {
      operator: 'AND',
      conditions: [{ field: 'email', op: 'not_empty' }],
    };
    expect(evaluateVisibility(rule, { email: null })).toBe(false);
  });

  it('not_empty: returns false for undefined', () => {
    const rule: VisibilityRule = {
      operator: 'AND',
      conditions: [{ field: 'email', op: 'not_empty' }],
    };
    expect(evaluateVisibility(rule, {})).toBe(false);
  });

  it('not_empty: returns false for empty string', () => {
    const rule: VisibilityRule = {
      operator: 'AND',
      conditions: [{ field: 'email', op: 'not_empty' }],
    };
    expect(evaluateVisibility(rule, { email: '' })).toBe(false);
  });

  it('empty: returns true for null', () => {
    const rule: VisibilityRule = {
      operator: 'AND',
      conditions: [{ field: 'email', op: 'empty' }],
    };
    expect(evaluateVisibility(rule, { email: null })).toBe(true);
  });

  it('empty: returns true for undefined fields', () => {
    const rule: VisibilityRule = {
      operator: 'AND',
      conditions: [{ field: 'email', op: 'empty' }],
    };
    expect(evaluateVisibility(rule, {})).toBe(true);
  });

  it('empty: returns true for empty string', () => {
    const rule: VisibilityRule = {
      operator: 'AND',
      conditions: [{ field: 'email', op: 'empty' }],
    };
    expect(evaluateVisibility(rule, { email: '' })).toBe(true);
  });

  it('empty: returns false for non-empty values', () => {
    const rule: VisibilityRule = {
      operator: 'AND',
      conditions: [{ field: 'email', op: 'empty' }],
    };
    expect(evaluateVisibility(rule, { email: 'test@example.com' })).toBe(false);
  });

  // ── greater_than / less_than ─────────────────────────────────────────────

  it('greater_than: returns true when value exceeds threshold', () => {
    const rule: VisibilityRule = {
      operator: 'AND',
      conditions: [{ field: 'amount', op: 'greater_than', value: 100 }],
    };
    expect(evaluateVisibility(rule, { amount: 150 })).toBe(true);
  });

  it('greater_than: returns false when value is below threshold', () => {
    const rule: VisibilityRule = {
      operator: 'AND',
      conditions: [{ field: 'amount', op: 'greater_than', value: 100 }],
    };
    expect(evaluateVisibility(rule, { amount: 50 })).toBe(false);
  });

  it('less_than: returns true when value is below threshold', () => {
    const rule: VisibilityRule = {
      operator: 'AND',
      conditions: [{ field: 'amount', op: 'less_than', value: 100 }],
    };
    expect(evaluateVisibility(rule, { amount: 50 })).toBe(true);
  });

  it('less_than: returns false when value exceeds threshold', () => {
    const rule: VisibilityRule = {
      operator: 'AND',
      conditions: [{ field: 'amount', op: 'less_than', value: 100 }],
    };
    expect(evaluateVisibility(rule, { amount: 150 })).toBe(false);
  });

  // ── in / not_in ──────────────────────────────────────────────────────────

  it('in: returns true when value is in the list', () => {
    const rule: VisibilityRule = {
      operator: 'AND',
      conditions: [{ field: 'stage', op: 'in', value: ['Proposal', 'Negotiation', 'Closed'] }],
    };
    expect(evaluateVisibility(rule, { stage: 'Proposal' })).toBe(true);
  });

  it('in: returns false when value is not in the list', () => {
    const rule: VisibilityRule = {
      operator: 'AND',
      conditions: [{ field: 'stage', op: 'in', value: ['Proposal', 'Negotiation'] }],
    };
    expect(evaluateVisibility(rule, { stage: 'Discovery' })).toBe(false);
  });

  it('not_in: returns true when value is not in the list', () => {
    const rule: VisibilityRule = {
      operator: 'AND',
      conditions: [{ field: 'stage', op: 'not_in', value: ['Closed', 'Lost'] }],
    };
    expect(evaluateVisibility(rule, { stage: 'Active' })).toBe(true);
  });

  it('not_in: returns false when value is in the list', () => {
    const rule: VisibilityRule = {
      operator: 'AND',
      conditions: [{ field: 'stage', op: 'not_in', value: ['Closed', 'Lost'] }],
    };
    expect(evaluateVisibility(rule, { stage: 'Closed' })).toBe(false);
  });

  // ── AND operator ─────────────────────────────────────────────────────────

  it('AND: returns true when all conditions pass', () => {
    const rule: VisibilityRule = {
      operator: 'AND',
      conditions: [
        { field: 'status', op: 'equals', value: 'Active' },
        { field: 'amount', op: 'greater_than', value: 0 },
      ],
    };
    expect(evaluateVisibility(rule, { status: 'Active', amount: 100 })).toBe(true);
  });

  it('AND: returns false when any condition fails', () => {
    const rule: VisibilityRule = {
      operator: 'AND',
      conditions: [
        { field: 'status', op: 'equals', value: 'Active' },
        { field: 'amount', op: 'greater_than', value: 0 },
      ],
    };
    expect(evaluateVisibility(rule, { status: 'Closed', amount: 100 })).toBe(false);
  });

  // ── OR operator ──────────────────────────────────────────────────────────

  it('OR: returns true when at least one condition passes', () => {
    const rule: VisibilityRule = {
      operator: 'OR',
      conditions: [
        { field: 'status', op: 'equals', value: 'Active' },
        { field: 'status', op: 'equals', value: 'Pending' },
      ],
    };
    expect(evaluateVisibility(rule, { status: 'Pending' })).toBe(true);
  });

  it('OR: returns false when no conditions pass', () => {
    const rule: VisibilityRule = {
      operator: 'OR',
      conditions: [
        { field: 'status', op: 'equals', value: 'Active' },
        { field: 'status', op: 'equals', value: 'Pending' },
      ],
    };
    expect(evaluateVisibility(rule, { status: 'Closed' })).toBe(false);
  });

  // ── Unknown operator ─────────────────────────────────────────────────────

  it('unknown op defaults to true', () => {
    const rule: VisibilityRule = {
      operator: 'AND',
      conditions: [{ field: 'x', op: 'unknown_op' as VisibilityRule['conditions'][0]['op'], value: 'a' }],
    };
    expect(evaluateVisibility(rule, { x: 'b' })).toBe(true);
  });
});
