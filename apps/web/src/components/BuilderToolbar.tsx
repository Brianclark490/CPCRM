import { Link } from 'react-router-dom';
import { PrimaryButton } from './PrimaryButton.js';
import styles from './BuilderToolbar.module.css';

export interface RoleLayout {
  id: string;
  name: string;
  role: string | null;
}

interface BuilderToolbarProps {
  objectId: string;
  layoutName: string;
  dirty: boolean;
  saving: boolean;
  publishing: boolean;
  onSaveDraft: () => void;
  onPublish: () => void;
  onPreview: () => void;
  /** Open the AI prompt modal. Stub for natural-language editing (#522). */
  onAsk?: () => void;
  /** Role-based layout support */
  allLayouts?: RoleLayout[];
  selectedLayoutId?: string | null;
  onRoleChange?: (layoutId: string | null, role: string | null) => void;
  onCopyFrom?: () => void;
  onResetToDefault?: () => void;
  onShowHistory?: () => void;
  usingDefault?: boolean;
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
  onAsk,
  allLayouts,
  selectedLayoutId,
  onRoleChange,
  onCopyFrom,
  onResetToDefault,
  onShowHistory,
  usingDefault,
}: BuilderToolbarProps) {
  const roles = ['Admin', 'Manager', 'User', 'Read Only'];

  const handleRoleSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    if (!onRoleChange) return;

    if (value === '__default__') {
      // Select the default layout (role = null)
      const defaultLayout = allLayouts?.find((l) => l.role === null);
      onRoleChange(defaultLayout?.id ?? null, null);
    } else {
      // Select or create a role-specific layout
      const roleLayout = allLayouts?.find((l) => l.role === value);
      onRoleChange(roleLayout?.id ?? null, value);
    }
  };

  const currentRole = allLayouts?.find((l) => l.id === selectedLayoutId)?.role ?? null;

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
        {usingDefault && (
          <span className={styles.defaultFallbackBadge} data-testid="using-default-badge">
            (no layout — using default)
          </span>
        )}
      </div>

      <div className={styles.center}>
        {allLayouts && onRoleChange && (
          <div className={styles.roleSelector} data-testid="role-selector">
            <label className={styles.roleSelectorLabel} htmlFor="role-select">Layout for:</label>
            <select
              id="role-select"
              className={styles.roleSelectorSelect}
              value={currentRole ?? '__default__'}
              onChange={handleRoleSelect}
              data-testid="role-select"
            >
              <option value="__default__">Default (all roles)</option>
              {roles.map((role) => (
                <option key={role} value={role}>{role}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className={styles.right}>
        {onShowHistory && (
          <PrimaryButton
            variant="ghost"
            size="sm"
            onClick={onShowHistory}
            data-testid="history-button"
          >
            History
          </PrimaryButton>
        )}
        {onCopyFrom && allLayouts && allLayouts.length > 1 && (
          <PrimaryButton
            variant="ghost"
            size="sm"
            onClick={onCopyFrom}
            data-testid="copy-from-button"
          >
            Copy from…
          </PrimaryButton>
        )}
        {onResetToDefault && currentRole !== null && (
          <PrimaryButton
            variant="ghost"
            size="sm"
            onClick={onResetToDefault}
            data-testid="reset-to-default-button"
          >
            Reset to default
          </PrimaryButton>
        )}
        {onAsk && (
          <PrimaryButton
            variant="ghost"
            size="sm"
            onClick={onAsk}
            data-testid="ask-button"
            aria-keyshortcuts="Control+K Meta+K"
          >
            <span aria-hidden="true">✨</span> Ask
          </PrimaryButton>
        )}
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
