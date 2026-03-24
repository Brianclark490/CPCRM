import { useTenantLocale } from '../useTenantLocale.js';
import styles from './FieldRenderer.module.css';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FieldRendererProps {
  fieldType: string;
  value: unknown;
}

// ─── Badge colour palette ─────────────────────────────────────────────────────

const BADGE_COLOURS = [
  { bg: 'rgba(99, 102, 241, 0.15)', text: '#a5b4fc' },
  { bg: 'rgba(16, 185, 129, 0.15)', text: '#6ee7b7' },
  { bg: 'rgba(245, 158, 11, 0.15)', text: '#fcd34d' },
  { bg: 'rgba(239, 68, 68, 0.15)', text: '#fca5a5' },
  { bg: 'rgba(217, 70, 239, 0.15)', text: '#e879f9' },
  { bg: 'rgba(14, 165, 233, 0.15)', text: '#7dd3fc' },
  { bg: 'rgba(249, 115, 22, 0.15)', text: '#fdba74' },
  { bg: 'rgba(168, 85, 247, 0.15)', text: '#c4b5fd' },
];

function getBadgeColour(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return BADGE_COLOURS[Math.abs(hash) % BADGE_COLOURS.length];
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Renders a field value in read mode based on its field_type.
 * Used in list pages, detail pages, and anywhere a field value is displayed.
 */
export function FieldRenderer({ fieldType, value }: FieldRendererProps) {
  const { formatCurrency, formatNumber, formatDate, formatDateTime } = useTenantLocale();

  if (value === null || value === undefined || value === '') {
    return <span className={styles.empty}>-</span>;
  }

  switch (fieldType) {
    case 'text':
    case 'textarea':
      return <span>{String(value)}</span>;

    case 'number':
      return <span>{formatNumber(Number(value))}</span>;

    case 'currency':
      return <span>{formatCurrency(Number(value))}</span>;

    case 'date':
      return <span>{formatDate(String(value))}</span>;

    case 'datetime':
      return <span>{formatDateTime(String(value))}</span>;

    case 'email':
      return (
        <a href={`mailto:${String(value)}`} className={styles.emailLink}>
          {String(value)}
        </a>
      );

    case 'phone':
      return <a href={`tel:${String(value)}`}>{String(value)}</a>;

    case 'url': {
      const href = String(value);
      const isHttpUrl = href.startsWith('http://') || href.startsWith('https://');
      if (isHttpUrl) {
        return (
          <a href={href} target="_blank" rel="noopener noreferrer">
            {href}
          </a>
        );
      }
      return <span>{href}</span>;
    }

    case 'boolean':
      return <span>{value ? 'Yes' : 'No'}</span>;

    case 'dropdown': {
      const colour = getBadgeColour(String(value));
      return (
        <span
          className={styles.badge}
          style={{ backgroundColor: colour.bg, color: colour.text }}
        >
          {String(value)}
        </span>
      );
    }

    case 'multi_select': {
      if (Array.isArray(value)) {
        return (
          <span className={styles.badgeGroup}>
            {(value as string[]).map((v) => {
              const colour = getBadgeColour(v);
              return (
                <span
                  key={v}
                  className={styles.badge}
                  style={{ backgroundColor: colour.bg, color: colour.text }}
                >
                  {v}
                </span>
              );
            })}
          </span>
        );
      }
      const colour = getBadgeColour(String(value));
      return (
        <span
          className={styles.badge}
          style={{ backgroundColor: colour.bg, color: colour.text }}
        >
          {String(value)}
        </span>
      );
    }

    case 'formula':
      return <span>{formatNumber(Number(value))}</span>;

    default:
      return <span>{String(value)}</span>;
  }
}
