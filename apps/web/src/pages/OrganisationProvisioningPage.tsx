import { useState } from 'react';
import { useDescope, useSession } from '@descope/react-sdk';
import { useNavigate } from 'react-router-dom';

interface FormState {
  name: string;
  description: string;
}

interface ApiError {
  error: string;
}

export function OrganisationProvisioningPage() {
  const { sessionToken } = useSession();
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
      const response = await fetch('/api/organisations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
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
    await logout();
    void navigate('/login');
  };

  if (success) {
    return (
      <div>
        <h1>Organisation created</h1>
        <p>Your organisation has been set up successfully.</p>
        <button onClick={() => void navigate('/dashboard')}>Go to dashboard</button>
      </div>
    );
  }

  return (
    <div>
      <h1>Create your organisation</h1>
      <p>Set up your organisation to get started with CPCRM.</p>

      <form onSubmit={(e) => void handleSubmit(e)}>
        <div>
          <label htmlFor="name">Organisation name</label>
          <input
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

        <div>
          <label htmlFor="description">Description (optional)</label>
          <textarea
            id="description"
            name="description"
            value={form.description}
            onChange={handleChange}
            placeholder="Brief description of your organisation"
            disabled={submitting}
          />
        </div>

        {errorMessage && <p role="alert">{errorMessage}</p>}

        <button type="submit" disabled={submitting}>
          {submitting ? 'Creating…' : 'Create organisation'}
        </button>
      </form>

      <button onClick={() => void handleLogout()}>Sign out</button>
    </div>
  );
}
