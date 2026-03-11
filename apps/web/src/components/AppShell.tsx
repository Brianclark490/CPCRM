import { type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useUser, useDescope } from '@descope/react-sdk';
import { sessionHistory } from '../store/sessionHistory.js';
import styles from './AppShell.module.css';

interface AppShellProps {
  children: ReactNode;
}

function getInitials(name: string | undefined, email: string | undefined): string {
  if (name) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase() || '?';
    }
    return (parts[0]?.[0] ?? '?').toUpperCase();
  }
  if (email) return email[0]?.toUpperCase() ?? '?';
  return '?';
}

const navItems = [
  {
    to: '/dashboard',
    label: 'Dashboard',
    icon: (
      <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
        <rect x="1" y="1" width="6" height="6" rx="1.5" fill="currentColor" />
        <rect x="9" y="1" width="6" height="6" rx="1.5" fill="currentColor" />
        <rect x="1" y="9" width="6" height="6" rx="1.5" fill="currentColor" />
        <rect x="9" y="9" width="6" height="6" rx="1.5" fill="currentColor" />
      </svg>
    ),
  },
  {
    to: '/opportunities',
    label: 'Opportunities',
    icon: (
      <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
        <path
          d="M2 12V5a1 1 0 011-1h10a1 1 0 011 1v7a1 1 0 01-1 1H3a1 1 0 01-1-1z"
          stroke="currentColor"
          strokeWidth="1.25"
        />
        <path d="M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1" stroke="currentColor" strokeWidth="1.25" />
        <path d="M8 7v3M6 9h4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    to: '/accounts',
    label: 'Accounts',
    icon: (
      <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
        <circle cx="6" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.25" />
        <path
          d="M1 13c0-2.21 2.239-4 5-4s5 1.79 5 4"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinecap="round"
        />
        <path
          d="M11 7c1.105 0 2 .895 2 2"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinecap="round"
        />
        <path
          d="M11 11c1.657 0 3 .895 3 2"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    to: '/admin',
    label: 'Admin',
    icon: (
      <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
        <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.25" />
        <path
          d="M8 2v1M8 13v1M2 8h1M13 8h1M3.757 3.757l.707.707M11.536 11.536l.707.707M3.757 12.243l.707-.707M11.536 4.464l.707-.707"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    to: '/settings',
    label: 'Settings',
    icon: (
      <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
        <path
          d="M6.5 2h3l.5 1.5 1.3.75 1.5-.5 2.12 2.12-.5 1.5L15 8.5v1l-.58 1.13.5 1.5-2.12 2.12-1.5-.5L10 14H6l-.5-1.5-1.3-.75-1.5.5L.58 10.13l.5-1.5L.5 7.5v-1l.58-1.13-.5-1.5L2.7 1.75l1.5.5L5.5 2h1z"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinejoin="round"
        />
        <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.25" />
      </svg>
    ),
  },
];

export function AppShell({ children }: AppShellProps) {
  const { user } = useUser();
  const { logout } = useDescope();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    sessionHistory.clearAuthenticated();
    void navigate('/login');
  };

  const displayName = user?.name ?? user?.email ?? 'User';
  const initials = getInitials(user?.name, user?.email);

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarLogo}>
          <span className={styles.logoText}>CPCRM</span>
        </div>
        <nav aria-label="Main navigation" className={styles.nav}>
          <div className={styles.navSection}>
            <span className={styles.navLabel}>Menu</span>
            <ul className={styles.navList}>
              {navItems.map(({ to, label, icon }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    className={({ isActive }) =>
                      `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`
                    }
                  >
                    <span className={styles.navIcon}>{icon}</span>
                    {label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        </nav>
      </aside>

      <div className={styles.main}>
        <header className={styles.header}>
          <div className={styles.searchWrap}>
            <svg
              className={styles.searchIcon}
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
            >
              <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.25" />
              <path
                d="M10.5 10.5L13 13"
                stroke="currentColor"
                strokeWidth="1.25"
                strokeLinecap="round"
              />
            </svg>
            <input
              type="search"
              placeholder="Search…"
              className={styles.searchInput}
              aria-label="Search"
            />
          </div>

          <div className={styles.headerActions}>
            <button type="button" className={styles.iconButton} aria-label="Notifications">
              <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="M8 2a4 4 0 00-4 4v2.5L2.5 10h11L12 8.5V6a4 4 0 00-4-4z"
                  stroke="currentColor"
                  strokeWidth="1.25"
                  strokeLinejoin="round"
                />
                <path
                  d="M6.5 10.5a1.5 1.5 0 003 0"
                  stroke="currentColor"
                  strokeWidth="1.25"
                  strokeLinecap="round"
                />
              </svg>
            </button>

            <div className={styles.userInfo}>
              {user && (
                <>
                  <button
                    type="button"
                    className={styles.userAvatar}
                    aria-label={`User menu for ${displayName}`}
                  >
                    {initials}
                  </button>
                  <span className={styles.userName}>{displayName}</span>
                </>
              )}
            </div>

            <button
              type="button"
              className={styles.signOutButton}
              onClick={() => void handleLogout()}
            >
              Sign out
            </button>
          </div>
        </header>
        <main className={styles.content}>{children}</main>
      </div>
    </div>
  );
}
