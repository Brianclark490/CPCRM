import { useNavigate } from 'react-router-dom';
import { useTenantLocale } from '../useTenantLocale.js';
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

function isOverdue(dateStr: string): boolean {
  return new Date(dateStr) < new Date();
}

function getDaysInStage(stageEnteredAt: string): number {
  const entered = new Date(stageEnteredAt);
  const now = new Date();
  return Math.floor((now.getTime() - entered.getTime()) / (1000 * 60 * 60 * 24));
}

export function getDaysIndicatorClass(
  daysInStage: number,
  expectedDays: number | null,
  styleMap: Record<string, string> = styles,
): string {
  if (!expectedDays || expectedDays <= 0) return styleMap.daysDefault;
  const ratio = daysInStage / expectedDays;
  if (ratio > 1) return styleMap.daysRed;
  if (ratio > 0.75) return styleMap.daysAmber;
  return styleMap.daysDefault;
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
  const { formatCurrencyCompact, formatDate } = useTenantLocale();

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
          <span className={styles.cardValue}>{formatCurrencyCompact(record.value)}</span>
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
        {record.expectedDays != null && record.expectedDays > 0 && (
          <span
            className={`${styles.daysIndicator} ${getDaysIndicatorClass(daysInStage, record.expectedDays)}`}
            data-testid={`days-indicator-${record.id}`}
          >
            Day {daysInStage} of {record.expectedDays}
          </span>
        )}
      </div>
    </div>
  );
}
