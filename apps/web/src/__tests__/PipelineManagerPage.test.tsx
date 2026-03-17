import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { PipelineManagerPage } from '../pages/PipelineManagerPage.js';

vi.mock('@descope/react-sdk', () => ({
  useSession: vi.fn(),
}));

const { useSession } = await import('@descope/react-sdk');

function renderPage() {
  return render(
    <MemoryRouter>
      <PipelineManagerPage />
    </MemoryRouter>,
  );
}

function mockFetchSuccess(data: unknown[] = []) {
  vi.mocked(fetch).mockResolvedValue({
    ok: true,
    json: async () => data,
  } as Response);
}

const samplePipelines = [
  {
    id: 'pipe-1',
    name: 'Sales Pipeline',
    apiName: 'sales_pipeline',
    objectId: 'obj-1',
    description: 'Main sales flow',
    isDefault: true,
    isSystem: true,
    stageCount: 5,
    recordCount: 42,
    objectLabel: 'Opportunity',
  },
  {
    id: 'pipe-2',
    name: 'Custom Pipeline',
    apiName: 'custom_pipeline',
    objectId: 'obj-2',
    description: '',
    isDefault: false,
    isSystem: false,
    stageCount: 3,
    recordCount: 0,
    objectLabel: 'Deal',
  },
];

describe('PipelineManagerPage', () => {
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
      expect(screen.getByRole('heading', { name: 'Pipeline Manager' })).toBeInTheDocument();
    });
  });

  it('renders a "Create pipeline" button', async () => {
    mockFetchSuccess();
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Create pipeline/ })).toBeInTheDocument();
    });
  });

  it('shows empty state when there are no pipelines', async () => {
    mockFetchSuccess();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('No pipelines yet')).toBeInTheDocument();
    });
  });

  it('renders pipeline cards when data is returned', async () => {
    mockFetchSuccess(samplePipelines);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Sales Pipeline')).toBeInTheDocument();
    });
    expect(screen.getByText('Custom Pipeline')).toBeInTheDocument();
    expect(screen.getByText('sales_pipeline')).toBeInTheDocument();
    expect(screen.getByText('custom_pipeline')).toBeInTheDocument();
  });

  it('shows system badge for system pipelines', async () => {
    mockFetchSuccess(samplePipelines);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('System')).toBeInTheDocument();
    });
  });

  it('displays stage and record counts', async () => {
    mockFetchSuccess(samplePipelines);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Sales Pipeline')).toBeInTheDocument();
    });

    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('shows an error message when the fetch fails', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Server error' }),
    } as Response);

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Failed to load pipelines.');
    });
  });

  it('opens the create modal when "Create pipeline" button is clicked', async () => {
    mockFetchSuccess();
    const user = userEvent.setup();

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Create pipeline/ })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Create pipeline/ }));

    expect(screen.getByRole('dialog', { name: 'Create pipeline' })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Name/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^API name/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Object/)).toBeInTheDocument();
  });

  it('auto-generates api_name from name in create modal', async () => {
    mockFetchSuccess();
    const user = userEvent.setup();

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Create pipeline/ })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Create pipeline/ }));

    const nameInput = screen.getByLabelText(/^Name/);
    await user.type(nameInput, 'My Sales Pipeline');

    const apiNameInput = screen.getByLabelText(/^API name/) as HTMLInputElement;
    expect(apiNameInput.value).toBe('my_sales_pipeline');
  });

  it('validates required fields in the create modal', async () => {
    mockFetchSuccess();
    const user = userEvent.setup();

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Create pipeline/ })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Create pipeline/ }));

    // Submit without filling fields
    const submitButtons = screen.getAllByRole('button', { name: /Create pipeline/ });
    const submitButton = submitButtons[submitButtons.length - 1];
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Name is required')).toBeInTheDocument();
    });
  });

  it('closes create modal when cancel is clicked', async () => {
    mockFetchSuccess();
    const user = userEvent.setup();

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Create pipeline/ })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Create pipeline/ }));
    expect(screen.getByRole('dialog', { name: 'Create pipeline' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog', { name: 'Create pipeline' })).not.toBeInTheDocument();
  });
});
