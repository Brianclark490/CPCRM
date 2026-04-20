import { useState, useCallback } from 'react';
import { useSession } from '@descope/react-sdk';
import { useQueryClient } from '@tanstack/react-query';
import { useApiClient, unwrapList } from '../../../lib/apiClient.js';
import { pageLayoutsKeys } from '../../../lib/queryKeys.js';
import type {
  BuilderLayout,
  PageLayoutListItem,
} from '../../../components/builderTypes.js';
import type { VersionEntry } from '../../../components/VersionHistoryPanel.js';
import { createDefaultLayout } from '../helpers.js';

interface UsePageLayoutActionsOptions {
  objectId: string | undefined;
  layout: BuilderLayout | null;
  selectedLayoutId: string | null;
  dirty: boolean;
  allLayouts: PageLayoutListItem[];
  objectLabel: string;
  setDirty: (dirty: boolean) => void;
  setSelectedLayoutId: (id: string | null) => void;
  setAllLayouts: React.Dispatch<React.SetStateAction<PageLayoutListItem[]>>;
  loadLayoutDetail: (layoutId: string) => Promise<void>;
}

export function usePageLayoutActions({
  objectId,
  layout,
  selectedLayoutId,
  dirty,
  allLayouts,
  objectLabel,
  setDirty,
  setSelectedLayoutId,
  setAllLayouts,
  loadLayoutDetail,
}: UsePageLayoutActionsOptions) {
  const { sessionToken } = useSession();
  const api = useApiClient();
  const queryClient = useQueryClient();

  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [versions, setVersions] = useState<VersionEntry[]>([]);
  const [reverting, setReverting] = useState(false);
  const [usingDefault, setUsingDefault] = useState(false);

  // ── Save / publish ─────────────────────────────────────────

  const handleSaveDraft = useCallback(async () => {
    if (!sessionToken || !objectId || !layout) return;

    setSaving(true);
    setSaveError(null);
    try {
      if (selectedLayoutId) {
        const res = await api.request(
          `/api/v1/admin/objects/${objectId}/page-layouts/${selectedLayoutId}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ layout }),
          },
        );
        if (res.ok) {
          setDirty(false);
        } else {
          const body = await res.json().catch(() => null) as { error?: string } | null;
          setSaveError(body?.error ?? 'Failed to save layout.');
        }
      } else {
        const res = await api.request(
          `/api/v1/admin/objects/${objectId}/page-layouts`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: layout.name,
              is_default: true,
              layout,
            }),
          },
        );
        if (res.ok) {
          const data = (await res.json()) as PageLayoutListItem;
          setSelectedLayoutId(data.id);
          setDirty(false);
        } else {
          const body = await res.json().catch(() => null) as { error?: string } | null;
          setSaveError(body?.error ?? 'Failed to create layout.');
        }
      }
    } catch {
      setSaveError('Failed to connect to the server. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [sessionToken, api, objectId, layout, selectedLayoutId, setDirty, setSelectedLayoutId]);

  const handlePublish = useCallback(async () => {
    if (!sessionToken || !objectId || !selectedLayoutId) return;

    if (dirty) {
      await handleSaveDraft();
    }

    setPublishing(true);
    setSaveError(null);
    try {
      const res = await api.request(
        `/api/v1/admin/objects/${objectId}/page-layouts/${selectedLayoutId}/publish`,
        { method: 'POST' },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null;
        setSaveError(body?.error ?? 'Failed to publish layout.');
        return;
      }
      // Record-detail pages cache the effective layout through TanStack
      // Query; without this invalidation, an already-open record page
      // would keep showing the previous layout until its staleTime
      // expired or the user hard-refreshed. Fire-and-forget: awaiting
      // this would hold the "Publishing" spinner until every listening
      // consumer finishes refetching.
      void queryClient.invalidateQueries({ queryKey: pageLayoutsKeys.all() });
    } catch {
      setSaveError('Failed to connect to the server. Please try again.');
    } finally {
      setPublishing(false);
    }
  }, [sessionToken, api, queryClient, objectId, selectedLayoutId, dirty, handleSaveDraft]);

  // ── Role-based layout handlers ─────────────────────────────

  const handleRoleChange = useCallback(async (layoutId: string | null, role: string | null) => {
    if (!sessionToken || !objectId) return;

    if (layoutId) {
      setSelectedLayoutId(layoutId);
      setUsingDefault(false);
      await loadLayoutDetail(layoutId);
    } else if (role !== null) {
      try {
        const res = await api.request(
          `/api/v1/admin/objects/${objectId}/page-layouts`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: `${objectLabel} - ${role}`,
              role,
              is_default: false,
              layout: layout ?? createDefaultLayout(objectId, `${objectLabel} - ${role}`),
            }),
          },
        );

        if (res.ok) {
          const data = (await res.json()) as PageLayoutListItem;
          setSelectedLayoutId(data.id);
          setAllLayouts((prev) => [...prev, data]);
          setUsingDefault(true);
          await loadLayoutDetail(data.id);
        }
      } catch {
        // silently fail
      }
    } else {
      const defaultLayout = allLayouts.find((l) => l.role === null);
      if (defaultLayout) {
        setSelectedLayoutId(defaultLayout.id);
        setUsingDefault(false);
        await loadLayoutDetail(defaultLayout.id);
      }
    }
  }, [sessionToken, api, objectId, objectLabel, layout, allLayouts, setSelectedLayoutId, setAllLayouts, loadLayoutDetail]);

  const handleCopyFrom = useCallback(async (sourceLayoutId: string) => {
    if (!sessionToken || !objectId || !selectedLayoutId) return;

    try {
      const res = await api.request(
        `/api/v1/admin/objects/${objectId}/page-layouts/${selectedLayoutId}/copy`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sourceLayoutId }),
        },
      );

      if (res.ok) {
        await loadLayoutDetail(selectedLayoutId);
        setUsingDefault(false);
      }
    } catch {
      // silently fail
    }

    setShowCopyModal(false);
  }, [sessionToken, api, objectId, selectedLayoutId, loadLayoutDetail]);

  const handleResetToDefault = useCallback(async () => {
    if (!sessionToken || !objectId || !selectedLayoutId) return;

    const currentLayout = allLayouts.find((l) => l.id === selectedLayoutId);
    if (!currentLayout || currentLayout.role === null) return;

    const confirmed = window.confirm(
      `Reset the "${currentLayout.role}" layout? This will delete the role-specific layout and fall back to the default.`,
    );
    if (!confirmed) return;

    try {
      const res = await api.request(
        `/api/v1/admin/objects/${objectId}/page-layouts/${selectedLayoutId}`,
        { method: 'DELETE' },
      );

      if (res.ok || res.status === 204) {
        setAllLayouts((prev) => prev.filter((l) => l.id !== selectedLayoutId));
        const defaultLayout = allLayouts.find((l) => l.role === null);
        if (defaultLayout) {
          setSelectedLayoutId(defaultLayout.id);
          setUsingDefault(false);
          await loadLayoutDetail(defaultLayout.id);
        }
      }
    } catch {
      // silently fail
    }
  }, [sessionToken, api, objectId, selectedLayoutId, allLayouts, setAllLayouts, setSelectedLayoutId, loadLayoutDetail]);

  // ── Version history ────────────────────────────────────────

  const handleShowHistory = useCallback(async () => {
    if (!sessionToken || !objectId || !selectedLayoutId) return;

    try {
      const res = await api.request(
        `/api/v1/admin/objects/${objectId}/page-layouts/${selectedLayoutId}/versions`,
      );

      if (res.ok) {
        const data = unwrapList<VersionEntry>(await res.json());
        setVersions(data);
      }
    } catch {
      // silently fail
    }

    setShowHistory(true);
  }, [sessionToken, api, objectId, selectedLayoutId]);

  const handleRevert = useCallback(async (version: number) => {
    if (!sessionToken || !objectId || !selectedLayoutId) return;

    setReverting(true);
    try {
      const res = await api.request(
        `/api/v1/admin/objects/${objectId}/page-layouts/${selectedLayoutId}/revert`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ version }),
        },
      );

      if (res.ok) {
        await loadLayoutDetail(selectedLayoutId);
        setShowHistory(false);
      }
    } catch {
      // silently fail
    } finally {
      setReverting(false);
    }
  }, [sessionToken, api, objectId, selectedLayoutId, loadLayoutDetail]);

  return {
    // State
    saving,
    publishing,
    saveError,
    setSaveError,
    showPreview,
    setShowPreview,
    showHistory,
    setShowHistory,
    showCopyModal,
    setShowCopyModal,
    versions,
    reverting,
    usingDefault,
    // Handlers
    handleSaveDraft,
    handlePublish,
    handleRoleChange,
    handleCopyFrom,
    handleResetToDefault,
    handleShowHistory,
    handleRevert,
  };
}
