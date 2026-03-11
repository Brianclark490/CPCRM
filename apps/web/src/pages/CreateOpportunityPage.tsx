import { useState } from 'react';
import { useSession } from '@descope/react-sdk';
import { useNavigate } from 'react-router-dom';

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
      <div>
        <h1>Opportunity created</h1>
        <p>Your opportunity has been created successfully.</p>
        <button onClick={() => void navigate('/opportunities')}>View opportunities</button>
      </div>
    );
  }

  return (
    <div>
      <h1>Create opportunity</h1>
      <p>Add a new opportunity to your pipeline.</p>

      <form onSubmit={(e) => void handleSubmit(e)}>
        <div>
          <label htmlFor="title">Title</label>
          <input
            id="title"
            name="title"
            type="text"
            value={form.title}
            onChange={handleChange}
            placeholder="e.g. New Partnership Deal"
            maxLength={200}
            disabled={submitting}
          />
        </div>

        <div>
          <label htmlFor="accountId">Account</label>
          <input
            id="accountId"
            name="accountId"
            type="text"
            value={form.accountId}
            onChange={handleChange}
            placeholder="e.g. account-uuid"
            disabled={submitting}
          />
        </div>

        <div>
          <label htmlFor="value">Value (optional)</label>
          <input
            id="value"
            name="value"
            type="number"
            min="0"
            value={form.value}
            onChange={handleChange}
            placeholder="e.g. 50000"
            disabled={submitting}
          />
        </div>

        <div>
          <label htmlFor="currency">Currency (optional)</label>
          <input
            id="currency"
            name="currency"
            type="text"
            value={form.currency}
            onChange={handleChange}
            placeholder="e.g. GBP"
            maxLength={3}
            disabled={submitting}
          />
        </div>

        <div>
          <label htmlFor="expectedCloseDate">Expected close date (optional)</label>
          <input
            id="expectedCloseDate"
            name="expectedCloseDate"
            type="date"
            value={form.expectedCloseDate}
            onChange={handleChange}
            disabled={submitting}
          />
        </div>

        <div>
          <label htmlFor="description">Description (optional)</label>
          <textarea
            id="description"
            name="description"
            value={form.description}
            onChange={handleChange}
            placeholder="Brief description of the opportunity"
            disabled={submitting}
          />
        </div>

        {errorMessage && <p role="alert">{errorMessage}</p>}

        <button type="submit" disabled={submitting}>
          {submitting ? 'Creating…' : 'Create opportunity'}
        </button>
      </form>

      <button type="button" onClick={() => void navigate('/opportunities')}>
        Cancel
      </button>
    </div>
  );
}
