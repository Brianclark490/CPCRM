import { useState } from 'react';
import { useSession } from '@descope/react-sdk';
import { useNavigate } from 'react-router-dom';
import { PrimaryButton } from '../components/PrimaryButton.js';
import styles from './CreateAccountPage.module.css';

const INDUSTRIES = [
  'Technology',
  'Healthcare',
  'Financial Services',
  'Manufacturing',
  'Retail',
  'Education',
  'Government',
  'Energy',
  'Real Estate',
  'Professional Services',
  'Media & Entertainment',
  'Telecommunications',
];

interface FormState {
  name: string;
  industry: string;
  customIndustry: string;
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

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[+]?[\d\s()-]{7,}$/;

export function CreateAccountPage() {
  const { sessionToken } = useSession();
  const navigate = useNavigate();

  const [form, setForm] = useState<FormState>({
    name: '',
    industry: '',
    customIndustry: '',
    website: '',
    phone: '',
    email: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    region: '',
    postalCode: '',
    country: '',
    notes: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
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

    const trimmedName = form.name.trim();
    if (!trimmedName) {
      setErrorMessage('Account name is required');
      return;
    }

    const trimmedEmail = form.email.trim();
    if (trimmedEmail && !EMAIL_REGEX.test(trimmedEmail)) {
      setErrorMessage('Please enter a valid email address');
      return;
    }

    const trimmedPhone = form.phone.trim();
    if (trimmedPhone && !PHONE_REGEX.test(trimmedPhone)) {
      setErrorMessage('Please enter a valid phone number');
      return;
    }

    setSubmitting(true);

    try {
      const industry =
        form.industry === 'Other' ? form.customIndustry.trim() : form.industry || undefined;

      const response = await fetch('/api/accounts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({
          name: trimmedName,
          industry: industry || undefined,
          website: form.website.trim() || undefined,
          phone: trimmedPhone || undefined,
          email: trimmedEmail || undefined,
          addressLine1: form.addressLine1.trim() || undefined,
          addressLine2: form.addressLine2.trim() || undefined,
          city: form.city.trim() || undefined,
          region: form.region.trim() || undefined,
          postalCode: form.postalCode.trim() || undefined,
          country: form.country.trim() || undefined,
          notes: form.notes.trim() || undefined,
        }),
      });

      if (response.ok) {
        const account = (await response.json()) as { id: string };
        void navigate(`/accounts/${account.id}`);
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

  return (
    <div className={styles.page}>
      <nav className={styles.breadcrumb} aria-label="Breadcrumb">
        <button
          className={styles.breadcrumbLink}
          onClick={() => void navigate('/accounts')}
          type="button"
        >
          Accounts
        </button>
        <span className={styles.breadcrumbSeparator} aria-hidden="true">›</span>
        <span className={styles.breadcrumbCurrent}>Create</span>
      </nav>

      <h1 className={styles.pageTitle}>Create account</h1>
      <p className={styles.pageSubtitle}>Add a new account to your CRM.</p>

      <div className={styles.card}>
        <form className={styles.form} noValidate onSubmit={(e) => void handleSubmit(e)}>
          <div className={styles.field}>
            <label className={`${styles.label} ${styles.labelRequired}`} htmlFor="name">
              Name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              className={styles.input}
              value={form.name}
              onChange={handleChange}
              placeholder="e.g. Acme Corp"
              maxLength={200}
              disabled={submitting}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="industry">
              Industry
            </label>
            <select
              id="industry"
              name="industry"
              className={styles.select}
              value={form.industry}
              onChange={handleChange}
              disabled={submitting}
            >
              <option value="">Select an industry</option>
              {INDUSTRIES.map((ind) => (
                <option key={ind} value={ind}>
                  {ind}
                </option>
              ))}
              <option value="Other">Other</option>
            </select>
          </div>

          {form.industry === 'Other' && (
            <div className={styles.field}>
              <label className={styles.label} htmlFor="customIndustry">
                Custom industry
              </label>
              <input
                id="customIndustry"
                name="customIndustry"
                type="text"
                className={styles.input}
                value={form.customIndustry}
                onChange={handleChange}
                placeholder="Enter industry"
                disabled={submitting}
              />
            </div>
          )}

          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="email">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                className={styles.input}
                value={form.email}
                onChange={handleChange}
                placeholder="e.g. contact@acme.com"
                disabled={submitting}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="phone">
                Phone
              </label>
              <input
                id="phone"
                name="phone"
                type="tel"
                className={styles.input}
                value={form.phone}
                onChange={handleChange}
                placeholder="e.g. +44 20 7946 0958"
                disabled={submitting}
              />
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="website">
              Website
            </label>
            <input
              id="website"
              name="website"
              type="url"
              className={styles.input}
              value={form.website}
              onChange={handleChange}
              placeholder="e.g. https://acme.com"
              disabled={submitting}
            />
          </div>

          <fieldset className={styles.fieldset}>
            <legend className={styles.legend}>Address</legend>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="addressLine1">
                Address line 1
              </label>
              <input
                id="addressLine1"
                name="addressLine1"
                type="text"
                className={styles.input}
                value={form.addressLine1}
                onChange={handleChange}
                placeholder="Street address"
                disabled={submitting}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="addressLine2">
                Address line 2
              </label>
              <input
                id="addressLine2"
                name="addressLine2"
                type="text"
                className={styles.input}
                value={form.addressLine2}
                onChange={handleChange}
                placeholder="Apartment, suite, etc."
                disabled={submitting}
              />
            </div>

            <div className={styles.fieldRow}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="city">
                  City
                </label>
                <input
                  id="city"
                  name="city"
                  type="text"
                  className={styles.input}
                  value={form.city}
                  onChange={handleChange}
                  disabled={submitting}
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="region">
                  Region
                </label>
                <input
                  id="region"
                  name="region"
                  type="text"
                  className={styles.input}
                  value={form.region}
                  onChange={handleChange}
                  placeholder="State / County"
                  disabled={submitting}
                />
              </div>
            </div>

            <div className={styles.fieldRow}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="postalCode">
                  Postal code
                </label>
                <input
                  id="postalCode"
                  name="postalCode"
                  type="text"
                  className={styles.input}
                  value={form.postalCode}
                  onChange={handleChange}
                  disabled={submitting}
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="country">
                  Country
                </label>
                <input
                  id="country"
                  name="country"
                  type="text"
                  className={styles.input}
                  value={form.country}
                  onChange={handleChange}
                  disabled={submitting}
                />
              </div>
            </div>
          </fieldset>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="notes">
              Notes
            </label>
            <textarea
              id="notes"
              name="notes"
              className={styles.textarea}
              value={form.notes}
              onChange={handleChange}
              placeholder="Additional notes about this account"
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
              onClick={() => void navigate('/accounts')}
              disabled={submitting}
            >
              Cancel
            </PrimaryButton>
            <PrimaryButton type="submit" disabled={submitting}>
              {submitting ? 'Creating…' : 'Create account'}
            </PrimaryButton>
          </div>
        </form>
      </div>
    </div>
  );
}
