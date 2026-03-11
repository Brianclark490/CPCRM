import { useSyncExternalStore } from 'react';
import { Navigate } from 'react-router-dom';
import { useSession } from '@descope/react-sdk';
import { type ReactNode } from 'react';
import { sessionHistory } from '../store/sessionHistory.js';

interface ProtectedRouteProps {
  children: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isSessionLoading } = useSession();
  const wasAuthenticated = useSyncExternalStore(
    sessionHistory.subscribe,
    sessionHistory.getSnapshot,
  );

  if (isSessionLoading) {
    return <div>Loading...</div>;
  }

  if (!isAuthenticated) {
    const state = wasAuthenticated ? { reason: 'session_expired' } : undefined;
    return <Navigate to="/login" state={state} replace />;
  }

  return <>{children}</>;
}
