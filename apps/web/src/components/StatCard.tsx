import { type ReactNode } from 'react';
import styles from './StatCard.module.css';

interface StatCardProps {
  label: string;
  value: string;
  meta?: string;
  icon: ReactNode;
}

export function StatCard({ label, value, meta, icon }: StatCardProps) {
  return (
    <div className={styles.card}>
      <div className={styles.top}>
        <span className={styles.label}>{label}</span>
        <span className={styles.iconWrap} aria-hidden="true">
          {icon}
        </span>
      </div>
      <div className={styles.value}>{value}</div>
      {meta && <div className={styles.meta}>{meta}</div>}
    </div>
  );
}
