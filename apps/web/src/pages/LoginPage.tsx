import { Descope, useSession } from '@descope/react-sdk';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { sessionHistory } from '../store/sessionHistory.js';
import styles from './LoginPage.module.css';

interface LocationState {
  reason?: string;
}

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, isSessionLoading } = useSession();

  const state = location.state as LocationState | null;
  const sessionExpired = state?.reason === 'session_expired';

  if (!isSessionLoading && isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSuccess = () => {
    sessionHistory.markAuthenticated();
    void navigate('/select-tenant');
  };

  const handleError = (e: CustomEvent) => {
    console.error('Descope login error:', e.detail);
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logoArea}>
          <span className={styles.logoText}>CPCRM</span>
        </div>
        <h1 className={styles.title}>Sign in to CPCRM</h1>
        <p className={styles.subtitle}>Enter your credentials to continue</p>
        {sessionExpired && (
          <p role="alert" className={styles.alert}>
            Your session has expired. Please sign in again.
          </p>
        )}
        <Descope flowId="sign-up-or-in" theme="dark" onSuccess={handleSuccess} onError={handleError} />
      </div>
    </div>
  );
}
