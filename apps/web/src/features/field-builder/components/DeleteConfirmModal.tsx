import { PrimaryButton } from '../../../components/PrimaryButton.js';
import styles from '../FieldBuilderPage.module.css';

interface DeleteConfirmModalProps {
  title: string;
  ariaLabel: string;
  itemLabel: string;
  message: string;
  error: string | null;
  deleting: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function DeleteConfirmModal({
  title,
  ariaLabel,
  itemLabel,
  message,
  error,
  deleting,
  onClose,
  onConfirm,
}: DeleteConfirmModalProps) {
  return (
    <div
      className={styles.overlay}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
    >
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.modalTitle}>{title}</h2>
        <p className={styles.confirmText}>
          {message}{' '}
          <span className={styles.confirmName}>{itemLabel}</span>
          {title === 'Delete field'
            ? '? This will remove the field from all layouts.'
            : ' relationship? This will remove all associated record links.'}
        </p>

        {error && (
          <p className={styles.errorAlert} role="alert">
            {error}
          </p>
        )}

        <div className={styles.actions}>
          <PrimaryButton
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={deleting}
          >
            Cancel
          </PrimaryButton>
          <PrimaryButton
            type="button"
            onClick={onConfirm}
            disabled={deleting}
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}
