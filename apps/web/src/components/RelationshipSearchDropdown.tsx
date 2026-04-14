import { useState, useEffect, useRef, useCallback } from 'react';
import { useApiClient } from '../lib/apiClient.js';
import styles from './RelationshipSearchDropdown.module.css';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RecordOption {
  id: string;
  name: string;
}

interface RelationshipSearchDropdownProps {
  objectApiName: string;
  value: string | null;
  valueName?: string;
  onChange: (recordId: string | null, recordName: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
  id?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * A generic searchable dropdown for selecting a record from any object type.
 * Used on create/edit forms for relationship (lookup) fields.
 */
export function RelationshipSearchDropdown({
  objectApiName,
  value,
  valueName,
  onChange,
  disabled = false,
  placeholder = 'Search records…',
  id,
}: RelationshipSearchDropdownProps) {
  const api = useApiClient();
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<RecordOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const displayValue = value ? (valueName ?? value) : '';

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Clear debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const fetchRecords = useCallback(
    async (search: string) => {
      if (!objectApiName) return;
      setLoading(true);
      try {
        const params = new URLSearchParams({ limit: '10' });
        if (search.trim()) params.set('search', search.trim());
        const response = await api.request(
          `/api/v1/objects/${objectApiName}/records?${params.toString()}`,
        );
        if (response.ok) {
          const data = (await response.json()) as { data: RecordOption[] };
          setOptions(data.data);
        }
      } catch {
        // silently fail — dropdown will show empty
      } finally {
        setLoading(false);
      }
    },
    [api, objectApiName],
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    setOpen(true);

    if (!val.trim() && value) {
      onChange(null, null);
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void fetchRecords(val);
    }, 250);
  };

  const handleFocus = () => {
    setOpen(true);
    void fetchRecords(query);
  };

  const handleSelect = (record: RecordOption) => {
    onChange(record.id, record.name);
    setQuery('');
    setOpen(false);
  };

  const handleClear = () => {
    onChange(null, null);
    setQuery('');
    setOpen(false);
  };

  return (
    <div className={styles.wrapper} ref={wrapperRef}>
      <div className={`${styles.inputWrap} ${disabled ? styles.inputWrapDisabled : ''}`}>
        {value ? (
          <>
            <button
              type="button"
              id={id}
              className={styles.input}
              data-testid="relationship-selected"
              onClick={disabled ? undefined : handleFocus}
              disabled={disabled}
              aria-haspopup="listbox"
              aria-expanded={open}
            >
              {displayValue}
            </button>
            {!disabled && (
              <button
                type="button"
                className={styles.clearBtn}
                onClick={handleClear}
                aria-label="Clear selection"
              >
                ✕
              </button>
            )}
          </>
        ) : (
          <input
            id={id}
            className={styles.input}
            type="text"
            value={query}
            onChange={handleInputChange}
            onFocus={handleFocus}
            placeholder={placeholder}
            disabled={disabled}
            autoComplete="off"
          />
        )}
      </div>

      {open && !value && !disabled && (
        <div className={styles.dropdown} role="listbox">
          {loading && <div className={styles.dropdownMessage}>Searching…</div>}
          {!loading && options.length === 0 && (
            <div className={styles.dropdownMessage}>No records found</div>
          )}
          {!loading &&
            options.map((record) => (
              <button
                key={record.id}
                type="button"
                className={styles.option}
                role="option"
                onClick={() => handleSelect(record)}
              >
                {record.name}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
