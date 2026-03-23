import type { LayoutTab } from './layoutTypes.js';
import styles from './PageLayoutTabBar.module.css';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PageLayoutTabBarProps {
  tabs: LayoutTab[];
  activeTabId: string;
  onTabChange: (tabId: string) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Horizontal tab bar for switching between layout tabs on a record page.
 */
export function PageLayoutTabBar({
  tabs,
  activeTabId,
  onTabChange,
}: PageLayoutTabBarProps) {
  if (tabs.length <= 1) return null;

  return (
    <nav aria-label="Record tabs" className={styles.tabBar} data-testid="layout-tab-bar">
      <div className={styles.tabList} role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={tab.id === activeTabId}
            className={`${styles.tab} ${tab.id === activeTabId ? styles.tabActive : ''}`}
            onClick={() => onTabChange(tab.id)}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
