import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import styles from './StatCard.module.css';

interface StatCardProps {
  label: string;
  value: string;
  meta?: string;
  icon: ReactNode;
  to?: string;
}

export function StatCard({ label, value, meta, icon, to }: StatCardProps) {
  const content = (
    <>
      <div className={styles.top}>
        <span className={styles.label}>{label}</span>
        <span className={styles.iconWrap} aria-hidden="true">
          {icon}
        </span>
      </div>
      <div className={styles.value}>{value}</div>
      {meta && <div className={styles.meta}>{meta}</div>}
    </>
  );

  if (to) {
    return (
      <Link to={to} className={`${styles.card} ${styles.cardLink}`} aria-label={label}>
        {content}
      </Link>
    );
  }

  return <div className={styles.card}>{content}</div>;
}
