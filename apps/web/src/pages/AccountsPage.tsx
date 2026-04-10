import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSession } from '@descope/react-sdk';
import { useApiClient } from '../lib/apiClient.js';
import { PrimaryButton } from '../components/PrimaryButton.js';
import styles from './AccountsPage.module.css';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AccountListItem {
  id: string;
  name: string;
  industry?: string;
  phone?: string;
  email?: string;
  city?: string;
  opportunityCount: number;
}

interface AccountsResponse {
  data: AccountListItem[];
  total: number;
  page: number;
  limit: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;
const DEBOUNCE_MS = 300;

// ─── Icons ────────────────────────────────────────────────────────────────────

const PlusIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
    <path d="M3 6h6M6 3v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

// ─── Component ────────────────────────────────────────────────────────────────

export function AccountsPage() {
  const { sessionToken } = useSession();
  const api = useApiClient();
  const navigate = useNavigate();

  const [accounts, setAccounts] = useState<AccountListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce search input
  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setDebouncedSearch(value);
      setPage(1);
    }, DEBOUNCE_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  // Fetch accounts
  useEffect(() => {
    if (!sessionToken) return;

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE),
      });
      if (debouncedSearch.trim()) {
        params.set('search', debouncedSearch.trim());
      }

      try {
        const response = await api.request(`/api/accounts?${params.toString()}`);

        if (cancelled) return;

        if (response.ok) {
          const data = (await response.json()) as AccountsResponse;
          if (!cancelled) {
            setAccounts(data.data);
            setTotal(data.total);
          }
        } else {
          if (!cancelled) setError('Failed to load accounts.');
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
  }, [sessionToken, api, page, debouncedSearch]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Accounts</h1>
          <p className={styles.pageSubtitle}>Manage your customer accounts and contacts</p>
        </div>
        <Link to="/accounts/new">
          <PrimaryButton size="sm">
            <PlusIcon />
            New account
          </PrimaryButton>
        </Link>
      </div>

      <div className={styles.toolbar}>
        <input
          type="search"
          placeholder="Search by name or email…"
          className={styles.searchInput}
          aria-label="Search accounts"
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
        />
        {!loading && !error && total > 0 && (
          <div className={styles.pagination}>
            <span className={styles.paginationInfo}>
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              className={styles.paginationButton}
              aria-label="Previous page"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              ‹
            </button>
            <button
              type="button"
              className={styles.paginationButton}
              aria-label="Next page"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              ›
            </button>
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className={styles.errorAlert}>
          {error}
        </p>
      )}

      {!loading && !error && accounts.length === 0 && (
        <div className={styles.emptyState}>
          <div className={styles.iconWrap} aria-hidden="true">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <circle cx="9" cy="7" r="3.5" stroke="currentColor" strokeWidth="1.5" />
              <path
                d="M2 20c0-3.314 3.134-6 7-6s7 2.686 7 6"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <path
                d="M16 10c1.657 0 3 1.343 3 3"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <path
                d="M16 16c2.485 0 4.5 1.343 4.5 3"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <h2 className={styles.emptyTitle}>No accounts yet — create your first one</h2>
          <p className={styles.emptyText}>
            Track companies, contacts, and relationships across your pipeline.
          </p>
        </div>
      )}

      {!loading && !error && accounts.length > 0 && (
        <div className={styles.tableCard}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Name</th>
                <th className={styles.th}>Industry</th>
                <th className={styles.th}>Phone</th>
                <th className={styles.th}>Email</th>
                <th className={styles.th}>City</th>
                <th className={styles.th}>Opportunities</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => (
                <tr
                  key={account.id}
                  className={styles.tr}
                  onClick={() => void navigate(`/accounts/${account.id}`)}
                >
                  <td className={styles.td}>
                    <Link
                      to={`/accounts/${account.id}`}
                      className={styles.nameLink}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {account.name}
                    </Link>
                  </td>
                  <td className={styles.td}>{account.industry ?? '—'}</td>
                  <td className={styles.td}>{account.phone ?? '—'}</td>
                  <td className={styles.td}>{account.email ?? '—'}</td>
                  <td className={styles.td}>{account.city ?? '—'}</td>
                  <td className={styles.td}>{account.opportunityCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

