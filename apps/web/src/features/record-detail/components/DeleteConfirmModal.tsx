import styles from '../RecordDetailPage.module.css';

interface DeleteConfirmModalProps {
  singularLabel: string;
  recordName: string;
  deleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteConfirmModal({
  singularLabel,
  recordName,
  deleting,
  onConfirm,
  onCancel,
}: DeleteConfirmModalProps) {
  return (
    <div className={styles.deleteOverlay}>
      <div className={styles.deleteModal} role="dialog" aria-label="Confirm deletion">
        <h2 className={styles.deleteModalTitle}>Delete {singularLabel}?</h2>
        <p className={styles.deleteModalText}>
          Are you sure you want to delete &ldquo;{recordName}&rdquo;? This
          action cannot be undone.
        </p>
        <div className={styles.deleteModalActions}>
          <button
            className={styles.btnSecondary}
            type="button"
            onClick={onCancel}
            disabled={deleting}
          >
            Cancel
          </button>
          <button
            className={styles.btnDanger}
            type="button"
            onClick={onConfirm}
            disabled={deleting}
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}
