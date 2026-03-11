import { useUser } from '@descope/react-sdk';
import styles from './DashboardPage.module.css';

const stats = [
  { label: 'Open Opportunities', value: '—', meta: 'No data yet' },
  { label: 'Active Accounts', value: '—', meta: 'No data yet' },
  { label: 'Pipeline Value', value: '—', meta: 'No data yet' },
  { label: 'Won This Quarter', value: '—', meta: 'No data yet' },
];

export function DashboardPage() {
  const { user } = useUser();

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Dashboard</h1>
        {user && (
          <p className={styles.pageSubtitle}>
            Welcome, {user.name ?? user.email ?? 'User'}
          </p>
        )}
      </div>

      <div className={styles.statsGrid}>
        {stats.map((stat) => (
          <div key={stat.label} className={styles.statCard}>
            <div className={styles.statLabel}>{stat.label}</div>
            <div className={styles.statValue}>{stat.value}</div>
            <div className={styles.statMeta}>{stat.meta}</div>
          </div>
        ))}
      </div>

      <div className={styles.sectionGrid}>
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>Recent Activity</span>
          </div>
          <div className={styles.cardBody}>
            <div className={styles.emptyState}>
              <svg
                className={styles.emptyStateIcon}
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
                <path
                  d="M12 8v4l3 3"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
              <p className={styles.emptyStateText}>No recent activity</p>
            </div>
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>Top Opportunities</span>
          </div>
          <div className={styles.cardBody}>
            <div className={styles.emptyState}>
              <svg
                className={styles.emptyStateIcon}
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M3 3h18v18H3z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
                <path
                  d="M8 17V13M12 17V8M16 17v-4"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
              <p className={styles.emptyStateText}>No opportunities yet</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
