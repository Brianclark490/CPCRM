import { useState } from 'react';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type {
  BuilderLayout,
  BuilderSection,
  FieldRef,
  ComponentDefinition,
} from './builderTypes.js';
import { HeaderZoneEditor } from './HeaderZoneEditor.js';
import { DroppableSection } from './DroppableSection.js';
import type { HeaderConfig } from './layoutTypes.js';
import styles from './BuilderCanvas.module.css';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BuilderCanvasProps {
  layout: BuilderLayout;
  fields: FieldRef[];
  registry: ComponentDefinition[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onHeaderChange: (header: HeaderConfig) => void;
  onAddTab: () => void;
  onRenameTab: (tabId: string, label: string) => void;
  onRemoveTab: (tabId: string) => void;
  onAddSection: (tabId: string, columns: number) => void;
  onRemoveSection: (sectionId: string) => void;
  onRenameSection: (sectionId: string, label: string) => void;
  onRemoveComponent: (sectionId: string, componentId: string) => void;
  onSelectComponent: (componentId: string) => void;
  onSelectSection: (sectionId: string) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function BuilderCanvas({
  layout,
  fields,
  registry,
  selectedId,
  onSelect,
  onHeaderChange,
  onAddTab,
  onRenameTab,
  onRemoveTab,
  onAddSection,
  onRemoveSection,
  onRenameSection,
  onRemoveComponent,
  onSelectComponent,
  onSelectSection,
}: BuilderCanvasProps) {
  const [activeTabId, setActiveTabId] = useState(layout.tabs[0]?.id ?? '');
  const activeTab = layout.tabs.find((t) => t.id === activeTabId) ?? layout.tabs[0];

  // Keep a local rename state for tabs
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const sectionSortableIds = (activeTab?.sections ?? []).map(
    (s: BuilderSection) => `section-${s.id}`,
  );

  return (
    <div
      className={styles.canvas}
      data-testid="builder-canvas"
      onClick={() => onSelect(null)}
    >
      {/* Header zone */}
      <HeaderZoneEditor
        header={layout.header}
        fields={fields}
        onChange={onHeaderChange}
      />

      {/* Tab bar */}
      <div className={styles.tabBar} data-testid="builder-tab-bar">
        {layout.tabs.map((tab) => (
          <div
            key={tab.id}
            className={`${styles.tab} ${tab.id === activeTabId ? styles.tabActive : ''}`}
          >
            {renamingTabId === tab.id ? (
              <input
                className={styles.tabInput}
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={() => {
                  if (renameValue.trim()) {
                    onRenameTab(tab.id, renameValue.trim());
                  }
                  setRenamingTabId(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    if (renameValue.trim()) {
                      onRenameTab(tab.id, renameValue.trim());
                    }
                    setRenamingTabId(null);
                  }
                  if (e.key === 'Escape') {
                    setRenamingTabId(null);
                  }
                }}
                autoFocus
                aria-label="Tab name"
              />
            ) : (
              <button
                className={styles.tabButton}
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveTabId(tab.id);
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  setRenamingTabId(tab.id);
                  setRenameValue(tab.label);
                }}
              >
                {tab.label}
              </button>
            )}
            {layout.tabs.length > 1 && (
              <button
                type="button"
                className={styles.tabRemove}
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveTab(tab.id);
                  if (activeTabId === tab.id) {
                    const remaining = layout.tabs.filter((t) => t.id !== tab.id);
                    if (remaining.length > 0) setActiveTabId(remaining[0].id);
                  }
                }}
                aria-label={`Remove tab ${tab.label}`}
              >
                ×
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          className={styles.addTab}
          onClick={(e) => {
            e.stopPropagation();
            onAddTab();
          }}
          aria-label="Add tab"
          data-testid="add-tab-button"
        >
          +
        </button>
      </div>

      {/* Sections */}
      {activeTab && (
        <div className={styles.sections}>
          <SortableContext items={sectionSortableIds} strategy={verticalListSortingStrategy}>
            {activeTab.sections.map((section: BuilderSection) => (
              <DroppableSection
                key={section.id}
                section={section}
                fields={fields}
                registry={registry}
                selectedId={selectedId}
                onSelectComponent={onSelectComponent}
                onSelectSection={onSelectSection}
                onRemoveComponent={onRemoveComponent}
                onRemoveSection={onRemoveSection}
                onRenameSection={onRenameSection}
              />
            ))}
          </SortableContext>

          <div className={styles.addSectionRow}>
            <button
              type="button"
              className={styles.addSectionBtn}
              onClick={(e) => {
                e.stopPropagation();
                onAddSection(activeTab.id, 1);
              }}
              data-testid="add-section-1col"
            >
              + 1-column section
            </button>
            <button
              type="button"
              className={styles.addSectionBtn}
              onClick={(e) => {
                e.stopPropagation();
                onAddSection(activeTab.id, 2);
              }}
              data-testid="add-section-2col"
            >
              + 2-column section
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
