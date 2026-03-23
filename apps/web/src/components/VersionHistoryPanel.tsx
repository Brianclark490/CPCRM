import styles from './VersionHistoryPanel.module.css';

export interface VersionEntry {
  id: string;
  layoutId: string;
  version: number;
  publishedBy: string | null;
  publishedAt: string;
}

interface VersionHistoryPanelProps {
  versions: VersionEntry[];
  currentVersion: number;
  reverting: boolean;
  onRevert: (version: number) => void;
  onClose: () => void;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

export function VersionHistoryPanel({
  versions,
  currentVersion,
  reverting,
  onRevert,
  onClose,
}: VersionHistoryPanelProps) {
  return (
    <div
      className={styles.overlay}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Version history"
      data-testid="version-history-panel"
    >
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>Version history</h2>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close version history"
            data-testid="version-history-close"
          >
            ×
          </button>
        </div>

        <div className={styles.body}>
          {versions.length === 0 ? (
            <p className={styles.empty}>No published versions yet.</p>
          ) : (
            <ul className={styles.versionList}>
              {versions.map((v) => (
                <li key={v.id} className={styles.versionItem} data-testid={`version-item-${v.version}`}>
                  <div className={styles.versionInfo}>
                    <span className={styles.versionLabel}>
                      v{v.version}
                      {v.version === currentVersion && (
                        <span className={styles.currentBadge}>current</span>
                      )}
                    </span>
                    <span className={styles.versionDate}>
                      Published {formatDate(v.publishedAt)}
                      {v.publishedBy ? ` by ${v.publishedBy}` : ''}
                    </span>
                  </div>
                  {v.version !== currentVersion && (
                    <button
                      type="button"
                      className={styles.revertBtn}
                      disabled={reverting}
                      onClick={() => onRevert(v.version)}
                      data-testid={`revert-to-v${v.version}`}
                    >
                      Revert to v{v.version}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
