import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { KanbanFilterBar, EMPTY_FILTERS } from '../components/KanbanFilterBar.js';

describe('KanbanFilterBar', () => {
  it('renders all filter inputs', () => {
    render(
      <KanbanFilterBar
        filters={EMPTY_FILTERS}
        onChange={vi.fn()}
        owners={[]}
      />,
    );

    expect(screen.getByLabelText('Search records')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter by owner')).toBeInTheDocument();
    expect(screen.getByLabelText('Close date from')).toBeInTheDocument();
    expect(screen.getByLabelText('Close date to')).toBeInTheDocument();
    expect(screen.getByLabelText('Minimum value')).toBeInTheDocument();
    expect(screen.getByLabelText('Maximum value')).toBeInTheDocument();
  });

  it('renders owner options', () => {
    render(
      <KanbanFilterBar
        filters={EMPTY_FILTERS}
        onChange={vi.fn()}
        owners={[
          { id: 'user-1', label: 'Alice' },
          { id: 'user-2', label: 'Bob' },
        ]}
      />,
    );

    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('calls onChange when the search input changes', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(
      <KanbanFilterBar
        filters={EMPTY_FILTERS}
        onChange={onChange}
        owners={[]}
      />,
    );

    await user.type(screen.getByLabelText('Search records'), 'A');
    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_FILTERS, search: 'A' });
  });

  it('shows "Clear filters" button when filters are active', () => {
    render(
      <KanbanFilterBar
        filters={{ ...EMPTY_FILTERS, search: 'test' }}
        onChange={vi.fn()}
        owners={[]}
      />,
    );

    expect(screen.getByText('Clear filters')).toBeInTheDocument();
  });

  it('does not show "Clear filters" button when no filters are active', () => {
    render(
      <KanbanFilterBar
        filters={EMPTY_FILTERS}
        onChange={vi.fn()}
        owners={[]}
      />,
    );

    expect(screen.queryByText('Clear filters')).not.toBeInTheDocument();
  });

  it('calls onChange with empty filters when "Clear filters" is clicked', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(
      <KanbanFilterBar
        filters={{ ...EMPTY_FILTERS, search: 'test' }}
        onChange={onChange}
        owners={[]}
      />,
    );

    await user.click(screen.getByText('Clear filters'));
    expect(onChange).toHaveBeenCalledWith(EMPTY_FILTERS);
  });
});
