import { useState, type ReactNode } from 'react';
import type {
  PageLayout,
  RecordData,
  FieldDefinitionRef,
  ObjectDefinitionRef,
  LayoutSectionDef,
} from './layoutTypes.js';
import { EMPTY_ZONES } from './layoutTypes.js';
import { RecordHeader } from './RecordHeader.js';
import { PageLayoutTabBar } from './PageLayoutTabBar.js';
import { LayoutSection } from './LayoutSection.js';
import { KpiStrip } from './KpiStrip.js';
import { evaluateVisibility } from './evaluateVisibility.js';
import styles from './PageLayoutRenderer.module.css';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PageLayoutRendererProps {
  layout: PageLayout;
  record: RecordData;
  fields: FieldDefinitionRef[];
  objectDef: ObjectDefinitionRef | null;
  actions?: ReactNode;
  onRecordCreated?: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Renders a full record detail page from a PageLayout definition.
 * Shell: [header] · [KPI strip] · [left rail | main (tabs + sections) | right rail].
 * Empty zones collapse; layouts without zones render like the pre-zones shell.
 */
export function PageLayoutRenderer({
  layout,
  record,
  fields,
  objectDef,
  actions,
  onRecordCreated,
}: PageLayoutRendererProps) {
  const [activeTabId, setActiveTabId] = useState(
    layout.tabs[0]?.id ?? '',
  );

  const activeTab = layout.tabs.find((t) => t.id === activeTabId) ?? layout.tabs[0];
  const zones = layout.zones ?? EMPTY_ZONES;
  const visibleLeftRail = zones.leftRail.filter((s) =>
    evaluateVisibility(s.visibility, record.fieldValues),
  );
  const visibleRightRail = zones.rightRail.filter((s) =>
    evaluateVisibility(s.visibility, record.fieldValues),
  );
  const hasLeftRail = visibleLeftRail.length > 0;
  const hasRightRail = visibleRightRail.length > 0;

  const bodyClass = [
    styles.body,
    hasLeftRail ? styles.withLeftRail : '',
    hasRightRail ? styles.withRightRail : '',
  ]
    .filter(Boolean)
    .join(' ');

  const renderRail = (sections: LayoutSectionDef[]) =>
    sections.map((section) => (
      <LayoutSection
        key={section.id}
        section={{ ...section, columns: 1 }}
        record={record}
        fields={fields}
        objectDef={objectDef}
        onRecordCreated={onRecordCreated}
      />
    ));

  return (
    <div className={styles.layoutRenderer} data-testid="page-layout-renderer">
      <div className={styles.stickyTop}>
        <RecordHeader
          layout={layout}
          record={record}
          objectDef={objectDef}
          fields={fields}
          actions={actions}
        />

        <KpiStrip
          components={zones.kpi}
          record={record}
          fields={fields}
          objectDef={objectDef}
          onRecordCreated={onRecordCreated}
        />
      </div>

      <div className={bodyClass} data-testid="layout-body">
        {hasLeftRail && (
          <aside
            className={`${styles.rail} ${styles.leftRail}`}
            data-testid="layout-left-rail"
          >
            {renderRail(visibleLeftRail)}
          </aside>
        )}

        <div className={styles.main} data-testid="layout-main">
          <PageLayoutTabBar
            tabs={layout.tabs}
            activeTabId={activeTabId}
            onTabChange={setActiveTabId}
          />

          {activeTab && (
            <div className={styles.tabContent} data-testid={`tab-content-${activeTab.id}`}>
              {activeTab.sections.map((section) => (
                <LayoutSection
                  key={section.id}
                  section={section}
                  record={record}
                  fields={fields}
                  objectDef={objectDef}
                  onRecordCreated={onRecordCreated}
                />
              ))}
            </div>
          )}
        </div>

        {hasRightRail && (
          <aside
            className={`${styles.rail} ${styles.rightRail}`}
            data-testid="layout-right-rail"
          >
            {renderRail(visibleRightRail)}
          </aside>
        )}
      </div>
    </div>
  );
}
