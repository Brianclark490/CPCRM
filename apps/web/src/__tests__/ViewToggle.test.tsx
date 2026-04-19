import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { RecordListPage } from '../pages/RecordListPage.js';
import { renderWithQuery } from './utils/renderWithQuery.js';

vi.mock('@descope/react-sdk', () => ({
  useSession: vi.fn(),
}));

const { useSession } = await import('@descope/react-sdk');

function renderPage(apiName = 'opportunity', initialView?: 'list' | 'pipeline') {
  return renderWithQuery(
    <MemoryRouter initialEntries={[`/objects/${apiName}`]}>
      <Routes>
        <Route
          path="/objects/:apiName"
          element={<RecordListPage initialView={initialView} />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

function makeRecordsResponse(total = 0) {
  return {
    data: [],
    pagination: { total, limit: 20, offset: 0, hasMore: false },
    object: {
      id: 'obj-1',
      apiName: 'opportunity',
      label: 'Opportunity',
      pluralLabel: 'Opportunities',
      isSystem: true,
    },
  };
}

function mockFetchWithPipeline() {
  const fetchMock = vi.fn().mockImplementation((url: string) => {
    if (typeof url === 'string' && url.includes('/api/v1/admin/objects') && !url.includes('/layouts')) {
      return Promise.resolve({
        ok: true,
        json: async () => [{ id: 'obj-1', apiName: 'opportunity' }],
      } as Response);
    }

    if (typeof url === 'string' && url.includes('/api/v1/admin/pipelines/pipe-1')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          id: 'pipe-1',
          name: 'Sales Pipeline',
          objectId: 'obj-1',
          stages: [
            { id: 's-1', name: 'Stage 1', apiName: 'stage_1', sortOrder: 0, stageType: 'open', colour: 'blue' },
          ],
        }),
      } as Response);
    }

    if (typeof url === 'string' && url.includes('/api/v1/admin/pipelines')) {
      return Promise.resolve({
        ok: true,
        json: async () => [{ id: 'pipe-1', object_id: 'obj-1' }],
      } as Response);
    }

    if (typeof url === 'string' && url.includes('/layouts')) {
      return Promise.resolve({
        ok: true,
        json: async () => [],
      } as Response);
    }

    if (typeof url === 'string' && url.includes('/api/v1/objects/')) {
      return Promise.resolve({
        ok: true,
        json: async () => makeRecordsResponse(),
      } as Response);
    }

    return Promise.resolve({ ok: false, json: async () => ({}) } as Response);
  });

  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function mockFetchWithoutPipeline() {
  const fetchMock = vi.fn().mockImplementation((url: string) => {
    if (typeof url === 'string' && url.includes('/api/v1/admin/objects') && !url.includes('/layouts')) {
      return Promise.resolve({
        ok: true,
        json: async () => [{ id: 'obj-1', apiName: 'opportunity' }],
      } as Response);
    }

    if (typeof url === 'string' && url.includes('/api/v1/admin/pipelines')) {
      return Promise.resolve({
        ok: true,
        json: async () => [],
      } as Response);
    }

    if (typeof url === 'string' && url.includes('/layouts')) {
      return Promise.resolve({
        ok: true,
        json: async () => [],
      } as Response);
    }

    if (typeof url === 'string' && url.includes('/api/v1/objects/')) {
      return Promise.resolve({
        ok: true,
        json: async () => makeRecordsResponse(),
      } as Response);
    }

    return Promise.resolve({ ok: false, json: async () => ({}) } as Response);
  });

  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('RecordListPage view toggle', () => {
  beforeEach(() => {
    vi.mocked(useSession).mockReturnValue({
      isAuthenticated: true,
      isSessionLoading: false,
      sessionToken: 'test-token',
      claims: {},
    });
  });

  it('shows the view toggle when the object has a pipeline', async () => {
    mockFetchWithPipeline();
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('view-toggle')).toBeInTheDocument();
    });
  });

  it('does not show the view toggle when the object has no pipeline', async () => {
    mockFetchWithoutPipeline();
    renderPage();

    // Wait for the page to load
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Opportunities' })).toBeInTheDocument();
    });

    expect(screen.queryByTestId('view-toggle')).not.toBeInTheDocument();
  });

  it('switches to pipeline view when Pipeline button is clicked', async () => {
    mockFetchWithPipeline();
    const user = userEvent.setup();

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('view-toggle')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Pipeline/i }));

    await waitFor(() => {
      expect(screen.getByTestId('kanban-board')).toBeInTheDocument();
    });
  });

  it('defaults to pipeline view when initialView prop is set', async () => {
    mockFetchWithPipeline();
    renderPage('opportunity', 'pipeline');

    await waitFor(() => {
      expect(screen.getByTestId('kanban-board')).toBeInTheDocument();
    });
  });

  it('shows List and Pipeline toggle buttons', async () => {
    mockFetchWithPipeline();
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /List/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Pipeline/i })).toBeInTheDocument();
    });
  });
});
