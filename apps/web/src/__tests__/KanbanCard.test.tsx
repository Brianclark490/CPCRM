import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { KanbanCard } from '../components/KanbanCard.js';
import type { KanbanCardRecord } from '../components/KanbanCard.js';

function makeRecord(overrides: Partial<KanbanCardRecord> = {}): KanbanCardRecord {
  return {
    id: 'rec-1',
    name: 'Acme Deal',
    value: 50000,
    closeDate: '2026-06-15',
    ownerId: 'user-abc',
    ownerInitials: 'AB',
    stageEnteredAt: '2026-03-01T00:00:00Z',
    expectedDays: 30,
    ...overrides,
  };
}

function renderCard(
  record: KanbanCardRecord = makeRecord(),
  props: { isDragging?: boolean } = {},
) {
  const onDragStart = vi.fn();
  const onDragEnd = vi.fn();

  return {
    onDragStart,
    onDragEnd,
    ...render(
      <MemoryRouter>
        <KanbanCard
          record={record}
          apiName="opportunity"
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          isDragging={props.isDragging ?? false}
        />
      </MemoryRouter>,
    ),
  };
}

describe('KanbanCard', () => {
  it('renders the record name', () => {
    renderCard();
    expect(screen.getByText('Acme Deal')).toBeInTheDocument();
  });

  it('renders the formatted currency value', () => {
    renderCard();
    expect(screen.getByText(/50.*000/)).toBeInTheDocument();
  });

  it('renders the close date', () => {
    renderCard();
    expect(screen.getByText(/Jun/)).toBeInTheDocument();
  });

  it('renders owner initials', () => {
    renderCard();
    expect(screen.getByText('AB')).toBeInTheDocument();
  });

  it('renders days in stage indicator with Day X of Y format', () => {
    renderCard();
    expect(screen.getByText(/Day \d+ of 30/)).toBeInTheDocument();
  });

  it('does not show days indicator when expectedDays is null', () => {
    renderCard(makeRecord({ expectedDays: null }));
    expect(screen.queryByTestId('days-indicator-rec-1')).not.toBeInTheDocument();
  });

  it('does not show days indicator when expectedDays is 0', () => {
    renderCard(makeRecord({ expectedDays: 0 }));
    expect(screen.queryByTestId('days-indicator-rec-1')).not.toBeInTheDocument();
  });

  it('shows overdue badge when close date is past', () => {
    renderCard(makeRecord({ closeDate: '2020-01-01' }));
    expect(screen.getByText('Overdue')).toBeInTheDocument();
  });

  it('does not show overdue badge when close date is in the future', () => {
    renderCard(makeRecord({ closeDate: '2099-12-31' }));
    expect(screen.queryByText('Overdue')).not.toBeInTheDocument();
  });

  it('handles null value gracefully', () => {
    renderCard(makeRecord({ value: null }));
    expect(screen.getByText('Acme Deal')).toBeInTheDocument();
  });

  it('handles null close date gracefully', () => {
    renderCard(makeRecord({ closeDate: null }));
    expect(screen.getByText('Acme Deal')).toBeInTheDocument();
  });

  it('sets draggable attribute', () => {
    renderCard();
    const card = screen.getByTestId('kanban-card-rec-1');
    expect(card).toHaveAttribute('draggable', 'true');
  });
});
