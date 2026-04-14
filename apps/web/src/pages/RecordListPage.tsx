import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useSession } from '@descope/react-sdk';
import { ApiError, useApiClient, unwrapList } from '../lib/apiClient.js';
import { ApiErrorDisplay } from '../components/ApiErrorDisplay.js';
import { PrimaryButton } from '../components/PrimaryButton.js';
import { FieldRenderer } from '../components/FieldRenderer.js';
import { KanbanBoard } from '../components/KanbanBoard.js';
import styles from './RecordListPage.module.css';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ObjectDefinition {
  id: string;
  apiName: string;
  label: string;
  pluralLabel: string;
  isSystem: boolean;
  nameFieldId?: string;
}

interface RecordField {
  apiName: string;
  label: string;
  fieldType: string;
  value: unknown;
}

interface LinkedParentRecord {
  objectApiName: string;
  recordId: string;
  recordName: string;
}

interface RecordItem {
  id: string;
  name: string;
  fieldValues: Record<string, unknown>;
  fields: RecordField[];
  ownerId: string;
  ownerName?: string;
  linkedParent?: LinkedParentRecord;
  createdAt: string;
  updatedAt: string;
}

interface PaginationMeta {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

interface RecordsResponse {
  data: RecordItem[];
  pagination: PaginationMeta;
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

function getInitials(name: string | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (parts[0][0] ?? '?').toUpperCase();
}

// ─── Component ────────────────────────────────────────────────────────────────

interface RecordListPageProps {
  initialView?: 'list' | 'pipeline';
}

export function RecordListPage({ initialView }: RecordListPageProps = {}) {
  const { apiName } = useParams<{ apiName: string }>();
  const { sessionToken } = useSession();
  const api = useApiClient();
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
  const [error, setError] = useState<ApiError | null>(null);

  // Pipeline view toggle state
  const [viewMode, setViewMode] = useState<'list' | 'pipeline'>(initialView ?? 'list');
  const [hasPipeline, setHasPipeline] = useState(false);
  const [resolvedObjectId, setResolvedObjectId] = useState<string | null>(null);

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
    setHasPipeline(false);
    setResolvedObjectId(null);
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

  // Fetch list layout columns and check for pipeline
  useEffect(() => {
    if (!sessionToken || !apiName) return;

    let cancelled = false;

    const loadLayout = async () => {
      try {
        // First get the object definitions to find the object ID
        const objResponse = await api.request('/api/v1/admin/objects');

        if (cancelled) return;

        if (!objResponse.ok) return;

        const allObjects = unwrapList<{
          id: string;
          apiName: string;
        }>(await objResponse.json());
        const obj = allObjects.find((o) => o.apiName === apiName);
        if (!obj || cancelled) return;

        // Store the resolved object ID for pipeline view
        setResolvedObjectId(obj.id);

        // Check for pipeline existence (best-effort)
        api.request('/api/v1/admin/pipelines')
          .then((resp) => {
            if (cancelled || !resp.ok) return null;
            return resp.json();
          })
          .then((pipelines) => {
            if (cancelled || !pipelines) return;
            const list = unwrapList<{ objectId?: string; object_id?: string }>(pipelines);
            const match = list.find(
              (p) => (p.objectId ?? p.object_id) === obj.id,
            );
            if (!cancelled) setHasPipeline(!!match);
          })
          .catch(() => { /* best-effort */ });

        // Fetch layouts for this object
        const layoutsResponse = await api.request(
          `/api/v1/admin/objects/${obj.id}/layouts`,
        );

        if (cancelled || !layoutsResponse.ok) return;

        const layouts = unwrapList<LayoutListItem>(await layoutsResponse.json());
        const listLayout = layouts.find(
          (l) => l.layoutType === 'list' && l.isDefault,
        ) ?? layouts.find((l) => l.layoutType === 'list');

        if (!listLayout || cancelled) return;

        // Fetch the layout detail with fields
        const layoutDetailResponse = await api.request(
          `/api/v1/admin/objects/${obj.id}/layouts/${listLayout.id}`,
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
  }, [sessionToken, api, apiName]);

  // Fetch records
  useEffect(() => {
    if (!sessionToken || !apiName) return;

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String((page - 1) * PAGE_SIZE),
      });
      if (debouncedSearch.trim()) {
        params.set('search', debouncedSearch.trim());
      }
      if (sortBy) {
        params.set('sort_by', sortBy);
        params.set('sort_dir', sortDir);
      }

      try {
        const data = await api.get<RecordsResponse>(
          `/api/v1/objects/${apiName}/records?${params.toString()}`,
        );

        if (!cancelled) {
          setRecords(data.data);
          setTotal(data.pagination.total);
          setObjectDef(data.object);
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError) {
          if (err.status === 404) {
            setError(
              new ApiError({ status: 404, message: 'Object type not found.' }),
            );
          } else if (err.isNetwork) {
            setError(
              new ApiError({
                status: 0,
                message: 'Failed to connect to the server. Please try again.',
              }),
            );
          } else {
            setError(
              new ApiError({
                status: err.status,
                message: 'Failed to load records.',
              }),
            );
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [sessionToken, api, apiName, page, debouncedSearch, sortBy, sortDir]);

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
  const columns: Array<{ apiName: string; label: string; fieldType: string; fieldId?: string }> =
    layoutColumns
      ? layoutColumns.map((lf) => ({
          apiName: lf.fieldApiName,
          label: lf.fieldLabel,
          fieldType: lf.fieldType,
          fieldId: lf.fieldId,
        }))
      : records.length > 0
        ? records[0].fields.map((f) => ({
            apiName: f.apiName,
            label: f.label,
            fieldType: f.fieldType,
          }))
        : [];

  // Determine which column is the name field (renders as a clickable link)
  const nameFieldId = objectDef?.nameFieldId;
  const nameColumnApiName = nameFieldId
    ? columns.find((col) => col.fieldId === nameFieldId)?.apiName ?? null
    : null;

  // Show a standalone "Name" column only when the name field is not already in the layout
  const showStandaloneNameColumn = !nameColumnApiName;

  // Show an "Account" column when any record has a linked parent account
  const showAccountColumn = records.some((r) => r.linkedParent != null);

  const pluralLabel = objectDef?.pluralLabel ?? apiName ?? 'Records';
  const singularLabel = objectDef?.label ?? apiName ?? 'Record';

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <h1 className={styles.pageTitle}>{pluralLabel}</h1>
          <input
            type="search"
            placeholder={`Search ${pluralLabel.toLowerCase()}…`}
            className={styles.searchInput}
            aria-label={`Search ${pluralLabel.toLowerCase()}`}
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
          {!loading && !error && (
            <span className={styles.recordCount}>
              {total} {total === 1 ? singularLabel.toLowerCase() : pluralLabel.toLowerCase()}
            </span>
          )}
        </div>
        <div className={styles.toolbarRight}>
          {hasPipeline && (
            <div className={styles.viewToggle} data-testid="view-toggle">
              <button
                type="button"
                className={`${styles.viewToggleButton} ${viewMode === 'list' ? styles.viewToggleActive : ''}`}
                onClick={() => setViewMode('list')}
                aria-pressed={viewMode === 'list'}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <path d="M2 3h10M2 7h10M2 11h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                List
              </button>
              <button
                type="button"
                className={`${styles.viewToggleButton} ${viewMode === 'pipeline' ? styles.viewToggleActive : ''}`}
                onClick={() => setViewMode('pipeline')}
                aria-pressed={viewMode === 'pipeline'}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <rect x="1" y="1" width="3" height="12" rx="1" stroke="currentColor" strokeWidth="1.25" />
                  <rect x="5.5" y="1" width="3" height="9" rx="1" stroke="currentColor" strokeWidth="1.25" />
                  <rect x="10" y="1" width="3" height="6" rx="1" stroke="currentColor" strokeWidth="1.25" />
                </svg>
                Pipeline
              </button>
            </div>
          )}
          {apiName !== 'user' && (
            <Link to={`/objects/${apiName}/new`}>
              <PrimaryButton size="sm">
                <PlusIcon />
                New {singularLabel.toLowerCase()}
              </PrimaryButton>
            </Link>
          )}
        </div>
      </div>

      {error && <ApiErrorDisplay error={error} />}

      {viewMode === 'pipeline' && hasPipeline && resolvedObjectId && apiName && (
        <KanbanBoard apiName={apiName} objectId={resolvedObjectId} />
      )}

      {viewMode === 'list' && !loading && !error && records.length === 0 && (
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
          <Link to={`/objects/${apiName}/new`} className={styles.emptyAction}>
            <PrimaryButton size="sm">
              <PlusIcon />
              Create your first {singularLabel.toLowerCase()}
            </PrimaryButton>
          </Link>
        </div>
      )}

      {viewMode === 'list' && !loading && !error && records.length > 0 && (
        <>
          <table className={styles.table}>
            <thead>
              <tr>
                {showStandaloneNameColumn && (
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
                )}
                {showAccountColumn && (
                  <th className={styles.th}>
                    <span className={styles.sortButton}>Account</span>
                  </th>
                )}
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
                <th className={styles.th}>
                  <span className={styles.sortButton}>Owner</span>
                </th>
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
                    {showStandaloneNameColumn && (
                      <td className={styles.td}>
                        <Link
                          to={`/objects/${apiName}/${record.id}`}
                          className={styles.nameLink}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {record.name}
                        </Link>
                      </td>
                    )}
                    {showAccountColumn && (
                      <td className={styles.td}>
                        {record.linkedParent ? (
                          <Link
                            to={`/objects/${record.linkedParent.objectApiName}/${record.linkedParent.recordId}`}
                            className={styles.nameLink}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {record.linkedParent.recordName}
                          </Link>
                        ) : '—'}
                      </td>
                    )}
                    {columns.map((col) => {
                      const field = fieldMap.get(col.apiName);
                      const isNameColumn = col.apiName === nameColumnApiName;

                      return (
                        <td key={col.apiName} className={styles.td}>
                          {isNameColumn ? (
                            <Link
                              to={`/objects/${apiName}/${record.id}`}
                              className={styles.nameLink}
                              onClick={(e) => e.stopPropagation()}
                            >
                              {record.name}
                            </Link>
                          ) : (
                            <FieldRenderer
                              fieldType={col.fieldType}
                              value={field?.value ?? null}
                            />
                          )}
                        </td>
                      );
                    })}
                    <td className={styles.td}>
                      {record.ownerName ? (
                        <span className={styles.ownerCell}>
                          <span className={styles.ownerAvatar}>{getInitials(record.ownerName)}</span>
                          {record.ownerName}
                        </span>
                      ) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {total > PAGE_SIZE && (
            <div className={styles.pagination}>
              <span className={styles.paginationInfo}>
                Showing {Math.min((page - 1) * PAGE_SIZE + 1, total)}–{Math.min(page * PAGE_SIZE, total)} of {total}
              </span>
              <div className={styles.paginationButtons}>
                <button
                  type="button"
                  className={styles.paginationButton}
                  aria-label="Previous page"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  ‹
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                  .reduce<Array<number | 'ellipsis'>>((acc, p, idx, arr) => {
                    if (idx > 0 && arr[idx - 1] !== undefined && p - (arr[idx - 1] as number) > 1) {
                      acc.push('ellipsis');
                    }
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((item, idx) =>
                    item === 'ellipsis' ? (
                      <span key={`ellipsis-${idx}`} className={styles.paginationEllipsis}>…</span>
                    ) : (
                      <button
                        key={item}
                        type="button"
                        className={`${styles.paginationButton} ${page === item ? styles.paginationButtonActive : ''}`}
                        onClick={() => setPage(item as number)}
                        aria-label={`Page ${String(item)}`}
                        aria-current={page === item ? 'page' : undefined}
                      >
                        {item}
                      </button>
                    ),
                  )}
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
            </div>
          )}
        </>
      )}
    </div>
  );
}
