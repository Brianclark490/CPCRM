import { useNavigate } from 'react-router-dom';
import styles from './KanbanCard.module.css';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface KanbanCardRecord {
  id: string;
  name: string;
  value: number | null;
  closeDate: string | null;
  ownerId: string;
  ownerInitials: string;
  stageEnteredAt: string | null;
  expectedDays: number | null;
}

interface KanbanCardProps {
  record: KanbanCardRecord;
  apiName: string;
  onDragStart: (recordId: string) => void;
  onDragEnd: () => void;
  isDragging: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function isOverdue(dateStr: string): boolean {
  return new Date(dateStr) < new Date();
}

function getDaysInStage(stageEnteredAt: string): number {
  const entered = new Date(stageEnteredAt);
  const now = new Date();
  return Math.floor((now.getTime() - entered.getTime()) / (1000 * 60 * 60 * 24));
}

function getDaysIndicatorClass(
  daysInStage: number,
  expectedDays: number | null,
): string {
  if (!expectedDays || expectedDays <= 0) return styles.daysGreen;
  const ratio = daysInStage / expectedDays;
  if (ratio > 1) return styles.daysRed;
  if (ratio > 0.75) return styles.daysAmber;
  return styles.daysGreen;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function KanbanCard({
  record,
  apiName,
  onDragStart,
  onDragEnd,
  isDragging,
}: KanbanCardProps) {
  const navigate = useNavigate();

  const daysInStage =
    record.stageEnteredAt ? getDaysInStage(record.stageEnteredAt) : 0;

  const handleNameClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    void navigate(`/objects/${apiName}/${record.id}`);
  };

  return (
    <div
      className={`${styles.card} ${isDragging ? styles.cardDragging : ''}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', record.id);
        onDragStart(record.id);
      }}
      onDragEnd={onDragEnd}
      data-testid={`kanban-card-${record.id}`}
    >
      <div
        className={styles.cardName}
        onClick={handleNameClick}
        role="link"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleNameClick(e as unknown as React.MouseEvent);
        }}
      >
        {record.name}
      </div>

      <div className={styles.cardRow}>
        {record.value !== null && (
          <span className={styles.cardValue}>${formatCurrency(record.value)}</span>
        )}
        {record.closeDate && (
          <span className={styles.cardDate}>
            {formatDate(record.closeDate)}
            {isOverdue(record.closeDate) && (
              <span className={styles.overdueBadge}>Overdue</span>
            )}
          </span>
        )}
      </div>

      <div className={styles.cardFooter}>
        <span className={styles.ownerAvatar} title={record.ownerId}>
          {record.ownerInitials}
        </span>
        <span
          className={`${styles.daysIndicator} ${getDaysIndicatorClass(daysInStage, record.expectedDays)}`}
        >
          {daysInStage}d
        </span>
      </div>
    </div>
  );
}
