import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ObjectManagerPage } from '../pages/ObjectManagerPage.js';
import { slugify } from '../utils.js';

vi.mock('@descope/react-sdk', () => ({
  useSession: vi.fn(),
}));

const { useSession } = await import('@descope/react-sdk');

function renderPage() {
  return render(
    <MemoryRouter>
      <ObjectManagerPage />
    </MemoryRouter>,
  );
}

function mockFetchSuccess(data: unknown[] = []) {
  vi.mocked(fetch).mockResolvedValue({
    ok: true,
    json: async () => data,
  } as Response);
}

const sampleObjects = [
  {
    id: 'obj-1',
    apiName: 'opportunity',
    label: 'Opportunity',
    pluralLabel: 'Opportunities',
    icon: '💼',
    isSystem: true,
    fieldCount: 8,
    recordCount: 25,
  },
  {
    id: 'obj-2',
    apiName: 'custom_project',
    label: 'Custom Project',
    pluralLabel: 'Custom Projects',
    icon: '📦',
    isSystem: false,
    fieldCount: 3,
    recordCount: 0,
  },
];

describe('slugify', () => {
  it('converts a label to snake_case', () => {
    expect(slugify('My Custom Object')).toBe('my_custom_object');
  });

  it('handles leading/trailing spaces', () => {
    expect(slugify('  Hello World  ')).toBe('hello_world');
  });

  it('replaces non-alphanumeric characters with underscores', () => {
    expect(slugify('My Object! v2.0')).toBe('my_object_v2_0');
  });

  it('collapses multiple underscores', () => {
    expect(slugify('hello   world')).toBe('hello_world');
  });

  it('returns empty string for empty input', () => {
    expect(slugify('')).toBe('');
  });
});

describe('ObjectManagerPage', () => {
  beforeEach(() => {
    vi.mocked(useSession).mockReturnValue({
      isAuthenticated: true,
      isSessionLoading: false,
      sessionToken: 'test-token',
      claims: {},
    });
    vi.stubGlobal('fetch', vi.fn());
  });

  it('renders the page heading', async () => {
    mockFetchSuccess();
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Object Manager' })).toBeInTheDocument();
    });
  });

  it('renders a "Create object" button', async () => {
    mockFetchSuccess();
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Create object/ })).toBeInTheDocument();
    });
  });

  it('shows empty state when there are no objects', async () => {
    mockFetchSuccess();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('No object definitions yet')).toBeInTheDocument();
    });
  });

  it('renders a table of objects when data is returned', async () => {
    mockFetchSuccess(sampleObjects);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Opportunity')).toBeInTheDocument();
    });
    expect(screen.getByText('Custom Project')).toBeInTheDocument();
    expect(screen.getByText('opportunity')).toBeInTheDocument();
    expect(screen.getByText('custom_project')).toBeInTheDocument();
  });

  it('shows system badge for system objects', async () => {
    mockFetchSuccess(sampleObjects);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('System')).toBeInTheDocument();
    });
  });

  it('shows delete button only for custom objects', async () => {
    mockFetchSuccess(sampleObjects);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Custom Project')).toBeInTheDocument();
    });

    // Should have delete button for custom object
    expect(screen.getByRole('button', { name: 'Delete Custom Project' })).toBeInTheDocument();

    // Should NOT have delete button for system object
    expect(screen.queryByRole('button', { name: 'Delete Opportunity' })).not.toBeInTheDocument();
  });

  it('shows field and record counts', async () => {
    mockFetchSuccess(sampleObjects);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Opportunity')).toBeInTheDocument();
    });

    // Find the row containing "Opportunity" and check its counts
    const rows = screen.getAllByRole('row');
    const opportunityRow = rows.find((row) => within(row).queryByText('Opportunity'));
    expect(opportunityRow).toBeTruthy();
    expect(within(opportunityRow!).getByText('8')).toBeInTheDocument();
    expect(within(opportunityRow!).getByText('25')).toBeInTheDocument();
  });

  it('links object labels to detail page', async () => {
    mockFetchSuccess(sampleObjects);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Opportunity')).toBeInTheDocument();
    });

    const link = screen.getByRole('link', { name: 'Opportunity' });
    expect(link).toHaveAttribute('href', '/admin/objects/obj-1');
  });

  it('shows an error message when the fetch fails', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Server error' }),
    } as Response);

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Failed to load object definitions.');
    });
  });

  it('opens the create modal when "Create object" button is clicked', async () => {
    mockFetchSuccess();
    const user = userEvent.setup();

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Create object/ })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Create object/ }));

    expect(screen.getByRole('dialog', { name: 'Create object' })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Label/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Plural label/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^API name/)).toBeInTheDocument();
  });

  it('auto-generates api_name from label in create modal', async () => {
    mockFetchSuccess();
    const user = userEvent.setup();

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Create object/ })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Create object/ }));

    const labelInput = screen.getByLabelText(/^Label/);
    await user.type(labelInput, 'My Custom Object');

    const apiNameInput = screen.getByLabelText(/^API name/) as HTMLInputElement;
    expect(apiNameInput.value).toBe('my_custom_object');
  });

  it('validates required fields in the create modal', async () => {
    mockFetchSuccess();
    const user = userEvent.setup();

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Create object/ })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Create object/ }));

    // Submit without filling fields
    const submitButtons = screen.getAllByRole('button', { name: /Create object/ });
    const submitButton = submitButtons[submitButtons.length - 1];
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Label is required')).toBeInTheDocument();
    });
  });

  it('opens delete confirmation when delete button is clicked', async () => {
    mockFetchSuccess(sampleObjects);
    const user = userEvent.setup();

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Custom Project')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Delete Custom Project' }));

    expect(screen.getByRole('dialog', { name: 'Confirm delete' })).toBeInTheDocument();
    expect(screen.getByText(/Are you sure you want to delete/)).toBeInTheDocument();
  });

  it('closes create modal when cancel is clicked', async () => {
    mockFetchSuccess();
    const user = userEvent.setup();

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Create object/ })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Create object/ }));
    expect(screen.getByRole('dialog', { name: 'Create object' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog', { name: 'Create object' })).not.toBeInTheDocument();
  });
});
