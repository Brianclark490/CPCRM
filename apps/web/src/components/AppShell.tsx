import { type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useUser, useDescope, useSession } from '@descope/react-sdk';
import { sessionHistory } from '../store/sessionHistory.js';
import { useTenant, clearStoredTenant } from '../store/tenant.js';
import { useSuperAdmin } from '../store/superAdmin.js';
import { useTheme } from '../store/useTheme.js';
import { ProfileDropdown } from './ProfileDropdown.js';
import { ObjectTabs } from './ObjectTabs.js';
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

export function AppShell({ children }: AppShellProps) {
  const { user } = useUser();
  const { logout } = useDescope();
  const { sessionToken } = useSession();
  const navigate = useNavigate();
  const { tenantName } = useTenant();
  const { isSuperAdmin } = useSuperAdmin();
  const { theme, toggle: toggleTheme } = useTheme();

  const handleLogout = async () => {
    await logout();
    sessionHistory.clearAuthenticated();
    clearStoredTenant();
    void navigate('/login');
  };

  const displayName = user?.name ?? user?.email ?? 'User';
  const initials = getInitials(user?.name, user?.email);

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.logoText}>CPCRM</span>
          {tenantName && (
            <NavLink to="/select-tenant" className={styles.tenantBadge} title="Switch organisation">
              {tenantName}
            </NavLink>
          )}
          <NavLink
            to="/dashboard"
            className={({ isActive }) =>
              `${styles.headerNavLink} ${isActive ? styles.headerNavLinkActive : ''}`
            }
          >
            Dashboard
          </NavLink>
          <NavLink
            to="/admin"
            className={({ isActive }) =>
              `${styles.headerNavLink} ${isActive ? styles.headerNavLinkActive : ''}`
            }
          >
            Admin
          </NavLink>
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

          {user && (
            <ProfileDropdown
              displayName={displayName}
              email={user.email}
              initials={initials}
              isSuperAdmin={isSuperAdmin}
              theme={theme}
              onThemeToggle={toggleTheme}
              onSignOut={() => void handleLogout()}
            />
          )}
        </div>
      </header>

      <ObjectTabs sessionToken={sessionToken} />

      <main className={styles.content}>
        <div className={styles.contentContainer}>{children}</div>
      </main>
    </div>
  );
}
