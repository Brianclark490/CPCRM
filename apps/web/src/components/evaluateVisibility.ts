import type { VisibilityRule } from './layoutTypes.js';

/**
 * Evaluates a visibility rule against a record's field values.
 * Returns true if the component/section should be visible.
 *
 * - If rule is null/undefined, the element is always visible.
 * - Supports AND/OR operators across multiple conditions.
 */
export function evaluateVisibility(
  rule: VisibilityRule | null | undefined,
  record: Record<string, unknown>,
): boolean {
  if (!rule) return true;

  const { conditions, operator } = rule;

  if (!conditions || conditions.length === 0) return true;

  const results = conditions.map((cond) => {
    const value = record[cond.field];

    switch (cond.op) {
      case 'equals':
        return value === cond.value;
      case 'not_equals':
        return value !== cond.value;
      case 'contains':
        return String(value).includes(String(cond.value));
      case 'not_empty':
        return value !== null && value !== undefined && value !== '';
      case 'empty':
        return value === null || value === undefined || value === '';
      case 'greater_than':
        return Number(value) > Number(cond.value);
      case 'less_than':
        return Number(value) < Number(cond.value);
      case 'in':
        return Array.isArray(cond.value) && cond.value.includes(value);
      case 'not_in':
        return Array.isArray(cond.value) && !cond.value.includes(value);
      default:
        return true;
    }
  });

  return operator === 'AND' ? results.every(Boolean) : results.some(Boolean);
}
