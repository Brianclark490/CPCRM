import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { OverdueDealsPanel } from '../components/OverdueDealsPanel.js';
import type { OverdueRecord } from '../components/OverdueDealsPanel.js';

const mockOverdueRecords: OverdueRecord[] = [
  {
    id: 'rec-1',
    name: 'Stalled Deal',
    value: 50000,
    daysInStage: 20,
    expectedDays: 14,
    stageName: 'Prospecting',
    ownerId: 'user-1',
  },
  {
    id: 'rec-2',
    name: 'Another Stalled Deal',
    value: null,
    daysInStage: 30,
    expectedDays: 21,
    stageName: 'Qualification',
    ownerId: 'user-2',
  },
];

function renderPanel(records: OverdueRecord[] = mockOverdueRecords) {
  return render(
    <MemoryRouter>
      <OverdueDealsPanel records={records} apiName="opportunity" />
    </MemoryRouter>,
  );
}

describe('OverdueDealsPanel', () => {
  it('renders nothing when there are no overdue records', () => {
    renderPanel([]);
    expect(screen.queryByTestId('overdue-deals-panel')).not.toBeInTheDocument();
  });

  it('renders the panel with overdue badge', () => {
    renderPanel();
    expect(screen.getByTestId('overdue-deals-panel')).toBeInTheDocument();
    expect(screen.getByTestId('overdue-badge')).toHaveTextContent('2 overdue');
  });

  it('starts collapsed (list not visible)', () => {
    renderPanel();
    expect(screen.queryByTestId('overdue-deals-list')).not.toBeInTheDocument();
  });

  it('expands to show overdue records when header is clicked', () => {
    renderPanel();
    const header = screen.getByRole('button');
    fireEvent.click(header);

    expect(screen.getByTestId('overdue-deals-list')).toBeInTheDocument();
    expect(screen.getByText('Stalled Deal')).toBeInTheDocument();
    expect(screen.getByText('Another Stalled Deal')).toBeInTheDocument();
  });

  it('shows days in stage and expected days for each item', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button'));

    expect(screen.getByText(/Day 20 of 14/)).toBeInTheDocument();
    expect(screen.getByText(/Day 30 of 21/)).toBeInTheDocument();
  });

  it('shows formatted value when value is not null', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button'));

    expect(screen.getByText(/£50K/)).toBeInTheDocument();
  });

  it('shows overdue days count', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button'));

    expect(screen.getByText('+6d overdue')).toBeInTheDocument();
    expect(screen.getByText('+9d overdue')).toBeInTheDocument();
  });

  it('collapses when clicked again', () => {
    renderPanel();
    const header = screen.getByRole('button');
    fireEvent.click(header);
    expect(screen.getByTestId('overdue-deals-list')).toBeInTheDocument();
    
    fireEvent.click(header);
    expect(screen.queryByTestId('overdue-deals-list')).not.toBeInTheDocument();
  });
});
