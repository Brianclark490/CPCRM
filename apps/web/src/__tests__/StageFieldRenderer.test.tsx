import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StageFieldRenderer } from '../components/StageFieldRenderer.js';

vi.mock('@descope/react-sdk', () => ({
  useSession: vi.fn(),
}));

const { useSession } = await import('@descope/react-sdk');

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_PIPELINES = [
  {
    id: 'pipeline-1',
    name: 'Sales Pipeline',
    objectId: 'obj-opp',
    object_id: 'obj-opp',
    stages: [],
  },
];

const MOCK_PIPELINE_DETAIL = {
  id: 'pipeline-1',
  name: 'Sales Pipeline',
  objectId: 'obj-opp',
  stages: [
    { id: 'stage-1', name: 'Prospecting', apiName: 'prospecting', sortOrder: 0, stageType: 'open', colour: 'blue', defaultProbability: 10 },
    { id: 'stage-2', name: 'Qualification', apiName: 'qualification', sortOrder: 1, stageType: 'open', colour: 'blue', defaultProbability: 25 },
    { id: 'stage-3', name: 'Proposal', apiName: 'proposal', sortOrder: 2, stageType: 'open', colour: 'purple', defaultProbability: 60 },
    { id: 'stage-4', name: 'Closed Won', apiName: 'closed_won', sortOrder: 3, stageType: 'won', colour: 'green', defaultProbability: 100 },
    { id: 'stage-5', name: 'Closed Lost', apiName: 'closed_lost', sortOrder: 4, stageType: 'lost', colour: 'red', defaultProbability: 0 },
  ],
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('StageFieldRenderer', () => {
  beforeEach(() => {
    vi.mocked(useSession).mockReturnValue({
      isAuthenticated: true,
      isSessionLoading: false,
      sessionToken: 'test-token',
      claims: {},
    });
  });

  function setupFetch(overrides?: { moveResponse?: { ok: boolean; status?: number; body?: unknown } }) {
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      // Pipeline list
      if (typeof url === 'string' && url === '/api/admin/pipelines') {
        return Promise.resolve({
          ok: true,
          json: async () => MOCK_PIPELINES,
        } as Response);
      }

      // Pipeline detail
      if (typeof url === 'string' && url.match(/\/api\/admin\/pipelines\//)) {
        return Promise.resolve({
          ok: true,
          json: async () => MOCK_PIPELINE_DETAIL,
        } as Response);
      }

      // Move stage
      if (typeof url === 'string' && url.includes('/move-stage') && init?.method === 'POST') {
        if (overrides?.moveResponse) {
          return Promise.resolve({
            ok: overrides.moveResponse.ok,
            status: overrides.moveResponse.status ?? (overrides.moveResponse.ok ? 200 : 400),
            json: async () => overrides.moveResponse!.body ?? {},
          } as Response);
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({
            id: 'rec-1',
            pipelineId: 'pipeline-1',
            currentStageId: 'stage-2',
            fieldValues: { stage: 'Qualification', probability: 25 },
          }),
        } as Response);
      }

      return Promise.resolve({ ok: false, json: async () => ({}) } as Response);
    });

    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  // ── View mode ──────────────────────────────────────────────

  it('renders the current stage name in view mode', async () => {
    setupFetch();

    render(
      <StageFieldRenderer
        objectApiName="opportunity"
        objectId="obj-opp"
        recordId="rec-1"
        currentStageId="stage-1"
        value="Prospecting"
        editing={false}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Prospecting')).toBeInTheDocument();
    });
  });

  it('falls back to value when stages cannot be loaded', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) } as Response),
    );

    render(
      <StageFieldRenderer
        objectApiName="opportunity"
        objectId="obj-opp"
        recordId="rec-1"
        currentStageId={null}
        value="Prospecting"
        editing={false}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Prospecting')).toBeInTheDocument();
    });
  });

  // ── Edit mode ──────────────────────────────────────────────

  it('renders a dropdown with pipeline stages in edit mode', async () => {
    setupFetch();

    render(
      <StageFieldRenderer
        objectApiName="opportunity"
        objectId="obj-opp"
        recordId="rec-1"
        currentStageId="stage-1"
        value="Prospecting"
        editing={true}
      />,
    );

    await waitFor(() => {
      const select = screen.getByRole('combobox');
      expect(select).toBeInTheDocument();
    });

    // All stages should be in the dropdown
    const options = screen.getAllByRole('option');
    expect(options.length).toBe(6); // 5 stages + "Select stage" placeholder
    expect(options[1]).toHaveTextContent('Prospecting');
    expect(options[2]).toHaveTextContent('Qualification');
    expect(options[3]).toHaveTextContent('Proposal');
  });

  it('calls move-stage API when a stage is selected', async () => {
    const fetchMock = setupFetch();
    const onStageChanged = vi.fn();

    const user = userEvent.setup();

    render(
      <StageFieldRenderer
        objectApiName="opportunity"
        objectId="obj-opp"
        recordId="rec-1"
        currentStageId="stage-1"
        value="Prospecting"
        editing={true}
        onStageChanged={onStageChanged}
      />,
    );

    // Wait for stages to load
    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    // Select a new stage
    await user.selectOptions(screen.getByRole('combobox'), 'stage-2');

    // Should have called move-stage API
    await waitFor(() => {
      const moveCalls = fetchMock.mock.calls.filter(
        (call: unknown[]) =>
          typeof call[0] === 'string' &&
          call[0].includes('/move-stage'),
      );
      expect(moveCalls.length).toBe(1);
      expect(JSON.parse((moveCalls[0][1] as RequestInit).body as string)).toEqual({
        target_stage_id: 'stage-2',
      });
    });

    // Should have called onStageChanged
    await waitFor(() => {
      expect(onStageChanged).toHaveBeenCalledWith({
        currentStageId: 'stage-2',
        fieldValues: { stage: 'Qualification', probability: 25 },
      });
    });
  });

  // ── Create mode (no recordId) ──────────────────────────────

  it('calls onChange with stage name on create form', async () => {
    setupFetch();
    const onChange = vi.fn();

    const user = userEvent.setup();

    render(
      <StageFieldRenderer
        objectApiName="opportunity"
        objectId="obj-opp"
        recordId={null}
        currentStageId={null}
        value={null}
        editing={true}
        onChange={onChange}
      />,
    );

    // Wait for stages to load
    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    // Select a stage
    await user.selectOptions(screen.getByRole('combobox'), 'stage-2');

    // Should have called onChange with the stage name (not ID)
    expect(onChange).toHaveBeenCalledWith('Qualification');
  });

  // ── Gate validation failures ───────────────────────────────

  it('shows gate failure modal when move is blocked', async () => {
    setupFetch({
      moveResponse: {
        ok: false,
        status: 422,
        body: {
          error: 'Cannot move to Qualification — missing required fields',
          code: 'GATE_VALIDATION_FAILED',
          failures: [
            {
              field: 'value',
              label: 'Value',
              gate: 'required',
              message: 'Deal value is required to enter Qualification',
              fieldType: 'currency',
              currentValue: null,
              options: {},
            },
          ],
        },
      },
    });

    const user = userEvent.setup();

    render(
      <StageFieldRenderer
        objectApiName="opportunity"
        objectId="obj-opp"
        recordId="rec-1"
        currentStageId="stage-1"
        value="Prospecting"
        editing={true}
      />,
    );

    // Wait for stages to load
    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    // Try to select a stage that has gate validation
    await user.selectOptions(screen.getByRole('combobox'), 'stage-2');

    // Gate failure modal should appear
    await waitFor(() => {
      expect(
        screen.getByText(/Complete these fields to move to Qualification/),
      ).toBeInTheDocument();
    });

    // The gate failure message should be visible
    expect(
      screen.getByText('Deal value is required to enter Qualification'),
    ).toBeInTheDocument();
  });

  // ── Disabled state ─────────────────────────────────────────

  it('disables the dropdown when disabled prop is true', async () => {
    setupFetch();

    render(
      <StageFieldRenderer
        objectApiName="opportunity"
        objectId="obj-opp"
        recordId="rec-1"
        currentStageId="stage-1"
        value="Prospecting"
        editing={true}
        disabled={true}
      />,
    );

    await waitFor(() => {
      const select = screen.getByRole('combobox');
      expect(select).toBeDisabled();
    });
  });
});
