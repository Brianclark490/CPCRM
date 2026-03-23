import { useState } from 'react';
import { PrimaryButton } from './PrimaryButton.js';
import styles from './CopyLayoutModal.module.css';

export interface LayoutOption {
  id: string;
  name: string;
  role: string | null;
}

interface CopyLayoutModalProps {
  layouts: LayoutOption[];
  currentLayoutId: string;
  currentRoleLabel: string;
  onCopy: (sourceLayoutId: string) => void;
  onClose: () => void;
}

function roleDisplayLabel(role: string | null): string {
  return role ?? 'Default (all roles)';
}

export function CopyLayoutModal({
  layouts,
  currentLayoutId,
  currentRoleLabel,
  onCopy,
  onClose,
}: CopyLayoutModalProps) {
  const available = layouts.filter((l) => l.id !== currentLayoutId);
  const [sourceId, setSourceId] = useState(available[0]?.id ?? '');

  return (
    <div
      className={styles.overlay}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Copy layout"
      data-testid="copy-layout-modal"
    >
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>Copy layout from…</h2>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close copy modal"
          >
            ×
          </button>
        </div>

        <div className={styles.body}>
          <label className={styles.label} htmlFor="copy-source-select">
            Copy layout from:
          </label>
          <select
            id="copy-source-select"
            className={styles.select}
            value={sourceId}
            onChange={(e) => setSourceId(e.target.value)}
            data-testid="copy-source-select"
          >
            {available.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} ({roleDisplayLabel(l.role)})
              </option>
            ))}
          </select>
          <p className={styles.warning}>
            This will replace the current draft for {currentRoleLabel}.
          </p>
        </div>

        <div className={styles.footer}>
          <PrimaryButton
            variant="ghost"
            size="sm"
            onClick={onClose}
            data-testid="copy-cancel-button"
          >
            Cancel
          </PrimaryButton>
          <PrimaryButton
            size="sm"
            onClick={() => onCopy(sourceId)}
            disabled={!sourceId}
            data-testid="copy-confirm-button"
          >
            Copy
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}
