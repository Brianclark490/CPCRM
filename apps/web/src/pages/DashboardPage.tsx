import { useUser } from '@descope/react-sdk';

export function DashboardPage() {
  const { user } = useUser();

  return (
    <div>
      <h1>Dashboard</h1>
      {user && <p>Welcome, {user.name ?? user.email ?? 'User'}</p>}
    </div>
  );
}
