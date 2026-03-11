import { useNavigate } from 'react-router-dom';
import styles from './ErrorPage.module.css';

export function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <p className={styles.codeLabel}>404</p>
        <h1 className={styles.title}>Page Not Found</h1>
        <p className={styles.message}>The page you are looking for does not exist.</p>
        <button className={styles.button} onClick={() => void navigate('/dashboard')}>
          Go to Dashboard
        </button>
      </div>
    </div>
  );
}
