import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useUser, useDescope, useSession } from '@descope/react-sdk';
import { sessionHistory } from '../store/sessionHistory.js';
import { useTenant, clearStoredTenant } from '../store/tenant.js';
import styles from './AppShell.module.css';

interface AppShellProps {
  children: ReactNode;
}

interface ObjectDefinitionNavItem {
  id: string;
  apiName: string;
  pluralLabel: string;
  icon?: string;
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

const TEXT_ICON_MAP: Record<string, string> = {
  building: '🏢',
  'dollar-sign': '💰',
  person: '👤',
  user: '👤',
  'user-plus': '👥',
  'trending-up': '📈',
  calendar: '📅',
  'check-circle': '✅',
  'file-text': '📄',
  'message-square': '💬',
  paperclip: '📎',
  briefcase: '💼',
  clipboard: '📋',
  target: '🎯',
  money: '💰',
  chart: '📊',
  wrench: '🔧',
  star: '⭐',
  note: '📝',
  folder: '🗂️',
  package: '📦',
};

function resolveIcon(icon: string): string {
  return TEXT_ICON_MAP[icon] ?? icon;
}

export function AppShell({ children }: AppShellProps) {
  const { user } = useUser();
  const { logout } = useDescope();
  const { sessionToken } = useSession();
  const navigate = useNavigate();
  const { tenantName } = useTenant();

  const [objectNavItems, setObjectNavItems] = useState<ObjectDefinitionNavItem[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragCounterRef = useRef(0);

  // Fetch object definitions for dynamic tab bar
  useEffect(() => {
    if (!sessionToken) return;

    let cancelled = false;

    const loadObjects = async () => {
      try {
        const response = await fetch('/api/admin/objects', {
          headers: { Authorization: `Bearer ${sessionToken}` },
        });

        if (cancelled || !response.ok) return;

        const objects = (await response.json()) as Array<{
          id: string;
          apiName: string;
          pluralLabel: string;
          icon?: string;
        }>;

        if (!cancelled) {
          setObjectNavItems(
            objects.map((o) => ({
              id: o.id,
              apiName: o.apiName,
              pluralLabel: o.pluralLabel,
              icon: o.icon,
            })),
          );
        }
      } catch {
        // Object fetch is best-effort
      }
    };

    void loadObjects();

    return () => {
      cancelled = true;
    };
  }, [sessionToken]);

  const persistOrder = useCallback(
    async (items: ObjectDefinitionNavItem[]) => {
      if (!sessionToken) return;
      try {
        await fetch('/api/admin/objects/reorder', {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${sessionToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ orderedIds: items.map((item) => item.id) }),
        });
      } catch {
        // Reorder persist is best-effort
      }
    },
    [sessionToken],
  );

  const handleDragStart = useCallback((index: number, e: React.DragEvent) => {
    setDragIndex(index);
    dragCounterRef.current = 0;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(index));
    }
  }, []);

  const handleDragEnter = useCallback(
    (index: number, e: React.DragEvent) => {
      e.preventDefault();
      if (dragIndex === null || index === dragIndex) return;
      dragCounterRef.current += 1;
      setDragOverIndex(index);
    },
    [dragIndex],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move';
    }
  }, []);

  const handleDragLeave = useCallback(
    (index: number) => {
      dragCounterRef.current -= 1;
      if (dragCounterRef.current <= 0 && dragOverIndex === index) {
        dragCounterRef.current = 0;
        setDragOverIndex(null);
      }
    },
    [dragOverIndex],
  );

  const handleDrop = useCallback(
    (targetIndex: number, e: React.DragEvent) => {
      e.preventDefault();
      if (dragIndex === null || dragIndex === targetIndex) {
        setDragIndex(null);
        setDragOverIndex(null);
        return;
      }

      setObjectNavItems((prev) => {
        const updated = [...prev];
        const [moved] = updated.splice(dragIndex, 1);
        updated.splice(targetIndex, 0, moved);
        void persistOrder(updated);
        return updated;
      });

      setDragIndex(null);
      setDragOverIndex(null);
    },
    [dragIndex, persistOrder],
  );

  const handleDragEnd = useCallback(() => {
    setDragIndex(null);
    setDragOverIndex(null);
    dragCounterRef.current = 0;
  }, []);

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

      <nav aria-label="Object navigation" className={styles.tabBar}>
        <div className={styles.tabList}>
          {objectNavItems.map(({ apiName, pluralLabel, icon }, index) => (
            <NavLink
              key={apiName}
              to={`/objects/${apiName}`}
              draggable
              onDragStart={(e) => handleDragStart(index, e)}
              onDragEnter={(e) => handleDragEnter(index, e)}
              onDragOver={handleDragOver}
              onDragLeave={() => handleDragLeave(index)}
              onDrop={(e) => handleDrop(index, e)}
              onDragEnd={handleDragEnd}
              className={({ isActive }) =>
                [
                  styles.tab,
                  isActive ? styles.tabActive : '',
                  dragIndex === index ? styles.tabDragging : '',
                  dragOverIndex === index ? styles.tabDragOver : '',
                ]
                  .filter(Boolean)
                  .join(' ')
              }
            >
              {icon && (
                <span className={styles.tabIcon} aria-hidden="true">
                  {resolveIcon(icon)}
                </span>
              )}
              {pluralLabel}
            </NavLink>
          ))}
        </div>
        <NavLink
          to="/admin"
          className={({ isActive }) =>
            `${styles.tab} ${styles.tabAdmin} ${isActive ? styles.tabActive : ''}`
          }
        >
          <svg
            className={styles.adminIcon}
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
            focusable="false"
          >
            <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.25" />
            <path
              d="M8 2v1M8 13v1M2 8h1M13 8h1M3.757 3.757l.707.707M11.536 11.536l.707.707M3.757 12.243l.707-.707M11.536 4.464l.707-.707"
              stroke="currentColor"
              strokeWidth="1.25"
              strokeLinecap="round"
            />
          </svg>
          Admin
        </NavLink>
      </nav>

      <main className={styles.content}>
        <div className={styles.contentContainer}>{children}</div>
      </main>
    </div>
  );
}
