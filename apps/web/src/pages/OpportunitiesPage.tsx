import styles from './PlaceholderPage.module.css';

export function OpportunitiesPage() {
  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Opportunities</h1>
        <p className={styles.pageSubtitle}>Track and manage your sales pipeline</p>
      </div>
      <div className={styles.card}>
        <div className={styles.iconWrap} aria-hidden="true">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <rect
              x="3"
              y="6"
              width="18"
              height="14"
              rx="2"
              stroke="currentColor"
              strokeWidth="1.5"
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
        <h2 className={styles.emptyTitle}>Opportunities management coming soon.</h2>
        <p className={styles.emptyText}>
          Build and track deals from first contact through to close.
        </p>
      </div>
    </div>
  );
}
