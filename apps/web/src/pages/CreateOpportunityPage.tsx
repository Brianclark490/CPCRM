import { useState } from 'react';
import { useSession } from '@descope/react-sdk';
import { useNavigate } from 'react-router-dom';
import { PrimaryButton } from '../components/PrimaryButton.js';
import styles from './CreateOpportunityPage.module.css';

interface FormState {
  title: string;
  accountId: string;
  value: string;
  currency: string;
  expectedCloseDate: string;
  description: string;
}

interface ApiError {
  error: string;
}

const BackIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path
      d="M8.5 3L5 7l3.5 4"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const CheckIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M5 13l4 4L19 7"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export function CreateOpportunityPage() {
  const { sessionToken } = useSession();
  const navigate = useNavigate();

  const [form, setForm] = useState<FormState>({
    title: '',
    accountId: '',
    value: '',
    currency: '',
    expectedCloseDate: '',
    description: '',
  });
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

    if (!sessionToken) {
      setErrorMessage('Session unavailable. Please refresh and try again.');
      return;
    }

    const trimmedTitle = form.title.trim();
    if (!trimmedTitle) {
      setErrorMessage('Opportunity title is required');
      return;
    }

    const trimmedAccountId = form.accountId.trim();
    if (!trimmedAccountId) {
      setErrorMessage('Account is required');
      return;
    }

    setSubmitting(true);

    try {
      let parsedValue: number | undefined;
      if (form.value.trim()) {
        parsedValue = Number(form.value.trim());
        if (isNaN(parsedValue)) {
          setErrorMessage('Value must be a valid number');
          return;
        }
      }

      const response = await fetch('/api/opportunities', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({
          title: trimmedTitle,
          accountId: trimmedAccountId,
          value: parsedValue,
          currency: form.currency.trim() || undefined,
          expectedCloseDate: form.expectedCloseDate.trim() || undefined,
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

  if (success) {
    return (
      <div className={styles.page}>
        <div className={styles.successCard}>
          <div className={styles.successIconWrap}>
            <CheckIcon />
          </div>
          <h1 className={styles.successTitle}>Opportunity created</h1>
          <p className={styles.successText}>Your opportunity has been created successfully.</p>
          <PrimaryButton onClick={() => void navigate('/opportunities')}>
            View opportunities
          </PrimaryButton>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <button
        type="button"
        className={styles.backLink}
        onClick={() => void navigate('/opportunities')}
      >
        <BackIcon />
        Back to Opportunities
      </button>

      <h1 className={styles.pageTitle}>Create opportunity</h1>
      <p className={styles.pageSubtitle}>Add a new opportunity to your pipeline.</p>

      <div className={styles.card}>
        <form className={styles.form} onSubmit={(e) => void handleSubmit(e)}>
          <div className={styles.field}>
            <label className={`${styles.label} ${styles.labelRequired}`} htmlFor="title">
              Title
            </label>
            <input
              id="title"
              name="title"
              type="text"
              className={styles.input}
              value={form.title}
              onChange={handleChange}
              placeholder="e.g. New Partnership Deal"
              maxLength={200}
              disabled={submitting}
            />
          </div>

          <div className={styles.field}>
            <label className={`${styles.label} ${styles.labelRequired}`} htmlFor="accountId">
              Account
            </label>
            <input
              id="accountId"
              name="accountId"
              type="text"
              className={styles.input}
              value={form.accountId}
              onChange={handleChange}
              placeholder="e.g. account-uuid"
              disabled={submitting}
            />
          </div>

          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="value">
                Value (optional)
              </label>
              <input
                id="value"
                name="value"
                type="number"
                min="0"
                className={styles.input}
                value={form.value}
                onChange={handleChange}
                placeholder="e.g. 50000"
                disabled={submitting}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="currency">
                Currency (optional)
              </label>
              <input
                id="currency"
                name="currency"
                type="text"
                className={styles.input}
                value={form.currency}
                onChange={handleChange}
                placeholder="e.g. GBP"
                maxLength={3}
                disabled={submitting}
              />
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="expectedCloseDate">
              Expected close date (optional)
            </label>
            <input
              id="expectedCloseDate"
              name="expectedCloseDate"
              type="date"
              className={styles.input}
              value={form.expectedCloseDate}
              onChange={handleChange}
              disabled={submitting}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="description">
              Description (optional)
            </label>
            <textarea
              id="description"
              name="description"
              className={styles.textarea}
              value={form.description}
              onChange={handleChange}
              placeholder="Brief description of the opportunity"
              disabled={submitting}
            />
          </div>

          {errorMessage && (
            <p className={styles.errorAlert} role="alert">
              {errorMessage}
            </p>
          )}

          <hr className={styles.divider} />

          <div className={styles.actions}>
            <PrimaryButton
              type="button"
              variant="outline"
              onClick={() => void navigate('/opportunities')}
              disabled={submitting}
            >
              Cancel
            </PrimaryButton>
            <PrimaryButton type="submit" disabled={submitting}>
              {submitting ? 'Creating…' : 'Create opportunity'}
            </PrimaryButton>
          </div>
        </form>
      </div>
    </div>
  );
}
