import type { ComponentRendererProps } from './layoutTypes.js';
import { ActivityPanel, type ActivityItem } from './ActivityPanel.js';

/**
 * Chronological feed of record events (replied / call / edit / note / meeting).
 * Thin adapter around ActivityPanel — intended for side rails or the main zone.
 * Config:
 *   - limit?: number         – max items to show
 *   - types?: string[]       – filter to these ActivityItem types
 *
 * Real wiring lives with the activity service (#384); for now ActivityFeed
 * surfaces the same empty-state ActivityPanel renders when there are no items.
 */
export function ActivityFeed({ component }: ComponentRendererProps) {
  const limitCfg = component.config.limit;
  const limit = typeof limitCfg === 'number' && limitCfg > 0 ? limitCfg : undefined;

  const typesCfg = component.config.types;
  const types = Array.isArray(typesCfg)
    ? (typesCfg.filter((t) => typeof t === 'string') as string[])
    : null;

  const allItems: ActivityItem[] = [];
  const filtered = types && types.length > 0
    ? allItems.filter((item) => types.includes(item.type))
    : allItems;
  const shown = limit !== undefined ? filtered.slice(0, limit) : filtered;

  return (
    <div data-testid="activity-feed">
      <ActivityPanel items={shown} />
    </div>
  );
}
