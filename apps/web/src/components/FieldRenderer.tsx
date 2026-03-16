// ─── Types ────────────────────────────────────────────────────────────────────

interface FieldRendererProps {
  fieldType: string;
  value: unknown;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Renders a field value in read mode based on its field_type.
 * Used in list pages, detail pages, and anywhere a field value is displayed.
 */
export function FieldRenderer({ fieldType, value }: FieldRendererProps) {
  if (value === null || value === undefined || value === '') {
    return <span>—</span>;
  }

  switch (fieldType) {
    case 'text':
    case 'textarea':
      return <span>{String(value)}</span>;

    case 'number':
      return <span>{Number(value).toLocaleString()}</span>;

    case 'currency':
      return (
        <span>
          {Number(value).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </span>
      );

    case 'date':
      return (
        <span>
          {new Date(String(value)).toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          })}
        </span>
      );

    case 'datetime':
      return (
        <span>
          {new Date(String(value)).toLocaleString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      );

    case 'email':
      return <a href={`mailto:${String(value)}`}>{String(value)}</a>;

    case 'phone':
      return <a href={`tel:${String(value)}`}>{String(value)}</a>;

    case 'url':
      return (
        <a href={String(value)} target="_blank" rel="noopener noreferrer">
          {String(value)}
        </a>
      );

    case 'boolean':
      return <span>{value ? 'Yes' : 'No'}</span>;

    case 'dropdown':
      return <span>{String(value)}</span>;

    case 'multi_select':
      if (Array.isArray(value)) {
        return <span>{value.join(', ')}</span>;
      }
      return <span>{String(value)}</span>;

    default:
      return <span>{String(value)}</span>;
  }
}
