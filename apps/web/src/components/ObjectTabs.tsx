import { useState, useRef, useCallback, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { useSession } from '@descope/react-sdk';
import { useApiClient } from '../lib/apiClient.js';
import { ObjectIcon } from './ObjectIcon.js';
import styles from './ObjectTabs.module.css';

interface ObjectDefinitionNavItem {
  id: string;
  apiName: string;
  pluralLabel: string;
  icon?: string;
}

export function ObjectTabs() {
  const { sessionToken } = useSession();
  const api = useApiClient();
  const [items, setItems] = useState<ObjectDefinitionNavItem[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragCounterRef = useRef(0);

  useEffect(() => {
    if (!sessionToken) return;

    let cancelled = false;

    const loadObjects = async () => {
      try {
        const response = await api.request('/api/v1/admin/objects');

        if (cancelled || !response.ok) return;

        const objects = (await response.json()) as Array<{
          id: string;
          apiName: string;
          pluralLabel: string;
          icon?: string;
        }>;

        if (!cancelled) {
          const HIDDEN_FROM_NAV = new Set(['user', 'team']);
          setItems(
            objects
              .filter((o) => !HIDDEN_FROM_NAV.has(o.apiName))
              .map((o) => ({
                id: o.id,
                apiName: o.apiName,
                pluralLabel: o.pluralLabel,
                icon: o.icon,
              })),
          );
        }
      } catch {
        // Object fetch is best-effort
      }
    };

    void loadObjects();

    return () => {
      cancelled = true;
    };
  }, [sessionToken, api]);

  const persistOrder = useCallback(
    async (orderedItems: ObjectDefinitionNavItem[]) => {
      if (!sessionToken) return;
      try {
        await api.request('/api/v1/admin/objects/reorder', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ orderedIds: orderedItems.map((item) => item.id) }),
        });
      } catch {
        // Reorder persist is best-effort
      }
    },
    [sessionToken, api],
  );

  const handleDragStart = useCallback((index: number, e: React.DragEvent) => {
    setDragIndex(index);
    dragCounterRef.current = 0;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(index));
    }
  }, []);

  const handleDragEnter = useCallback(
    (index: number, e: React.DragEvent) => {
      e.preventDefault();
      if (dragIndex === null || index === dragIndex) return;
      dragCounterRef.current += 1;
      setDragOverIndex(index);
    },
    [dragIndex],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move';
    }
  }, []);

  const handleDragLeave = useCallback(
    (index: number) => {
      dragCounterRef.current -= 1;
      if (dragCounterRef.current <= 0 && dragOverIndex === index) {
        dragCounterRef.current = 0;
        setDragOverIndex(null);
      }
    },
    [dragOverIndex],
  );

  const handleDrop = useCallback(
    (targetIndex: number, e: React.DragEvent) => {
      e.preventDefault();
      if (dragIndex === null || dragIndex === targetIndex) {
        setDragIndex(null);
        setDragOverIndex(null);
        return;
      }

      setItems((prev) => {
        const updated = [...prev];
        const [moved] = updated.splice(dragIndex, 1);
        updated.splice(targetIndex, 0, moved);
        void persistOrder(updated);
        return updated;
      });

      setDragIndex(null);
      setDragOverIndex(null);
    },
    [dragIndex, persistOrder],
  );

  const handleDragEnd = useCallback(() => {
    setDragIndex(null);
    setDragOverIndex(null);
    dragCounterRef.current = 0;
  }, []);

  return (
    <nav aria-label="Object navigation" className={styles.tabBar}>
      <div className={styles.tabList}>
        {items.map(({ apiName, pluralLabel, icon }, index) => (
          <NavLink
            key={apiName}
            to={`/objects/${apiName}`}
            draggable
            onDragStart={(e) => handleDragStart(index, e)}
            onDragEnter={(e) => handleDragEnter(index, e)}
            onDragOver={handleDragOver}
            onDragLeave={() => handleDragLeave(index)}
            onDrop={(e) => handleDrop(index, e)}
            onDragEnd={handleDragEnd}
            className={({ isActive }) =>
              [
                styles.tab,
                isActive ? styles.tabActive : '',
                dragIndex === index ? styles.tabDragging : '',
                dragOverIndex === index ? styles.tabDragOver : '',
              ]
                .filter(Boolean)
                .join(' ')
            }
          >
            {icon && (
              <span className={styles.tabIcon}>
                <ObjectIcon icon={icon} size={16} />
              </span>
            )}
            {pluralLabel}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
