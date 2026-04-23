import { useState } from 'react';
import type { FallbackProps } from 'react-error-boundary';
import styles from './RouteErrorFallback.module.css';

function isDev(): boolean {
  try {
    return Boolean((import.meta as { env?: { DEV?: boolean } }).env?.DEV);
  } catch {
    return false;
  }
}

function toError(value: unknown): Error {
  if (value instanceof Error) return value;
  if (typeof value === 'string') return new Error(value);
  try {
    return new Error(JSON.stringify(value));
  } catch {
    return new Error(String(value));
  }
}

function formatErrorForCopy(error: unknown): string {
  const err = toError(error);
  const name = err.name || 'Error';
  const message = err.message || '';
  const stack = err.stack || '';
  return `${name}: ${message}\n\n${stack}`.trim();
}

export function RouteErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
      return;
    }
    try {
      await navigator.clipboard.writeText(formatErrorForCopy(error));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard write failed (e.g. permission denied) — leave the confirmation off.
    }
  };

  const handleReload = () => {
    window.location.reload();
  };

  return (
    <div className={styles.root} role="alert" aria-live="assertive" data-testid="route-error-fallback">
      <h2 className={styles.title}>Something went wrong on this page</h2>
      <p className={styles.message}>
        We hit an unexpected error while rendering this page. You can try again, reload the page, or copy
        the error details to share with support.
      </p>
      <div className={styles.actions}>
        <button
          type="button"
          className={`${styles.button} ${styles.buttonPrimary}`}
          onClick={() => resetErrorBoundary()}
        >
          Try again
        </button>
        <button type="button" className={styles.button} onClick={handleReload}>
          Reload
        </button>
        <button type="button" className={styles.button} onClick={() => void handleCopy()}>
          Copy error
        </button>
        {copied && (
          <span className={styles.copyConfirm} role="status">
            Copied
          </span>
        )}
      </div>
      {isDev() && (
        <details className={styles.details}>
          <summary>Error details (dev only)</summary>
          <pre className={styles.stack}>{formatErrorForCopy(error)}</pre>
        </details>
      )}
    </div>
  );
}
