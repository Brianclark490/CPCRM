import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useSuperAdmin } from '../store/superAdmin.js';
import styles from './AdminPage.module.css';

interface AdminCard {
  title: string;
  description: string;
  to: string;
  icon: ReactNode;
  comingSoon?: boolean;
}

/* ── SVG icons ────────────────────────────────────────────── */

const GridIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

const ActivityIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <polyline
      points="22 12 18 12 15 21 9 3 6 12 2 12"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const UserPlusIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="8.5" cy="7" r="4" stroke="currentColor" strokeWidth="1.5" />
    <line x1="20" y1="8" x2="20" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="23" y1="11" x2="17" y2="11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const ShieldIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const FileTextIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <polyline
      points="14 2 14 8 20 8"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <line x1="16" y1="13" x2="8" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="16" y1="17" x2="8" y2="17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="10" y1="9" x2="8" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const SettingsIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" />
    <path
      d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09a1.65 1.65 0 00-1.08-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09a1.65 1.65 0 001.51-1.08 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1.08z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const TargetIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="12" cy="12" r="6" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="12" cy="12" r="2" fill="currentColor" />
  </svg>
);

/* ── Card definitions ─────────────────────────────────────── */

const baseCards: AdminCard[] = [
  {
    title: 'Object manager',
    description: 'Objects, fields, layouts, relationships',
    to: '/admin/objects',
    icon: <GridIcon />,
  },
  {
    title: 'Pipeline manager',
    description: 'Pipelines, stages, gates, probabilities',
    to: '/admin/pipelines',
    icon: <ActivityIcon />,
  },
  {
    title: 'User management',
    description: 'Invite users, assign roles, deactivate',
    to: '/admin/users',
    icon: <UserPlusIcon />,
  },
  {
    title: 'Sales targets',
    description: 'Business, team, and user targets',
    to: '/admin/targets',
    icon: <TargetIcon />,
  },
];

const rolesCard: AdminCard = {
  title: 'Roles and permissions',
  description: 'Manage roles and permission assignments',
  to: '/admin/roles',
  icon: <ShieldIcon />,
};

const trailingCards: AdminCard[] = [
  {
    title: 'Audit log',
    description: 'Login history, role changes, data access',
    to: '/admin/audit',
    icon: <FileTextIcon />,
  },
  {
    title: 'Tenant settings',
    description: 'Company name, branding, defaults',
    to: '/admin/settings',
    icon: <SettingsIcon />,
  },
];

export function AdminPage() {
  const { isSuperAdmin } = useSuperAdmin();

  const cards = isSuperAdmin
    ? [...baseCards, rolesCard, ...trailingCards]
    : [...baseCards, ...trailingCards];

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Admin</h1>
        <p className={styles.pageSubtitle}>Configure your workspace and manage users</p>
      </div>
      <div className={styles.cardGrid}>
        {cards.map((card) => (
          <Link key={card.to} to={card.to} className={styles.navCard}>
            <div className={styles.navCardIcon} aria-hidden="true">
              {card.icon}
            </div>
            <div className={styles.navCardBody}>
              <div className={styles.navCardTitle}>
                {card.title}
                {card.comingSoon && <span className={styles.comingSoon}>Coming soon</span>}
              </div>
              <div className={styles.navCardDescription}>{card.description}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
