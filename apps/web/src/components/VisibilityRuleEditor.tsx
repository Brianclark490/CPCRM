import type { VisibilityRule, VisibilityCondition } from './layoutTypes.js';
import type { FieldRef } from './builderTypes.js';
import styles from './VisibilityRuleEditor.module.css';

// ─── Types ────────────────────────────────────────────────────────────────────

interface VisibilityRuleEditorProps {
  rule: VisibilityRule | null;
  fields: FieldRef[];
  onChange: (rule: VisibilityRule | null) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const OPERATORS: { value: VisibilityCondition['op']; label: string }[] = [
  { value: 'equals', label: 'Equals' },
  { value: 'not_equals', label: 'Not equals' },
  { value: 'contains', label: 'Contains' },
  { value: 'not_empty', label: 'Is not empty' },
  { value: 'empty', label: 'Is empty' },
  { value: 'greater_than', label: 'Greater than' },
  { value: 'less_than', label: 'Less than' },
];

const NEEDS_VALUE = new Set(['equals', 'not_equals', 'contains', 'greater_than', 'less_than']);

function newCondition(): VisibilityCondition {
  return { field: '', op: 'not_empty' };
}

// ─── Component ────────────────────────────────────────────────────────────────

export function VisibilityRuleEditor({
  rule,
  fields,
  onChange,
}: VisibilityRuleEditorProps) {
  const enabled = rule !== null;

  const handleToggle = () => {
    if (enabled) {
      onChange(null);
    } else {
      onChange({ operator: 'AND', conditions: [newCondition()] });
    }
  };

  const handleOperatorChange = (operator: 'AND' | 'OR') => {
    if (!rule) return;
    onChange({ ...rule, operator });
  };

  const handleConditionChange = (
    index: number,
    patch: Partial<VisibilityCondition>,
  ) => {
    if (!rule) return;
    const conditions = [...rule.conditions];
    conditions[index] = { ...conditions[index], ...patch };
    onChange({ ...rule, conditions });
  };

  const handleAddCondition = () => {
    if (!rule) return;
    onChange({ ...rule, conditions: [...rule.conditions, newCondition()] });
  };

  const handleRemoveCondition = (index: number) => {
    if (!rule) return;
    const conditions = rule.conditions.filter((_, i) => i !== index);
    if (conditions.length === 0) {
      onChange(null);
    } else {
      onChange({ ...rule, conditions });
    }
  };

  return (
    <div className={styles.editor} data-testid="visibility-rule-editor">
      <div className={styles.toggleRow}>
        <label className={styles.toggleLabel}>Conditional visibility</label>
        <button
          type="button"
          className={`${styles.toggle} ${enabled ? styles.toggleActive : ''}`}
          role="switch"
          aria-checked={enabled}
          onClick={handleToggle}
        >
          <span className={styles.toggleKnob} />
        </button>
      </div>

      {enabled && rule && (
        <div className={styles.rules}>
          <div className={styles.matchRow}>
            <span className={styles.matchLabel}>Show when</span>
            <select
              className={styles.matchSelect}
              value={rule.operator}
              onChange={(e) => handleOperatorChange(e.target.value as 'AND' | 'OR')}
            >
              <option value="AND">ALL conditions match</option>
              <option value="OR">ANY condition matches</option>
            </select>
          </div>

          {rule.conditions.map((cond, index) => (
            <div key={index} className={styles.conditionRow}>
              <select
                className={styles.condField}
                value={cond.field}
                onChange={(e) => handleConditionChange(index, { field: e.target.value })}
                aria-label="Field"
              >
                <option value="">Select field…</option>
                {fields.map((f) => (
                  <option key={f.apiName} value={f.apiName}>
                    {f.label}
                  </option>
                ))}
              </select>

              <select
                className={styles.condOp}
                value={cond.op}
                onChange={(e) =>
                  handleConditionChange(index, {
                    op: e.target.value as VisibilityCondition['op'],
                  })
                }
                aria-label="Operator"
              >
                {OPERATORS.map((op) => (
                  <option key={op.value} value={op.value}>
                    {op.label}
                  </option>
                ))}
              </select>

              {NEEDS_VALUE.has(cond.op) && (
                <input
                  className={styles.condValue}
                  type="text"
                  value={String(cond.value ?? '')}
                  onChange={(e) => handleConditionChange(index, { value: e.target.value })}
                  placeholder="Value"
                  aria-label="Value"
                />
              )}

              <button
                type="button"
                className={styles.removeBtn}
                onClick={() => handleRemoveCondition(index)}
                aria-label="Remove condition"
              >
                ×
              </button>
            </div>
          ))}

          <button
            type="button"
            className={styles.addBtn}
            onClick={handleAddCondition}
          >
            + Add condition
          </button>
        </div>
      )}
    </div>
  );
}
