import { type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useUser, useDescope } from '@descope/react-sdk';
import { sessionHistory } from '../store/sessionHistory.js';

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
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
      <header>
        <span>CPCRM</span>
        <div>
          {user && <span>{user.name ?? user.email ?? 'User'}</span>}
          <button type="button" onClick={() => void handleLogout()}>Sign out</button>
        </div>
      </header>
      <div>
        <nav aria-label="Main navigation">
          <ul>
            <li>
              <NavLink to="/dashboard">Dashboard</NavLink>
            </li>
            <li>
              <NavLink to="/opportunities">Opportunities</NavLink>
            </li>
            <li>
              <NavLink to="/accounts">Accounts</NavLink>
            </li>
            <li>
              <NavLink to="/admin">Admin</NavLink>
            </li>
          </ul>
        </nav>
        <main>{children}</main>
      </div>
    </div>
  );
}
