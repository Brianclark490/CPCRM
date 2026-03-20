import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'cpcrm-theme';
type Theme = 'light' | 'dark';

/**
 * Manages the current colour theme (light / dark).
 *
 * - Reads the initial value from localStorage (defaults to `'dark'`).
 * - Sets `data-theme` on `<html>` whenever the value changes.
 * - Persists the preference to localStorage.
 */
export function useTheme(): { theme: Theme; toggle: () => void } {
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  }, []);

  return { theme, toggle };
}
