import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PipelineDetailPage } from '../pages/PipelineDetailPage.js';

vi.mock('@descope/react-sdk', () => ({
  useSession: vi.fn(),
}));

const { useSession } = await import('@descope/react-sdk');

function renderPage(pipelineId = 'pipe-1') {
  return render(
    <MemoryRouter initialEntries={[`/admin/pipelines/${pipelineId}`]}>
      <Routes>
        <Route path="/admin/pipelines/:id" element={<PipelineDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

const samplePipeline = {
  id: 'pipe-1',
  objectId: 'obj-1',
  name: 'Sales Pipeline',
  apiName: 'sales_pipeline',
  description: 'Main sales flow',
  isDefault: true,
  isSystem: false,
  stages: [
    {
      id: 'stage-1',
      pipelineId: 'pipe-1',
      name: 'Prospecting',
      apiName: 'prospecting',
      sortOrder: 0,
      stageType: 'open',
      colour: 'blue',
      defaultProbability: 10,
      expectedDays: 14,
      description: 'Initial outreach',
      gates: [],
    },
    {
      id: 'stage-2',
      pipelineId: 'pipe-1',
      name: 'Qualification',
      apiName: 'qualification',
      sortOrder: 1,
      stageType: 'open',
      colour: 'yellow',
      defaultProbability: 25,
      expectedDays: 14,
      gates: [],
    },
    {
      id: 'stage-3',
      pipelineId: 'pipe-1',
      name: 'Closed Won',
      apiName: 'closed_won',
      sortOrder: 2,
      stageType: 'won',
      colour: 'green',
      defaultProbability: 100,
      gates: [],
    },
    {
      id: 'stage-4',
      pipelineId: 'pipe-1',
      name: 'Closed Lost',
      apiName: 'closed_lost',
      sortOrder: 3,
      stageType: 'lost',
      colour: 'red',
      defaultProbability: 0,
      gates: [],
    },
  ],
};

function mockFetchPipeline(data: unknown = samplePipeline) {
  vi.mocked(fetch).mockResolvedValue({
    ok: true,
    json: async () => data,
  } as Response);
}

function mockFetchPipelineWithGates() {
  const mockFetch = vi.fn();
  // First call: fetch pipeline detail
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => samplePipeline,
  } as Response);
  // Second call: fetch fields for object (best-effort, returns empty array)
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => [],
  } as Response);
  // Third call (and beyond): fetch gates for selected stage
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => [],
  } as Response);
  vi.stubGlobal('fetch', mockFetch);
  return mockFetch;
}

describe('PipelineDetailPage', () => {
  beforeEach(() => {
    vi.mocked(useSession).mockReturnValue({
      isAuthenticated: true,
      isSessionLoading: false,
      sessionToken: 'test-token',
      claims: {},
    });
    vi.stubGlobal('fetch', vi.fn());
  });

  it('renders the pipeline name as heading', async () => {
    mockFetchPipeline();
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Sales Pipeline' })).toBeInTheDocument();
    });
  });

  it('renders breadcrumb navigation', async () => {
    mockFetchPipeline();
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Sales Pipeline' })).toBeInTheDocument();
    });

    expect(screen.getByRole('link', { name: 'Admin' })).toHaveAttribute('href', '/admin');
    expect(screen.getByRole('link', { name: 'Pipelines' })).toHaveAttribute(
      'href',
      '/admin/pipelines',
    );
  });

  it('renders all stage pills in the visual stage bar', async () => {
    mockFetchPipeline();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Prospecting')).toBeInTheDocument();
    });

    expect(screen.getByText('Qualification')).toBeInTheDocument();
    expect(screen.getByText('Closed Won')).toBeInTheDocument();
    expect(screen.getByText('Closed Lost')).toBeInTheDocument();
  });

  it('shows probability for stages', async () => {
    mockFetchPipeline();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('10%')).toBeInTheDocument();
    });

    expect(screen.getByText('25%')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('shows expected days for stages that have them', async () => {
    mockFetchPipeline();
    renderPage();

    await waitFor(() => {
      expect(screen.getAllByText('14 days').length).toBeGreaterThan(0);
    });
  });

  it('renders an "Add stage" button', async () => {
    mockFetchPipeline();
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Add stage/ })).toBeInTheDocument();
    });
  });

  it('opens stage edit panel when a stage pill is clicked', async () => {
    mockFetchPipelineWithGates();
    const user = userEvent.setup();

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Prospecting')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Prospecting'));

    await waitFor(() => {
      expect(screen.getByText('Edit Stage: Prospecting')).toBeInTheDocument();
    });

    expect(screen.getByLabelText(/^Name/)).toHaveValue('Prospecting');
  });

  it('shows reorder buttons only for open stages', async () => {
    mockFetchPipeline();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Prospecting')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: 'Move Prospecting left' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move Prospecting right' })).toBeInTheDocument();
  });

  it('disables left button for the first open stage', async () => {
    mockFetchPipeline();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Prospecting')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: 'Move Prospecting left' })).toBeDisabled();
  });

  it('disables right button for the last open stage', async () => {
    mockFetchPipeline();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Qualification')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: 'Move Qualification right' })).toBeDisabled();
  });

  it('opens add stage modal when "Add stage" button is clicked', async () => {
    mockFetchPipeline();
    const user = userEvent.setup();

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Add stage/ })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Add stage/ }));

    expect(screen.getByRole('dialog', { name: 'Add stage' })).toBeInTheDocument();
  });

  it('shows qualification gates section when a stage is selected', async () => {
    mockFetchPipelineWithGates();
    const user = userEvent.setup();

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Prospecting')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Prospecting'));

    await waitFor(() => {
      expect(screen.getByText('Qualification Gates')).toBeInTheDocument();
    });
  });

  it('shows error when pipeline is not found', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: 'Not found' }),
    } as Response);

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Pipeline not found.');
    });
  });

  it('shows delete button in stage edit panel', async () => {
    mockFetchPipelineWithGates();
    const user = userEvent.setup();

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Prospecting')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Prospecting'));

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Delete Prospecting' }),
      ).toBeInTheDocument();
    });
  });

  it('opens delete stage confirmation modal', async () => {
    mockFetchPipelineWithGates();
    const user = userEvent.setup();

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Prospecting')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Prospecting'));

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Delete Prospecting' }),
      ).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Delete Prospecting' }));

    expect(screen.getByRole('dialog', { name: 'Confirm delete stage' })).toBeInTheDocument();
    expect(screen.getByText(/Are you sure you want to delete/)).toBeInTheDocument();
  });

  // ── Pipeline-level default / delete ─────────────────────────────────────────

  it('renders the default badge when isDefault is true', async () => {
    mockFetchPipeline({ ...samplePipeline, isDefault: true });
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('default-badge')).toHaveTextContent('Default');
    });
  });

  it('does not render "Set as default" button when pipeline is already default', async () => {
    mockFetchPipeline({ ...samplePipeline, isDefault: true });
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Sales Pipeline' })).toBeInTheDocument();
    });

    expect(
      screen.queryByRole('button', { name: /Set as default/i }),
    ).not.toBeInTheDocument();
  });

  it('sends PUT with isDefault=true when "Set as default" is clicked', async () => {
    const nonDefault = { ...samplePipeline, isDefault: false };
    const promoted = { ...samplePipeline, isDefault: true };
    const fetchMock = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        return Promise.resolve({
          ok: true,
          json: async () => promoted,
        } as Response);
      }
      // GET pipeline detail — return the currently-not-default version first,
      // then the promoted version after PUT.
      return Promise.resolve({
        ok: true,
        json: async () => (fetchMock.mock.calls.filter((c) => !c[1]?.method || c[1].method === 'GET').length > 1 ? promoted : nonDefault),
      } as Response);
    });
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Set as default/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Set as default/i }));

    await waitFor(() => {
      const putCall = fetchMock.mock.calls.find(
        (call) => call[1]?.method === 'PUT',
      );
      expect(putCall).toBeDefined();
      expect(putCall![0]).toContain('/api/v1/admin/pipelines/pipe-1');
      expect(JSON.parse(putCall![1].body as string)).toEqual({ isDefault: true });
    });
  });

  it('disables Delete pipeline button for system pipelines', async () => {
    mockFetchPipeline({ ...samplePipeline, isDefault: false, isSystem: true });
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Sales Pipeline' })).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /Delete pipeline/i })).toBeDisabled();
  });

  it('disables Delete pipeline button for the default pipeline', async () => {
    mockFetchPipeline({ ...samplePipeline, isDefault: true, isSystem: false });
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Sales Pipeline' })).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /Delete pipeline/i })).toBeDisabled();
  });

  it('opens delete pipeline confirmation modal and sends DELETE on confirm', async () => {
    const nonDefault = { ...samplePipeline, isDefault: false, isSystem: false };
    const fetchMock = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === 'DELETE') {
        return Promise.resolve({
          ok: true,
          status: 204,
          json: async () => ({}),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: async () => nonDefault,
      } as Response);
    });
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Delete pipeline/i })).toBeEnabled();
    });

    await user.click(screen.getByRole('button', { name: /Delete pipeline/i }));

    expect(
      screen.getByRole('dialog', { name: 'Confirm delete pipeline' }),
    ).toBeInTheDocument();

    // The modal has both "Cancel" and a second "Delete" button; click the
    // submit one inside the dialog.
    const dialog = screen.getByRole('dialog', { name: 'Confirm delete pipeline' });
    const confirmButton = Array.from(dialog.querySelectorAll('button')).find(
      (btn) => btn.textContent?.trim() === 'Delete',
    );
    expect(confirmButton).toBeDefined();
    await user.click(confirmButton!);

    await waitFor(() => {
      const deleteCall = fetchMock.mock.calls.find(
        (call) => call[1]?.method === 'DELETE',
      );
      expect(deleteCall).toBeDefined();
      expect(deleteCall![0]).toContain('/api/v1/admin/pipelines/pipe-1');
    });
  });
});
