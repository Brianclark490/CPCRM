import { useUser, useDescope } from '@descope/react-sdk';
import { useNavigate } from 'react-router-dom';
import { sessionHistory } from '../store/sessionHistory.js';

export function DashboardPage() {
  const { user } = useUser();
  const { logout } = useDescope();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    sessionHistory.clearAuthenticated();
    void navigate('/login');
  };

  return (
    <div>
      <h1>Dashboard</h1>
      {user && <p>Welcome, {user.name ?? user.email ?? 'User'}</p>}
      <button onClick={() => void handleLogout()}>Sign out</button>
    </div>
  );
}
