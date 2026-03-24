import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import styles from './ProfileDropdown.module.css';

interface ProfileDropdownProps {
  displayName: string;
  email: string | undefined;
  initials: string;
  isSuperAdmin: boolean;
  theme: 'light' | 'dark';
  onThemeToggle: () => void;
  onSignOut: () => void;
}

export function ProfileDropdown({
  displayName,
  email,
  initials,
  isSuperAdmin,
  theme,
  onThemeToggle,
  onSignOut,
}: ProfileDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div className={styles.wrapper} ref={ref}>
      <button
        type="button"
        className={styles.avatarButton}
        aria-label={`User menu for ${displayName}`}
        onClick={() => setOpen((o) => !o)}
      >
        {initials}
      </button>

      {open && (
        <div className={styles.menu} role="menu">
          {/* ── User identity ────────────────────────────── */}
          <div className={styles.userHeader}>
            <div className={styles.userName}>{displayName}</div>
            {email && email !== displayName && (
              <div className={styles.userEmail}>{email}</div>
            )}
            {isSuperAdmin && <span className={styles.adminBadge}>Admin</span>}
          </div>

          <div className={styles.divider} />

          {/* ── Personal ─────────────────────────────────── */}
          <Link
            to="/settings/profile"
            className={styles.menuItem}
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            <span className={styles.menuItemIcon} aria-hidden="true">
              👤
            </span>
            My profile
          </Link>
          <Link
            to="/admin/settings"
            className={styles.menuItem}
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            <span className={styles.menuItemIcon} aria-hidden="true">
              ⚙️
            </span>
            Settings
          </Link>

          <div className={styles.divider} />

          {/* ── Admin section ────────────────────────────── */}
          <div className={styles.sectionLabel}>Admin</div>
          <Link
            to="/admin/objects"
            className={styles.menuItem}
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            <span className={styles.menuItemIcon} aria-hidden="true">
              🔲
            </span>
            Object manager
          </Link>
          <Link
            to="/admin/pipelines"
            className={styles.menuItem}
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            <span className={styles.menuItemIcon} aria-hidden="true">
              📈
            </span>
            Pipeline manager
          </Link>
          <Link
            to="/admin/users"
            className={styles.menuItem}
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            <span className={styles.menuItemIcon} aria-hidden="true">
              👥
            </span>
            User management
          </Link>
          <Link
            to="/admin/roles"
            className={styles.menuItem}
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            <span className={styles.menuItemIcon} aria-hidden="true">
              🔒
            </span>
            Roles & permissions
          </Link>
          <Link
            to="/admin/audit"
            className={styles.menuItem}
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            <span className={styles.menuItemIcon} aria-hidden="true">
              📄
            </span>
            Audit log
          </Link>
          <Link
            to="/admin/targets"
            className={styles.menuItem}
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            <span className={styles.menuItemIcon} aria-hidden="true">
              🎯
            </span>
            Sales targets
          </Link>

          {/* ── Platform section (super-admin only) ──────── */}
          {isSuperAdmin && (
            <>
              <div className={styles.divider} />
              <div className={styles.sectionLabel}>Platform</div>
              <Link
                to="/platform/tenants"
                className={styles.menuItem}
                role="menuitem"
                onClick={() => setOpen(false)}
              >
                <span className={styles.menuItemIcon} aria-hidden="true">
                  🏢
                </span>
                Tenant management
              </Link>
            </>
          )}

          <div className={styles.divider} />

          {/* ── Appearance toggle ────────────────────────── */}
          <div className={styles.themeRow}>
            <span className={styles.themeLabel}>
              <span className={styles.themeLabelIcon} aria-hidden="true">
                🌙
              </span>
              Dark mode
            </span>
            <button
              type="button"
              className={`${styles.themeToggle} ${theme === 'dark' ? styles.themeToggleActive : ''}`}
              aria-label="Toggle dark mode"
              onClick={onThemeToggle}
            />
          </div>

          {/* ── Sign out ─────────────────────────────────── */}
          <button
            type="button"
            className={styles.menuItemDanger}
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
          >
            <span className={styles.menuItemIcon} aria-hidden="true">
              🚪
            </span>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
