import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PrimaryButton } from '../components/PrimaryButton.js';
import styles from './OpportunitiesPage.module.css';

const PlusIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
    <path d="M3 6h6M6 3v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const EditIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
    <path
      d="M8.5 1.5l2 2-6 6H2.5v-2l6-6z"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinejoin="round"
    />
  </svg>
);

const TrashIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
    <path
      d="M1.5 3h9M4 3V2a1 1 0 011-1h2a1 1 0 011 1v1M5 5.5v3M7 5.5v3M2.5 3l.5 7a1 1 0 001 1h4a1 1 0 001-1l.5-7"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

type Stage = 'Prospecting' | 'Qualification' | 'Proposal' | 'Negotiation' | 'Closed Won' | 'Closed Lost';

interface Opportunity {
  id: string;
  title: string;
  account: string;
  value?: number;
  currency?: string;
  closeDate?: string;
  stage: Stage;
}

const STAGE_CLASS: Record<Stage, string> = {
  'Prospecting': styles.badgeProspecting,
  'Qualification': styles.badgeQualification,
  'Proposal': styles.badgeProposal,
  'Negotiation': styles.badgeNegotiation,
  'Closed Won': styles.badgeClosedWon,
  'Closed Lost': styles.badgeClosedLost,
};

function formatValue(value: number, currency = 'GBP') {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

const PLACEHOLDER_OPPORTUNITIES: Opportunity[] = [
  {
    id: '1',
    title: 'New Partnership Deal',
    account: 'Contoso Ltd',
    value: 50000,
    currency: 'GBP',
    closeDate: '2025-06-30',
    stage: 'Proposal',
  },
  {
    id: '2',
    title: 'Software License Renewal',
    account: 'Fabrikam Inc',
    value: 120000,
    currency: 'USD',
    closeDate: '2025-05-15',
    stage: 'Negotiation',
  },
  {
    id: '3',
    title: 'Cloud Migration Project',
    account: 'Adventure Works',
    value: 85000,
    currency: 'GBP',
    closeDate: '2025-07-31',
    stage: 'Qualification',
  },
];

export function OpportunitiesPage() {
  const navigate = useNavigate();
  const [opportunities, setOpportunities] = useState<Opportunity[]>(PLACEHOLDER_OPPORTUNITIES);

  const handleDelete = (id: string, title: string) => {
    if (!window.confirm(`Delete "${title}"? This action cannot be undone.`)) return;
    setOpportunities((prev) => prev.filter((o) => o.id !== id));
  };

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

      {opportunities.length === 0 ? (
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
      ) : (
        <div className={styles.tableCard}>
          <table className={styles.table}>
            <thead className={styles.tableHead}>
              <tr>
                <th>Opportunity</th>
                <th>Value</th>
                <th>Stage</th>
                <th>Close Date</th>
                <th />
              </tr>
            </thead>
            <tbody className={styles.tableBody}>
              {opportunities.map((opp) => (
                <tr key={opp.id}>
                  <td>
                    <div className={styles.opportunityTitle}>{opp.title}</div>
                    <div className={styles.accountName}>{opp.account}</div>
                  </td>
                  <td className={styles.valueCell}>
                    {opp.value != null ? formatValue(opp.value, opp.currency) : '—'}
                  </td>
                  <td>
                    <span className={`${styles.badge} ${STAGE_CLASS[opp.stage]}`}>
                      {opp.stage}
                    </span>
                  </td>
                  <td className={styles.closeDate}>
                    {opp.closeDate ? formatDate(opp.closeDate) : '—'}
                  </td>
                  <td>
                    <div className={styles.rowActions}>
                      <button
                        type="button"
                        className={`${styles.actionButton} ${styles.editButton}`}
                        onClick={() => void navigate(`/opportunities/${opp.id}/edit`)}
                        aria-label={`Edit ${opp.title}`}
                      >
                        <EditIcon />
                        Edit
                      </button>
                      <button
                        type="button"
                        className={`${styles.actionButton} ${styles.deleteButton}`}
                        onClick={() => handleDelete(opp.id, opp.title)}
                        aria-label={`Delete ${opp.title}`}
                      >
                        <TrashIcon />
                        Delete
                      </button>
                    </div>
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
