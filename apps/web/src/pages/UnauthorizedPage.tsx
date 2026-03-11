import { useNavigate } from 'react-router-dom';

export function UnauthorizedPage() {
  const navigate = useNavigate();

  return (
    <div>
      <h1>Access Denied</h1>
      <p>You do not have permission to view this page.</p>
      <button onClick={() => void navigate('/dashboard')}>Go to Dashboard</button>
    </div>
  );
}
