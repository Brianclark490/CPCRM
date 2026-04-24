import { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type {
  BuilderLayout,
  BuilderComponent,
  BuilderSection,
  FieldRef,
  RelationshipRef,
  ComponentDefinition,
  LayoutZone,
} from './builderTypes.js';
import { HeaderZoneEditor } from './HeaderZoneEditor.js';
import { DroppableSection } from './DroppableSection.js';
import { DraggableComponent } from './DraggableComponent.js';
import type { HeaderConfig } from './layoutTypes.js';
import styles from './BuilderCanvas.module.css';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DroppableTabProps {
  tabId: string;
  isActive: boolean;
  children: React.ReactNode;
}

function DroppableTab({ tabId, isActive, children }: DroppableTabProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `tab-drop-${tabId}`,
    data: { origin: 'tab-drop-target', tabId },
  });

  return (
    <div
      ref={setNodeRef}
      className={`${styles.tab} ${isActive ? styles.tabActive : ''} ${isOver ? styles.tabDropOver : ''}`}
      data-testid={`builder-tab-${tabId}`}
    >
      {children}
    </div>
  );
}

// Drop target wrapping a whole zone (KPI strip, left/right rail).
interface ZoneDropRegionProps {
  zone: Extract<LayoutZone, 'kpi' | 'leftRail' | 'rightRail'>;
  label: string;
  isActive: boolean;
  isEmpty: boolean;
  emptyHint: string;
  onActivate: () => void;
  children: React.ReactNode;
}

function ZoneDropRegion({
  zone,
  label,
  isActive,
  isEmpty,
  emptyHint,
  onActivate,
  children,
}: ZoneDropRegionProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `zone-drop-${zone}`,
    data: { origin: 'zone', zone },
  });

  return (
    <section
      ref={setNodeRef}
      className={[
        styles.zone,
        isActive ? styles.zoneActive : '',
        isOver ? styles.zoneOver : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-testid={`zone-${zone}`}
      data-zone-active={isActive ? 'true' : 'false'}
      onClick={(e) => {
        e.stopPropagation();
        onActivate();
      }}
    >
      <header className={styles.zoneHeader}>
        <span className={styles.zoneLabel}>{label}</span>
      </header>
      <div className={styles.zoneBody}>
        {isEmpty ? (
          <div className={styles.zoneEmpty} data-testid={`zone-empty-${zone}`}>
            {emptyHint}
          </div>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

interface AddSectionDropZoneProps {
  tabId: string;
  columns: number;
  label: string;
  testId: string;
  onClick: () => void;
}

function AddSectionDropZone({ tabId, columns, label, testId, onClick }: AddSectionDropZoneProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `add-section-${tabId}-${columns}`,
    data: { origin: 'new-section', tabId, columns },
  });

  return (
    <button
      ref={setNodeRef}
      type="button"
      className={`${styles.addSectionBtn} ${isOver ? styles.addSectionBtnOver : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      data-testid={testId}
    >
      {label}
    </button>
  );
}

interface BuilderCanvasProps {
  layout: BuilderLayout;
  fields: FieldRef[];
  relationships: RelationshipRef[];
  registry: ComponentDefinition[];
  selectedId: string | null;
  activeZone: LayoutZone;
  onSelect: (id: string | null) => void;
  onSelectZone: (zone: LayoutZone) => void;
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
  relationships,
  registry,
  selectedId,
  activeZone,
  onSelect,
  onSelectZone,
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
  const zones = layout.zones;

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

      {/* KPI strip zone */}
      <ZoneDropRegion
        zone="kpi"
        label="KPI Strip"
        isActive={activeZone === 'kpi'}
        isEmpty={zones.kpi.length === 0}
        emptyHint="Drop a metric here"
        onActivate={() => onSelectZone('kpi')}
      >
        <div className={styles.kpiStrip}>
          {zones.kpi.map((comp: BuilderComponent) => (
            <DraggableComponent
              key={comp.id}
              component={comp}
              sectionId=""
              fields={fields}
              relationships={relationships}
              registry={registry}
              isSelected={selectedId === comp.id}
              onSelect={() => onSelectComponent(comp.id)}
              onRemove={() => onRemoveComponent('', comp.id)}
            />
          ))}
        </div>
      </ZoneDropRegion>

      {/* Three-column body: leftRail · main · rightRail */}
      <div className={styles.zonedBody}>
        <ZoneDropRegion
          zone="leftRail"
          label="Left Rail"
          isActive={activeZone === 'leftRail'}
          isEmpty={zones.leftRail.length === 0}
          emptyHint="Drop a panel here"
          onActivate={() => onSelectZone('leftRail')}
        >
          {zones.leftRail.map((section: BuilderSection) => (
            <DroppableSection
              key={section.id}
              section={section}
              fields={fields}
              relationships={relationships}
              registry={registry}
              selectedId={selectedId}
              onSelectComponent={onSelectComponent}
              onSelectSection={onSelectSection}
              onRemoveComponent={onRemoveComponent}
              onRemoveSection={onRemoveSection}
              onRenameSection={onRenameSection}
            />
          ))}
        </ZoneDropRegion>

        <div
          className={`${styles.mainZone} ${activeZone === 'main' ? styles.zoneActive : ''}`}
          data-testid="zone-main"
          data-zone-active={activeZone === 'main' ? 'true' : 'false'}
          onClick={(e) => {
            // Clicking blank space in the main zone clears selection and
            // activates it so the palette re-filters to main-zone components.
            e.stopPropagation();
            onSelect(null);
            onSelectZone('main');
          }}
        >
          {/* Tab bar */}
          <div className={styles.tabBar} data-testid="builder-tab-bar">
        {layout.tabs.map((tab) => (
          <DroppableTab
            key={tab.id}
            tabId={tab.id}
            isActive={tab.id === activeTabId}
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
          </DroppableTab>
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
                relationships={relationships}
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
            <AddSectionDropZone
              tabId={activeTab.id}
              columns={1}
              label="+ 1-column section"
              testId="add-section-1col"
              onClick={() => onAddSection(activeTab.id, 1)}
            />
            <AddSectionDropZone
              tabId={activeTab.id}
              columns={2}
              label="+ 2-column section"
              testId="add-section-2col"
              onClick={() => onAddSection(activeTab.id, 2)}
            />
          </div>
        </div>
      )}
        </div>

        <ZoneDropRegion
          zone="rightRail"
          label="Right Rail"
          isActive={activeZone === 'rightRail'}
          isEmpty={zones.rightRail.length === 0}
          emptyHint="Drop a panel here"
          onActivate={() => onSelectZone('rightRail')}
        >
          {zones.rightRail.map((section: BuilderSection) => (
            <DroppableSection
              key={section.id}
              section={section}
              fields={fields}
              relationships={relationships}
              registry={registry}
              selectedId={selectedId}
              onSelectComponent={onSelectComponent}
              onSelectSection={onSelectSection}
              onRemoveComponent={onRemoveComponent}
              onRemoveSection={onRemoveSection}
              onRenameSection={onRenameSection}
            />
          ))}
        </ZoneDropRegion>
      </div>
    </div>
  );
}
