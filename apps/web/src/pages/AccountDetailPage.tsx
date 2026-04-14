import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSession } from '@descope/react-sdk';
import { useApiClient } from '../lib/apiClient.js';
import styles from './AccountDetailPage.module.css';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LinkedOpportunity {
  id: string;
  title: string;
  stage: string;
  value?: number;
  currency?: string;
  expectedCloseDate?: string;
  createdAt: string;
  updatedAt: string;
}

interface Account {
  id: string;
  tenantId: string;
  name: string;
  industry?: string;
  website?: string;
  phone?: string;
  email?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  region?: string;
  postalCode?: string;
  country?: string;
  notes?: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  opportunities: LinkedOpportunity[];
}

interface FormState {
  name: string;
  industry: string;
  website: string;
  phone: string;
  email: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  notes: string;
}

interface ApiError {
  error: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STAGE_LABELS: Record<string, string> = {
  prospecting: 'Prospecting',
  qualification: 'Qualification',
  proposal: 'Proposal',
  negotiation: 'Negotiation',
  closed_won: 'Closed Won',
  closed_lost: 'Closed Lost',
};

function formatDate(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function accountToForm(account: Account): FormState {
  return {
    name: account.name,
    industry: account.industry ?? '',
    website: account.website ?? '',
    phone: account.phone ?? '',
    email: account.email ?? '',
    addressLine1: account.addressLine1 ?? '',
    addressLine2: account.addressLine2 ?? '',
    city: account.city ?? '',
    region: account.region ?? '',
    postalCode: account.postalCode ?? '',
    country: account.country ?? '',
    notes: account.notes ?? '',
  };
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;
const PHONE_REGEX = /^[+]?[\d\s\-().]{7,50}$/;

// ─── Component ────────────────────────────────────────────────────────────────

export function AccountDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { sessionToken } = useSession();
  const api = useApiClient();

  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // ── Load account ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!id || !sessionToken) return;

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setLoadError(null);

      try {
        const response = await api.request(`/api/v1/accounts/${id}`);

        if (cancelled) return;

        if (response.ok) {
          const data = (await response.json()) as Account;
          if (!cancelled) setAccount(data);
        } else if (response.status === 404) {
          if (!cancelled) setLoadError('Account not found.');
        } else {
          if (!cancelled) setLoadError('Failed to load account.');
        }
      } catch {
        if (!cancelled) setLoadError('Failed to connect to the server. Please try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [id, sessionToken, api]);

  // ── Edit handlers ─────────────────────────────────────────────────────────

  const handleEditClick = () => {
    if (!account) return;
    setForm(accountToForm(account));
    setSaveError(null);
    setSaveSuccess(false);
    setEditing(true);
  };

  const handleCancelClick = () => {
    setEditing(false);
    setSaveError(null);
    setSaveSuccess(false);
    setForm(null);
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    setForm((prev) => (prev ? { ...prev, [e.target.name]: e.target.value } : prev));
    setSaveError(null);
    setSaveSuccess(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form || !account) return;

    if (!sessionToken) {
      setSaveError('Session unavailable. Please refresh and try again.');
      return;
    }

    const trimmedName = form.name.trim();
    if (!trimmedName) {
      setSaveError('Account name is required');
      return;
    }

    if (form.email.trim() && !EMAIL_REGEX.test(form.email.trim())) {
      setSaveError('Email must be a valid email address');
      return;
    }

    if (form.phone.trim() && !PHONE_REGEX.test(form.phone.trim())) {
      setSaveError('Phone must be a valid phone number');
      return;
    }

    if (form.website.trim()) {
      try {
        new URL(form.website.trim());
      } catch {
        setSaveError('Website must be a valid URL');
        return;
      }
    }

    setSubmitting(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      const response = await api.request(`/api/v1/accounts/${account.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: trimmedName,
          industry: form.industry.trim() || null,
          website: form.website.trim() || null,
          phone: form.phone.trim() || null,
          email: form.email.trim() || null,
          addressLine1: form.addressLine1.trim() || null,
          addressLine2: form.addressLine2.trim() || null,
          city: form.city.trim() || null,
          region: form.region.trim() || null,
          postalCode: form.postalCode.trim() || null,
          country: form.country.trim() || null,
          notes: form.notes.trim() || null,
        }),
      });

      if (response.ok) {
        const updated = (await response.json()) as Account;
        setAccount(updated);
        setEditing(false);
        setForm(null);
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

  // ── Delete handlers ───────────────────────────────────────────────────────

  const handleDeleteClick = () => {
    setDeleteError(null);
    setShowDeleteDialog(true);
  };

  const handleDeleteCancel = () => {
    setShowDeleteDialog(false);
    setDeleteError(null);
  };

  const handleDeleteConfirm = async () => {
    if (!account || !sessionToken) return;

    setDeleting(true);
    setDeleteError(null);

    try {
      const response = await api.request(`/api/v1/accounts/${account.id}`, {
        method: 'DELETE',
      });

      if (response.ok || response.status === 204) {
        void navigate('/accounts');
      } else {
        const data = (await response.json()) as ApiError;
        setDeleteError(data.error ?? 'Failed to delete account');
      }
    } catch {
      setDeleteError('Failed to connect to the server. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className={styles.page}>
        <p>Loading…</p>
      </div>
    );
  }

  if (loadError || !account) {
    return (
      <div className={styles.page}>
        <button className={styles.backLink} onClick={() => void navigate('/accounts')}>
          ← Back to accounts
        </button>
        <p role="alert">{loadError ?? 'Account not found.'}</p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {/* Page header */}
      <div className={styles.pageHeader}>
        <div className={styles.headerLeft}>
          <button
            className={styles.backLink}
            onClick={() => void navigate('/accounts')}
            type="button"
          >
            ← Back to accounts
          </button>
          <h1 className={styles.pageTitle}>{account.name}</h1>
        </div>

        {!editing && (
          <div className={styles.headerActions}>
            <button className={styles.btnPrimary} type="button" onClick={handleEditClick}>
              Edit
            </button>
            <button className={styles.btnDanger} type="button" onClick={handleDeleteClick}>
              Delete
            </button>
          </div>
        )}
      </div>

      {/* Success banner */}
      {saveSuccess && (
        <p role="status" className={styles.successAlert}>
          Account updated successfully.
        </p>
      )}

      {/* Detail / Edit card */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <span className={styles.cardTitle}>
            {editing ? 'Edit account' : 'Account details'}
          </span>
        </div>

        <div className={styles.cardBody}>
          {editing && form ? (
            <form onSubmit={(e) => void handleSave(e)} noValidate>
              <div className={styles.formGrid}>
                {/* Name */}
                <div className={styles.formField}>
                  <label className={styles.label} htmlFor="name">
                    Account name <span className={styles.required}>*</span>
                  </label>
                  <input
                    className={styles.input}
                    id="name"
                    name="name"
                    type="text"
                    value={form.name}
                    onChange={handleChange}
                    maxLength={200}
                    disabled={submitting}
                  />
                </div>

                {/* Industry */}
                <div className={styles.formField}>
                  <label className={styles.label} htmlFor="industry">
                    Industry
                  </label>
                  <input
                    className={styles.input}
                    id="industry"
                    name="industry"
                    type="text"
                    value={form.industry}
                    onChange={handleChange}
                    disabled={submitting}
                  />
                </div>

                {/* Website */}
                <div className={styles.formField}>
                  <label className={styles.label} htmlFor="website">
                    Website
                  </label>
                  <input
                    className={styles.input}
                    id="website"
                    name="website"
                    type="url"
                    value={form.website}
                    onChange={handleChange}
                    placeholder="https://example.com"
                    disabled={submitting}
                  />
                </div>

                {/* Phone */}
                <div className={styles.formField}>
                  <label className={styles.label} htmlFor="phone">
                    Phone
                  </label>
                  <input
                    className={styles.input}
                    id="phone"
                    name="phone"
                    type="tel"
                    value={form.phone}
                    onChange={handleChange}
                    disabled={submitting}
                  />
                </div>

                {/* Email */}
                <div className={styles.formField}>
                  <label className={styles.label} htmlFor="email">
                    Email
                  </label>
                  <input
                    className={styles.input}
                    id="email"
                    name="email"
                    type="email"
                    value={form.email}
                    onChange={handleChange}
                    disabled={submitting}
                  />
                </div>

                {/* Address Line 1 */}
                <div className={styles.formField}>
                  <label className={styles.label} htmlFor="addressLine1">
                    Address line 1
                  </label>
                  <input
                    className={styles.input}
                    id="addressLine1"
                    name="addressLine1"
                    type="text"
                    value={form.addressLine1}
                    onChange={handleChange}
                    disabled={submitting}
                  />
                </div>

                {/* Address Line 2 */}
                <div className={styles.formField}>
                  <label className={styles.label} htmlFor="addressLine2">
                    Address line 2
                  </label>
                  <input
                    className={styles.input}
                    id="addressLine2"
                    name="addressLine2"
                    type="text"
                    value={form.addressLine2}
                    onChange={handleChange}
                    disabled={submitting}
                  />
                </div>

                {/* City */}
                <div className={styles.formField}>
                  <label className={styles.label} htmlFor="city">
                    City
                  </label>
                  <input
                    className={styles.input}
                    id="city"
                    name="city"
                    type="text"
                    value={form.city}
                    onChange={handleChange}
                    disabled={submitting}
                  />
                </div>

                {/* Region */}
                <div className={styles.formField}>
                  <label className={styles.label} htmlFor="region">
                    Region
                  </label>
                  <input
                    className={styles.input}
                    id="region"
                    name="region"
                    type="text"
                    value={form.region}
                    onChange={handleChange}
                    disabled={submitting}
                  />
                </div>

                {/* Postal Code */}
                <div className={styles.formField}>
                  <label className={styles.label} htmlFor="postalCode">
                    Postal code
                  </label>
                  <input
                    className={styles.input}
                    id="postalCode"
                    name="postalCode"
                    type="text"
                    value={form.postalCode}
                    onChange={handleChange}
                    disabled={submitting}
                  />
                </div>

                {/* Country */}
                <div className={styles.formField}>
                  <label className={styles.label} htmlFor="country">
                    Country
                  </label>
                  <input
                    className={styles.input}
                    id="country"
                    name="country"
                    type="text"
                    value={form.country}
                    onChange={handleChange}
                    disabled={submitting}
                  />
                </div>

                {/* Notes */}
                <div className={`${styles.formField} ${styles.formFieldFull}`}>
                  <label className={styles.label} htmlFor="notes">
                    Notes
                  </label>
                  <textarea
                    className={styles.textarea}
                    id="notes"
                    name="notes"
                    value={form.notes}
                    onChange={handleChange}
                    disabled={submitting}
                  />
                </div>
              </div>

              {saveError && (
                <p role="alert" className={styles.errorAlert} style={{ marginTop: '16px' }}>
                  {saveError}
                </p>
              )}

              <div className={styles.formActions}>
                <button className={styles.btnPrimary} type="submit" disabled={submitting}>
                  {submitting ? 'Saving…' : 'Save'}
                </button>
                <button
                  className={styles.btnSecondary}
                  type="button"
                  onClick={handleCancelClick}
                  disabled={submitting}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <div className={styles.fieldsGrid}>
              <div className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>Account name</span>
                <span className={styles.fieldValue}>{account.name}</span>
              </div>

              <div className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>Industry</span>
                {account.industry ? (
                  <span className={styles.fieldValue}>{account.industry}</span>
                ) : (
                  <span className={styles.fieldEmpty}>Not set</span>
                )}
              </div>

              <div className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>Website</span>
                {account.website ? (
                  <span className={styles.fieldValue}>{account.website}</span>
                ) : (
                  <span className={styles.fieldEmpty}>Not set</span>
                )}
              </div>

              <div className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>Phone</span>
                {account.phone ? (
                  <span className={styles.fieldValue}>{account.phone}</span>
                ) : (
                  <span className={styles.fieldEmpty}>Not set</span>
                )}
              </div>

              <div className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>Email</span>
                {account.email ? (
                  <span className={styles.fieldValue}>{account.email}</span>
                ) : (
                  <span className={styles.fieldEmpty}>Not set</span>
                )}
              </div>

              <div className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>Address line 1</span>
                {account.addressLine1 ? (
                  <span className={styles.fieldValue}>{account.addressLine1}</span>
                ) : (
                  <span className={styles.fieldEmpty}>Not set</span>
                )}
              </div>

              <div className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>Address line 2</span>
                {account.addressLine2 ? (
                  <span className={styles.fieldValue}>{account.addressLine2}</span>
                ) : (
                  <span className={styles.fieldEmpty}>Not set</span>
                )}
              </div>

              <div className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>City</span>
                {account.city ? (
                  <span className={styles.fieldValue}>{account.city}</span>
                ) : (
                  <span className={styles.fieldEmpty}>Not set</span>
                )}
              </div>

              <div className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>Region</span>
                {account.region ? (
                  <span className={styles.fieldValue}>{account.region}</span>
                ) : (
                  <span className={styles.fieldEmpty}>Not set</span>
                )}
              </div>

              <div className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>Postal code</span>
                {account.postalCode ? (
                  <span className={styles.fieldValue}>{account.postalCode}</span>
                ) : (
                  <span className={styles.fieldEmpty}>Not set</span>
                )}
              </div>

              <div className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>Country</span>
                {account.country ? (
                  <span className={styles.fieldValue}>{account.country}</span>
                ) : (
                  <span className={styles.fieldEmpty}>Not set</span>
                )}
              </div>

              <div className={`${styles.fieldGroup} ${styles.fieldFull}`}>
                <span className={styles.fieldLabel}>Notes</span>
                {account.notes ? (
                  <span className={styles.fieldValue}>{account.notes}</span>
                ) : (
                  <span className={styles.fieldEmpty}>No notes</span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Metadata footer */}
        {!editing && (
          <div className={styles.metaRow}>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Created</span>
              <span className={styles.metaValue}>{formatDate(account.createdAt)}</span>
            </div>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Last modified</span>
              <span className={styles.metaValue}>{formatDate(account.updatedAt)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Linked opportunities section */}
      {!editing && (
        <div className={styles.opportunitiesSection}>
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <span className={styles.cardTitle}>Linked opportunities</span>
              <button
                className={styles.btnPrimary}
                type="button"
                onClick={() => void navigate(`/opportunities/new?accountId=${account.id}`)}
              >
                Add opportunity
              </button>
            </div>

            {account.opportunities.length > 0 ? (
              <table className={styles.opportunitiesTable}>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Stage</th>
                    <th>Value</th>
                    <th>Close date</th>
                  </tr>
                </thead>
                <tbody>
                  {account.opportunities.map((opp) => (
                    <tr key={opp.id}>
                      <td>
                        <button
                          className={styles.oppLink}
                          type="button"
                          onClick={() => void navigate(`/opportunities/${opp.id}`)}
                        >
                          {opp.title}
                        </button>
                      </td>
                      <td>{STAGE_LABELS[opp.stage] ?? opp.stage}</td>
                      <td>
                        {opp.value !== undefined
                          ? opp.currency
                            ? `${opp.currency} ${opp.value.toLocaleString()}`
                            : opp.value.toLocaleString()
                          : '—'}
                      </td>
                      <td>{formatDate(opp.expectedCloseDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className={styles.emptyOpportunities}>No linked opportunities yet.</p>
            )}
          </div>
        </div>
      )}

      {/* Delete confirmation dialog */}
      {showDeleteDialog && (
        <div className={styles.dialogOverlay} role="dialog" aria-modal="true">
          <div className={styles.dialogCard}>
            <h2 className={styles.dialogTitle}>Delete account</h2>
            <p className={styles.dialogText}>
              Are you sure you want to delete <strong>{account.name}</strong>? This action cannot be
              undone.
            </p>
            {deleteError && (
              <p role="alert" className={styles.errorAlert} style={{ marginBottom: '16px' }}>
                {deleteError}
              </p>
            )}
            <div className={styles.dialogActions}>
              <button
                className={styles.btnSecondary}
                type="button"
                onClick={handleDeleteCancel}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                className={styles.btnDanger}
                type="button"
                onClick={() => void handleDeleteConfirm()}
                disabled={deleting}
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
