import { Descope, useSession } from '@descope/react-sdk';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { sessionHistory } from '../store/sessionHistory.js';

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
    void navigate('/dashboard');
  };

  const handleError = (e: CustomEvent) => {
    console.error('Descope login error:', e.detail);
  };

  return (
    <div>
      <h1>Sign in to CPCRM</h1>
      {sessionExpired && (
        <p role="alert">Your session has expired. Please sign in again.</p>
      )}
      <Descope flowId="sign-up-or-in" onSuccess={handleSuccess} onError={handleError} />
    </div>
  );
}
