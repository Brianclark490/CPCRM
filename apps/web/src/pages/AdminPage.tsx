import styles from './PlaceholderPage.module.css';

export function AdminPage() {
  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Admin</h1>
        <p className={styles.pageSubtitle}>Configure your workspace and manage users</p>
      </div>
      <div className={styles.card}>
        <div className={styles.iconWrap} aria-hidden="true">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" />
            <path
              d="M12 3v2M12 19v2M3 12h2M19 12h2M5.636 5.636l1.414 1.414M16.95 16.95l1.414 1.414M5.636 18.364l1.414-1.414M16.95 7.05l1.414-1.414"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </div>
        <h2 className={styles.emptyTitle}>Administration coming soon.</h2>
        <p className={styles.emptyText}>
          Manage users, roles, integrations, and workspace settings.
        </p>
      </div>
    </div>
  );
}
