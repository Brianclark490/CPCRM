import { useCallback, useEffect, useState } from 'react';
import { useApiClient } from '../../lib/apiClient.js';
import styles from './ConnectMailboxCard.module.css';

interface MailboxStatus {
  connected: boolean;
  status: 'active' | 'paused' | 'revoked' | 'error' | 'disconnected';
  emailAddress: string | null;
  provider: string | null;
}

/**
 * Sits on the profile/settings page. Lets the user connect or disconnect
 * their Microsoft 365 mailbox and surfaces the current status.
 */
export function ConnectMailboxCard() {
  const api = useApiClient();
  const [status, setStatus] = useState<MailboxStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await api.get<MailboxStatus>('/api/v1/mailbox/status');
      setStatus(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load mailbox status');
    }
  }, [api]);

  useEffect(() => {
    void refresh();
    // If we just came back from the OAuth callback, the API has written the
    // connection row; strip the query string so a refresh doesn't re-show
    // the success banner.
    const params = new URLSearchParams(window.location.search);
    if (params.get('mailboxConnected') || params.get('mailboxError')) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [refresh]);

  const connect = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const { authUrl } = await api.get<{ authUrl: string }>(
        '/api/v1/mailbox/connect/microsoft',
      );
      window.location.href = authUrl;
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : 'Failed to start OAuth flow');
    }
  }, [api]);

  const disconnect = useCallback(async () => {
    setBusy(true);
    try {
      await api.del('/api/v1/mailbox/disconnect');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect mailbox');
    } finally {
      setBusy(false);
    }
  }, [api, refresh]);

  const connected = status?.connected ?? false;

  return (
    <section className={styles.card}>
      <header className={styles.header}>
        <h2 className={styles.title}>Email-to-CRM</h2>
        <p className={styles.subtitle}>
          Connect your Outlook mailbox and CPCRM will automatically file emails
          against the right Account. Internal threads are skipped by default —
          you can still pull them in from the Mailbox page.
        </p>
      </header>

      {status && (
        <div className={styles.status}>
          <span
            className={connected ? styles.pillActive : styles.pillInactive}
            data-testid="mailbox-status-pill"
          >
            {connected ? 'Connected' : status.status === 'error' ? 'Error' : 'Not connected'}
          </span>
          {status.emailAddress && (
            <span className={styles.address}>{status.emailAddress}</span>
          )}
        </div>
      )}

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.actions}>
        {connected ? (
          <button className={styles.secondary} onClick={disconnect} disabled={busy}>
            Disconnect mailbox
          </button>
        ) : (
          <button className={styles.primary} onClick={connect} disabled={busy}>
            {busy ? 'Redirecting…' : 'Connect Outlook'}
          </button>
        )}
      </div>
    </section>
  );
}
