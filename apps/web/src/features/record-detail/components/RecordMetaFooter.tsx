import { Link } from 'react-router-dom';
import { getInitials } from '../helpers.js';
import type { RecordDetail } from '../types.js';
import styles from '../RecordDetailPage.module.css';

interface RecordMetaFooterProps {
  record: RecordDetail;
  formatDate: (date: string) => string;
  formatRelativeTime: (date: string) => string;
}

export function RecordMetaFooter({
  record,
  formatDate,
  formatRelativeTime,
}: RecordMetaFooterProps) {
  return (
    <div className={styles.metaRow}>
      <div className={styles.metaItem}>
        <span className={styles.metaLabel}>Owner</span>
        <span className={styles.metaValue}>
          {record.ownerName ? (
            record.ownerRecordId ? (
              <Link to={`/objects/user/${record.ownerRecordId}`} className={styles.avatarChipLink}>
                <span className={styles.avatarInitials}>{getInitials(record.ownerName)}</span>
                {record.ownerName}
              </Link>
            ) : (
              <span className={styles.avatarChip}>
                <span className={styles.avatarInitials}>{getInitials(record.ownerName)}</span>
                {record.ownerName}
              </span>
            )
          ) : '—'}
        </span>
      </div>
      <div className={styles.metaItem}>
        <span className={styles.metaLabel}>Last modified</span>
        <span className={styles.metaValue}>
          {record.updatedByName ? (
            record.updatedByRecordId ? (
              <Link to={`/objects/user/${record.updatedByRecordId}`} className={styles.avatarChipLink}>
                <span className={styles.avatarInitials}>{getInitials(record.updatedByName)}</span>
                {record.updatedByName}
              </Link>
            ) : (
              <span className={styles.avatarChip}>
                <span className={styles.avatarInitials}>{getInitials(record.updatedByName)}</span>
                {record.updatedByName}
              </span>
            )
          ) : null}
          {record.updatedByName ? ' · ' : ''}{formatRelativeTime(record.updatedAt)}
        </span>
      </div>
      <div className={styles.metaItem}>
        <span className={styles.metaLabel}>Created</span>
        <span className={styles.metaValue}>
          {formatDate(record.createdAt)}
        </span>
      </div>
    </div>
  );
}
