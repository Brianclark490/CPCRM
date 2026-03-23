import { AuditManagement } from '@descope/react-sdk';
import { useTenant } from '../store/tenant.js';
import styles from './AdminAuditPage.module.css';

export function AdminAuditPage() {
  const { tenantId } = useTenant();

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Audit log</h1>
        <p className={styles.pageSubtitle}>
          Login history, role changes, and data access events
        </p>
      </div>
      <div className={styles.widgetContainer}>
        {tenantId ? (
          <AuditManagement tenant={tenantId} widgetId="audit-management-widget" theme="dark" />
        ) : (
          <p>No organisation selected. Please select an organisation first.</p>
        )}
      </div>
    </div>
  );
}
