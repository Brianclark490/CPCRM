import { Descope, useDescope } from '@descope/react-sdk';
import { useNavigate } from 'react-router-dom';

export function LoginPage() {
  const navigate = useNavigate();
  const { logout } = useDescope();

  const handleSuccess = () => {
    void navigate('/dashboard');
  };

  const handleError = (e: CustomEvent) => {
    console.error('Descope login error:', e.detail);
  };

  // If the user explicitly visits /login while already logged in,
  // let them log out first via normal logout flow; this page just shows the flow.
  void logout;

  return (
    <div>
      <h1>Sign in to CPCRM</h1>
      <Descope flowId="sign-up-or-in" onSuccess={handleSuccess} onError={handleError} />
    </div>
  );
}
