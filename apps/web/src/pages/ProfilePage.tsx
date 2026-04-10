import { useState, useEffect } from 'react';
import { useSession } from '@descope/react-sdk';
import { useApiClient } from '../lib/apiClient.js';
import styles from './ProfilePage.module.css';

interface UserProfile {
  id: string;
  userId: string;
  displayName?: string;
  jobTitle?: string;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
}

interface FormState {
  displayName: string;
  jobTitle: string;
}

interface ApiError {
  error: string;
}

export function ProfilePage() {
  const { sessionToken } = useSession();
  const api = useApiClient();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [form, setForm] = useState<FormState>({ displayName: '', jobTitle: '' });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const fetchProfile = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const response = await api.request('/api/profile');
        if (!response.ok) {
          const data = (await response.json()) as ApiError;
          if (!cancelled) setLoadError(data.error ?? 'Failed to load profile');
          return;
        }
        const data = (await response.json()) as UserProfile;
        if (!cancelled) {
          setProfile(data);
          setForm({
            displayName: data.displayName ?? '',
            jobTitle: data.jobTitle ?? '',
          });
        }
      } catch {
        if (!cancelled) setLoadError('Failed to connect to the server. Please try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void fetchProfile();
    return () => { cancelled = true; };
  }, [sessionToken, api]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setSaveError(null);
    setSaveSuccess(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    setSaveSuccess(false);
    setSubmitting(true);

    const body: Record<string, string> = {};
    if (form.displayName.trim()) body.displayName = form.displayName.trim();
    if (form.jobTitle.trim()) body.jobTitle = form.jobTitle.trim();

    try {
      const response = await api.request('/api/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        const updated = (await response.json()) as UserProfile;
        setProfile(updated);
        setForm({
          displayName: updated.displayName ?? '',
          jobTitle: updated.jobTitle ?? '',
        });
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

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>Profile</h1>
        </div>
        <p className={styles.loadingText}>Loading…</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className={styles.page}>
        <div className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>Profile</h1>
        </div>
        <p role="alert" className={styles.errorAlert}>{loadError}</p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Profile</h1>
        <p className={styles.pageSubtitle}>Manage your personal information</p>
      </div>

      <div className={styles.card}>
        <form className={styles.form} onSubmit={(e) => void handleSubmit(e)}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="displayName">
              Display name
            </label>
            <input
              className={styles.input}
              id="displayName"
              name="displayName"
              type="text"
              value={form.displayName}
              onChange={handleChange}
              placeholder="e.g. Alice Smith"
              maxLength={100}
              disabled={submitting}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="jobTitle">
              Job title (optional)
            </label>
            <input
              className={styles.input}
              id="jobTitle"
              name="jobTitle"
              type="text"
              value={form.jobTitle}
              onChange={handleChange}
              placeholder="e.g. Account Executive"
              maxLength={100}
              disabled={submitting}
            />
          </div>

          {saveError && (
            <p role="alert" className={styles.errorAlert}>{saveError}</p>
          )}

          {saveSuccess && (
            <p role="status" className={styles.successAlert}>Profile saved successfully.</p>
          )}

          <div className={styles.actions}>
            {profile && (
              <p className={styles.metaText}>
                Last updated: {new Date(profile.updatedAt).toLocaleDateString()}
              </p>
            )}
            <button className={styles.submitButton} type="submit" disabled={submitting}>
              {submitting ? 'Saving…' : 'Save profile'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
