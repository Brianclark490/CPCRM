import styles from './KanbanFilterBar.module.css';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface KanbanFilters {
  search: string;
  owner: string;
  dateFrom: string;
  dateTo: string;
  valueMin: string;
  valueMax: string;
}

interface KanbanFilterBarProps {
  filters: KanbanFilters;
  onChange: (filters: KanbanFilters) => void;
  owners: Array<{ id: string; label: string }>;
}

export const EMPTY_FILTERS: KanbanFilters = {
  search: '',
  owner: '',
  dateFrom: '',
  dateTo: '',
  valueMin: '',
  valueMax: '',
};

// ─── Component ────────────────────────────────────────────────────────────────

export function KanbanFilterBar({ filters, onChange, owners }: KanbanFilterBarProps) {
  const update = (field: keyof KanbanFilters, value: string) => {
    onChange({ ...filters, [field]: value });
  };

  const hasActiveFilters = Object.values(filters).some((v) => v !== '');

  return (
    <div className={styles.filterBar} data-testid="kanban-filter-bar">
      <input
        type="search"
        className={`${styles.filterInput} ${styles.searchInput}`}
        placeholder="Search by name…"
        value={filters.search}
        onChange={(e) => update('search', e.target.value)}
        aria-label="Search records"
      />

      <div className={styles.filterGroup}>
        <span className={styles.filterLabel}>Owner</span>
        <select
          className={styles.ownerSelect}
          value={filters.owner}
          onChange={(e) => update('owner', e.target.value)}
          aria-label="Filter by owner"
        >
          <option value="">All owners</option>
          {owners.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.filterGroup}>
        <span className={styles.filterLabel}>Close date</span>
        <input
          type="date"
          className={`${styles.filterInput} ${styles.dateInput}`}
          value={filters.dateFrom}
          onChange={(e) => update('dateFrom', e.target.value)}
          aria-label="Close date from"
        />
        <span className={styles.filterLabel}>to</span>
        <input
          type="date"
          className={`${styles.filterInput} ${styles.dateInput}`}
          value={filters.dateTo}
          onChange={(e) => update('dateTo', e.target.value)}
          aria-label="Close date to"
        />
      </div>

      <div className={styles.filterGroup}>
        <span className={styles.filterLabel}>Value</span>
        <input
          type="number"
          className={`${styles.filterInput} ${styles.valueInput}`}
          placeholder="Min"
          value={filters.valueMin}
          onChange={(e) => update('valueMin', e.target.value)}
          aria-label="Minimum value"
        />
        <span className={styles.filterLabel}>–</span>
        <input
          type="number"
          className={`${styles.filterInput} ${styles.valueInput}`}
          placeholder="Max"
          value={filters.valueMax}
          onChange={(e) => update('valueMax', e.target.value)}
          aria-label="Maximum value"
        />
      </div>

      {hasActiveFilters && (
        <button
          type="button"
          className={styles.clearButton}
          onClick={() => onChange(EMPTY_FILTERS)}
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
