import { useState, useEffect, useRef, useCallback } from 'react';
import styles from './AccountSearchDropdown.module.css';

interface AccountOption {
  id: string;
  name: string;
}

interface AccountSearchDropdownProps {
  sessionToken: string;
  value: string | null;
  valueName?: string;
  onChange: (accountId: string | null, accountName: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
  id?: string;
}

export function AccountSearchDropdown({
  sessionToken,
  value,
  valueName,
  onChange,
  disabled = false,
  placeholder = 'Search accounts…',
  id,
}: AccountSearchDropdownProps) {
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<AccountOption[]>([]);
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

  const fetchAccounts = useCallback(
    async (search: string) => {
      if (!sessionToken) return;
      setLoading(true);
      try {
        const params = new URLSearchParams({ limit: '10' });
        if (search.trim()) params.set('search', search.trim());
        const response = await fetch(`/api/accounts?${params.toString()}`, {
          headers: { Authorization: `Bearer ${sessionToken}` },
        });
        if (response.ok) {
          const data = (await response.json()) as { data: AccountOption[] };
          setOptions(data.data);
        }
      } catch {
        // silently fail — dropdown will show empty
      } finally {
        setLoading(false);
      }
    },
    [sessionToken],
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    setOpen(true);

    // If the user is clearing the input, also clear selection
    if (!val.trim() && value) {
      onChange(null, null);
    }

    // Debounce search
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void fetchAccounts(val);
    }, 250);
  };

  const handleFocus = () => {
    setOpen(true);
    void fetchAccounts(query);
  };

  const handleSelect = (account: AccountOption) => {
    onChange(account.id, account.name);
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
              data-testid="account-selected"
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
                aria-label="Clear account"
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
            <div className={styles.dropdownMessage}>No accounts found</div>
          )}
          {!loading &&
            options.map((account) => (
              <button
                key={account.id}
                type="button"
                className={styles.option}
                role="option"
                onClick={() => handleSelect(account)}
              >
                {account.name}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
