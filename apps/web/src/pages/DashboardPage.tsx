import { useUser } from '@descope/react-sdk';
import { StatCard } from '../components/StatCard.js';
import { ActivityPanel, type ActivityItem } from '../components/ActivityPanel.js';
import { PrimaryButton } from '../components/PrimaryButton.js';
import { PipelineChart } from '../components/PipelineChart.js';
import styles from './DashboardPage.module.css';

const PlusIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
    <path d="M3 6h6M6 3v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const ReportsIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
    <rect x="1" y="2" width="10" height="8" rx="1" stroke="currentColor" strokeWidth="1.25" />
    <path d="M3 5h6M3 7h4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
  </svg>
);

const stats = [
  {
    label: 'Open Opportunities',
    value: '—',
    meta: 'No data yet',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id="icon-opp" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#D946EF" />
            <stop offset="100%" stopColor="#6366F1" />
          </linearGradient>
        </defs>
        <path
          d="M3 6h18v14H3z"
          stroke="url(#icon-opp)"
          strokeWidth="1.5"
          strokeLinejoin="round"
          fill="none"
        />
        <path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" stroke="url(#icon-opp)" strokeWidth="1.5" />
        <path
          d="M12 11v4M10 13h4"
          stroke="url(#icon-opp)"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    label: 'Pipeline Value',
    value: '—',
    meta: 'No data yet',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id="icon-pipe" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#F97316" />
            <stop offset="100%" stopColor="#D946EF" />
          </linearGradient>
        </defs>
        <path
          d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
          stroke="url(#icon-pipe)"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <circle cx="12" cy="12" r="4" stroke="url(#icon-pipe)" strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    label: 'Active Accounts',
    value: '—',
    meta: 'No data yet',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id="icon-acc" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#6366F1" />
            <stop offset="100%" stopColor="#F97316" />
          </linearGradient>
        </defs>
        <circle cx="9" cy="7" r="3.5" stroke="url(#icon-acc)" strokeWidth="1.5" />
        <path
          d="M2 20c0-3.314 3.134-6 7-6s7 2.686 7 6"
          stroke="url(#icon-acc)"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <path
          d="M16 10c1.657 0 3 1.343 3 3"
          stroke="url(#icon-acc)"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <path
          d="M16 16c2.485 0 4.5 1.343 4.5 3"
          stroke="url(#icon-acc)"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    label: 'Tasks to Review',
    value: '—',
    meta: 'No data yet',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id="icon-task" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#D946EF" />
            <stop offset="100%" stopColor="#F97316" />
          </linearGradient>
        </defs>
        <rect x="3" y="5" width="18" height="16" rx="2" stroke="url(#icon-task)" strokeWidth="1.5" />
        <path d="M3 10h18" stroke="url(#icon-task)" strokeWidth="1.5" />
        <path d="M8 3v4M16 3v4" stroke="url(#icon-task)" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
];

const activityItems: ActivityItem[] = [
  { id: '1', text: 'Opportunity created', time: 'Just now', type: 'opportunity' },
  { id: '2', text: 'Tenant configuration updated', time: '2 minutes ago', type: 'system' },
  { id: '3', text: 'User provisioning completed', time: '1 hour ago', type: 'user' },
];

const pipelineStages = [
  { label: 'Prospect', value: 80, count: 24 },
  { label: 'Qualify', value: 55, count: 16 },
  { label: 'Close', value: 30, count: 9 },
];

export function DashboardPage() {
  const { user } = useUser();

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Dashboard</h1>
          {user && (
            <p className={styles.pageSubtitle}>
              Welcome, {user.name ?? user.email ?? 'User'}
            </p>
          )}
        </div>
      </div>

      <div className={styles.statsGrid}>
        {stats.map((stat) => (
          <StatCard key={stat.label} label={stat.label} value={stat.value} meta={stat.meta} icon={stat.icon} />
        ))}
      </div>

      <div className={styles.sectionGrid}>
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>Recent Activity</span>
          </div>
          <div className={styles.cardBody}>
            <ActivityPanel items={activityItems} />
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>Pipeline Overview</span>
          </div>
          <div className={styles.cardBody}>
            <PipelineChart stages={pipelineStages} />
          </div>
        </div>
      </div>

      <div className={styles.actionsRow}>
        <span className={styles.actionsLabel}>Quick Actions</span>
        <div className={styles.actionsButtons}>
          <PrimaryButton size="sm">
            <PlusIcon />
            New Opportunity
          </PrimaryButton>
          <PrimaryButton size="sm">
            <PlusIcon />
            New Account
          </PrimaryButton>
          <PrimaryButton variant="outline" size="sm">
            <ReportsIcon />
            View Reports
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}
