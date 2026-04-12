import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { UserManagement, useSession } from '@descope/react-sdk';
import { useApiClient } from '../lib/apiClient.js';
import { useTenant } from '../store/tenant.js';
import styles from './AdminUsersPage.module.css';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CrmUser {
  id: string;
  name: string;
  fieldValues: Record<string, unknown>;
}

interface UsersResponse {
  data: CrmUser[];
  total: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fieldStr(user: CrmUser, key: string): string {
  return (user.fieldValues[key] as string) || '—';
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AdminUsersPage() {
  const { tenantId } = useTenant();
  const { sessionToken } = useSession();
  const api = useApiClient();
  const [users, setUsers] = useState<CrmUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionToken || !tenantId) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    const loadUsers = async () => {
      try {
        const response = await api.request('/api/objects/user/records?limit=100');

        if (cancelled) return;

        if (!response.ok) {
          setError('Failed to load CRM users');
          setLoading(false);
          return;
        }

        const result = (await response.json()) as UsersResponse;
        if (!cancelled) {
          setUsers(result.data);
        }
      } catch {
        if (!cancelled) setError('Failed to load CRM users');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadUsers();

    return () => {
      cancelled = true;
    };
  }, [sessionToken, api, tenantId]);

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>User management</h1>
        <p className={styles.pageSubtitle}>Invite, manage, and remove users in your organisation</p>
      </div>

      {/* CRM User records list */}
      {tenantId && (
        <div className={styles.userListSection}>
          <h2 className={styles.sectionTitle}>CRM users</h2>
          <p className={styles.sectionSubtitle}>
            Users synced from authentication. Click a user to view their full profile.
          </p>

          {loading && <p className={styles.loadingText}>Loading users…</p>}
          {error && <p className={styles.errorText}>{error}</p>}
          {!loading && !error && users.length === 0 && (
            <p className={styles.emptyText}>
              No CRM user records yet. Users are created automatically when they log in.
            </p>
          )}

          {!loading && !error && users.length > 0 && (
            <div className={styles.tableWrapper}>
              <table className={styles.userTable}>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Job title</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id}>
                      <td>
                        <Link to={`/objects/user/${user.id}`} className={styles.userLink}>
                          {user.name || '—'}
                        </Link>
                      </td>
                      <td>{fieldStr(user, 'email')}</td>
                      <td>{fieldStr(user, 'role')}</td>
                      <td>{fieldStr(user, 'job_title')}</td>
                      <td>
                        <span
                          className={
                            user.fieldValues.is_active === true
                              ? styles.badgeActive
                              : styles.badgeInactive
                          }
                        >
                          {user.fieldValues.is_active === true ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Descope auth management widget */}
      <div className={styles.widgetSection}>
        <h2 className={styles.sectionTitle}>Authentication management</h2>
        <p className={styles.sectionSubtitle}>
          Invite users, reset passwords, and manage authentication settings via Descope.
        </p>
        <div className={styles.widgetContainer}>
          {tenantId ? (
            <UserManagement tenant={tenantId} widgetId="user-management-widget" theme="dark" />
          ) : (
            <p>No organisation selected. Please select an organisation first.</p>
          )}
        </div>
      </div>
    </div>
  );
}
