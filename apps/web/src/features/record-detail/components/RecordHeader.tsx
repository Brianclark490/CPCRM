import styles from '../RecordDetailPage.module.css';

interface RecordHeaderProps {
  pluralLabel: string;
  recordName: string;
  lastUpdated: string;
  editing: boolean;
  isLead: boolean;
  isConverted: boolean;
  onNavigateToList: () => void;
  onEditClick: () => void;
  onDeleteClick: () => void;
  onConvertClick: () => void;
}

export function RecordHeader({
  pluralLabel,
  recordName,
  lastUpdated,
  editing,
  isLead,
  isConverted,
  onNavigateToList,
  onEditClick,
  onDeleteClick,
  onConvertClick,
}: RecordHeaderProps) {
  return (
    <div className={styles.pageHeader}>
      <div className={styles.headerLeft}>
        <nav className={styles.breadcrumb} aria-label="Breadcrumb">
          <button
            className={styles.breadcrumbLink}
            onClick={onNavigateToList}
            type="button"
          >
            {pluralLabel}
          </button>
          <span className={styles.breadcrumbSeparator} aria-hidden="true">›</span>
          <span className={styles.breadcrumbCurrent}>{recordName}</span>
        </nav>
        <h1 className={styles.pageTitle}>{recordName}</h1>
        <p className={styles.pageSubtitle}>
          Last updated {lastUpdated}
        </p>
      </div>

      {!editing && (
        <div className={styles.headerActions}>
          {isLead && !isConverted && (
            <button
              className={styles.btnConvert}
              type="button"
              onClick={onConvertClick}
            >
              Convert Lead
            </button>
          )}
          {!isConverted && (
            <>
              <button
                className={styles.btnPrimary}
                type="button"
                onClick={onEditClick}
              >
                Edit
              </button>
              <button
                className={styles.btnDanger}
                type="button"
                onClick={onDeleteClick}
              >
                Delete
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
