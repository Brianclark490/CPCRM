import { ApiError } from '../lib/apiClient.js';
import styles from './ApiErrorDisplay.module.css';

interface ApiErrorDisplayProps {
  /**
   * The error to render. Accepts an {@link ApiError}, a generic `Error`, or
   * a plain string so callers can funnel every failure mode through the same
   * component.
   */
  error: ApiError | Error | string | null | undefined;
  /** Optional heading — defaults to a status-appropriate title. */
  title?: string;
  /** Retry handler. When provided, a "Try again" button is rendered. */
  onRetry?: () => void;
  /** Optional test id hook. */
  testId?: string;
}

function defaultTitleFor(error: ApiError | Error | string): string {
  if (typeof error === 'string') return 'Something went wrong';
  if (error instanceof ApiError) {
    if (error.isNetwork) return 'Connection problem';
    if (error.status === 401) return 'Please sign in again';
    if (error.status === 403) return "You don't have permission";
    if (error.status === 404) return 'Not found';
    if (error.status === 422) return 'Please check the form';
    if (error.status >= 500) return 'Server error';
    return 'Request failed';
  }
  return 'Something went wrong';
}

function messageFor(error: ApiError | Error | string): string {
  if (typeof error === 'string') return error;
  return error.message || 'An unexpected error occurred.';
}

/**
 * Single inline error surface for anything thrown by the API client.
 *
 * Renders a heading, the error message, any field-level errors reported by
 * the server, and an optional retry button.  This component is the only
 * place the web app needs to know how to render an {@link ApiError}.
 */
export function ApiErrorDisplay({
  error,
  title,
  onRetry,
  testId,
}: ApiErrorDisplayProps) {
  if (!error) return null;

  const resolvedTitle = title ?? defaultTitleFor(error);
  const message = messageFor(error);
  const fieldErrors =
    error instanceof ApiError && Object.keys(error.fieldErrors).length > 0
      ? error.fieldErrors
      : null;

  return (
    <div
      className={styles.root}
      role="alert"
      data-testid={testId ?? 'api-error'}
    >
      <p className={styles.title}>{resolvedTitle}</p>
      <p className={styles.message}>{message}</p>
      {fieldErrors && (
        <ul className={styles.fieldList}>
          {Object.entries(fieldErrors).map(([field, messages]) => (
            <li key={field}>
              <strong>{field}:</strong> {messages.join(', ')}
            </li>
          ))}
        </ul>
      )}
      {onRetry && (
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.retryButton}
            onClick={onRetry}
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
