import { useState } from 'react';
import type {
  PageLayout,
  RecordData,
  FieldDefinitionRef,
  ObjectDefinitionRef,
} from './layoutTypes.js';
import { RecordHeader } from './RecordHeader.js';
import { PageLayoutTabBar } from './PageLayoutTabBar.js';
import { LayoutSection } from './LayoutSection.js';
import styles from './PageLayoutRenderer.module.css';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PageLayoutRendererProps {
  layout: PageLayout;
  record: RecordData;
  fields: FieldDefinitionRef[];
  objectDef: ObjectDefinitionRef | null;
  actions?: React.ReactNode;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Renders a full record detail page from a PageLayout definition.
 * Always shows the RecordHeader at the top, followed by tab navigation,
 * and the active tab's sections.
 */
export function PageLayoutRenderer({
  layout,
  record,
  fields,
  objectDef,
  actions,
}: PageLayoutRendererProps) {
  const [activeTabId, setActiveTabId] = useState(
    layout.tabs[0]?.id ?? '',
  );

  const activeTab = layout.tabs.find((t) => t.id === activeTabId) ?? layout.tabs[0];

  return (
    <div className={styles.layoutRenderer} data-testid="page-layout-renderer">
      <RecordHeader
        layout={layout}
        record={record}
        objectDef={objectDef}
        fields={fields}
        actions={actions}
      />

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
            />
          ))}
        </div>
      )}
    </div>
  );
}
