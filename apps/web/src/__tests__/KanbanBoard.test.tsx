import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { KanbanBoard } from '../components/KanbanBoard.js';
import { renderWithQuery } from './utils/renderWithQuery.js';

vi.mock('@descope/react-sdk', () => ({
  useSession: vi.fn(),
}));

const { useSession } = await import('@descope/react-sdk');

/**
 * Wraps a list of items in the paginated envelope returned by the real
 * `/api/v1/admin/pipelines` endpoint (`paginateInMemory`). Using this in
 * mocks keeps the tests honest about the response shape so regressions
 * like unwrapping a `.find()` call directly on the envelope are caught.
 */
function paginated<T>(items: readonly T[]) {
  return {
    data: items,
    pagination: { total: items.length, limit: 20, offset: 0, hasMore: false },
  };
}

const mockPipeline = {
  id: 'pipe-1',
  name: 'Sales Pipeline',
  objectId: 'obj-1',
  is_default: true,
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

const mockSummary = {
  pipeline: { id: 'pipe-1', name: 'Sales Pipeline' },
  stages: [],
  totals: {
    openDeals: 2,
    totalOpenValue: 125000,
    totalWeightedValue: 17500,
    avgDealSize: 62500,
    wonThisMonth: 1,
    wonValueThisMonth: 50000,
    lostThisMonth: 0,
  },
};

const mockVelocity = {
  period: '30d',
  stages: [],
  overallConversion: 50,
  avgDaysToClose: 18,
};

const mockOverdue = [
  {
    id: 'rec-2',
    name: 'Small Deal',
    value: 25000,
    daysInStage: 25,
    expectedDays: 21,
    stageName: 'Qualification',
    ownerId: 'user-2',
  },
];

function mockFetch() {
  const fetchMock = vi.fn().mockImplementation((url: string) => {
    if (typeof url === 'string' && url.includes('/api/v1/admin/pipelines/pipe-1')) {
      return Promise.resolve({
        ok: true,
        json: async () => mockPipeline,
      } as Response);
    }

    if (typeof url === 'string' && url.includes('/api/v1/admin/pipelines')) {
      return Promise.resolve({
        ok: true,
        json: async () => paginated([{ ...mockPipeline, object_id: 'obj-1' }]),
      } as Response);
    }

    if (typeof url === 'string' && url.includes('/api/v1/objects/opportunity/records')) {
      return Promise.resolve({
        ok: true,
        json: async () => mockRecords,
      } as Response);
    }

    if (typeof url === 'string' && url.includes('/api/v1/pipelines/pipe-1/summary')) {
      return Promise.resolve({
        ok: true,
        json: async () => mockSummary,
      } as Response);
    }

    if (typeof url === 'string' && url.includes('/api/v1/pipelines/pipe-1/velocity')) {
      return Promise.resolve({
        ok: true,
        json: async () => mockVelocity,
      } as Response);
    }

    if (typeof url === 'string' && url.includes('/api/v1/pipelines/pipe-1/overdue')) {
      return Promise.resolve({
        ok: true,
        json: async () => mockOverdue,
      } as Response);
    }

    return Promise.resolve({ ok: false, json: async () => ({}) } as Response);
  });

  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderBoard() {
  return renderWithQuery(
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
    localStorage.clear();
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

  it('renders the summary bar with live API data', async () => {
    mockFetch();
    renderBoard();

    await waitFor(() => {
      expect(screen.getByTestId('pipeline-summary-bar')).toBeInTheDocument();
    });

    // Check that stat cards from the API data are displayed
    expect(screen.getByText('Total Open Value')).toBeInTheDocument();
    expect(screen.getByText('Weighted Pipeline')).toBeInTheDocument();
    expect(screen.getByText('Open Deals')).toBeInTheDocument();
    expect(screen.getByText('Avg Deal Size')).toBeInTheDocument();
    expect(screen.getByText('Won This Month')).toBeInTheDocument();
    expect(screen.getByText('Avg Days to Close')).toBeInTheDocument();
  });

  it('renders the overdue deals panel', async () => {
    mockFetch();
    renderBoard();

    await waitFor(() => {
      expect(screen.getByTestId('overdue-deals-panel')).toBeInTheDocument();
    });

    expect(screen.getByTestId('overdue-badge')).toHaveTextContent('1 overdue');
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
        if (typeof url === 'string' && url.includes('/api/v1/admin/pipelines')) {
          return Promise.resolve({
            ok: true,
            json: async () => paginated([]),
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

  it('unwraps the paginated envelope returned by /admin/pipelines', async () => {
    // Regression test for the "Failed to load pipeline configuration"
    // bug: the admin/pipelines endpoint returns a `{ data, pagination }`
    // envelope (via paginateInMemory), not a raw array. Calling
    // `.find()` directly on that object throws TypeError and flips the
    // board into its error state. Render the board against a real-
    // shape response and assert the stages render — which can only
    // happen if unwrapList peeled off `data` successfully.
    mockFetch();

    renderBoard();

    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.getByText('Prospecting')).toBeInTheDocument();
      expect(screen.getByText('Qualification')).toBeInTheDocument();
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
        if (typeof url === 'string' && url.includes('/api/v1/admin/pipelines/pipe-1')) {
          return Promise.resolve({
            ok: true,
            json: async () => mockPipeline,
          } as Response);
        }
        if (typeof url === 'string' && url.includes('/api/v1/admin/pipelines')) {
          return Promise.resolve({
            ok: true,
            json: async () => paginated([{ ...mockPipeline, object_id: 'obj-1' }]),
          } as Response);
        }
        if (typeof url === 'string' && url.includes('/api/v1/objects/opportunity/records')) {
          return Promise.resolve({
            ok: true,
            json: async () => unassignedRecords,
          } as Response);
        }
        if (typeof url === 'string' && url.includes('/api/v1/pipelines/pipe-1/summary')) {
          return Promise.resolve({
            ok: true,
            json: async () => mockSummary,
          } as Response);
        }
        if (typeof url === 'string' && url.includes('/api/v1/pipelines/pipe-1/velocity')) {
          return Promise.resolve({
            ok: true,
            json: async () => mockVelocity,
          } as Response);
        }
        if (typeof url === 'string' && url.includes('/api/v1/pipelines/pipe-1/overdue')) {
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

  it('calls move-stage API on successful drag and drop', async () => {
    const fetchMock = mockFetch();
    renderBoard();

    await waitFor(() => {
      expect(screen.getByTestId('kanban-board')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText('Big Deal')).toBeInTheDocument();
    });

    const card = screen.getByTestId('kanban-card-rec-1');
    const qualColumn = screen.getByTestId('kanban-column-qualification');

    // Simulate drag start on the card
    fireEvent.dragStart(card, {
      dataTransfer: {
        effectAllowed: 'move',
        setData: vi.fn(),
        getData: () => 'rec-1',
      },
    });

    // Simulate dragover on the target column
    fireEvent.dragOver(qualColumn, {
      dataTransfer: { dropEffect: 'move' },
    });

    // Mock the move-stage response
    fetchMock.mockImplementation((url: string, options?: RequestInit) => {
      if (
        typeof url === 'string' &&
        url.includes('/move-stage') &&
        options?.method === 'POST'
      ) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            id: 'rec-1',
            pipelineId: 'pipe-1',
            currentStageId: 'stage-2',
            stageEnteredAt: new Date().toISOString(),
            fieldValues: { value: 100000, close_date: '2026-06-15', probability: 30 },
          }),
        } as Response);
      }
      // Fall back to existing mock responses
      if (typeof url === 'string' && url.includes('/api/v1/admin/pipelines/pipe-1')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockPipeline,
        } as Response);
      }
      if (typeof url === 'string' && url.includes('/api/v1/admin/pipelines')) {
        return Promise.resolve({
          ok: true,
          json: async () => paginated([{ ...mockPipeline, object_id: 'obj-1' }]),
        } as Response);
      }
      if (typeof url === 'string' && url.includes('/api/v1/pipelines/pipe-1/summary')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockSummary,
        } as Response);
      }
      if (typeof url === 'string' && url.includes('/api/v1/pipelines/pipe-1/velocity')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockVelocity,
        } as Response);
      }
      if (typeof url === 'string' && url.includes('/api/v1/pipelines/pipe-1/overdue')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockOverdue,
        } as Response);
      }
      return Promise.resolve({ ok: false, json: async () => ({}) } as Response);
    });

    // Simulate drop on the target column
    fireEvent.drop(qualColumn, {
      dataTransfer: { getData: () => 'rec-1' },
    });

    await waitFor(() => {
      const moveCalls = fetchMock.mock.calls.filter(
        (call: unknown[]) =>
          typeof call[0] === 'string' && (call[0] as string).includes('/move-stage'),
      );
      expect(moveCalls.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows gate failure modal when move-stage returns 422', async () => {
    const fetchMock = mockFetch();
    renderBoard();

    await waitFor(() => {
      expect(screen.getByTestId('kanban-board')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText('Big Deal')).toBeInTheDocument();
    });

    // Override fetch to return gate validation failure for move-stage
    fetchMock.mockImplementation((url: string, options?: RequestInit) => {
      if (
        typeof url === 'string' &&
        url.includes('/move-stage') &&
        options?.method === 'POST'
      ) {
        return Promise.resolve({
          ok: false,
          status: 422,
          json: async () => ({
            error: 'Cannot move to Qualification — missing required fields',
            code: 'GATE_VALIDATION_FAILED',
            failures: [
              {
                field: 'value',
                label: 'Deal Value',
                gate: 'required',
                message: 'Deal Value is required',
                fieldType: 'currency',
                currentValue: null,
                options: {},
              },
            ],
          }),
        } as Response);
      }
      if (typeof url === 'string' && url.includes('/api/v1/admin/pipelines/pipe-1')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockPipeline,
        } as Response);
      }
      if (typeof url === 'string' && url.includes('/api/v1/admin/pipelines')) {
        return Promise.resolve({
          ok: true,
          json: async () => paginated([{ ...mockPipeline, object_id: 'obj-1' }]),
        } as Response);
      }
      if (typeof url === 'string' && url.includes('/api/v1/pipelines/pipe-1/summary')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockSummary,
        } as Response);
      }
      if (typeof url === 'string' && url.includes('/api/v1/pipelines/pipe-1/velocity')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockVelocity,
        } as Response);
      }
      if (typeof url === 'string' && url.includes('/api/v1/pipelines/pipe-1/overdue')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockOverdue,
        } as Response);
      }
      return Promise.resolve({ ok: false, json: async () => ({}) } as Response);
    });

    const card = screen.getByTestId('kanban-card-rec-1');
    const qualColumn = screen.getByTestId('kanban-column-qualification');

    // Simulate drag and drop
    fireEvent.dragStart(card, {
      dataTransfer: {
        effectAllowed: 'move',
        setData: vi.fn(),
        getData: () => 'rec-1',
      },
    });

    fireEvent.drop(qualColumn, {
      dataTransfer: { getData: () => 'rec-1' },
    });

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    expect(screen.getByText('Deal Value')).toBeInTheDocument();
    expect(screen.getByText('Deal Value is required')).toBeInTheDocument();
  });

  it('optimistically moves card to target column before server responds', async () => {
    const fetchMock = mockFetch();
    renderBoard();

    await waitFor(() => {
      expect(screen.getByText('Big Deal')).toBeInTheDocument();
    });

    // Big Deal starts in Prospecting
    const prospectingColumn = screen.getByTestId('kanban-column-prospecting');
    const qualColumn = screen.getByTestId('kanban-column-qualification');
    expect(prospectingColumn).toHaveTextContent('Big Deal');

    // Hold the move-stage response until we flip this deferred. Every other
    // request falls back to the default mock so analytics panels (summary,
    // velocity, overdue) still get their expected shapes and don't crash the
    // component when `loadAnalytics()` fires in the success path.
    let resolveMove: (value: Response) => void = () => {};
    const movePromise = new Promise<Response>((r) => {
      resolveMove = r;
    });
    const defaultImpl = fetchMock.getMockImplementation();
    fetchMock.mockImplementation((url: string, options?: RequestInit) => {
      if (
        typeof url === 'string' &&
        url.includes('/move-stage') &&
        options?.method === 'POST'
      ) {
        return movePromise;
      }
      return defaultImpl?.(url, options) ?? Promise.resolve({
        ok: false,
        json: async () => ({}),
      } as Response);
    });

    const card = screen.getByTestId('kanban-card-rec-1');
    fireEvent.dragStart(card, {
      dataTransfer: { effectAllowed: 'move', setData: vi.fn(), getData: () => 'rec-1' },
    });
    fireEvent.drop(qualColumn, {
      dataTransfer: { getData: () => 'rec-1' },
    });

    // Optimistic update: card should appear in Qualification while the POST is pending
    await waitFor(() => {
      expect(qualColumn).toHaveTextContent('Big Deal');
    });
    expect(prospectingColumn).not.toHaveTextContent('Big Deal');

    // Release the server response and wait for the success path (including
    // the `loadAnalytics()` refresh) to settle before the test exits, so we
    // don't leak pending promises into later tests.
    resolveMove({
      ok: true,
      json: async () => ({
        id: 'rec-1',
        pipelineId: 'pipe-1',
        currentStageId: 'stage-2',
        stageEnteredAt: new Date().toISOString(),
        fieldValues: { value: 100000, close_date: '2026-06-15', probability: 30 },
      }),
    } as Response);

    await waitFor(() => {
      const moveCalls = fetchMock.mock.calls.filter(
        (call: unknown[]) =>
          typeof call[0] === 'string' && (call[0] as string).includes('/move-stage'),
      );
      expect(moveCalls.length).toBeGreaterThanOrEqual(1);
      // Card stays in Qualification and no gate dialog appeared.
      expect(qualColumn).toHaveTextContent('Big Deal');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('rolls back optimistic move when server returns 422', async () => {
    const fetchMock = mockFetch();
    renderBoard();

    await waitFor(() => {
      expect(screen.getByText('Big Deal')).toBeInTheDocument();
    });

    const prospectingColumn = screen.getByTestId('kanban-column-prospecting');
    const qualColumn = screen.getByTestId('kanban-column-qualification');
    expect(prospectingColumn).toHaveTextContent('Big Deal');

    // Only override the move-stage POST; every other request (including
    // analytics endpoints that fire after settle) keeps using the default
    // mock so the board renders without surprise shape mismatches.
    const defaultImpl = fetchMock.getMockImplementation();
    fetchMock.mockImplementation((url: string, options?: RequestInit) => {
      if (
        typeof url === 'string' &&
        url.includes('/move-stage') &&
        options?.method === 'POST'
      ) {
        return Promise.resolve({
          ok: false,
          status: 422,
          json: async () => ({
            error: 'Cannot move to Qualification — missing required fields',
            code: 'GATE_VALIDATION_FAILED',
            failures: [
              {
                field: 'value',
                label: 'Deal Value',
                gate: 'required',
                message: 'Deal Value is required',
                fieldType: 'currency',
                currentValue: null,
                options: {},
              },
            ],
          }),
        } as Response);
      }
      return defaultImpl?.(url, options) ?? Promise.resolve({
        ok: false,
        json: async () => ({}),
      } as Response);
    });

    const card = screen.getByTestId('kanban-card-rec-1');
    fireEvent.dragStart(card, {
      dataTransfer: { effectAllowed: 'move', setData: vi.fn(), getData: () => 'rec-1' },
    });
    fireEvent.drop(qualColumn, {
      dataTransfer: { getData: () => 'rec-1' },
    });

    // Gate modal opens ⇒ server responded with 422 ⇒ rollback has run
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    // After rollback the card is back in Prospecting — not lingering in Qualification.
    expect(prospectingColumn).toHaveTextContent('Big Deal');
    expect(qualColumn).not.toHaveTextContent('Big Deal');
  });

  it('places records using fieldValues.stage when present', async () => {
    const stageRecords = {
      data: [
        {
          id: 'rec-s1',
          name: 'Qualified Lead',
          fieldValues: { value: 30000, stage: 'Qualification' },
          ownerId: 'user-1',
          createdAt: '2026-03-01T00:00:00Z',
        },
        {
          id: 'rec-s2',
          name: 'Won Deal',
          fieldValues: { value: 90000, stage: 'Closed Won' },
          ownerId: 'user-2',
          createdAt: '2026-02-20T00:00:00Z',
        },
        {
          id: 'rec-s3',
          name: 'Lowercase Stage',
          fieldValues: { value: 10000, stage: 'prospecting' },
          ownerId: 'user-1',
          createdAt: '2026-03-05T00:00:00Z',
        },
      ],
      total: 3,
      page: 1,
      limit: 100,
    };

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (typeof url === 'string' && url.includes('/api/v1/admin/pipelines/pipe-1')) {
          return Promise.resolve({
            ok: true,
            json: async () => mockPipeline,
          } as Response);
        }
        if (typeof url === 'string' && url.includes('/api/v1/admin/pipelines')) {
          return Promise.resolve({
            ok: true,
            json: async () => paginated([{ ...mockPipeline, object_id: 'obj-1' }]),
          } as Response);
        }
        if (typeof url === 'string' && url.includes('/api/v1/objects/opportunity/records')) {
          return Promise.resolve({
            ok: true,
            json: async () => stageRecords,
          } as Response);
        }
        if (typeof url === 'string' && url.includes('/api/v1/pipelines/pipe-1/summary')) {
          return Promise.resolve({
            ok: true,
            json: async () => mockSummary,
          } as Response);
        }
        if (typeof url === 'string' && url.includes('/api/v1/pipelines/pipe-1/velocity')) {
          return Promise.resolve({
            ok: true,
            json: async () => mockVelocity,
          } as Response);
        }
        if (typeof url === 'string' && url.includes('/api/v1/pipelines/pipe-1/overdue')) {
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
      expect(screen.getByText('Qualified Lead')).toBeInTheDocument();
    });
    expect(screen.getByText('Won Deal')).toBeInTheDocument();
    expect(screen.getByText('Lowercase Stage')).toBeInTheDocument();

    // Qualified Lead should be in Qualification column
    const qualColumn = screen.getByTestId('kanban-column-qualification');
    expect(qualColumn).toHaveTextContent('Qualified Lead');

    // Won Deal should be in Closed Won column
    const wonColumn = screen.getByTestId('kanban-column-closed_won');
    expect(wonColumn).toHaveTextContent('Won Deal');

    // Lowercase Stage should be in Prospecting column (matches apiName)
    const prospectingColumn = screen.getByTestId('kanban-column-prospecting');
    expect(prospectingColumn).toHaveTextContent('Lowercase Stage');
  });

  it('places records by currentStageId when it disagrees with fieldValues.stage', async () => {
    // Regression: the server treats `records.current_stage_id` as the source
    // of truth and rejects move-stage requests whose target matches it with
    // 400 "already in this stage". If the UI placed a card by a stale
    // `fieldValues.stage` (left over from a previous move or a manual edit),
    // dragging the card to its actual DB column would fire a doomed request.
    const mismatchedRecords = {
      data: [
        {
          id: 'rec-mismatch',
          name: 'Mismatched Deal',
          fieldValues: { value: 42000, stage: 'Prospecting' },
          ownerId: 'user-1',
          pipelineId: 'pipe-1',
          currentStageId: 'stage-2',
          stageEnteredAt: '2026-04-01T00:00:00Z',
          createdAt: '2026-03-20T00:00:00Z',
        },
      ],
      total: 1,
      page: 1,
      limit: 100,
    };

    // Override only the records endpoint; everything else (pipelines,
    // summary, velocity, overdue) keeps the default mock so future endpoint
    // changes stay in one place.
    const fetchMock = mockFetch();
    const defaultImpl = fetchMock.getMockImplementation();
    fetchMock.mockImplementation((url: string, options?: RequestInit) => {
      if (typeof url === 'string' && url.includes('/api/v1/objects/opportunity/records')) {
        return Promise.resolve({ ok: true, json: async () => mismatchedRecords } as Response);
      }
      return (
        defaultImpl?.(url, options) ??
        Promise.resolve({ ok: false, json: async () => ({}) } as Response)
      );
    });

    renderBoard();

    await waitFor(() => {
      expect(screen.getByText('Mismatched Deal')).toBeInTheDocument();
    });

    const qualColumn = screen.getByTestId('kanban-column-qualification');
    expect(qualColumn).toHaveTextContent('Mismatched Deal');

    const prospectingColumn = screen.getByTestId('kanban-column-prospecting');
    expect(prospectingColumn).not.toHaveTextContent('Mismatched Deal');
  });

  it('hides records that belong to a different pipeline', async () => {
    // Regression: the records endpoint returns every record for the object
    // regardless of pipeline. If a row's `pipelineId` points at a sibling
    // pipeline, rendering it via `fieldValues.stage` fallback lets the user
    // drag it — and the resulting move-stage fires cross-pipeline and the
    // server rejects with 400 "Target stage does not belong to the same
    // pipeline". Such rows should be hidden entirely.
    const mixedPipelineRecords = {
      data: [
        {
          id: 'rec-this-pipeline',
          name: 'In This Pipeline',
          fieldValues: { value: 10000 },
          ownerId: 'user-1',
          pipelineId: 'pipe-1',
          currentStageId: 'stage-1',
          stageEnteredAt: '2026-04-01T00:00:00Z',
          createdAt: '2026-03-01T00:00:00Z',
        },
        {
          id: 'rec-other-pipeline',
          name: 'In Other Pipeline',
          fieldValues: { value: 20000, stage: 'Qualification' },
          ownerId: 'user-2',
          pipelineId: 'pipe-2',
          currentStageId: 'stage-x',
          stageEnteredAt: '2026-04-01T00:00:00Z',
          createdAt: '2026-03-01T00:00:00Z',
        },
      ],
      total: 2,
      page: 1,
      limit: 100,
    };

    const fetchMock = mockFetch();
    const defaultImpl = fetchMock.getMockImplementation();
    fetchMock.mockImplementation((url: string, options?: RequestInit) => {
      if (typeof url === 'string' && url.includes('/api/v1/objects/opportunity/records')) {
        return Promise.resolve({ ok: true, json: async () => mixedPipelineRecords } as Response);
      }
      return (
        defaultImpl?.(url, options) ??
        Promise.resolve({ ok: false, json: async () => ({}) } as Response)
      );
    });

    renderBoard();

    await waitFor(() => {
      expect(screen.getByText('In This Pipeline')).toBeInTheDocument();
    });

    expect(screen.queryByText('In Other Pipeline')).not.toBeInTheDocument();
  });

  it('prefers the default pipeline when multiple exist for the object', async () => {
    // When a tenant has more than one pipeline for the same object, the
    // server's `assignDefaultPipeline` routes records without a
    // `pipeline_id` to the pipeline flagged `is_default`. The Kanban must
    // render that same pipeline, otherwise target stages would live in the
    // non-default pipeline and the server would reject moves with 400
    // "Target stage does not belong to the same pipeline".
    const defaultPipeline = {
      ...mockPipeline,
      id: 'pipe-default',
      name: 'Default Pipeline',
      isDefault: true,
    };
    const nonDefaultPipeline = {
      id: 'pipe-other',
      name: 'Other Pipeline',
      objectId: 'obj-1',
      isDefault: false,
      stages: [
        {
          id: 'stage-other-1',
          name: 'Other Stage',
          apiName: 'other_stage',
          sortOrder: 0,
          stageType: 'open',
          colour: 'grey',
          defaultProbability: 0,
        },
      ],
    };

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (typeof url === 'string' && url.includes('/api/v1/admin/pipelines/pipe-default')) {
          return Promise.resolve({ ok: true, json: async () => defaultPipeline } as Response);
        }
        if (typeof url === 'string' && url.includes('/api/v1/admin/pipelines')) {
          return Promise.resolve({
            ok: true,
            json: async () =>
              paginated([
                // Non-default comes first so the test fails if the Kanban
                // naively picks the first match rather than the default.
                { ...nonDefaultPipeline, object_id: 'obj-1' },
                { ...defaultPipeline, object_id: 'obj-1' },
              ]),
          } as Response);
        }
        if (typeof url === 'string' && url.includes('/api/v1/objects/opportunity/records')) {
          return Promise.resolve({ ok: true, json: async () => mockRecords } as Response);
        }
        if (typeof url === 'string' && url.includes('/api/v1/pipelines/pipe-default/summary')) {
          return Promise.resolve({ ok: true, json: async () => mockSummary } as Response);
        }
        if (typeof url === 'string' && url.includes('/api/v1/pipelines/pipe-default/velocity')) {
          return Promise.resolve({ ok: true, json: async () => mockVelocity } as Response);
        }
        if (typeof url === 'string' && url.includes('/api/v1/pipelines/pipe-default/overdue')) {
          return Promise.resolve({ ok: true, json: async () => [] } as Response);
        }
        return Promise.resolve({ ok: false, json: async () => ({}) } as Response);
      }),
    );

    renderBoard();

    // Default pipeline's Prospecting column should render, not the other
    // pipeline's single "Other Stage" column.
    await waitFor(() => {
      expect(screen.getByTestId('kanban-column-prospecting')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('kanban-column-other_stage')).not.toBeInTheDocument();
  });

  it('shows a pipeline picker and switches boards when multiple pipelines exist', async () => {
    // Two pipelines for the same object — the picker should let the user
    // switch boards without the page reloading. Selecting the non-default
    // pipeline swaps the columns and the records shown to those belonging
    // to the newly-selected pipeline.
    const defaultPipeline = {
      ...mockPipeline,
      id: 'pipe-default',
      name: 'Default Pipeline',
      isDefault: true,
      is_default: true,
    };
    const otherPipeline = {
      id: 'pipe-other',
      name: 'Other Pipeline',
      objectId: 'obj-1',
      isDefault: false,
      is_default: false,
      stages: [
        {
          id: 'stage-other-1',
          name: 'Other Stage',
          apiName: 'other_stage',
          sortOrder: 0,
          stageType: 'open',
          colour: 'grey',
          defaultProbability: 0,
        },
      ],
    };
    const multiPipelineRecords = {
      data: [
        {
          id: 'rec-default',
          name: 'Default Deal',
          fieldValues: {},
          ownerId: 'user-1',
          pipelineId: 'pipe-default',
          currentStageId: 'stage-1',
          createdAt: '2026-03-01T00:00:00Z',
        },
        {
          id: 'rec-other',
          name: 'Other Deal',
          fieldValues: {},
          ownerId: 'user-1',
          pipelineId: 'pipe-other',
          currentStageId: 'stage-other-1',
          createdAt: '2026-03-02T00:00:00Z',
        },
      ],
      total: 2,
      page: 1,
      limit: 100,
    };

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (typeof url === 'string' && url.includes('/api/v1/admin/pipelines/pipe-default')) {
          return Promise.resolve({ ok: true, json: async () => defaultPipeline } as Response);
        }
        if (typeof url === 'string' && url.includes('/api/v1/admin/pipelines/pipe-other')) {
          return Promise.resolve({ ok: true, json: async () => otherPipeline } as Response);
        }
        if (typeof url === 'string' && url.includes('/api/v1/admin/pipelines')) {
          return Promise.resolve({
            ok: true,
            json: async () =>
              paginated([
                { ...defaultPipeline, object_id: 'obj-1' },
                { ...otherPipeline, object_id: 'obj-1' },
              ]),
          } as Response);
        }
        if (typeof url === 'string' && url.includes('/api/v1/objects/opportunity/records')) {
          return Promise.resolve({ ok: true, json: async () => multiPipelineRecords } as Response);
        }
        if (typeof url === 'string' && url.includes('/summary')) {
          return Promise.resolve({ ok: true, json: async () => mockSummary } as Response);
        }
        if (typeof url === 'string' && url.includes('/velocity')) {
          return Promise.resolve({ ok: true, json: async () => mockVelocity } as Response);
        }
        if (typeof url === 'string' && url.includes('/overdue')) {
          return Promise.resolve({ ok: true, json: async () => [] } as Response);
        }
        return Promise.resolve({ ok: false, json: async () => ({}) } as Response);
      }),
    );

    renderBoard();

    // Default board renders first; only the default-pipeline record is visible.
    const picker = await screen.findByTestId<HTMLSelectElement>('kanban-pipeline-picker');
    expect(picker.value).toBe('pipe-default');
    await waitFor(() => {
      expect(screen.getByText('Default Deal')).toBeInTheDocument();
    });
    expect(screen.queryByText('Other Deal')).not.toBeInTheDocument();

    // Switch to the non-default pipeline.
    fireEvent.change(picker, { target: { value: 'pipe-other' } });

    await waitFor(() => {
      expect(screen.getByTestId('kanban-column-other_stage')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('kanban-column-prospecting')).not.toBeInTheDocument();
    expect(screen.getByText('Other Deal')).toBeInTheDocument();
    expect(screen.queryByText('Default Deal')).not.toBeInTheDocument();
  });

  it('clears the dragging style on the card after drop', async () => {
    // Regression: the browser can lose the `dragend` event when the card is
    // reparented by the optimistic update that follows a successful move.
    // The board must therefore clear the dragging state in `handleDrop`
    // itself so the card never stays rendered in the faded drag ghost
    // style after a successful move.
    const fetchMock = mockFetch();
    renderBoard();

    await waitFor(() => {
      expect(screen.getByText('Big Deal')).toBeInTheDocument();
    });

    const card = screen.getByTestId('kanban-card-rec-1');
    const qualColumn = screen.getByTestId('kanban-column-qualification');

    fireEvent.dragStart(card, {
      dataTransfer: {
        effectAllowed: 'move',
        setData: vi.fn(),
        getData: () => 'rec-1',
      },
    });

    // After dragStart the card should carry the dragging class.
    expect(card.className).toMatch(/Dragging/);

    fetchMock.mockImplementation((url: string, options?: RequestInit) => {
      if (
        typeof url === 'string' &&
        url.includes('/move-stage') &&
        options?.method === 'POST'
      ) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            id: 'rec-1',
            pipelineId: 'pipe-1',
            currentStageId: 'stage-2',
            stageEnteredAt: new Date().toISOString(),
            fieldValues: {},
          }),
        } as Response);
      }
      return Promise.resolve({ ok: false, json: async () => ({}) } as Response);
    });

    fireEvent.drop(qualColumn, {
      dataTransfer: { getData: () => 'rec-1' },
    });

    // Drop must clear the dragging style even without a subsequent
    // dragEnd — the browser may skip it when the card reparents.
    await waitFor(() => {
      expect(
        screen.getByTestId('kanban-card-rec-1').className,
      ).not.toMatch(/Dragging/);
    });
  });

  it('shows records with no pipelineId only on the default pipeline board', async () => {
    // Records that the server never auto-assigned a pipeline to (missing or
    // undefined pipelineId) should only render on the default pipeline —
    // otherwise switching to a sibling pipeline would show a card whose
    // move-stage would 400 once the server auto-assigns it to the default.
    const defaultPipeline = {
      ...mockPipeline,
      id: 'pipe-default',
      name: 'Default Pipeline',
      isDefault: true,
      is_default: true,
    };
    const otherPipeline = {
      id: 'pipe-other',
      name: 'Other Pipeline',
      objectId: 'obj-1',
      isDefault: false,
      is_default: false,
      stages: [
        {
          id: 'stage-other-1',
          name: 'Other Stage',
          apiName: 'other_stage',
          sortOrder: 0,
          stageType: 'open',
          colour: 'grey',
          defaultProbability: 0,
        },
      ],
    };
    const recordsWithUnassigned = {
      data: [
        {
          id: 'rec-unassigned',
          name: 'Unassigned Deal',
          fieldValues: {},
          ownerId: 'user-1',
          createdAt: '2026-03-01T00:00:00Z',
        },
      ],
      total: 1,
      page: 1,
      limit: 100,
    };

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (typeof url === 'string' && url.includes('/api/v1/admin/pipelines/pipe-default')) {
          return Promise.resolve({ ok: true, json: async () => defaultPipeline } as Response);
        }
        if (typeof url === 'string' && url.includes('/api/v1/admin/pipelines/pipe-other')) {
          return Promise.resolve({ ok: true, json: async () => otherPipeline } as Response);
        }
        if (typeof url === 'string' && url.includes('/api/v1/admin/pipelines')) {
          return Promise.resolve({
            ok: true,
            json: async () =>
              paginated([
                { ...defaultPipeline, object_id: 'obj-1' },
                { ...otherPipeline, object_id: 'obj-1' },
              ]),
          } as Response);
        }
        if (typeof url === 'string' && url.includes('/api/v1/objects/opportunity/records')) {
          return Promise.resolve({ ok: true, json: async () => recordsWithUnassigned } as Response);
        }
        if (typeof url === 'string' && url.includes('/summary')) {
          return Promise.resolve({ ok: true, json: async () => mockSummary } as Response);
        }
        if (typeof url === 'string' && url.includes('/velocity')) {
          return Promise.resolve({ ok: true, json: async () => mockVelocity } as Response);
        }
        if (typeof url === 'string' && url.includes('/overdue')) {
          return Promise.resolve({ ok: true, json: async () => [] } as Response);
        }
        return Promise.resolve({ ok: false, json: async () => ({}) } as Response);
      }),
    );

    renderBoard();

    const picker = await screen.findByTestId<HTMLSelectElement>('kanban-pipeline-picker');
    // Visible on default — unassigned records land in the first open stage.
    await waitFor(() => {
      expect(screen.getByText('Unassigned Deal')).toBeInTheDocument();
    });

    // Switch to non-default — the unassigned record should disappear so we
    // never issue a cross-pipeline move.
    fireEvent.change(picker, { target: { value: 'pipe-other' } });

    await waitFor(() => {
      expect(screen.getByTestId('kanban-column-other_stage')).toBeInTheDocument();
    });
    expect(screen.queryByText('Unassigned Deal')).not.toBeInTheDocument();
  });

  it('renders the summary toggle button', async () => {
    mockFetch();
    renderBoard();

    await waitFor(() => {
      expect(screen.getByTestId('summary-toggle')).toBeInTheDocument();
    });

    const toggle = screen.getByTestId('summary-toggle');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toHaveTextContent('Hide summary');
  });

  it('collapses summary cards when toggle is clicked', async () => {
    mockFetch();
    renderBoard();

    await waitFor(() => {
      expect(screen.getByTestId('summary-toggle')).toBeInTheDocument();
    });

    const toggle = screen.getByTestId('summary-toggle');

    // Initially expanded
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const section = screen.getByTestId('summary-section');
    expect(section.className).toContain('Expanded');

    // Click to collapse
    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveTextContent('Show summary');
    expect(section.className).toContain('Collapsed');
  });

  it('keeps filter bar visible when summary is collapsed', async () => {
    mockFetch();
    renderBoard();

    await waitFor(() => {
      expect(screen.getByTestId('kanban-filter-bar')).toBeInTheDocument();
    });

    // Collapse summary
    fireEvent.click(screen.getByTestId('summary-toggle'));

    // Filter bar should still be visible
    expect(screen.getByTestId('kanban-filter-bar')).toBeInTheDocument();
  });

  it('persists collapsed state in localStorage', async () => {
    mockFetch();
    renderBoard();

    await waitFor(() => {
      expect(screen.getByTestId('summary-toggle')).toBeInTheDocument();
    });

    // Click to collapse
    fireEvent.click(screen.getByTestId('summary-toggle'));

    expect(localStorage.getItem('cpcrm-pipeline-summary-collapsed')).toBe('true');

    // Click to expand
    fireEvent.click(screen.getByTestId('summary-toggle'));

    expect(localStorage.getItem('cpcrm-pipeline-summary-collapsed')).toBe('false');
  });

  it('uses grid layout for columns container', async () => {
    mockFetch();
    renderBoard();

    await waitFor(() => {
      expect(screen.getByTestId('kanban-board')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByTestId('kanban-column-prospecting')).toBeInTheDocument();
    });
  });
});
