import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { KanbanCard, getDaysIndicatorClass } from '../components/KanbanCard.js';
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
    accountName: null,
    accountId: null,
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
    expect(screen.getByText(/£50K/)).toBeInTheDocument();
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

// ─── getDaysIndicatorClass unit tests (timeline colours) ───────────────────

describe('getDaysIndicatorClass', () => {
  const mockStyles = { daysDefault: 'default', daysAmber: 'amber', daysRed: 'red' };

  it('returns default class when expectedDays is null', () => {
    expect(getDaysIndicatorClass(5, null, mockStyles)).toBe('default');
  });

  it('returns default class when expectedDays is 0', () => {
    expect(getDaysIndicatorClass(5, 0, mockStyles)).toBe('default');
  });

  it('returns default class when days in stage is well under expected', () => {
    // 5 out of 30 = 17% — should be default (green)
    expect(getDaysIndicatorClass(5, 30, mockStyles)).toBe('default');
  });

  it('returns amber class when days in stage is 76-100% of expected', () => {
    // 24 out of 30 = 80% — should be amber
    expect(getDaysIndicatorClass(24, 30, mockStyles)).toBe('amber');
  });

  it('returns red class when days exceed expected', () => {
    // 35 out of 30 = 117% — should be red (overdue)
    expect(getDaysIndicatorClass(35, 30, mockStyles)).toBe('red');
  });

  it('returns default class at exactly 75% threshold', () => {
    // Exactly 75% — not > 0.75 so should be default
    expect(getDaysIndicatorClass(75, 100, mockStyles)).toBe('default');
  });

  it('returns amber class just above 75% threshold', () => {
    // 76% — > 0.75 so should be amber
    expect(getDaysIndicatorClass(76, 100, mockStyles)).toBe('amber');
  });

  it('returns amber class at exactly 100% threshold', () => {
    // Exactly 100% — not > 1 so should be amber
    expect(getDaysIndicatorClass(100, 100, mockStyles)).toBe('amber');
  });

  it('returns red class just above 100% threshold', () => {
    // 101% — > 1 so should be red
    expect(getDaysIndicatorClass(101, 100, mockStyles)).toBe('red');
  });
});
