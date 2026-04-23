import { Link } from 'react-router-dom';
import { UserManagement } from '@descope/react-sdk';
import { ApiErrorDisplay } from '../components/ApiErrorDisplay.js';
import { useTenant } from '../store/tenant.js';
import {
  useRecords,
  type RecordItem,
} from '../features/records/hooks/queries/useRecords.js';
import styles from './AdminUsersPage.module.css';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fieldStr(user: RecordItem, key: string): string {
  return (user.fieldValues[key] as string) || '—';
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AdminUsersPage() {
  const { tenantId } = useTenant();
  // Only fetch once a tenant is selected, and isolate the cache entry by
  // tenant so switching organisations does not briefly render the previous
  // tenant's CRM users from cache.
  const usersQuery = useRecords(
    tenantId ? 'user' : undefined,
    { limit: 100 },
    { scope: { tenantId } },
  );
  const users = usersQuery.data?.data ?? [];

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

          {usersQuery.isLoading && <p className={styles.loadingText}>Loading users…</p>}
          {usersQuery.isError && <ApiErrorDisplay error={usersQuery.error} />}
          {usersQuery.isSuccess && users.length === 0 && (
            <p className={styles.emptyText}>
              No CRM user records yet. Users are created automatically when they log in.
            </p>
          )}

          {usersQuery.isSuccess && users.length > 0 && (
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
