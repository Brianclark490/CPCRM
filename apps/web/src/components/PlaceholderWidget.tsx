import type { ComponentRendererProps } from './LayoutComponent.js';
import styles from './PlaceholderWidget.module.css';

const WIDGET_LABELS: Record<string, string> = {
  activity_timeline: 'Activity Timeline',
  notes: 'Notes',
  stage_history: 'Stage History',
  files: 'Files',
};

/**
 * Placeholder renderer for widget types that are not yet implemented.
 * Displays a "Coming soon" message with the widget type label.
 */
export function PlaceholderWidget({ component }: ComponentRendererProps) {
  const label = WIDGET_LABELS[component.type] ?? component.type;

  return (
    <div className={styles.placeholder} data-testid={`widget-${component.type}`}>
      <span className={styles.icon} aria-hidden="true">🚧</span>
      <span className={styles.label}>{label}</span>
      <span className={styles.message}>Coming soon</span>
    </div>
  );
}
