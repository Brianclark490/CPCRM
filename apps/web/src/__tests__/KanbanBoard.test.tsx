import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { KanbanBoard } from '../components/KanbanBoard.js';

vi.mock('@descope/react-sdk', () => ({
  useSession: vi.fn(),
}));

const { useSession } = await import('@descope/react-sdk');

const mockPipeline = {
  id: 'pipe-1',
  name: 'Sales Pipeline',
  objectId: 'obj-1',
  stages: [
    {
      id: 'stage-1',
      name: 'Prospecting',
      apiName: 'prospecting',
      sortOrder: 0,
      stageType: 'open',
      colour: 'blue',
      expectedDays: 14,
      defaultProbability: 10,
    },
    {
      id: 'stage-2',
      name: 'Qualification',
      apiName: 'qualification',
      sortOrder: 1,
      stageType: 'open',
      colour: 'indigo',
      expectedDays: 21,
      defaultProbability: 30,
    },
    {
      id: 'stage-3',
      name: 'Closed Won',
      apiName: 'closed_won',
      sortOrder: 2,
      stageType: 'won',
      colour: 'green',
      defaultProbability: 100,
    },
    {
      id: 'stage-4',
      name: 'Closed Lost',
      apiName: 'closed_lost',
      sortOrder: 3,
      stageType: 'lost',
      colour: 'red',
      defaultProbability: 0,
    },
  ],
};

const mockRecords = {
  data: [
    {
      id: 'rec-1',
      name: 'Big Deal',
      fieldValues: { value: 100000, close_date: '2026-06-15' },
      ownerId: 'user-1',
      pipelineId: 'pipe-1',
      currentStageId: 'stage-1',
      stageEnteredAt: '2026-03-10T00:00:00Z',
      createdAt: '2026-03-01T00:00:00Z',
    },
    {
      id: 'rec-2',
      name: 'Small Deal',
      fieldValues: { value: 25000, close_date: '2026-07-01' },
      ownerId: 'user-2',
      pipelineId: 'pipe-1',
      currentStageId: 'stage-2',
      stageEnteredAt: '2026-03-05T00:00:00Z',
      createdAt: '2026-02-15T00:00:00Z',
    },
  ],
  total: 2,
  page: 1,
  limit: 100,
};

function mockFetch() {
  const fetchMock = vi.fn().mockImplementation((url: string) => {
    if (typeof url === 'string' && url.includes('/api/admin/pipelines/pipe-1')) {
      return Promise.resolve({
        ok: true,
        json: async () => mockPipeline,
      } as Response);
    }

    if (typeof url === 'string' && url.includes('/api/admin/pipelines')) {
      return Promise.resolve({
        ok: true,
        json: async () => [{ ...mockPipeline, object_id: 'obj-1' }],
      } as Response);
    }

    if (typeof url === 'string' && url.includes('/api/objects/opportunity/records')) {
      return Promise.resolve({
        ok: true,
        json: async () => mockRecords,
      } as Response);
    }

    return Promise.resolve({ ok: false, json: async () => ({}) } as Response);
  });

  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderBoard() {
  return render(
    <MemoryRouter initialEntries={['/objects/opportunity']}>
      <Routes>
        <Route
          path="/objects/:apiName"
          element={<KanbanBoard apiName="opportunity" objectId="obj-1" />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('KanbanBoard', () => {
  beforeEach(() => {
    vi.mocked(useSession).mockReturnValue({
      isAuthenticated: true,
      isSessionLoading: false,
      sessionToken: 'test-token',
      claims: {},
    });
  });

  it('renders the kanban board with columns from pipeline stages', async () => {
    mockFetch();
    renderBoard();

    await waitFor(() => {
      expect(screen.getByTestId('kanban-board')).toBeInTheDocument();
    });

    expect(screen.getByTestId('kanban-column-prospecting')).toBeInTheDocument();
    expect(screen.getByTestId('kanban-column-qualification')).toBeInTheDocument();
    expect(screen.getByTestId('kanban-column-closed_won')).toBeInTheDocument();
    expect(screen.getByTestId('kanban-column-closed_lost')).toBeInTheDocument();
  });

  it('renders cards with deal info in the correct columns', async () => {
    mockFetch();
    renderBoard();

    await waitFor(() => {
      expect(screen.getByText('Big Deal')).toBeInTheDocument();
    });

    expect(screen.getByText('Small Deal')).toBeInTheDocument();
  });

  it('renders the summary bar with totals', async () => {
    mockFetch();
    renderBoard();

    await waitFor(() => {
      expect(screen.getByTestId('kanban-summary')).toBeInTheDocument();
    });

    // Check that open value total is displayed
    expect(screen.getByText(/Open value/)).toBeInTheDocument();
    expect(screen.getByText(/Weighted value/)).toBeInTheDocument();
    expect(screen.getByText(/Deals/)).toBeInTheDocument();
  });

  it('renders the filter bar', async () => {
    mockFetch();
    renderBoard();

    await waitFor(() => {
      expect(screen.getByTestId('kanban-filter-bar')).toBeInTheDocument();
    });
  });

  it('renders stage names in column headers', async () => {
    mockFetch();
    renderBoard();

    await waitFor(() => {
      expect(screen.getByText('Prospecting')).toBeInTheDocument();
    });
    expect(screen.getByText('Qualification')).toBeInTheDocument();
    expect(screen.getByText('Closed Won')).toBeInTheDocument();
    expect(screen.getByText('Closed Lost')).toBeInTheDocument();
  });

  it('renders record count per column', async () => {
    mockFetch();
    renderBoard();

    await waitFor(() => {
      // Prospecting has 1 record, Qualification has 1 record
      const counts = screen.getAllByText('1');
      expect(counts.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('shows no-pipeline message when no pipeline is found', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (typeof url === 'string' && url.includes('/api/admin/pipelines')) {
          return Promise.resolve({
            ok: true,
            json: async () => [],
          } as Response);
        }
        return Promise.resolve({ ok: false, json: async () => ({}) } as Response);
      }),
    );

    renderBoard();

    await waitFor(() => {
      expect(screen.getByTestId('no-pipeline')).toBeInTheDocument();
    });
  });

  it('shows error state when pipeline fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Server error' }),
      } as Response),
    );

    renderBoard();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  it('places records without currentStageId into the first open stage column', async () => {
    const unassignedRecords = {
      data: [
        {
          id: 'rec-u1',
          name: 'Unassigned Deal',
          fieldValues: { value: 50000, close_date: '2026-08-01' },
          ownerId: 'user-1',
          createdAt: '2026-03-01T00:00:00Z',
        },
        {
          id: 'rec-u2',
          name: 'Another Unassigned',
          fieldValues: { value: 75000 },
          ownerId: 'user-2',
          createdAt: '2026-02-20T00:00:00Z',
        },
      ],
      total: 2,
      page: 1,
      limit: 100,
    };

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (typeof url === 'string' && url.includes('/api/admin/pipelines/pipe-1')) {
          return Promise.resolve({
            ok: true,
            json: async () => mockPipeline,
          } as Response);
        }
        if (typeof url === 'string' && url.includes('/api/admin/pipelines')) {
          return Promise.resolve({
            ok: true,
            json: async () => [{ ...mockPipeline, object_id: 'obj-1' }],
          } as Response);
        }
        if (typeof url === 'string' && url.includes('/api/objects/opportunity/records')) {
          return Promise.resolve({
            ok: true,
            json: async () => unassignedRecords,
          } as Response);
        }
        return Promise.resolve({ ok: false, json: async () => ({}) } as Response);
      }),
    );

    renderBoard();

    await waitFor(() => {
      expect(screen.getByText('Unassigned Deal')).toBeInTheDocument();
    });
    expect(screen.getByText('Another Unassigned')).toBeInTheDocument();

    // Both should be in the Prospecting column (first open stage)
    const prospectingColumn = screen.getByTestId('kanban-column-prospecting');
    expect(prospectingColumn).toHaveTextContent('Unassigned Deal');
    expect(prospectingColumn).toHaveTextContent('Another Unassigned');
    // Column count should show 2
    expect(prospectingColumn).toHaveTextContent('2');
  });
});
