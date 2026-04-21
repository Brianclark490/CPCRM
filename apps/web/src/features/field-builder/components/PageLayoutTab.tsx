import { Link } from 'react-router-dom';
import { PrimaryButton } from '../../../components/PrimaryButton.js';
import type { PageLayoutListItem } from '../types.js';
import styles from '../FieldBuilderPage.module.css';

interface PageLayoutTabProps {
  objectId: string;
  pageLayouts: PageLayoutListItem[];
  pageLayoutsLoading: boolean;
  pageLayoutsError: string | null;
  createLayoutError: string | null;
  creatingLayout: boolean;
  onCreateDefaultLayout: () => void;
}

export function PageLayoutTab({
  objectId,
  pageLayouts,
  pageLayoutsLoading,
  pageLayoutsError,
  createLayoutError,
  creatingLayout,
  onCreateDefaultLayout,
}: PageLayoutTabProps) {
  return (
    <div className={styles.pageLayoutTab}>
      <p className={styles.pageLayoutDescription}>
        Configure how record pages look for this object using the page builder.
      </p>

      {pageLayoutsError && (
        <p role="alert" className={styles.errorAlert}>
          {pageLayoutsError}
        </p>
      )}

      {createLayoutError && (
        <p role="alert" className={styles.errorAlert}>
          {createLayoutError}
        </p>
      )}

      {pageLayoutsLoading && <p>Loading page layouts…</p>}

      {!pageLayoutsLoading && !pageLayoutsError && pageLayouts.length === 0 && (
        <div className={styles.emptyState}>
          <h3 className={styles.emptyTitle}>No page layouts yet</h3>
          <p className={styles.emptyText}>
            Create a default layout to start customising how record pages appear.
          </p>
          <PrimaryButton
            size="sm"
            onClick={onCreateDefaultLayout}
            disabled={creatingLayout}
          >
            {creatingLayout ? 'Creating…' : 'Create default layout'}
          </PrimaryButton>
        </div>
      )}

      {!pageLayoutsLoading && pageLayouts.length > 0 && (
        <>
          <div className={styles.tableCard}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.th}>Name</th>
                  <th className={styles.th}>Status</th>
                  <th className={styles.th}>Version</th>
                  <th className={`${styles.th} ${styles.thActions}`}></th>
                </tr>
              </thead>
              <tbody>
                {pageLayouts.map((pl) => (
                  <tr key={pl.id} className={styles.tr}>
                    <td className={styles.td}>
                      <span className={styles.fieldLabel}>{pl.name}</span>
                    </td>
                    <td className={styles.td}>
                      <span className={pl.version > 0 ? styles.requiredBadge : styles.typeBadge}>
                        {pl.version > 0 ? 'Published' : 'Draft'}
                      </span>
                    </td>
                    <td className={styles.td}>{pl.version}</td>
                    <td className={styles.td}>
                      <Link
                        to={`/admin/objects/${objectId}/page-builder`}
                        className={styles.breadcrumbLink}
                        onClick={(e) => e.stopPropagation()}
                      >
                        Edit in page builder →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 'var(--space-4)' }}>
            <Link to={`/admin/objects/${objectId}/page-builder`} className={styles.breadcrumbLink}>
              Open page builder →
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
