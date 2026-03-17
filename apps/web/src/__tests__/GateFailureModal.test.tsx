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
    fieldType: 'currency',
    currentValue: null,
    options: {},
  },
  {
    field: 'close_date',
    label: 'Close Date',
    gate: 'required',
    message: 'Close Date is required',
    fieldType: 'date',
    currentValue: null,
    options: {},
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

    expect(screen.getByText(/Complete these fields to move to Negotiation/)).toBeInTheDocument();
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

  it('renders the correct input type for each failure field', () => {
    render(
      <GateFailureModal
        stageName="Negotiation"
        failures={mockFailures}
        onFillAndMove={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    // currency field renders as number input
    const currencyInput = document.getElementById('gate-deal_value') as HTMLInputElement;
    expect(currencyInput).toBeInTheDocument();
    expect(currencyInput.type).toBe('number');

    // date field renders as date input
    const dateInput = document.getElementById('gate-close_date') as HTMLInputElement;
    expect(dateInput).toBeInTheDocument();
    expect(dateInput.type).toBe('date');
  });

  it('pre-populates with current values when provided', () => {
    const failuresWithValues: GateFailure[] = [
      {
        field: 'deal_value',
        label: 'Deal Value',
        gate: 'min_value',
        message: 'Must be at least £1,000',
        fieldType: 'currency',
        currentValue: 500,
        options: {},
      },
    ];

    render(
      <GateFailureModal
        stageName="Negotiation"
        failures={failuresWithValues}
        onFillAndMove={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const input = document.getElementById('gate-deal_value') as HTMLInputElement;
    expect(input.value).toBe('500');
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

  it('calls onFillAndMove with field values when Save and move is clicked', async () => {
    const onFillAndMove = vi.fn();
    const user = userEvent.setup();

    const textFailures: GateFailure[] = [
      {
        field: 'deal_value',
        label: 'Deal Value',
        gate: 'required',
        message: 'Deal Value is required',
        fieldType: 'text',
        currentValue: null,
        options: {},
      },
      {
        field: 'close_date',
        label: 'Close Date',
        gate: 'required',
        message: 'Close Date is required',
        fieldType: 'text',
        currentValue: null,
        options: {},
      },
    ];

    render(
      <GateFailureModal
        stageName="Negotiation"
        failures={textFailures}
        onFillAndMove={onFillAndMove}
        onCancel={vi.fn()}
      />,
    );

    const inputs = screen.getAllByRole('textbox');
    await user.type(inputs[0], '50000');
    await user.type(inputs[1], '2026-12-31');

    await user.click(screen.getByRole('button', { name: 'Save and move' }));
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

    expect(screen.getByText(/Saving…/)).toBeInTheDocument();
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

  it('calls onCancel when Escape key is pressed', async () => {
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

    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('shows validation errors when submitting empty required fields', async () => {
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

    await user.click(screen.getByRole('button', { name: 'Save and move' }));

    // Should not call onFillAndMove when validation fails
    expect(onFillAndMove).not.toHaveBeenCalled();
  });

  it('renders with fallback text fieldType when fieldType is not provided', () => {
    const legacyFailures: GateFailure[] = [
      {
        field: 'name',
        label: 'Name',
        gate: 'required',
        message: 'Name is required',
      },
    ];

    render(
      <GateFailureModal
        stageName="Qualification"
        failures={legacyFailures}
        onFillAndMove={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    // Falls back to text input
    const input = document.getElementById('gate-name') as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.type).toBe('text');
  });

  it('renders dropdown field type with choices', () => {
    const dropdownFailures: GateFailure[] = [
      {
        field: 'priority',
        label: 'Priority',
        gate: 'required',
        message: 'Priority is required',
        fieldType: 'dropdown',
        currentValue: null,
        options: { choices: ['Low', 'Medium', 'High'] },
      },
    ];

    render(
      <GateFailureModal
        stageName="Qualification"
        failures={dropdownFailures}
        onFillAndMove={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const select = screen.getByRole('combobox');
    expect(select).toBeInTheDocument();
    expect(screen.getByText('Low')).toBeInTheDocument();
    expect(screen.getByText('Medium')).toBeInTheDocument();
    expect(screen.getByText('High')).toBeInTheDocument();
  });
});
