import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { useSession } from '@descope/react-sdk';
import { useApiClient } from '../lib/apiClient.js';

/* ── Types ────────────────────────────────────────────────── */

export interface TenantLocaleSettings {
  currency: string;
  dateFormat: string;
  timezone: string;
}

/* ── Defaults ─────────────────────────────────────────────── */

export const DEFAULT_LOCALE_SETTINGS: TenantLocaleSettings = {
  currency: 'GBP',
  dateFormat: 'DD/MM/YYYY',
  timezone: 'Europe/London',
};

/* ── Context ──────────────────────────────────────────────── */

const TenantSettingsContext = createContext<TenantLocaleSettings>(
  DEFAULT_LOCALE_SETTINGS,
);

/* ── Provider ─────────────────────────────────────────────── */

interface TenantSettingsProviderProps {
  children: ReactNode;
}

export function TenantSettingsProvider({ children }: TenantSettingsProviderProps) {
  const { sessionToken } = useSession();
  const api = useApiClient();
  const [settings, setSettings] = useState<TenantLocaleSettings>(DEFAULT_LOCALE_SETTINGS);

  useEffect(() => {
    if (!sessionToken) return;

    let cancelled = false;

    const fetchSettings = async () => {
      try {
        const response = await api.request('/api/v1/admin/tenant-settings');

        if (!response.ok || cancelled) return;

        const data = (await response.json()) as {
          settings: {
            currency?: string;
            dateFormat?: string;
            timezone?: string;
          };
        };

        if (!cancelled) {
          setSettings({
            currency: data.settings.currency ?? DEFAULT_LOCALE_SETTINGS.currency,
            dateFormat: data.settings.dateFormat ?? DEFAULT_LOCALE_SETTINGS.dateFormat,
            timezone: data.settings.timezone ?? DEFAULT_LOCALE_SETTINGS.timezone,
          });
        }
      } catch {
        // Keep defaults on error
      }
    };

    void fetchSettings();

    return () => {
      cancelled = true;
    };
  }, [sessionToken, api]);

  return (
    <TenantSettingsContext.Provider value={settings}>
      {children}
    </TenantSettingsContext.Provider>
  );
}

/* ── Hook ─────────────────────────────────────────────────── */

export function useTenantSettings(): TenantLocaleSettings {
  return useContext(TenantSettingsContext);
}
