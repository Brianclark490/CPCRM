import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '@descope/react-sdk';
import { PrimaryButton } from '../components/PrimaryButton.js';
import styles from './OpportunitiesPage.module.css';

// ─── Types ────────────────────────────────────────────────────────────────────

type OpportunityStage =
  | 'prospecting'
  | 'qualification'
  | 'proposal'
  | 'negotiation'
  | 'closed_won'
  | 'closed_lost';

interface Opportunity {
  id: string;
  title: string;
  accountId: string;
  stage: OpportunityStage;
  value?: number;
  currency?: string;
  expectedCloseDate?: string;
  updatedAt: string;
}

const STAGE_LABELS: Record<OpportunityStage, string> = {
  prospecting: 'Prospecting',
  qualification: 'Qualification',
  proposal: 'Proposal',
  negotiation: 'Negotiation',
  closed_won: 'Closed Won',
  closed_lost: 'Closed Lost',
};

// ─── Icons ─────────────────────────────────────────────────────────────────────

const PlusIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
    <path d="M3 6h6M6 3v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

// ─── Component ────────────────────────────────────────────────────────────────

export function OpportunitiesPage() {
  const { sessionToken } = useSession();

  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionToken) return;

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch('/api/opportunities', {
          headers: { Authorization: `Bearer ${sessionToken}` },
        });

        if (cancelled) return;

        if (response.ok) {
          const data = (await response.json()) as Opportunity[];
          if (!cancelled) setOpportunities(data);
        } else {
          if (!cancelled) setError('Failed to load opportunities.');
        }
      } catch {
        if (!cancelled) setError('Failed to connect to the server. Please try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [sessionToken]);

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Opportunities</h1>
          <p className={styles.pageSubtitle}>Track and manage your sales pipeline</p>
        </div>
        <Link to="/opportunities/new">
          <PrimaryButton size="sm">
            <PlusIcon />
            New opportunity
          </PrimaryButton>
        </Link>
      </div>

      {error && (
        <p role="alert" className={styles.errorAlert}>
          {error}
        </p>
      )}

      {!loading && !error && opportunities.length === 0 && (
        <div className={styles.emptyState}>
          <div className={styles.iconWrap} aria-hidden="true">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path
                d="M3 6h18v14H3z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinejoin="round"
                fill="none"
              />
              <path
                d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <path
                d="M12 11v4M10 13h4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <h2 className={styles.emptyTitle}>No opportunities yet.</h2>
          <p className={styles.emptyText}>
            Create your first opportunity to start tracking your sales pipeline.
          </p>
        </div>
      )}

      {!loading && !error && opportunities.length > 0 && (
        <div className={styles.tableCard}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Name</th>
                <th className={styles.th}>Account</th>
                <th className={styles.th}>Stage</th>
                <th className={styles.th}>Value</th>
                <th className={styles.th}>Close date</th>
              </tr>
            </thead>
            <tbody>
              {opportunities.map((opp) => (
                <tr key={opp.id} className={styles.tr}>
                  <td className={styles.td}>
                    <Link to={`/opportunities/${opp.id}`} className={styles.nameLink}>
                      {opp.title}
                    </Link>
                  </td>
                  <td className={styles.td}>{opp.accountId}</td>
                  <td className={styles.td}>
                    <span className={styles.stageBadge}>{STAGE_LABELS[opp.stage]}</span>
                  </td>
                  <td className={styles.td}>
                    {opp.value !== undefined
                      ? `${opp.currency ? opp.currency + ' ' : ''}${opp.value.toLocaleString()}`
                      : '—'}
                  </td>
                  <td className={styles.td}>
                    {opp.expectedCloseDate
                      ? new Date(opp.expectedCloseDate).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

