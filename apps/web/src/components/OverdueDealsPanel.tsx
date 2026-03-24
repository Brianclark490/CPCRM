import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTenantLocale } from '../useTenantLocale.js';
import styles from './OverdueDealsPanel.module.css';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OverdueRecord {
  id: string;
  name: string;
  value: number | null;
  daysInStage: number;
  expectedDays: number;
  stageName: string;
  ownerId: string;
}

interface OverdueDealsProps {
  records: OverdueRecord[];
  apiName: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function OverdueDealsPanel({ records, apiName }: OverdueDealsProps) {
  const navigate = useNavigate();
  const { formatCurrencyCompact } = useTenantLocale();
  const [expanded, setExpanded] = useState(false);

  if (records.length === 0) return null;

  return (
    <div className={styles.panel} data-testid="overdue-deals-panel">
      <div
        className={styles.header}
        onClick={() => setExpanded((prev) => !prev)}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setExpanded((prev) => !prev);
          }
        }}
      >
        <div className={styles.headerLeft}>
          <span className={styles.title}>Overdue Deals</span>
          <span className={styles.badge} data-testid="overdue-badge">
            {records.length} overdue
          </span>
        </div>
        <svg
          className={`${styles.chevron} ${expanded ? styles.chevronOpen : ''}`}
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M4 6l4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      {expanded && (
        <div className={styles.body} data-testid="overdue-deals-list">
          <ul className={styles.list}>
            {records.map((record) => (
              <li
                key={record.id}
                className={styles.item}
                onClick={() => void navigate(`/objects/${apiName}/${record.id}`)}
                role="link"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void navigate(`/objects/${apiName}/${record.id}`);
                }}
                data-testid={`overdue-item-${record.id}`}
              >
                <div className={styles.itemLeft}>
                  <span className={styles.itemName}>{record.name}</span>
                  <span className={styles.itemMeta}>
                    {record.stageName} · Day {record.daysInStage} of {record.expectedDays}
                  </span>
                </div>
                <div className={styles.itemRight}>
                  {record.value !== null && (
                    <span className={styles.itemValue}>{formatCurrencyCompact(record.value)}</span>
                  )}
                  <span className={styles.itemOverdue}>
                    +{record.daysInStage - record.expectedDays}d overdue
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
