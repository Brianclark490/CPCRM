import { useState, useEffect, useCallback } from 'react';
import { useDescope } from '@descope/react-sdk';
import { useNavigate } from 'react-router-dom';
import { setStoredTenant } from '../store/tenant.js';
import { sessionHistory } from '../store/sessionHistory.js';
import styles from './TenantPickerPage.module.css';

interface TenantOption {
  tenantId: string;
  name: string;
}

export function TenantPickerPage() {
  const sdk = useDescope();
  const navigate = useNavigate();

  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selecting, setSelecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSelectTenant = useCallback(
    async (tenant: TenantOption) => {
      setSelecting(tenant.tenantId);
      setError(null);
      try {
        await sdk.selectTenant(tenant.tenantId);
        setStoredTenant(tenant.tenantId, tenant.name);
        sessionHistory.markAuthenticated();
        void navigate('/dashboard', { replace: true });
      } catch {
        setError('Failed to select organisation. Please try again.');
        setSelecting(null);
      }
    },
    [sdk, navigate],
  );

  useEffect(() => {
    let cancelled = false;

    const loadTenants = async () => {
      try {
        const response = (await sdk.myTenants(true)) as {
          ok: boolean;
          data?: TenantOption[];
        };

        if (cancelled) return;

        const tenantList = response.data ?? [];

        if (tenantList.length === 0) {
          void navigate('/organisations/new', { replace: true });
          return;
        }

        if (tenantList.length === 1) {
          await handleSelectTenant(tenantList[0]);
          return;
        }

        setTenants(tenantList);
      } catch {
        if (!cancelled) {
          setError('Failed to load your organisations. Please try again.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadTenants();

    return () => {
      cancelled = true;
    };
  }, [sdk, navigate, handleSelectTenant]);

  if (loading && !error) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.logoArea}>
            <span className={styles.logoText}>CPCRM</span>
          </div>
          <p className={styles.loadingText}>Loading organisations…</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logoArea}>
          <span className={styles.logoText}>CPCRM</span>
        </div>
        <h1 className={styles.title}>Select an organisation</h1>
        <p className={styles.subtitle}>Choose which organisation you'd like to work in.</p>

        {error && (
          <p role="alert" className={styles.alert}>
            {error}
          </p>
        )}

        <ul className={styles.tenantList}>
          {tenants.map((tenant) => (
            <li key={tenant.tenantId}>
              <button
                type="button"
                className={styles.tenantButton}
                disabled={selecting !== null}
                onClick={() => void handleSelectTenant(tenant)}
              >
                <span className={styles.tenantName}>{tenant.name}</span>
                {selecting === tenant.tenantId && (
                  <span className={styles.selectingLabel}>Selecting…</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
