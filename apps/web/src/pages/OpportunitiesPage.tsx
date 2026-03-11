import { Link } from 'react-router-dom';
import { PrimaryButton } from '../components/PrimaryButton.js';
import styles from './OpportunitiesPage.module.css';

const PlusIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
    <path d="M3 6h6M6 3v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

export function OpportunitiesPage() {
  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Opportunities</h1>
          <p className={styles.pageSubtitle}>Track and manage your sales pipeline</p>
        </div>
        <Link to="/opportunities/new">
          <PrimaryButton size="sm">
            <PlusIcon />
            New opportunity
          </PrimaryButton>
        </Link>
      </div>

      <div className={styles.emptyState}>
        <div className={styles.iconWrap} aria-hidden="true">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path
              d="M3 6h18v14H3z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
              fill="none"
            />
            <path
              d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <path
              d="M12 11v4M10 13h4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </div>
        <h2 className={styles.emptyTitle}>No opportunities yet.</h2>
        <p className={styles.emptyText}>
          Create your first opportunity to start tracking your sales pipeline.
        </p>
      </div>
    </div>
  );
}
