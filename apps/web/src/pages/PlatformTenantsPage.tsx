import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSession } from '@descope/react-sdk';
import { useApiClient } from '../lib/apiClient.js';
import { PrimaryButton } from '../components/PrimaryButton.js';
import styles from './PlatformTenantsPage.module.css';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TenantListItem {
  id: string;
  name: string;
  slug: string;
  status: string;
  plan: string;
  created_at: string;
  userCount?: number;
}

interface TenantListResponse {
  tenants: TenantListItem[];
  total: number;
}

interface CreateTenantForm {
  name: string;
  slug: string;
  adminEmail: string;
  adminName: string;
  plan: string;
}

interface ProvisionResult {
  tenant: { id: string; name: string; slug: string; status: string };
  adminUser: { email: string; inviteSent: boolean };
  seeded: { objects: number; fields: number; relationships: number; pipelines: number };
}

interface ApiError {
  error: string;
}

type ProvisionStep = 'idle' | 'creating' | 'seeding' | 'inviting' | 'done' | 'error';

// ─── Icons ────────────────────────────────────────────────────────────────────

const PlusIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
    <path d="M3 6h6M6 3v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function slugifyTenantName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function statusClass(status: string): string {
  switch (status) {
    case 'active':
      return styles.statusActive;
    case 'suspended':
      return styles.statusSuspended;
    case 'cancelled':
      return styles.statusCancelled;
    default:
      return styles.statusInactive;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PlatformTenantsPage() {
  const { sessionToken } = useSession();
  const api = useApiClient();
  const navigate = useNavigate();

  // List state
  const [tenants, setTenants] = useState<TenantListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState<CreateTenantForm>({
    name: '',
    slug: '',
    adminEmail: '',
    adminName: '',
    plan: 'free',
  });
  const [slugEdited, setSlugEdited] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [provisionStep, setProvisionStep] = useState<ProvisionStep>('idle');
  const [provisionResult, setProvisionResult] = useState<ProvisionResult | null>(null);

  // ── Fetch tenants ───────────────────────────────────────────

  const fetchTenants = useCallback(async () => {
    if (!sessionToken) return;

    setLoading(true);
    setError(null);

    try {
      const response = await api.request('/api/platform/tenants');

      if (response.ok) {
        const data = (await response.json()) as TenantListResponse;
        setTenants(data.tenants);
      } else {
        setError('Failed to load tenants.');
      }
    } catch {
      setError('Failed to connect to the server. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [sessionToken, api]);

  useEffect(() => {
    void fetchTenants();
  }, [fetchTenants]);

  // ── Create modal handlers ──────────────────────────────────

  const openCreateModal = () => {
    setCreateForm({ name: '', slug: '', adminEmail: '', adminName: '', plan: 'free' });
    setSlugEdited(false);
    setCreateError(null);
    setProvisionStep('idle');
    setProvisionResult(null);
    setShowCreateModal(true);
  };

  const closeCreateModal = () => {
    if (provisionStep !== 'idle' && provisionStep !== 'done' && provisionStep !== 'error') return;
    setShowCreateModal(false);
    setCreateError(null);
    setProvisionStep('idle');
    setProvisionResult(null);
  };

  const handleCreateFieldChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;

    setCreateForm((prev) => {
      const next = { ...prev, [name]: value };

      if (name === 'name' && !slugEdited) {
        next.slug = slugifyTenantName(value);
      }

      return next;
    });

    if (name === 'slug') {
      setSlugEdited(true);
    }

    setCreateError(null);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);

    if (!sessionToken) {
      setCreateError('Session unavailable. Please refresh and try again.');
      return;
    }

    const trimmedName = createForm.name.trim();
    if (!trimmedName) {
      setCreateError('Tenant name is required');
      return;
    }

    const trimmedSlug = createForm.slug.trim();
    if (!trimmedSlug) {
      setCreateError('Slug is required');
      return;
    }

    const trimmedEmail = createForm.adminEmail.trim();
    if (!trimmedEmail) {
      setCreateError('Admin email is required');
      return;
    }

    const trimmedAdminName = createForm.adminName.trim();
    if (!trimmedAdminName) {
      setCreateError('Admin name is required');
      return;
    }

    setProvisionStep('creating');

    try {
      // Simulate progress through steps
      await new Promise((resolve) => setTimeout(resolve, 500));
      setProvisionStep('seeding');

      const response = await api.request('/api/platform/tenants', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: trimmedName,
          slug: trimmedSlug,
          adminEmail: trimmedEmail,
          adminName: trimmedAdminName,
          plan: createForm.plan,
        }),
      });

      setProvisionStep('inviting');
      await new Promise((resolve) => setTimeout(resolve, 300));

      if (response.ok) {
        const result = (await response.json()) as ProvisionResult;
        setProvisionResult(result);
        setProvisionStep('done');
        await fetchTenants();
      } else {
        const data = (await response.json()) as ApiError;
        setCreateError(data.error ?? 'An unexpected error occurred');
        setProvisionStep('error');
      }
    } catch {
      setCreateError('Failed to connect to the server. Please try again.');
      setProvisionStep('error');
    }
  };

  const handleViewCreatedTenant = () => {
    if (provisionResult) {
      void navigate(`/platform/tenants/${provisionResult.tenant.id}`);
    }
  };

  // ── Render ─────────────────────────────────────────────────

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Tenant Management</h1>
          <p className={styles.pageSubtitle}>
            Create and manage platform tenants
          </p>
        </div>
        <PrimaryButton size="sm" onClick={openCreateModal}>
          <PlusIcon />
          Create tenant
        </PrimaryButton>
      </div>

      {error && (
        <p role="alert" className={styles.errorAlert}>
          {error}
        </p>
      )}

      {loading && <p className={styles.loadingText}>Loading tenants…</p>}

      {!loading && !error && tenants.length === 0 && (
        <div className={styles.emptyState}>
          <h2 className={styles.emptyTitle}>No tenants yet</h2>
          <p className={styles.emptyText}>
            Create your first tenant to get started with the platform.
          </p>
        </div>
      )}

      {!loading && !error && tenants.length > 0 && (
        <div className={styles.tableCard}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Name</th>
                <th className={styles.th}>Slug</th>
                <th className={styles.th}>Status</th>
                <th className={styles.th}>Plan</th>
                <th className={styles.th}>Users</th>
                <th className={styles.th}>Created</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((tenant) => (
                <tr
                  key={tenant.id}
                  className={styles.tr}
                  onClick={() => void navigate(`/platform/tenants/${tenant.id}`)}
                >
                  <td className={styles.td}>
                    <Link
                      to={`/platform/tenants/${tenant.id}`}
                      className={styles.nameLink}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {tenant.name}
                    </Link>
                  </td>
                  <td className={styles.td}>
                    <code className={styles.slug}>{tenant.slug}</code>
                  </td>
                  <td className={styles.td}>
                    <span className={`${styles.statusBadge} ${statusClass(tenant.status)}`}>
                      {tenant.status}
                    </span>
                  </td>
                  <td className={styles.td}>
                    <span className={styles.planBadge}>{tenant.plan}</span>
                  </td>
                  <td className={styles.td}>{tenant.userCount ?? '—'}</td>
                  <td className={styles.td}>{formatDate(tenant.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Create Tenant Modal ───────────────────────────────── */}

      {showCreateModal && (
        <div
          className={styles.overlay}
          onClick={closeCreateModal}
          role="dialog"
          aria-modal="true"
          aria-label="Create tenant"
        >
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Create tenant</h2>

            {provisionStep === 'done' && provisionResult ? (
              <div>
                <p className={styles.successAlert} role="status">
                  Tenant "{provisionResult.tenant.name}" created successfully!
                  {provisionResult.adminUser.inviteSent
                    ? ` Admin invite sent to ${provisionResult.adminUser.email}.`
                    : ' Admin invite could not be sent — you can resend it manually.'}
                </p>
                <div className={styles.actions}>
                  <PrimaryButton type="button" variant="outline" onClick={closeCreateModal}>
                    Close
                  </PrimaryButton>
                  <PrimaryButton type="button" onClick={handleViewCreatedTenant}>
                    View tenant
                  </PrimaryButton>
                </div>
              </div>
            ) : (
              <form
                className={styles.form}
                noValidate
                onSubmit={(e) => void handleCreateSubmit(e)}
              >
                <div className={styles.field}>
                  <label
                    className={`${styles.label} ${styles.labelRequired}`}
                    htmlFor="create-tenant-name"
                  >
                    Tenant name
                  </label>
                  <input
                    id="create-tenant-name"
                    name="name"
                    type="text"
                    className={styles.input}
                    value={createForm.name}
                    onChange={handleCreateFieldChange}
                    placeholder="e.g. Acme Corporation"
                    maxLength={255}
                    disabled={provisionStep !== 'idle' && provisionStep !== 'error'}
                  />
                </div>

                <div className={styles.field}>
                  <label
                    className={`${styles.label} ${styles.labelRequired}`}
                    htmlFor="create-tenant-slug"
                  >
                    Slug
                  </label>
                  <input
                    id="create-tenant-slug"
                    name="slug"
                    type="text"
                    className={styles.input}
                    value={createForm.slug}
                    onChange={handleCreateFieldChange}
                    placeholder="e.g. acme-corp"
                    maxLength={63}
                    disabled={provisionStep !== 'idle' && provisionStep !== 'error'}
                  />
                  <span className={styles.fieldHint}>
                    Auto-generated from name. Lowercase letters, digits, and hyphens only.
                  </span>
                </div>

                <div className={styles.field}>
                  <label
                    className={`${styles.label} ${styles.labelRequired}`}
                    htmlFor="create-tenant-email"
                  >
                    Admin email
                  </label>
                  <input
                    id="create-tenant-email"
                    name="adminEmail"
                    type="email"
                    className={styles.input}
                    value={createForm.adminEmail}
                    onChange={handleCreateFieldChange}
                    placeholder="e.g. admin@acme.com"
                    disabled={provisionStep !== 'idle' && provisionStep !== 'error'}
                  />
                </div>

                <div className={styles.field}>
                  <label
                    className={`${styles.label} ${styles.labelRequired}`}
                    htmlFor="create-tenant-admin-name"
                  >
                    Admin name
                  </label>
                  <input
                    id="create-tenant-admin-name"
                    name="adminName"
                    type="text"
                    className={styles.input}
                    value={createForm.adminName}
                    onChange={handleCreateFieldChange}
                    placeholder="e.g. John Smith"
                    maxLength={255}
                    disabled={provisionStep !== 'idle' && provisionStep !== 'error'}
                  />
                </div>

                <div className={styles.field}>
                  <label className={styles.label} htmlFor="create-tenant-plan">
                    Plan
                  </label>
                  <select
                    id="create-tenant-plan"
                    name="plan"
                    className={styles.select}
                    value={createForm.plan}
                    onChange={handleCreateFieldChange}
                    disabled={provisionStep !== 'idle' && provisionStep !== 'error'}
                  >
                    <option value="free">Free</option>
                    <option value="pro">Pro</option>
                    <option value="enterprise">Enterprise</option>
                  </select>
                </div>

                {/* Progress steps */}
                {provisionStep !== 'idle' && provisionStep !== 'error' && (
                  <div className={styles.progressSteps}>
                    <div
                      className={`${styles.progressStep} ${
                        provisionStep === 'creating'
                          ? styles.progressStepActive
                          : styles.progressStepDone
                      }`}
                    >
                      <span
                        className={`${styles.progressDot} ${
                          provisionStep === 'creating'
                            ? styles.progressDotActive
                            : styles.progressDotDone
                        }`}
                      />
                      Creating tenant…
                    </div>
                    <div
                      className={`${styles.progressStep} ${
                        provisionStep === 'seeding'
                          ? styles.progressStepActive
                          : provisionStep === 'inviting' || provisionStep === 'done'
                            ? styles.progressStepDone
                            : ''
                      }`}
                    >
                      <span
                        className={`${styles.progressDot} ${
                          provisionStep === 'seeding'
                            ? styles.progressDotActive
                            : provisionStep === 'inviting' || provisionStep === 'done'
                              ? styles.progressDotDone
                              : ''
                        }`}
                      />
                      Seeding data…
                    </div>
                    <div
                      className={`${styles.progressStep} ${
                        provisionStep === 'inviting'
                          ? styles.progressStepActive
                          : provisionStep === 'done'
                            ? styles.progressStepDone
                            : ''
                      }`}
                    >
                      <span
                        className={`${styles.progressDot} ${
                          provisionStep === 'inviting'
                            ? styles.progressDotActive
                            : provisionStep === 'done'
                              ? styles.progressDotDone
                              : ''
                        }`}
                      />
                      Inviting admin…
                    </div>
                  </div>
                )}

                {createError && (
                  <p className={styles.errorAlert} role="alert">
                    {createError}
                  </p>
                )}

                <hr className={styles.divider} />

                <div className={styles.actions}>
                  <PrimaryButton
                    type="button"
                    variant="outline"
                    onClick={closeCreateModal}
                    disabled={provisionStep !== 'idle' && provisionStep !== 'error'}
                  >
                    Cancel
                  </PrimaryButton>
                  <PrimaryButton
                    type="submit"
                    disabled={provisionStep !== 'idle' && provisionStep !== 'error'}
                  >
                    {provisionStep === 'idle' || provisionStep === 'error'
                      ? 'Create and invite'
                      : 'Creating…'}
                  </PrimaryButton>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
