import styles from './ActivityPanel.module.css';

export interface ActivityItem {
  id: string;
  text: string;
  time: string;
  type: 'opportunity' | 'account' | 'system' | 'user';
}

interface ActivityPanelProps {
  items: ActivityItem[];
}

const dotColors: Record<ActivityItem['type'], string> = {
  opportunity: '#D946EF',
  account: '#6366F1',
  system: '#F97316',
  user: '#10b981',
};

export function ActivityPanel({ items }: ActivityPanelProps) {
  if (items.length === 0) {
    return (
      <div className={styles.empty}>
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={styles.emptyIcon}>
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
          <path d="M12 8v4l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <p className={styles.emptyText}>No recent activity</p>
      </div>
    );
  }

  return (
    <ul className={styles.list}>
      {items.map((item) => (
        <li key={item.id} className={styles.item}>
          <span
            className={styles.dot}
            style={{ background: dotColors[item.type] }}
            aria-hidden="true"
          />
          <div className={styles.content}>
            <span className={styles.text}>{item.text}</span>
            <span className={styles.time}>{item.time}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
