import { RoleManagement } from '@descope/react-sdk';
import { useTenant } from '../store/tenant.js';
import styles from './AdminRolesPage.module.css';

export function AdminRolesPage() {
  const { tenantId } = useTenant();

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Roles</h1>
        <p className={styles.pageSubtitle}>Manage roles and permissions for your organisation</p>
      </div>
      <div className={styles.widgetContainer}>
        {tenantId ? (
          <RoleManagement tenant={tenantId} widgetId="role-management-widget" />
        ) : (
          <p>No organisation selected. Please select an organisation first.</p>
        )}
      </div>
    </div>
  );
}
