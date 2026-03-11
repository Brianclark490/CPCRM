import { useNavigate } from 'react-router-dom';

export function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <div>
      <h1>Page Not Found</h1>
      <p>The page you are looking for does not exist.</p>
      <button onClick={() => void navigate('/dashboard')}>Go to Dashboard</button>
    </div>
  );
}
