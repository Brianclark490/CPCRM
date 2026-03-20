import { UserManagement } from '@descope/react-sdk';
import { useTenant } from '../store/tenant.js';
import styles from './AdminUsersPage.module.css';

export function AdminUsersPage() {
  const { tenantId } = useTenant();

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>User management</h1>
        <p className={styles.pageSubtitle}>Invite, manage, and remove users in your organisation</p>
      </div>
      <div className={styles.widgetContainer}>
        {tenantId ? (
          <UserManagement tenant={tenantId} widgetId="user-management-widget" theme="dark" />
        ) : (
          <p>No organisation selected. Please select an organisation first.</p>
        )}
      </div>
    </div>
  );
}
