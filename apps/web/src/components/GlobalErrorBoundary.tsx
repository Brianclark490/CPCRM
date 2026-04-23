import { type ErrorInfo, type ReactNode } from 'react';
import { ErrorBoundary, type FallbackProps } from 'react-error-boundary';
import { logger } from '../lib/logger.js';

interface GlobalErrorBoundaryProps {
  children: ReactNode;
}

/**
 * Outermost error boundary — catches errors that escape the router or any
 * per-route boundary (e.g. provider initialisation failures).  Uses inline
 * styles so the fallback still renders if CSS fails to load.
 */
function GlobalFallback({ error, resetErrorBoundary }: FallbackProps) {
  const message = (error as Error)?.message ?? 'Unknown error';

  return (
    <div
      role="alert"
      aria-live="assertive"
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
        color: '#1a1a1a',
        background: '#f8f7f4',
      }}
    >
      <div
        style={{
          maxWidth: 520,
          padding: '1.5rem',
          borderRadius: '0.5rem',
          border: '1px solid rgba(220, 38, 38, 0.25)',
          background: '#fef2f2',
        }}
      >
        <h1 style={{ margin: 0, fontSize: '1.25rem', color: '#dc2626' }}>
          The application encountered a problem
        </h1>
        <p style={{ marginTop: '0.75rem', marginBottom: '1rem', color: '#6b6b6b' }}>
          Something unexpected happened while loading the app. Try reloading the page; if the problem
          continues, please contact support.
        </p>
        <p
          style={{
            marginTop: 0,
            marginBottom: '1rem',
            fontSize: '0.8125rem',
            color: '#6b6b6b',
            wordBreak: 'break-word',
          }}
        >
          <strong>Error:</strong> {message}
        </p>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '0.375rem',
              border: '1px solid #dc2626',
              background: '#dc2626',
              color: '#ffffff',
              fontSize: '0.875rem',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
          <button
            type="button"
            onClick={() => resetErrorBoundary()}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '0.375rem',
              border: '1px solid rgba(220, 38, 38, 0.25)',
              background: '#ffffff',
              color: '#dc2626',
              fontSize: '0.875rem',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      </div>
    </div>
  );
}

export function GlobalErrorBoundary({ children }: GlobalErrorBoundaryProps) {
  const handleError = (error: unknown, info: ErrorInfo) => {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('global error boundary caught render error', {
      errorName: err.name,
      errorMessage: err.message,
      componentStack: info.componentStack ?? undefined,
    });
  };

  return (
    <ErrorBoundary FallbackComponent={GlobalFallback} onError={handleError}>
      {children}
    </ErrorBoundary>
  );
}
