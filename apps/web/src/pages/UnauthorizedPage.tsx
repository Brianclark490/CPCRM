import { useNavigate } from 'react-router-dom';
import styles from './ErrorPage.module.css';

export function UnauthorizedPage() {
  const navigate = useNavigate();

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <p className={styles.codeLabel}>403</p>
        <h1 className={styles.title}>Access Denied</h1>
        <p className={styles.message}>You do not have permission to view this page.</p>
        <button className={styles.button} onClick={() => void navigate('/dashboard')}>
          Go to Dashboard
        </button>
      </div>
    </div>
  );
}
