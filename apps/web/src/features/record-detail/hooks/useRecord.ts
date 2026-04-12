import { useState, useEffect, useCallback } from 'react';
import { useSession } from '@descope/react-sdk';
import { useApiClient } from '../../../lib/apiClient.js';
import { usePageLayout } from '../../../usePageLayout.js';
import { groupFieldsBySection } from '../helpers.js';
import type {
  ObjectDefinition,
  RecordDetail,
  LayoutListItem,
  LayoutDefinition,
  LayoutSection,
} from '../types.js';
import type { PageLayout } from '../../../components/layoutTypes.js';

interface UseRecordResult {
  record: RecordDetail | null;
  objectDef: ObjectDefinition | null;
  layoutSections: LayoutSection[] | null;
  pageLayout: PageLayout | null;
  loading: boolean;
  loadError: string | null;
  api: ReturnType<typeof useApiClient>;
  sessionToken: string | undefined;
  loadRecord: () => Promise<void>;
  setRecord: React.Dispatch<React.SetStateAction<RecordDetail | null>>;
}

export function useRecord(
  apiName: string | undefined,
  id: string | undefined,
): UseRecordResult {
  const { sessionToken } = useSession();
  const api = useApiClient();

  const [record, setRecord] = useState<RecordDetail | null>(null);
  const [objectDef, setObjectDef] = useState<ObjectDefinition | null>(null);
  const [layoutSections, setLayoutSections] = useState<LayoutSection[] | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const { layout: pageLayout } = usePageLayout(apiName);

  const loadRecord = useCallback(async () => {
    if (!sessionToken || !apiName || !id) return;

    setLoading(true);
    setLoadError(null);

    try {
      const response = await api.request(
        `/api/objects/${apiName}/records/${id}`,
      );

      if (response.ok) {
        const data = (await response.json()) as RecordDetail;
        setRecord(data);

        const objResponse = await api.request('/api/admin/objects');
        if (objResponse.ok) {
          const allObjects = (await objResponse.json()) as ObjectDefinition[];
          const obj = allObjects.find((o) => o.apiName === apiName);
          if (obj) setObjectDef(obj);
        }
      } else if (response.status === 404) {
        setLoadError('Record not found.');
      } else {
        setLoadError('Failed to load record.');
      }
    } catch {
      setLoadError('Failed to connect to the server. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [sessionToken, api, apiName, id]);

  useEffect(() => {
    void loadRecord();
  }, [loadRecord]);

  // Load form layout
  useEffect(() => {
    if (!sessionToken || !apiName) return;

    let cancelled = false;

    const loadLayout = async () => {
      try {
        const objResponse = await api.request('/api/admin/objects');
        if (cancelled || !objResponse.ok) return;

        const allObjects = (await objResponse.json()) as Array<{
          id: string;
          apiName: string;
        }>;
        const obj = allObjects.find((o) => o.apiName === apiName);
        if (!obj || cancelled) return;

        const layoutsResponse = await api.request(
          `/api/admin/objects/${obj.id}/layouts`,
        );
        if (cancelled || !layoutsResponse.ok) return;

        const layouts = (await layoutsResponse.json()) as LayoutListItem[];
        const formLayout =
          layouts.find((l) => l.layoutType === 'form' && l.isDefault) ??
          layouts.find((l) => l.layoutType === 'form');

        if (!formLayout || cancelled) return;

        const layoutDetailResponse = await api.request(
          `/api/admin/objects/${obj.id}/layouts/${formLayout.id}`,
        );
        if (cancelled || !layoutDetailResponse.ok) return;

        const layoutDetail =
          (await layoutDetailResponse.json()) as LayoutDefinition;
        if (!cancelled && layoutDetail.fields.length > 0) {
          setLayoutSections(groupFieldsBySection(layoutDetail.fields));
        }
      } catch {
        // Layout fetch is best-effort — fall back to record fields
      }
    };

    void loadLayout();

    return () => {
      cancelled = true;
    };
  }, [sessionToken, api, apiName]);

  return {
    record,
    objectDef,
    layoutSections,
    pageLayout,
    loading,
    loadError,
    api,
    sessionToken,
    loadRecord,
    setRecord,
  };
}
