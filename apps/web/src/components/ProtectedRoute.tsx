import { type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useSession } from '@descope/react-sdk';

interface ProtectedRouteProps {
  children: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isSessionLoading } = useSession();

  if (isSessionLoading) {
    return <div>Loading...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
