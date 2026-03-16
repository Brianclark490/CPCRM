import styles from './FieldInput.module.css';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FieldInputProps {
  fieldType: string;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
  required?: boolean;
  options?: Record<string, unknown>;
  id?: string;
  name?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Renders a field input in edit mode based on its field_type.
 * Used in detail pages and create forms wherever a field value is editable.
 */
export function FieldInput({
  fieldType,
  value,
  onChange,
  disabled = false,
  required = false,
  options = {},
  id,
  name,
}: FieldInputProps) {
  const stringValue = value !== null && value !== undefined ? String(value) : '';

  switch (fieldType) {
    case 'text':
      return (
        <input
          className={styles.input}
          type="text"
          id={id}
          name={name}
          value={stringValue}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          required={required}
          maxLength={(options.max_length as number) ?? undefined}
        />
      );

    case 'textarea':
      return (
        <textarea
          className={styles.textarea}
          id={id}
          name={name}
          value={stringValue}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          required={required}
        />
      );

    case 'number':
      return (
        <input
          className={styles.input}
          type="number"
          id={id}
          name={name}
          value={stringValue}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
          disabled={disabled}
          required={required}
          min={(options.min as number) ?? undefined}
          max={(options.max as number) ?? undefined}
        />
      );

    case 'currency':
      return (
        <input
          className={styles.input}
          type="number"
          id={id}
          name={name}
          value={stringValue}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
          disabled={disabled}
          required={required}
          step="0.01"
          min={(options.min as number) ?? undefined}
          max={(options.max as number) ?? undefined}
        />
      );

    case 'date':
      return (
        <input
          className={styles.input}
          type="date"
          id={id}
          name={name}
          value={stringValue ? stringValue.slice(0, 10) : ''}
          onChange={(e) => onChange(e.target.value || null)}
          disabled={disabled}
          required={required}
        />
      );

    case 'datetime':
      return (
        <input
          className={styles.input}
          type="datetime-local"
          id={id}
          name={name}
          value={stringValue ? stringValue.slice(0, 16) : ''}
          onChange={(e) => onChange(e.target.value ? new Date(e.target.value).toISOString() : null)}
          disabled={disabled}
          required={required}
        />
      );

    case 'email':
      return (
        <input
          className={styles.input}
          type="email"
          id={id}
          name={name}
          value={stringValue}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          required={required}
        />
      );

    case 'phone':
      return (
        <input
          className={styles.input}
          type="tel"
          id={id}
          name={name}
          value={stringValue}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          required={required}
        />
      );

    case 'url':
      return (
        <input
          className={styles.input}
          type="url"
          id={id}
          name={name}
          value={stringValue}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          required={required}
        />
      );

    case 'boolean':
      return (
        <label className={styles.toggle}>
          <input
            type="checkbox"
            id={id}
            name={name}
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
            disabled={disabled}
            className={styles.toggleInput}
          />
          <span className={styles.toggleSlider} />
          <span className={styles.toggleLabel}>{value ? 'Yes' : 'No'}</span>
        </label>
      );

    case 'dropdown': {
      const choices = (options.choices as string[]) ?? [];
      return (
        <select
          className={styles.select}
          id={id}
          name={name}
          value={stringValue}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          required={required}
        >
          <option value="">— Select —</option>
          {choices.map((choice) => (
            <option key={choice} value={choice}>
              {choice}
            </option>
          ))}
        </select>
      );
    }

    case 'multi_select': {
      const msChoices = (options.choices as string[]) ?? [];
      const selected = Array.isArray(value) ? (value as string[]) : [];

      const handleToggle = (choice: string) => {
        if (selected.includes(choice)) {
          onChange(selected.filter((s) => s !== choice));
        } else {
          onChange([...selected, choice]);
        }
      };

      return (
        <div className={styles.multiSelect}>
          {msChoices.map((choice) => (
            <label key={choice} className={styles.multiSelectOption}>
              <input
                type="checkbox"
                checked={selected.includes(choice)}
                onChange={() => handleToggle(choice)}
                disabled={disabled}
              />
              <span>{choice}</span>
            </label>
          ))}
        </div>
      );
    }

    default:
      return (
        <input
          className={styles.input}
          type="text"
          id={id}
          name={name}
          value={stringValue}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          required={required}
        />
      );
  }
}
