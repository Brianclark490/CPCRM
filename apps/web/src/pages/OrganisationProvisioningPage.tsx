import { useState } from 'react';
import { useDescope } from '@descope/react-sdk';
import { useNavigate } from 'react-router-dom';
import { useApiClient, clearServerSession } from '../lib/apiClient.js';
import styles from './OrganisationProvisioningPage.module.css';

interface FormState {
  name: string;
  description: string;
}

interface ApiError {
  error: string;
}

export function OrganisationProvisioningPage() {
  const api = useApiClient();
  const { logout } = useDescope();
  const navigate = useNavigate();

  const [form, setForm] = useState<FormState>({ name: '', description: '' });
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setErrorMessage(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedName = form.name.trim();
    if (!trimmedName) {
      setErrorMessage('Organisation name is required');
      return;
    }

    setSubmitting(true);

    try {
      const response = await api.request('/api/organisations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: trimmedName,
          description: form.description.trim() || undefined,
        }),
      });

      if (response.ok) {
        setSuccess(true);
      } else {
        const data = (await response.json()) as ApiError;
        setErrorMessage(data.error ?? 'An unexpected error occurred');
      }
    } catch {
      setErrorMessage('Failed to connect to the server. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = async () => {
    await clearServerSession();
    await logout();
    void navigate('/login');
  };

  if (success) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.successIcon} aria-hidden="true">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path
                d="M5 13l4 4L19 7"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h1 className={styles.successTitle}>Organisation created</h1>
          <p className={styles.successText}>Your organisation has been set up successfully.</p>
          <button className={styles.primaryButton} onClick={() => void navigate('/dashboard')}>
            Go to dashboard
          </button>
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

        <h1 className={styles.title}>Create your organisation</h1>
        <p className={styles.subtitle}>Set up your organisation to get started with CPCRM.</p>

        <form className={styles.form} onSubmit={(e) => void handleSubmit(e)}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="name">
              Organisation name
            </label>
            <input
              className={styles.input}
              id="name"
              name="name"
              type="text"
              value={form.name}
              onChange={handleChange}
              placeholder="e.g. Acme Corp"
              maxLength={100}
              disabled={submitting}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="description">
              Description (optional)
            </label>
            <textarea
              className={styles.textarea}
              id="description"
              name="description"
              value={form.description}
              onChange={handleChange}
              placeholder="Brief description of your organisation"
              disabled={submitting}
            />
          </div>

          {errorMessage && (
            <p role="alert" className={styles.errorAlert}>
              {errorMessage}
            </p>
          )}

          <div className={styles.actions}>
            <button className={styles.submitButton} type="submit" disabled={submitting}>
              {submitting ? 'Creating…' : 'Create organisation'}
            </button>
            <button
              type="button"
              className={styles.signOutLink}
              onClick={() => void handleLogout()}
            >
              Sign out
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
