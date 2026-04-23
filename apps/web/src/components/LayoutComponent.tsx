import type { ComponentType } from 'react';
import type { ComponentRendererProps } from './layoutTypes.js';
import { evaluateVisibility } from './evaluateVisibility.js';
import { LayoutFieldRenderer } from './LayoutFieldRenderer.js';
import { RelatedListRenderer } from './RelatedListRenderer.js';
import { PlaceholderWidget } from './PlaceholderWidget.js';
import { SalesTargetsRenderer } from './SalesTargetsRenderer.js';
import { IdentityPanel } from './IdentityPanel.js';
import { ContactsPanel } from './ContactsPanel.js';
import { ActivityFeed } from './ActivityFeed.js';

// ─── Component registry (map, not switch) ─────────────────────────────────────

const COMPONENT_RENDERERS: Record<string, ComponentType<ComponentRendererProps>> = {
  field: LayoutFieldRenderer,
  related_list: RelatedListRenderer,
  sales_targets: SalesTargetsRenderer,
  identity: IdentityPanel,
  contacts: ContactsPanel,
  activity: ActivityFeed,
  activity_timeline: PlaceholderWidget,
  notes: PlaceholderWidget,
  stage_history: PlaceholderWidget,
  files: PlaceholderWidget,
};

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Dispatches a layout component to the correct renderer using the registry map.
 * Unknown component types log a warning but don't crash.
 * Components with failing visibility rules are not rendered.
 */
export function LayoutComponent({
  component,
  record,
  fields,
  objectDef,
  onRecordCreated,
}: ComponentRendererProps) {
  if (!evaluateVisibility(component.visibility, record.fieldValues)) {
    return null;
  }

  const Renderer = COMPONENT_RENDERERS[component.type];

  if (!Renderer) {
    console.warn(
      `[PageLayout] Unknown component type "${component.type}" (id: ${component.id}). Skipping render.`,
    );
    return null;
  }

  return (
    <Renderer
      component={component}
      record={record}
      fields={fields}
      objectDef={objectDef}
      onRecordCreated={onRecordCreated}
    />
  );
}
