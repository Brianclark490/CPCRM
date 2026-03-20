import { UserProfile } from '@descope/react-sdk';
import styles from './SettingsProfilePage.module.css';

export function SettingsProfilePage() {
  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>My profile</h1>
        <p className={styles.pageSubtitle}>Manage your personal details and preferences</p>
      </div>
      <div className={styles.widgetContainer}>
        <UserProfile widgetId="user-profile-widget" />
      </div>
    </div>
  );
}
