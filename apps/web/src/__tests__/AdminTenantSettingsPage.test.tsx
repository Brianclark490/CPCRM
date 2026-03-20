import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AdminTenantSettingsPage } from '../pages/AdminTenantSettingsPage.js';

vi.mock('@descope/react-sdk', () => ({
  useSession: vi.fn(),
}));

const { useSession } = await import('@descope/react-sdk');

function renderPage() {
  return render(
    <MemoryRouter>
      <AdminTenantSettingsPage />
    </MemoryRouter>,
  );
}

const baseSettings = {
  name: 'Acme Corp',
  slug: 'acme-corp',
  status: 'active',
  plan: 'pro',
  settings: {
    currency: 'GBP',
    dateFormat: 'DD/MM/YYYY',
    timezone: 'Europe/London',
    financialYearStart: 'April',
    defaultPipeline: '',
    defaultRecordOwner: 'creator',
    leadAutoConversion: false,
  },
};

const basePipelines = [
  { id: 'pipeline-1', name: 'Default Pipeline' },
  { id: 'pipeline-2', name: 'Enterprise Pipeline' },
];

describe('AdminTenantSettingsPage', () => {
  beforeEach(() => {
    vi.mocked(useSession).mockReturnValue({
      isAuthenticated: true,
      isSessionLoading: false,
      sessionToken: 'test-token',
      claims: {},
    });
    vi.stubGlobal('fetch', vi.fn());
  });

  it('shows a loading state initially', () => {
    vi.mocked(fetch).mockReturnValue(new Promise(() => {}));

    renderPage();

    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('renders the page heading and sections after loading', async () => {
    vi.mocked(fetch).mockImplementation((url) => {
      if (typeof url === 'string' && url.includes('tenant-settings')) {
        return Promise.resolve({
          ok: true,
          json: async () => baseSettings,
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: async () => basePipelines,
      } as Response);
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Tenant settings' })).toBeInTheDocument();
    });

    expect(screen.getByText('Organisation details')).toBeInTheDocument();
    expect(screen.getByText('Regional defaults')).toBeInTheDocument();
    expect(screen.getByText('CRM defaults')).toBeInTheDocument();
  });

  it('populates form fields with existing data', async () => {
    vi.mocked(fetch).mockImplementation((url) => {
      if (typeof url === 'string' && url.includes('tenant-settings')) {
        return Promise.resolve({
          ok: true,
          json: async () => baseSettings,
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: async () => basePipelines,
      } as Response);
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByDisplayValue('Acme Corp')).toBeInTheDocument();
    });

    expect(screen.getByText('acme-corp')).toBeInTheDocument();
    expect(screen.getByText('active')).toBeInTheDocument();
    expect(screen.getByText('pro')).toBeInTheDocument();
  });

  it('shows read-only fields (slug, status, plan) as non-editable', async () => {
    vi.mocked(fetch).mockImplementation((url) => {
      if (typeof url === 'string' && url.includes('tenant-settings')) {
        return Promise.resolve({
          ok: true,
          json: async () => baseSettings,
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: async () => basePipelines,
      } as Response);
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('acme-corp')).toBeInTheDocument();
    });

    // slug is rendered in a div, not an input
    const slugField = screen.getByText('acme-corp');
    expect(slugField.tagName).not.toBe('INPUT');
  });

  it('shows an error alert when loading fails', async () => {
    vi.mocked(fetch).mockImplementation((url) => {
      if (typeof url === 'string' && url.includes('tenant-settings')) {
        return Promise.resolve({
          ok: false,
          json: async () => ({ error: 'Unauthorised' }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: async () => [],
      } as Response);
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Unauthorised');
    });
  });

  it('shows a network error when fetch throws during load', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('Network error'));

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Failed to connect to the server. Please try again.',
      );
    });
  });

  it('submits the form and shows success message', async () => {
    const updatedSettings = { ...baseSettings, name: 'New Name' };
    vi.mocked(fetch).mockImplementation((url, opts) => {
      if (typeof url === 'string' && url.includes('tenant-settings')) {
        const init = opts as RequestInit | undefined;
        if (init?.method === 'PUT') {
          return Promise.resolve({
            ok: true,
            json: async () => updatedSettings,
          } as Response);
        }
        return Promise.resolve({
          ok: true,
          json: async () => baseSettings,
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: async () => basePipelines,
      } as Response);
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByDisplayValue('Acme Corp')).toBeInTheDocument();
    });

    const nameInput = screen.getByLabelText('Company name');
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'New Name');

    await userEvent.click(screen.getByRole('button', { name: 'Save settings' }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Settings saved successfully.');
    });
  });

  it('shows a save error when the server returns a non-ok response', async () => {
    vi.mocked(fetch).mockImplementation((url, opts) => {
      if (typeof url === 'string' && url.includes('tenant-settings')) {
        const init = opts as RequestInit | undefined;
        if (init?.method === 'PUT') {
          return Promise.resolve({
            ok: false,
            json: async () => ({ error: 'Company name cannot be empty' }),
          } as Response);
        }
        return Promise.resolve({
          ok: true,
          json: async () => baseSettings,
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: async () => basePipelines,
      } as Response);
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByDisplayValue('Acme Corp')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: 'Save settings' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Company name cannot be empty');
    });
  });

  it('shows a network error when fetch throws during save', async () => {
    let callCount = 0;
    vi.mocked(fetch).mockImplementation((url) => {
      if (typeof url === 'string' && url.includes('tenant-settings')) {
        callCount++;
        if (callCount <= 1) {
          return Promise.resolve({
            ok: true,
            json: async () => baseSettings,
          } as Response);
        }
        return Promise.reject(new Error('Network error'));
      }
      return Promise.resolve({
        ok: true,
        json: async () => basePipelines,
      } as Response);
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByDisplayValue('Acme Corp')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: 'Save settings' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Failed to connect to the server. Please try again.',
      );
    });
  });

  it('renders the Save settings button', async () => {
    vi.mocked(fetch).mockImplementation((url) => {
      if (typeof url === 'string' && url.includes('tenant-settings')) {
        return Promise.resolve({
          ok: true,
          json: async () => baseSettings,
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: async () => basePipelines,
      } as Response);
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Save settings' })).toBeInTheDocument();
    });
  });

  it('renders the lead auto-conversion toggle', async () => {
    vi.mocked(fetch).mockImplementation((url) => {
      if (typeof url === 'string' && url.includes('tenant-settings')) {
        return Promise.resolve({
          ok: true,
          json: async () => baseSettings,
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: async () => basePipelines,
      } as Response);
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('switch')).toBeInTheDocument();
    });

    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
  });
});
