import { type ErrorInfo, type ReactNode } from 'react';
import { ErrorBoundary, type FallbackProps } from 'react-error-boundary';
import { useLocation } from 'react-router-dom';
import { useUser } from '@descope/react-sdk';
import { useTenant } from '../store/tenant.js';
import { logger } from '../lib/logger.js';
import { RouteErrorFallback } from './RouteErrorFallback.js';

interface RouteErrorBoundaryProps {
  children: ReactNode;
  /**
   * Optional override for the fallback component. Defaults to the shared
   * {@link RouteErrorFallback}, which matches the app's error surface styling.
   */
  FallbackComponent?: (props: FallbackProps) => ReactNode;
}

/**
 * Per-route error boundary.
 *
 * Catches render errors within a single route, reports them through the
 * frontend logger (which Issue 4.4 will wire to Application Insights), and
 * renders an accessible fallback.  Automatically resets when the URL
 * pathname changes so the user is not stuck on a broken view after
 * navigating away.
 */
export function RouteErrorBoundary({
  children,
  FallbackComponent = RouteErrorFallback,
}: RouteErrorBoundaryProps) {
  const location = useLocation();
  const { user } = useUser();
  const { tenantId } = useTenant();

  const handleError = (error: unknown, info: ErrorInfo) => {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('route error boundary caught render error', {
      route: location.pathname,
      errorName: err.name,
      errorMessage: err.message,
      componentStack: info.componentStack ?? undefined,
      userId: (user as { userId?: string } | undefined)?.userId,
      userEmail: user?.email,
      tenantId,
    });
  };

  return (
    <ErrorBoundary
      FallbackComponent={FallbackComponent}
      onError={handleError}
      resetKeys={[location.pathname]}
    >
      {children}
    </ErrorBoundary>
  );
}
