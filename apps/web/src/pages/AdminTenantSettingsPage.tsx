import { useState, useEffect } from 'react';
import { useSession } from '@descope/react-sdk';
import { useApiClient, unwrapList } from '../lib/apiClient.js';
import styles from './AdminTenantSettingsPage.module.css';

/* ── Types ────────────────────────────────────────────────── */

interface TenantSettings {
  currency?: string;
  dateFormat?: string;
  timezone?: string;
  financialYearStart?: string;
  defaultPipeline?: string;
  defaultRecordOwner?: string;
  leadAutoConversion?: boolean;
}

interface TenantSettingsResponse {
  name: string;
  slug: string;
  status: string;
  plan: string;
  settings: TenantSettings;
}

interface ApiError {
  error: string;
}

interface PipelineDefinition {
  id: string;
  name: string;
}

/* ── Dropdown option constants ────────────────────────────── */

const CURRENCY_OPTIONS = [
  { value: 'GBP', label: 'GBP — British Pound' },
  { value: 'USD', label: 'USD — US Dollar' },
  { value: 'EUR', label: 'EUR — Euro' },
  { value: 'AUD', label: 'AUD — Australian Dollar' },
  { value: 'CAD', label: 'CAD — Canadian Dollar' },
];

const DATE_FORMAT_OPTIONS = [
  { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY' },
  { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY' },
  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD' },
];

const TIMEZONE_OPTIONS = [
  { value: 'Europe/London', label: 'Europe/London' },
  { value: 'US/Eastern', label: 'US/Eastern' },
  { value: 'US/Central', label: 'US/Central' },
  { value: 'US/Mountain', label: 'US/Mountain' },
  { value: 'US/Pacific', label: 'US/Pacific' },
  { value: 'Europe/Paris', label: 'Europe/Paris' },
  { value: 'Europe/Berlin', label: 'Europe/Berlin' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo' },
  { value: 'Asia/Shanghai', label: 'Asia/Shanghai' },
  { value: 'Australia/Sydney', label: 'Australia/Sydney' },
  { value: 'Pacific/Auckland', label: 'Pacific/Auckland' },
];

const FY_START_OPTIONS = [
  { value: 'January', label: 'January' },
  { value: 'April', label: 'April' },
  { value: 'July', label: 'July' },
  { value: 'October', label: 'October' },
];

const RECORD_OWNER_OPTIONS = [
  { value: 'creator', label: 'Record creator' },
];

/* ── Component ────────────────────────────────────────────── */

export function AdminTenantSettingsPage() {
  const { sessionToken } = useSession();
  const api = useApiClient();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Read-only fields
  const [slug, setSlug] = useState('');
  const [status, setStatus] = useState('');
  const [plan, setPlan] = useState('');

  // Editable fields
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('');
  const [dateFormat, setDateFormat] = useState('');
  const [timezone, setTimezone] = useState('');
  const [financialYearStart, setFinancialYearStart] = useState('');
  const [defaultPipeline, setDefaultPipeline] = useState('');
  const [defaultRecordOwner, setDefaultRecordOwner] = useState('');
  const [leadAutoConversion, setLeadAutoConversion] = useState(false);

  // Pipelines for the dropdown
  const [pipelines, setPipelines] = useState<PipelineDefinition[]>([]);

  // ── Fetch settings ───────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const fetchSettings = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const [settingsRes, pipelinesRes] = await Promise.all([
          api.request('/api/v1/admin/tenant-settings'),
          api.request('/api/v1/admin/pipelines'),
        ]);

        if (!settingsRes.ok) {
          const data = (await settingsRes.json()) as ApiError;
          if (!cancelled) setLoadError(data.error ?? 'Failed to load settings');
          return;
        }

        const data = (await settingsRes.json()) as TenantSettingsResponse;
        if (!cancelled) {
          setName(data.name ?? '');
          setSlug(data.slug ?? '');
          setStatus(data.status ?? '');
          setPlan(data.plan ?? 'free');
          setCurrency(data.settings.currency ?? '');
          setDateFormat(data.settings.dateFormat ?? '');
          setTimezone(data.settings.timezone ?? '');
          setFinancialYearStart(data.settings.financialYearStart ?? '');
          setDefaultPipeline(data.settings.defaultPipeline ?? '');
          setDefaultRecordOwner(data.settings.defaultRecordOwner ?? '');
          setLeadAutoConversion(data.settings.leadAutoConversion ?? false);
        }

        if (pipelinesRes.ok) {
          const pipelineData = unwrapList<PipelineDefinition>(await pipelinesRes.json());
          if (!cancelled) setPipelines(pipelineData);
        }
      } catch {
        if (!cancelled) setLoadError('Failed to connect to the server. Please try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void fetchSettings();
    return () => { cancelled = true; };
  }, [sessionToken, api]);

  // ── Submit ───────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    setSaveSuccess(false);
    setSubmitting(true);

    const settings: TenantSettings = {};
    if (currency) settings.currency = currency;
    if (dateFormat) settings.dateFormat = dateFormat;
    if (timezone) settings.timezone = timezone;
    if (financialYearStart) settings.financialYearStart = financialYearStart;
    if (defaultPipeline) settings.defaultPipeline = defaultPipeline;
    if (defaultRecordOwner) settings.defaultRecordOwner = defaultRecordOwner;
    settings.leadAutoConversion = leadAutoConversion;

    try {
      const response = await api.request('/api/v1/admin/tenant-settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: name.trim(), settings }),
      });

      if (response.ok) {
        const data = (await response.json()) as TenantSettingsResponse;
        setName(data.name);
        setSlug(data.slug);
        setStatus(data.status);
        setPlan(data.plan ?? 'free');
        setCurrency(data.settings.currency ?? '');
        setDateFormat(data.settings.dateFormat ?? '');
        setTimezone(data.settings.timezone ?? '');
        setFinancialYearStart(data.settings.financialYearStart ?? '');
        setDefaultPipeline(data.settings.defaultPipeline ?? '');
        setDefaultRecordOwner(data.settings.defaultRecordOwner ?? '');
        setLeadAutoConversion(data.settings.leadAutoConversion ?? false);
        setSaveSuccess(true);
      } else {
        const data = (await response.json()) as ApiError;
        setSaveError(data.error ?? 'An unexpected error occurred');
      }
    } catch {
      setSaveError('Failed to connect to the server. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Helpers ──────────────────────────────────────────────
  const statusBadgeClass =
    status === 'active'
      ? styles.badgeActive
      : status === 'suspended'
        ? styles.badgeSuspended
        : styles.badgeDefault;

  // ── Render ───────────────────────────────────────────────

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>Tenant settings</h1>
        </div>
        <p className={styles.loadingText}>Loading…</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className={styles.page}>
        <div className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>Tenant settings</h1>
        </div>
        <p role="alert" className={styles.errorAlert}>{loadError}</p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Tenant settings</h1>
        <p className={styles.pageSubtitle}>
          Configure your organisation's CRM settings
        </p>
      </div>

      <form onSubmit={(e) => void handleSubmit(e)}>
        {/* ── Organisation details ──────────────────────────── */}
        <div className={styles.card}>
          <h2 className={styles.sectionTitle}>Organisation details</h2>
          <div className={styles.form}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="companyName">
                Company name
              </label>
              <input
                className={styles.input}
                id="companyName"
                name="companyName"
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setSaveError(null);
                  setSaveSuccess(false);
                }}
                maxLength={255}
                disabled={submitting}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="slug">
                Company slug
              </label>
              <div className={styles.readOnlyValue} id="slug">
                {slug}
              </div>
            </div>

            <div className={styles.field}>
              <span className={styles.label}>Status</span>
              <div>
                <span className={`${styles.badge} ${statusBadgeClass}`}>
                  {status}
                </span>
              </div>
            </div>

            <div className={styles.field}>
              <span className={styles.label}>Plan</span>
              <div>
                <span className={`${styles.badge} ${styles.badgeDefault}`}>
                  {plan}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Regional defaults ─────────────────────────────── */}
        <div className={styles.card}>
          <h2 className={styles.sectionTitle}>Regional defaults</h2>
          <div className={styles.form}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="currency">
                Currency
              </label>
              <select
                className={styles.select}
                id="currency"
                value={currency}
                onChange={(e) => {
                  setCurrency(e.target.value);
                  setSaveError(null);
                  setSaveSuccess(false);
                }}
                disabled={submitting}
              >
                <option value="">Select currency…</option>
                {CURRENCY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="dateFormat">
                Date format
              </label>
              <select
                className={styles.select}
                id="dateFormat"
                value={dateFormat}
                onChange={(e) => {
                  setDateFormat(e.target.value);
                  setSaveError(null);
                  setSaveSuccess(false);
                }}
                disabled={submitting}
              >
                <option value="">Select date format…</option>
                {DATE_FORMAT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="timezone">
                Timezone
              </label>
              <select
                className={styles.select}
                id="timezone"
                value={timezone}
                onChange={(e) => {
                  setTimezone(e.target.value);
                  setSaveError(null);
                  setSaveSuccess(false);
                }}
                disabled={submitting}
              >
                <option value="">Select timezone…</option>
                {TIMEZONE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="financialYearStart">
                Financial year start
              </label>
              <select
                className={styles.select}
                id="financialYearStart"
                value={financialYearStart}
                onChange={(e) => {
                  setFinancialYearStart(e.target.value);
                  setSaveError(null);
                  setSaveSuccess(false);
                }}
                disabled={submitting}
              >
                <option value="">Select month…</option>
                {FY_START_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* ── CRM defaults ──────────────────────────────────── */}
        <div className={styles.card}>
          <h2 className={styles.sectionTitle}>CRM defaults</h2>
          <div className={styles.form}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="defaultPipeline">
                Default pipeline
              </label>
              <select
                className={styles.select}
                id="defaultPipeline"
                value={defaultPipeline}
                onChange={(e) => {
                  setDefaultPipeline(e.target.value);
                  setSaveError(null);
                  setSaveSuccess(false);
                }}
                disabled={submitting}
              >
                <option value="">Select pipeline…</option>
                {pipelines.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="defaultRecordOwner">
                Default record owner
              </label>
              <select
                className={styles.select}
                id="defaultRecordOwner"
                value={defaultRecordOwner}
                onChange={(e) => {
                  setDefaultRecordOwner(e.target.value);
                  setSaveError(null);
                  setSaveSuccess(false);
                }}
                disabled={submitting}
              >
                <option value="">Select default…</option>
                {RECORD_OWNER_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.toggleRow}>
              <span className={styles.toggleLabel}>
                Lead auto-conversion
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={leadAutoConversion}
                className={styles.toggle}
                onClick={() => {
                  setLeadAutoConversion(!leadAutoConversion);
                  setSaveError(null);
                  setSaveSuccess(false);
                }}
                disabled={submitting}
              />
            </div>
          </div>
        </div>

        {/* ── Feedback + actions ─────────────────────────────── */}
        <div className={styles.card}>
          {saveError && (
            <p role="alert" className={styles.errorAlert}>{saveError}</p>
          )}

          {saveSuccess && (
            <p role="status" className={styles.successAlert}>
              Settings saved successfully.
            </p>
          )}

          <div className={styles.actions}>
            <button
              className={styles.submitButton}
              type="submit"
              disabled={submitting}
            >
              {submitting ? 'Saving…' : 'Save settings'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
