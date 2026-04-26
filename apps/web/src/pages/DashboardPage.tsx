import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useUser, useSession } from '@descope/react-sdk';
import { useApiClient } from '../lib/apiClient.js';
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

const statIcons = {
  opportunity: (
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
  account: (
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
};

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

// ─── Component ────────────────────────────────────────────────────────────────

export function DashboardPage() {
  const { user } = useUser();
  const { sessionToken } = useSession();
  const api = useApiClient();

  const [opportunityCount, setOpportunityCount] = useState<number | null>(null);
  const [accountCount, setAccountCount] = useState<number | null>(null);

  useEffect(() => {
    if (!sessionToken) return;

    api.request('/api/v1/objects/opportunity/records?limit=1&offset=0')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { pagination?: { total?: number } } | null) => {
        if (data?.pagination && typeof data.pagination.total === 'number') {
          setOpportunityCount(data.pagination.total);
        }
      })
      .catch(() => { /* best-effort */ });

    api.request('/api/v1/objects/account/records?limit=1&offset=0')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { pagination?: { total?: number } } | null) => {
        if (data?.pagination && typeof data.pagination.total === 'number') {
          setAccountCount(data.pagination.total);
        }
      })
      .catch(() => { /* best-effort */ });
  }, [sessionToken, api]);

  const stats = [
    {
      label: 'Open Opportunities',
      value: opportunityCount !== null ? String(opportunityCount) : '—',
      meta: opportunityCount !== null ? `${opportunityCount} total` : 'Loading…',
      icon: statIcons.opportunity,
      to: '/objects/opportunity',
    },
    {
      label: 'Active Accounts',
      value: accountCount !== null ? String(accountCount) : '—',
      meta: accountCount !== null ? `${accountCount} total` : 'Loading…',
      icon: statIcons.account,
      to: '/objects/account',
    },
  ];

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
          <StatCard key={stat.label} label={stat.label} value={stat.value} meta={stat.meta} icon={stat.icon} to={stat.to} />
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
          <Link to="/objects/opportunity/new">
            <PrimaryButton size="sm">
              <PlusIcon />
              New Opportunity
            </PrimaryButton>
          </Link>
          <Link to="/objects/account/new">
            <PrimaryButton size="sm">
              <PlusIcon />
              New Account
            </PrimaryButton>
          </Link>
          <Link to="/objects/opportunity">
            <PrimaryButton variant="outline" size="sm">
              <ReportsIcon />
              View Reports
            </PrimaryButton>
          </Link>
        </div>
      </div>
    </div>
  );
}
