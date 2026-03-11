import styles from './PlaceholderPage.module.css';

export function AccountsPage() {
  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Accounts</h1>
        <p className={styles.pageSubtitle}>Manage your customer accounts and contacts</p>
      </div>
      <div className={styles.card}>
        <div className={styles.iconWrap} aria-hidden="true">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <circle cx="9" cy="7" r="3.5" stroke="currentColor" strokeWidth="1.5" />
            <path
              d="M2 20c0-3.314 3.134-6 7-6s7 2.686 7 6"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <path
              d="M16 10c1.657 0 3 1.343 3 3"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <path
              d="M16 16c2.485 0 4.5 1.343 4.5 3"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </div>
        <h2 className={styles.emptyTitle}>Accounts management coming soon.</h2>
        <p className={styles.emptyText}>
          Track companies, contacts, and relationships across your pipeline.
        </p>
      </div>
    </div>
  );
}
