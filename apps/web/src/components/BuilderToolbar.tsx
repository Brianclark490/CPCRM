import { Link } from 'react-router-dom';
import { PrimaryButton } from './PrimaryButton.js';
import styles from './BuilderToolbar.module.css';

interface BuilderToolbarProps {
  objectId: string;
  layoutName: string;
  dirty: boolean;
  saving: boolean;
  publishing: boolean;
  onSaveDraft: () => void;
  onPublish: () => void;
  onPreview: () => void;
}

export function BuilderToolbar({
  objectId,
  layoutName,
  dirty,
  saving,
  publishing,
  onSaveDraft,
  onPublish,
  onPreview,
}: BuilderToolbarProps) {
  return (
    <div className={styles.toolbar} data-testid="builder-toolbar">
      <div className={styles.left}>
        <Link
          to={`/admin/objects/${objectId}`}
          className={styles.backLink}
          data-testid="back-to-object"
        >
          ← Back to object
        </Link>
        <span className={styles.layoutName}>{layoutName}</span>
        {dirty && <span className={styles.dirtyBadge}>Unsaved</span>}
      </div>

      <div className={styles.right}>
        <PrimaryButton
          variant="ghost"
          size="sm"
          onClick={onPreview}
          data-testid="preview-button"
        >
          Preview
        </PrimaryButton>
        <PrimaryButton
          variant="outline"
          size="sm"
          onClick={onSaveDraft}
          disabled={saving || !dirty}
          data-testid="save-draft-button"
        >
          {saving ? 'Saving…' : 'Save draft'}
        </PrimaryButton>
        <PrimaryButton
          size="sm"
          onClick={onPublish}
          disabled={publishing}
          data-testid="publish-button"
        >
          {publishing ? 'Publishing…' : 'Publish'}
        </PrimaryButton>
      </div>
    </div>
  );
}
