import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useSession } from '@descope/react-sdk';
import { PrimaryButton } from '../components/PrimaryButton.js';
import { FieldRenderer } from '../components/FieldRenderer.js';
import styles from './RecordListPage.module.css';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ObjectDefinition {
  id: string;
  apiName: string;
  label: string;
  pluralLabel: string;
  isSystem: boolean;
}

interface RecordField {
  apiName: string;
  label: string;
  fieldType: string;
  value: unknown;
}

interface RecordItem {
  id: string;
  name: string;
  fieldValues: Record<string, unknown>;
  fields: RecordField[];
  createdAt: string;
  updatedAt: string;
}

interface RecordsResponse {
  data: RecordItem[];
  total: number;
  page: number;
  limit: number;
  object: ObjectDefinition;
}

interface LayoutFieldWithMetadata {
  fieldId: string;
  fieldApiName: string;
  fieldLabel: string;
  fieldType: string;
  sortOrder: number;
  section: number;
  width: string;
}

interface LayoutDefinition {
  id: string;
  objectId: string;
  name: string;
  layoutType: string;
  isDefault: boolean;
  fields: LayoutFieldWithMetadata[];
}

interface LayoutListItem {
  id: string;
  objectId: string;
  name: string;
  layoutType: string;
  isDefault: boolean;
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

const SortIcon = ({ direction }: { direction: 'asc' | 'desc' | null }) => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true" style={{ marginLeft: 4, opacity: direction ? 1 : 0.3 }}>
    {direction === 'asc' ? (
      <path d="M5 2L8 7H2L5 2Z" fill="currentColor" />
    ) : direction === 'desc' ? (
      <path d="M5 8L2 3H8L5 8Z" fill="currentColor" />
    ) : (
      <>
        <path d="M5 1L7.5 4H2.5L5 1Z" fill="currentColor" />
        <path d="M5 9L2.5 6H7.5L5 9Z" fill="currentColor" />
      </>
    )}
  </svg>
);

// ─── Component ────────────────────────────────────────────────────────────────

export function RecordListPage() {
  const { apiName } = useParams<{ apiName: string }>();
  const { sessionToken } = useSession();
  const navigate = useNavigate();

  const [records, setRecords] = useState<RecordItem[]>([]);
  const [objectDef, setObjectDef] = useState<ObjectDefinition | null>(null);
  const [layoutColumns, setLayoutColumns] = useState<LayoutFieldWithMetadata[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortBy, setSortBy] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset state when the object changes
  useEffect(() => {
    setRecords([]);
    setObjectDef(null);
    setLayoutColumns(null);
    setTotal(0);
    setPage(1);
    setSearch('');
    setDebouncedSearch('');
    setSortBy(null);
    setSortDir('asc');
    setLoading(true);
    setError(null);
  }, [apiName]);

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

  // Fetch list layout columns
  useEffect(() => {
    if (!sessionToken || !apiName) return;

    let cancelled = false;

    const loadLayout = async () => {
      try {
        // First get the object definitions to find the object ID
        const objResponse = await fetch('/api/admin/objects', {
          headers: { Authorization: `Bearer ${sessionToken}` },
        });

        if (cancelled) return;

        if (!objResponse.ok) return;

        const allObjects = (await objResponse.json()) as Array<{
          id: string;
          apiName: string;
        }>;
        const obj = allObjects.find((o) => o.apiName === apiName);
        if (!obj || cancelled) return;

        // Fetch layouts for this object
        const layoutsResponse = await fetch(
          `/api/admin/objects/${obj.id}/layouts`,
          { headers: { Authorization: `Bearer ${sessionToken}` } },
        );

        if (cancelled || !layoutsResponse.ok) return;

        const layouts = (await layoutsResponse.json()) as LayoutListItem[];
        const listLayout = layouts.find(
          (l) => l.layoutType === 'list' && l.isDefault,
        ) ?? layouts.find((l) => l.layoutType === 'list');

        if (!listLayout || cancelled) return;

        // Fetch the layout detail with fields
        const layoutDetailResponse = await fetch(
          `/api/admin/objects/${obj.id}/layouts/${listLayout.id}`,
          { headers: { Authorization: `Bearer ${sessionToken}` } },
        );

        if (cancelled || !layoutDetailResponse.ok) return;

        const layoutDetail = (await layoutDetailResponse.json()) as LayoutDefinition;
        if (!cancelled && layoutDetail.fields.length > 0) {
          setLayoutColumns(layoutDetail.fields);
        }
      } catch {
        // Layout fetch is best-effort — fall back to record fields
      }
    };

    void loadLayout();

    return () => {
      cancelled = true;
    };
  }, [sessionToken, apiName]);

  // Fetch records
  useEffect(() => {
    if (!sessionToken || !apiName) return;

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
      if (sortBy) {
        params.set('sort_by', sortBy);
        params.set('sort_dir', sortDir);
      }

      try {
        const response = await fetch(
          `/api/objects/${apiName}/records?${params.toString()}`,
          { headers: { Authorization: `Bearer ${sessionToken}` } },
        );

        if (cancelled) return;

        if (response.ok) {
          const data = (await response.json()) as RecordsResponse;
          if (!cancelled) {
            setRecords(data.data);
            setTotal(data.total);
            setObjectDef(data.object);
          }
        } else if (response.status === 404) {
          if (!cancelled) setError('Object type not found.');
        } else {
          if (!cancelled) setError('Failed to load records.');
        }
      } catch {
        if (!cancelled)
          setError('Failed to connect to the server. Please try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [sessionToken, apiName, page, debouncedSearch, sortBy, sortDir]);

  const handleSort = (fieldApiName: string) => {
    if (sortBy === fieldApiName) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(fieldApiName);
      setSortDir('asc');
    }
    setPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Determine columns: prefer layout columns, fall back to record fields
  const columns: Array<{ apiName: string; label: string; fieldType: string }> =
    layoutColumns
      ? layoutColumns.map((lf) => ({
          apiName: lf.fieldApiName,
          label: lf.fieldLabel,
          fieldType: lf.fieldType,
        }))
      : records.length > 0
        ? records[0].fields.map((f) => ({
            apiName: f.apiName,
            label: f.label,
            fieldType: f.fieldType,
          }))
        : [];

  const pluralLabel = objectDef?.pluralLabel ?? apiName ?? 'Records';
  const singularLabel = objectDef?.label ?? apiName ?? 'Record';

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>{pluralLabel}</h1>
          <p className={styles.pageSubtitle}>
            Manage your {pluralLabel.toLowerCase()}
          </p>
        </div>
        <Link to={`/objects/${apiName}/new`}>
          <PrimaryButton size="sm">
            <PlusIcon />
            New {singularLabel.toLowerCase()}
          </PrimaryButton>
        </Link>
      </div>

      <div className={styles.toolbar}>
        <input
          type="search"
          placeholder={`Search ${pluralLabel.toLowerCase()}…`}
          className={styles.searchInput}
          aria-label={`Search ${pluralLabel.toLowerCase()}`}
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

      {!loading && !error && records.length === 0 && (
        <div className={styles.emptyState}>
          <div className={styles.iconWrap} aria-hidden="true">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <rect
                x="3"
                y="3"
                width="18"
                height="18"
                rx="3"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <path
                d="M12 8v4M12 16h.01"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <h2 className={styles.emptyTitle}>
            No {pluralLabel.toLowerCase()} yet
          </h2>
          <p className={styles.emptyText}>
            Create your first {singularLabel.toLowerCase()} to get started.
          </p>
        </div>
      )}

      {!loading && !error && records.length > 0 && (
        <div className={styles.tableCard}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>
                  <button
                    type="button"
                    className={styles.sortButton}
                    onClick={() => handleSort('name')}
                  >
                    Name
                    <SortIcon
                      direction={
                        sortBy === 'name' ? sortDir : null
                      }
                    />
                  </button>
                </th>
                {columns.map((col) => (
                  <th key={col.apiName} className={styles.th}>
                    <button
                      type="button"
                      className={styles.sortButton}
                      onClick={() => handleSort(col.apiName)}
                    >
                      {col.label}
                      <SortIcon
                        direction={
                          sortBy === col.apiName ? sortDir : null
                        }
                      />
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {records.map((record) => {
                // Build a quick lookup of field values from the record
                const fieldMap = new Map(
                  record.fields.map((f) => [f.apiName, f]),
                );

                return (
                  <tr
                    key={record.id}
                    className={styles.tr}
                    onClick={() =>
                      void navigate(`/objects/${apiName}/${record.id}`)
                    }
                  >
                    <td className={styles.td}>
                      <Link
                        to={`/objects/${apiName}/${record.id}`}
                        className={styles.nameLink}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {record.name}
                      </Link>
                    </td>
                    {columns.map((col) => {
                      const field = fieldMap.get(col.apiName);
                      return (
                        <td key={col.apiName} className={styles.td}>
                          <FieldRenderer
                            fieldType={col.fieldType}
                            value={field?.value ?? null}
                          />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
