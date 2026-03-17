import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GateFailureModal } from '../components/GateFailureModal.js';
import type { GateFailure } from '../components/GateFailureModal.js';

const mockFailures: GateFailure[] = [
  {
    field: 'deal_value',
    label: 'Deal Value',
    gate: 'required',
    message: 'Deal Value is required',
  },
  {
    field: 'close_date',
    label: 'Close Date',
    gate: 'required',
    message: 'Close Date is required',
  },
];

describe('GateFailureModal', () => {
  it('renders the stage name in the title', () => {
    render(
      <GateFailureModal
        stageName="Negotiation"
        failures={mockFailures}
        onFillAndMove={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText(/Cannot move to Negotiation/)).toBeInTheDocument();
  });

  it('renders a field label and error message for each failure', () => {
    render(
      <GateFailureModal
        stageName="Negotiation"
        failures={mockFailures}
        onFillAndMove={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText('Deal Value')).toBeInTheDocument();
    expect(screen.getByText('Deal Value is required')).toBeInTheDocument();
    expect(screen.getByText('Close Date')).toBeInTheDocument();
    expect(screen.getByText('Close Date is required')).toBeInTheDocument();
  });

  it('renders an input for each failure field', () => {
    render(
      <GateFailureModal
        stageName="Negotiation"
        failures={mockFailures}
        onFillAndMove={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    // There should be input fields for each failure
    const inputs = screen.getAllByRole('textbox');
    expect(inputs).toHaveLength(2);
  });

  it('calls onCancel when the Cancel button is clicked', async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();

    render(
      <GateFailureModal
        stageName="Negotiation"
        failures={mockFailures}
        onFillAndMove={vi.fn()}
        onCancel={onCancel}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('calls onFillAndMove with field values when Fill and move is clicked', async () => {
    const onFillAndMove = vi.fn();
    const user = userEvent.setup();

    render(
      <GateFailureModal
        stageName="Negotiation"
        failures={mockFailures}
        onFillAndMove={onFillAndMove}
        onCancel={vi.fn()}
      />,
    );

    const inputs = screen.getAllByRole('textbox');
    await user.type(inputs[0], '50000');
    await user.type(inputs[1], '2026-12-31');

    await user.click(screen.getByRole('button', { name: 'Fill and move' }));
    expect(onFillAndMove).toHaveBeenCalledOnce();
    expect(onFillAndMove).toHaveBeenCalledWith({
      deal_value: '50000',
      close_date: '2026-12-31',
    });
  });

  it('shows loading text when loading prop is true', () => {
    render(
      <GateFailureModal
        stageName="Negotiation"
        failures={mockFailures}
        onFillAndMove={vi.fn()}
        onCancel={vi.fn()}
        loading
      />,
    );

    expect(screen.getByText(/Moving…/)).toBeInTheDocument();
  });

  it('has the modal dialog role', () => {
    render(
      <GateFailureModal
        stageName="Negotiation"
        failures={mockFailures}
        onFillAndMove={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
