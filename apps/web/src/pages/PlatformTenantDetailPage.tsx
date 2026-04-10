import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useSession } from '@descope/react-sdk';
import { useApiClient } from '../lib/apiClient.js';
import { PrimaryButton } from '../components/PrimaryButton.js';
import styles from './PlatformTenantDetailPage.module.css';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TenantDetail {
  id: string;
  name: string;
  slug: string;
  status: string;
  plan: string;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  userCount: number;
}

interface TenantUser {
  userId: string;
  loginId: string;
  email: string;
  name: string;
  roles: string[];
  status: string;
  lastLogin: string | null;
}

interface InviteForm {
  email: string;
  name: string;
  role: string;
}

interface ApiError {
  error: string;
}

// ─── Icons ────────────────────────────────────────────────────────────────────

const PlusIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
    <path d="M3 6h6M6 3v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

export function PlatformTenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { sessionToken } = useSession();
  const api = useApiClient();
  const navigate = useNavigate();

  // Tenant state
  const [tenant, setTenant] = useState<TenantDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit state
  const [editName, setEditName] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Users state
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);

  // Invite modal state
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteForm, setInviteForm] = useState<InviteForm>({
    email: '',
    name: '',
    role: 'user',
  });
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);

  // Suspend / reactivate state
  const [statusUpdating, setStatusUpdating] = useState(false);

  // Delete state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // ── Fetch tenant ────────────────────────────────────────────

  const fetchTenant = useCallback(async () => {
    if (!sessionToken || !id) return;

    setLoading(true);
    setError(null);

    try {
      const response = await api.request(`/api/platform/tenants/${id}`);

      if (response.ok) {
        const data = (await response.json()) as TenantDetail;
        setTenant(data);
        setEditName(data.name);
      } else if (response.status === 404) {
        setError('Tenant not found.');
      } else {
        setError('Failed to load tenant details.');
      }
    } catch {
      setError('Failed to connect to the server. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [sessionToken, api, id]);

  // ── Fetch users ─────────────────────────────────────────────

  const fetchUsers = useCallback(async () => {
    if (!sessionToken || !id) return;

    setUsersLoading(true);

    try {
      const response = await api.request(`/api/platform/tenants/${id}/users`);

      if (response.ok) {
        const data = (await response.json()) as TenantUser[];
        setUsers(data);
      }
    } catch {
      // Best-effort
    } finally {
      setUsersLoading(false);
    }
  }, [sessionToken, api, id]);

  useEffect(() => {
    void fetchTenant();
    void fetchUsers();
  }, [fetchTenant, fetchUsers]);

  // ── Save tenant name ────────────────────────────────────────

  const handleSaveName = async () => {
    if (!sessionToken || !id || !editName.trim()) return;

    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      const response = await api.request(`/api/platform/tenants/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: editName.trim() }),
      });

      if (response.ok) {
        const updated = (await response.json()) as TenantDetail;
        setTenant((prev) => (prev ? { ...prev, ...updated } : prev));
        setSaveSuccess(true);
      } else {
        const data = (await response.json()) as ApiError;
        setSaveError(data.error ?? 'Failed to update tenant');
      }
    } catch {
      setSaveError('Failed to connect to the server.');
    } finally {
      setSaving(false);
    }
  };

  // ── Suspend / Reactivate ────────────────────────────────────

  const handleStatusChange = async (newStatus: string) => {
    if (!sessionToken || !id) return;

    setStatusUpdating(true);
    setSaveError(null);

    try {
      const response = await api.request(`/api/platform/tenants/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: newStatus }),
      });

      if (response.ok) {
        const updated = (await response.json()) as TenantDetail;
        setTenant((prev) => (prev ? { ...prev, ...updated } : prev));
      } else {
        const data = (await response.json()) as ApiError;
        setSaveError(data.error ?? 'Failed to update status');
      }
    } catch {
      setSaveError('Failed to connect to the server.');
    } finally {
      setStatusUpdating(false);
    }
  };

  // ── Delete tenant ───────────────────────────────────────────

  const handleDelete = async () => {
    if (!sessionToken || !id || !tenant) return;
    if (deleteConfirmText !== tenant.name) return;

    setDeleting(true);
    setDeleteError(null);

    try {
      const response = await api.request(`/api/platform/tenants/${id}?cascade=true`, {
        method: 'DELETE',
      });

      if (response.ok || response.status === 204) {
        void navigate('/platform/tenants', { replace: true });
      } else {
        const data = (await response.json()) as ApiError;
        setDeleteError(data.error ?? 'Failed to delete tenant');
      }
    } catch {
      setDeleteError('Failed to connect to the server.');
    } finally {
      setDeleting(false);
    }
  };

  // ── Invite user ─────────────────────────────────────────────

  const openInviteModal = () => {
    setInviteForm({ email: '', name: '', role: 'user' });
    setInviteError(null);
    setShowInviteModal(true);
  };

  const closeInviteModal = () => {
    setShowInviteModal(false);
    setInviteError(null);
  };

  const handleInviteFieldChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    setInviteForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setInviteError(null);
  };

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteError(null);

    if (!sessionToken || !id) return;

    const trimmedEmail = inviteForm.email.trim();
    if (!trimmedEmail) {
      setInviteError('Email is required');
      return;
    }

    const trimmedName = inviteForm.name.trim();
    if (!trimmedName) {
      setInviteError('Name is required');
      return;
    }

    setInviting(true);

    try {
      const response = await api.request(`/api/platform/tenants/${id}/users/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: trimmedEmail,
          name: trimmedName,
          role: inviteForm.role,
        }),
      });

      if (response.ok) {
        setShowInviteModal(false);
        await fetchUsers();
      } else {
        const data = (await response.json()) as ApiError;
        setInviteError(data.error ?? 'Failed to invite user');
      }
    } catch {
      setInviteError('Failed to connect to the server.');
    } finally {
      setInviting(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────

  if (loading) {
    return (
      <div className={styles.page}>
        <Link to="/platform/tenants" className={styles.backLink}>
          ← Back to tenants
        </Link>
        <p className={styles.loadingText}>Loading tenant…</p>
      </div>
    );
  }

  if (error || !tenant) {
    return (
      <div className={styles.page}>
        <Link to="/platform/tenants" className={styles.backLink}>
          ← Back to tenants
        </Link>
        <p role="alert" className={styles.errorAlert}>
          {error ?? 'Tenant not found.'}
        </p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <Link to="/platform/tenants" className={styles.backLink}>
        ← Back to tenants
      </Link>

      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>{tenant.name}</h1>
          <p className={styles.pageSubtitle}>Tenant ID: {tenant.id}</p>
        </div>
        <div className={styles.actionRow}>
          {tenant.status === 'active' && (
            <PrimaryButton
              variant="outline"
              size="sm"
              onClick={() => void handleStatusChange('suspended')}
              disabled={statusUpdating}
            >
              {statusUpdating ? 'Updating…' : 'Suspend tenant'}
            </PrimaryButton>
          )}
          {tenant.status === 'suspended' && (
            <PrimaryButton
              size="sm"
              onClick={() => void handleStatusChange('active')}
              disabled={statusUpdating}
            >
              {statusUpdating ? 'Updating…' : 'Reactivate tenant'}
            </PrimaryButton>
          )}
        </div>
      </div>

      {saveError && (
        <p role="alert" className={styles.errorAlert}>
          {saveError}
        </p>
      )}

      {saveSuccess && (
        <p role="status" className={styles.successAlert}>
          Tenant updated successfully.
        </p>
      )}

      {/* ── Tenant info ───────────────────────────────────────── */}

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Tenant Information</h2>
        <div className={styles.infoGrid}>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>Slug</span>
            <span className={styles.infoValue}>{tenant.slug}</span>
          </div>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>Status</span>
            <span className={`${styles.statusBadge} ${statusClass(tenant.status)}`}>
              {tenant.status}
            </span>
          </div>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>Plan</span>
            <span className={styles.planBadge}>{tenant.plan}</span>
          </div>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>Users</span>
            <span className={styles.infoValue}>{tenant.userCount}</span>
          </div>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>Created</span>
            <span className={styles.infoValue}>{formatDate(tenant.created_at)}</span>
          </div>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>Updated</span>
            <span className={styles.infoValue}>{formatDate(tenant.updated_at)}</span>
          </div>
        </div>

        <div className={styles.editRow}>
          <input
            type="text"
            className={styles.editInput}
            value={editName}
            onChange={(e) => {
              setEditName(e.target.value);
              setSaveSuccess(false);
              setSaveError(null);
            }}
            placeholder="Tenant name"
            maxLength={255}
            disabled={saving}
          />
          <PrimaryButton
            size="sm"
            onClick={() => void handleSaveName()}
            disabled={saving || editName.trim() === tenant.name}
          >
            {saving ? 'Saving…' : 'Save name'}
          </PrimaryButton>
        </div>
      </div>

      {/* ── User list ─────────────────────────────────────────── */}

      <div className={styles.tableCard}>
        <div className={styles.tableHeader}>
          <h2 className={styles.tableTitle}>Users ({users.length})</h2>
          <PrimaryButton size="sm" onClick={openInviteModal}>
            <PlusIcon />
            Invite user
          </PrimaryButton>
        </div>

        {usersLoading && <p className={styles.emptyText}>Loading users…</p>}

        {!usersLoading && users.length === 0 && (
          <p className={styles.emptyText}>No users in this tenant yet.</p>
        )}

        {!usersLoading && users.length > 0 && (
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Name</th>
                <th className={styles.th}>Email</th>
                <th className={styles.th}>Roles</th>
                <th className={styles.th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.userId} className={styles.tr}>
                  <td className={styles.td}>{user.name || '—'}</td>
                  <td className={styles.td}>{user.email}</td>
                  <td className={styles.td}>
                    {user.roles.map((role) => (
                      <span key={role} className={styles.roleBadge}>
                        {role}
                      </span>
                    ))}
                    {user.roles.length === 0 && '—'}
                  </td>
                  <td className={styles.td}>{user.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Danger zone ───────────────────────────────────────── */}

      <div className={styles.dangerZone}>
        <h2 className={styles.dangerTitle}>Danger Zone</h2>
        <p className={styles.dangerText}>
          Deleting a tenant will suspend it and remove it from Descope. This action
          cannot be easily undone.
        </p>
        <button
          type="button"
          className={styles.dangerButton}
          onClick={() => {
            setShowDeleteModal(true);
            setDeleteConfirmText('');
            setDeleteError(null);
          }}
          disabled={deleting}
        >
          Delete tenant
        </button>
      </div>

      {/* ── Invite User Modal ─────────────────────────────────── */}

      {showInviteModal && (
        <div
          className={styles.overlay}
          onClick={closeInviteModal}
          role="dialog"
          aria-modal="true"
          aria-label="Invite user"
        >
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Invite user</h2>

            <form
              className={styles.form}
              noValidate
              onSubmit={(e) => void handleInviteSubmit(e)}
            >
              <div className={styles.field}>
                <label
                  className={`${styles.label} ${styles.labelRequired}`}
                  htmlFor="invite-email"
                >
                  Email
                </label>
                <input
                  id="invite-email"
                  name="email"
                  type="email"
                  className={styles.input}
                  value={inviteForm.email}
                  onChange={handleInviteFieldChange}
                  placeholder="e.g. user@example.com"
                  disabled={inviting}
                />
              </div>

              <div className={styles.field}>
                <label
                  className={`${styles.label} ${styles.labelRequired}`}
                  htmlFor="invite-name"
                >
                  Name
                </label>
                <input
                  id="invite-name"
                  name="name"
                  type="text"
                  className={styles.input}
                  value={inviteForm.name}
                  onChange={handleInviteFieldChange}
                  placeholder="e.g. Jane Doe"
                  maxLength={255}
                  disabled={inviting}
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="invite-role">
                  Role
                </label>
                <select
                  id="invite-role"
                  name="role"
                  className={styles.select}
                  value={inviteForm.role}
                  onChange={handleInviteFieldChange}
                  disabled={inviting}
                >
                  <option value="admin">Admin</option>
                  <option value="manager">Manager</option>
                  <option value="user">User</option>
                  <option value="read_only">Read Only</option>
                </select>
              </div>

              {inviteError && (
                <p className={styles.errorAlert} role="alert">
                  {inviteError}
                </p>
              )}

              <hr className={styles.divider} />

              <div className={styles.actions}>
                <PrimaryButton
                  type="button"
                  variant="outline"
                  onClick={closeInviteModal}
                  disabled={inviting}
                >
                  Cancel
                </PrimaryButton>
                <PrimaryButton type="submit" disabled={inviting}>
                  {inviting ? 'Sending…' : 'Send invite'}
                </PrimaryButton>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Modal ─────────────────────────── */}

      {showDeleteModal && (
        <div
          className={styles.overlay}
          onClick={() => setShowDeleteModal(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Delete tenant"
        >
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Delete tenant</h2>

            <p className={styles.confirmText}>
              Are you sure you want to delete{' '}
              <span className={styles.confirmName}>{tenant.name}</span>? This will
              suspend the tenant and remove it from Descope.
            </p>

            <p className={styles.confirmText}>
              Type <strong>{tenant.name}</strong> to confirm:
            </p>

            <input
              type="text"
              className={styles.confirmInput}
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder={tenant.name}
              disabled={deleting}
            />

            {deleteError && (
              <p className={styles.errorAlert} role="alert">
                {deleteError}
              </p>
            )}

            <div className={styles.actions}>
              <PrimaryButton
                type="button"
                variant="outline"
                onClick={() => setShowDeleteModal(false)}
                disabled={deleting}
              >
                Cancel
              </PrimaryButton>
              <PrimaryButton
                type="button"
                onClick={() => void handleDelete()}
                disabled={deleting || deleteConfirmText !== tenant.name}
              >
                {deleting ? 'Deleting…' : 'Delete tenant'}
              </PrimaryButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
