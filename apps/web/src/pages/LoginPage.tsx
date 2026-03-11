import { Descope } from '@descope/react-sdk';
import { useNavigate } from 'react-router-dom';

export function LoginPage() {
  const navigate = useNavigate();

  const handleSuccess = () => {
    void navigate('/dashboard');
  };

  const handleError = (e: CustomEvent) => {
    console.error('Descope login error:', e.detail);
  };

  return (
    <div>
      <h1>Sign in to CPCRM</h1>
      <Descope flowId="sign-up-or-in" onSuccess={handleSuccess} onError={handleError} />
    </div>
  );
}
