import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApiClient } from '../lib/apiClient.js';
import styles from './EmailIngestPage.module.css';

interface IngestRow {
  id: string;
  receivedAt: string;
  fromEmail: string;
  fromName: string | null;
  subject: string | null;
  status:
    | 'auto_applied'
    | 'new_account'
    | 'pending_user_review'
    | 'resolved'
    | 'failed'
    | 'skipped';
  accountId: string | null;
  activityId: string | null;
  reviewTaskId: string | null;
  confidence: number | null;
  filterDecision: string;
  error: string | null;
}

interface IngestDetail extends IngestRow {
  toEmails: string[];
  ccEmails: string[];
  textBody: string | null;
  extraction: {
    company?: { name: string; domain?: string; industry?: string };
    candidates?: Array<{ accountId: string; score: number; reason: string }>;
    summary?: string;
  } | null;
}

interface InternalRecentRow {
  providerMessageId: string;
  fromEmail: string;
  fromName?: string;
  subject?: string;
  receivedAt: string;
  preview?: string;
  toEmails: string[];
}

function statusLabel(status: IngestRow['status']): string {
  switch (status) {
    case 'auto_applied':
      return 'Filed';
    case 'new_account':
      return 'Created';
    case 'pending_user_review':
      return 'Needs review';
    case 'resolved':
      return 'Resolved';
    case 'failed':
      return 'Failed';
    case 'skipped':
      return 'Skipped';
  }
}

export function EmailIngestPage() {
  const api = useApiClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [rows, setRows] = useState<IngestRow[]>([]);
  const [internalRows, setInternalRows] = useState<InternalRecentRow[]>([]);
  const [selected, setSelected] = useState<IngestDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const feed = await api.get<{ data: IngestRow[] }>('/api/v1/email-ingest');
      setRows(feed.data);
      const internal = await api
        .get<{ data: InternalRecentRow[] }>('/api/v1/mailbox/internal-recent')
        .catch(() => ({ data: [] as InternalRecentRow[] }));
      setInternalRows(internal.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load ingest feed');
    }
  }, [api]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const openDetail = useCallback(
    async (id: string) => {
      try {
        const detail = await api.get<IngestDetail>(`/api/v1/email-ingest/${id}`);
        setSelected(detail);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load email');
      }
    },
    [api],
  );

  // Review Tasks created by the server link to /email-ingest?ingest=<id>.
  // When that query param is present, auto-open the modal so the user
  // lands directly on the item they need to resolve.
  useEffect(() => {
    const id = searchParams.get('ingest');
    if (id && (!selected || selected.id !== id)) {
      void openDetail(id);
      // Clear the param so a manual refresh / close doesn't re-open.
      const next = new URLSearchParams(searchParams);
      next.delete('ingest');
      setSearchParams(next, { replace: true });
    }
  }, [openDetail, searchParams, selected, setSearchParams]);

  const resolve = useCallback(
    async (
      id: string,
      body: {
        resolution: 'match' | 'create' | 'discard';
        accountId?: string;
        newAccountName?: string;
      },
    ) => {
      setBusy(true);
      try {
        await api.post(`/api/v1/email-ingest/${id}/resolve`, { body });
        setSelected(null);
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to resolve ingest');
      } finally {
        setBusy(false);
      }
    },
    [api, refresh],
  );

  const linkInternal = useCallback(
    async (providerMessageId: string) => {
      setBusy(true);
      try {
        await api.post(`/api/v1/mailbox/internal-recent/${encodeURIComponent(providerMessageId)}/link`);
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to link email');
      } finally {
        setBusy(false);
      }
    },
    [api, refresh],
  );

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Email activity</h1>
        <p className={styles.subtitle}>
          CPCRM automatically files your external emails against the right
          account. Anything that needs your judgement shows up here — plus
          internal threads that were skipped so you can pull them in.
        </p>
      </header>
      {error && <p className={styles.error}>{error}</p>}

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Recent ingests</h2>
        {rows.length === 0 ? (
          <p className={styles.empty}>No emails ingested yet.</p>
        ) : (
          <ul className={styles.list}>
            {rows.map((r) => (
              <li key={r.id} className={styles.row}>
                <button className={styles.rowButton} onClick={() => openDetail(r.id)}>
                  <span className={styles.rowHeader}>
                    <span className={styles.rowFrom}>{r.fromName ?? r.fromEmail}</span>
                    <span className={styles.rowDate}>
                      {new Date(r.receivedAt).toLocaleString()}
                    </span>
                  </span>
                  <span className={styles.rowSubject}>{r.subject ?? '(no subject)'}</span>
                  <span className={styles.rowStatus} data-status={r.status}>
                    {statusLabel(r.status)}
                    {r.confidence != null && ` · ${(r.confidence * 100).toFixed(0)}%`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Internal threads (skipped)</h2>
        <p className={styles.sectionHelp}>
          Skipped by default because every participant is on your org domain.
          Click "Link to account" if a thread discusses a customer you want on
          record.
        </p>
        {internalRows.length === 0 ? (
          <p className={styles.empty}>No recent internal threads.</p>
        ) : (
          <ul className={styles.list}>
            {internalRows.map((m) => (
              <li key={m.providerMessageId} className={styles.row}>
                <div className={styles.rowHeader}>
                  <span className={styles.rowFrom}>{m.fromName ?? m.fromEmail}</span>
                  <span className={styles.rowDate}>
                    {new Date(m.receivedAt).toLocaleString()}
                  </span>
                </div>
                <div className={styles.rowSubject}>{m.subject ?? '(no subject)'}</div>
                {m.preview && <div className={styles.preview}>{m.preview}</div>}
                <button
                  className={styles.primary}
                  onClick={() => linkInternal(m.providerMessageId)}
                  disabled={busy}
                >
                  Link to account
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {selected && (
        <div
          className={styles.modal}
          role="dialog"
          aria-modal="true"
          aria-labelledby={`email-ingest-dialog-title-${selected.id}`}
        >
          <div className={styles.modalCard}>
            <header className={styles.modalHeader}>
              <h3 id={`email-ingest-dialog-title-${selected.id}`}>
                {selected.subject ?? '(no subject)'}
              </h3>
              <button
                className={styles.close}
                aria-label="Close dialog"
                onClick={() => setSelected(null)}
              >
                ×
              </button>
            </header>
            <div className={styles.modalBody}>
              <p className={styles.small}>
                From <strong>{selected.fromEmail}</strong> · received{' '}
                {new Date(selected.receivedAt).toLocaleString()}
              </p>
              {selected.extraction?.summary && (
                <p className={styles.summary}>{selected.extraction.summary}</p>
              )}
              {selected.status === 'pending_user_review' &&
                (selected.extraction?.candidates ?? []).length > 0 && (
                  <section>
                    <h4>Possible matches</h4>
                    <ul className={styles.candidates}>
                      {(selected.extraction?.candidates ?? []).map((c) => (
                        <li key={c.accountId} className={styles.candidate}>
                          <span>
                            {c.accountId} · {(c.score * 100).toFixed(0)}%
                          </span>
                          <span className={styles.reason}>{c.reason}</span>
                          <button
                            disabled={busy}
                            className={styles.primary}
                            onClick={() =>
                              resolve(selected.id, {
                                resolution: 'match',
                                accountId: c.accountId,
                              })
                            }
                          >
                            Pick this account
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              {selected.status === 'pending_user_review' && (
                <div className={styles.actions}>
                  <button
                    disabled={busy}
                    onClick={() =>
                      resolve(selected.id, {
                        resolution: 'create',
                        newAccountName: selected.extraction?.company?.name,
                      })
                    }
                  >
                    Create new account
                  </button>
                  <button
                    disabled={busy}
                    className={styles.danger}
                    onClick={() => resolve(selected.id, { resolution: 'discard' })}
                  >
                    Discard
                  </button>
                </div>
              )}
              {selected.textBody && (
                <pre className={styles.body}>{selected.textBody}</pre>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
