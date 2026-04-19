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
