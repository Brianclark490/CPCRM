import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { BuilderToolbar } from '../../components/BuilderToolbar.js';
import type { RoleLayout } from '../../components/BuilderToolbar.js';
import { VersionHistoryPanel } from '../../components/VersionHistoryPanel.js';
import { CopyLayoutModal } from '../../components/CopyLayoutModal.js';
import { AiPromptModal } from '../../components/AiPromptModal.js';
import { usePageLayout } from './hooks/usePageLayout.js';
import { usePageLayoutDnd } from './hooks/usePageLayoutDnd.js';
import { usePageLayoutActions } from './hooks/usePageLayoutActions.js';
import { LayoutCanvas } from './components/LayoutCanvas.js';
import { PreviewPane } from './components/PreviewPane.js';
import styles from './PageBuilderPage.module.css';

const AI_TOAST_TIMEOUT_MS = 4000;

export function PageBuilderPage() {
  const { objectId } = useParams<{ objectId: string }>();

  const pl = usePageLayout(objectId);

  const dnd = usePageLayoutDnd({
    layout: pl.layout,
    updateLayout: pl.updateLayout,
    registry: pl.registry,
  });

  const actions = usePageLayoutActions({
    objectId,
    layout: pl.layout,
    selectedLayoutId: pl.selectedLayoutId,
    dirty: pl.dirty,
    allLayouts: pl.allLayouts,
    objectLabel: pl.objectDef?.label ?? 'Object',
    setDirty: pl.setDirty,
    setSelectedLayoutId: pl.setSelectedLayoutId,
    setAllLayouts: pl.setAllLayouts,
    loadLayoutDetail: pl.loadLayoutDetail,
  });

  // ── AI prompt stub (#522) ──────────────────────────────────
  // The real LLM contract is being designed in #523; this is purely a UX
  // freeze so everything around the affordance can be built.
  const [showAiPrompt, setShowAiPrompt] = useState(false);
  const [aiToast, setAiToast] = useState<string | null>(null);

  const openAiPrompt = useCallback(() => setShowAiPrompt(true), []);

  useEffect(() => {
    if (!aiToast) return;
    const timer = window.setTimeout(() => setAiToast(null), AI_TOAST_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [aiToast]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setShowAiPrompt(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleAskSubmit = useCallback(
    (prompt: string) => {
      // Real backend lands after the contract spike (#523). For now: log the
      // prompt + current layout JSON so we can sanity-check the affordance,
      // then close the modal and show a coming-soon toast.
      console.info('[AI prompt stub]', {
        prompt,
        layout: pl.layout,
      });
      setShowAiPrompt(false);
      setAiToast('AI editing is coming soon. Your request has been logged.');
    },
    [pl.layout],
  );

  // ── Loading / error states ──────────���──────────────────────

  if (pl.loading) {
    return <div className={styles.page} data-testid="page-builder-loading">Loading&hellip;</div>;
  }

  if (pl.error || !pl.objectDef) {
    return (
      <div className={styles.page}>
        <p role="alert" className={styles.errorAlert}>
          {pl.error ?? 'Object not found.'}
        </p>
      </div>
    );
  }

  if (!pl.layout) {
    return (
      <div className={styles.page}>
        <p>No layout data available.</p>
      </div>
    );
  }

  // ── Derived values ─────────────────────────────────────────

  const allLayoutsForToolbar: RoleLayout[] = pl.allLayouts.map((l) => ({
    id: l.id,
    name: l.name,
    role: l.role,
  }));

  const currentLayoutVersion = pl.allLayouts.find((l) => l.id === pl.selectedLayoutId)?.version ?? 1;

  // ── Render ─────────────────────────────────────────────────

  return (
    <div className={styles.page} data-testid="page-builder">
      <BuilderToolbar
        objectId={objectId!}
        layoutName={pl.layout.name}
        dirty={pl.dirty}
        saving={actions.saving}
        publishing={actions.publishing}
        onSaveDraft={() => void actions.handleSaveDraft()}
        onPublish={() => void actions.handlePublish()}
        onPreview={() => actions.setShowPreview(true)}
        onAsk={openAiPrompt}
        allLayouts={allLayoutsForToolbar}
        selectedLayoutId={pl.selectedLayoutId}
        onRoleChange={(layoutId, role) => void actions.handleRoleChange(layoutId, role)}
        onCopyFrom={() => actions.setShowCopyModal(true)}
        onResetToDefault={() => void actions.handleResetToDefault()}
        onShowHistory={() => void actions.handleShowHistory()}
        usingDefault={actions.usingDefault}
      />

      {actions.saveError && (
        <div className={styles.saveErrorBanner} role="alert" data-testid="save-error-banner">
          <span>{actions.saveError}</span>
          <button
            type="button"
            className={styles.saveErrorDismiss}
            onClick={() => actions.setSaveError(null)}
            aria-label="Dismiss error"
          >
            &times;
          </button>
        </div>
      )}

      <LayoutCanvas
        layout={pl.layout}
        fields={pl.fields}
        relationships={pl.relationships}
        relatedFields={pl.relatedFields}
        registry={pl.registry}
        selectedId={pl.selectedId}
        selectedItem={pl.getSelectedItem()}
        activeDragId={dnd.activeDragId}
        activeZone={pl.activeZone}
        sensors={pl.sensors}
        onSelect={pl.setSelectedId}
        onSelectZone={pl.setActiveZone}
        onHeaderChange={pl.handleHeaderChange}
        onAddTab={pl.handleAddTab}
        onRenameTab={pl.handleRenameTab}
        onRemoveTab={pl.handleRemoveTab}
        onAddSection={pl.handleAddSection}
        onRemoveSection={pl.handleRemoveSection}
        onRenameSection={pl.handleRenameSection}
        onRemoveComponent={pl.handleRemoveComponent}
        onSelectComponent={pl.handleSelectComponent}
        onSelectSection={pl.handleSelectSection}
        onComponentChange={pl.handleComponentChange}
        onComponentVisibilityChange={pl.handleComponentVisibilityChange}
        onSectionChange={pl.handleSectionChange}
        onSectionVisibilityChange={pl.handleSectionVisibilityChange}
        onDragStart={dnd.handleDragStart}
        onDragEnd={dnd.handleDragEnd}
      />

      {actions.showPreview && (
        <PreviewPane
          layout={pl.layout}
          fields={pl.fields}
          objectDef={pl.objectDef}
          onClose={() => actions.setShowPreview(false)}
        />
      )}

      {actions.showHistory && (
        <VersionHistoryPanel
          versions={actions.versions}
          currentVersion={currentLayoutVersion}
          reverting={actions.reverting}
          onRevert={(version) => void actions.handleRevert(version)}
          onClose={() => actions.setShowHistory(false)}
        />
      )}

      {showAiPrompt && (
        <AiPromptModal
          onSubmit={handleAskSubmit}
          onClose={() => setShowAiPrompt(false)}
        />
      )}

      {aiToast && (
        <div
          className={styles.aiToast}
          role="status"
          aria-live="polite"
          data-testid="ai-toast"
        >
          {aiToast}
        </div>
      )}

      {actions.showCopyModal && (
        <CopyLayoutModal
          layouts={allLayoutsForToolbar.map((l) => ({
            id: l.id,
            name: l.name,
            role: l.role,
          }))}
          currentLayoutId={pl.selectedLayoutId ?? ''}
          currentRoleLabel={
            pl.allLayouts.find((l) => l.id === pl.selectedLayoutId)?.role ?? 'Default'
          }
          onCopy={(sourceId) => void actions.handleCopyFrom(sourceId)}
          onClose={() => actions.setShowCopyModal(false)}
        />
      )}
    </div>
  );
}
