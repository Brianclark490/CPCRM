import { useState, useEffect, useCallback } from 'react';
import { useSession } from '@descope/react-sdk';
import { useApiClient } from '../../../lib/apiClient.js';
import type {
  FieldDefinition,
  ObjectDefinitionDetail,
  RelationshipDefinition,
  ObjectDefinitionListItem,
  PageLayoutListItem,
  TabName,
} from '../types.js';

export function useFieldDefinitions(objectId: string | undefined) {
  const { sessionToken } = useSession();
  const api = useApiClient();

  // Object + fields state
  const [objectDef, setObjectDef] = useState<ObjectDefinitionDetail | null>(null);
  const [fields, setFields] = useState<FieldDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Relationship state
  const [relationships, setRelationships] = useState<RelationshipDefinition[]>([]);
  const [allObjects, setAllObjects] = useState<ObjectDefinitionListItem[]>([]);
  const [relationshipsLoading, setRelationshipsLoading] = useState(false);
  const [relationshipsError, setRelationshipsError] = useState<string | null>(null);

  // Page layout state
  const [pageLayouts, setPageLayouts] = useState<PageLayoutListItem[]>([]);
  const [pageLayoutsLoading, setPageLayoutsLoading] = useState(false);
  const [pageLayoutsError, setPageLayoutsError] = useState<string | null>(null);

  // ── Fetch object definition ──────────────────────────────

  const fetchObject = useCallback(async () => {
    if (!sessionToken || !objectId) return;

    setLoading(true);
    setError(null);

    try {
      const response = await api.request(`/api/v1/admin/objects/${objectId}`);

      if (response.ok) {
        const data = (await response.json()) as ObjectDefinitionDetail;
        setObjectDef(data);
        setFields(data.fields ?? []);
      } else {
        setError('Failed to load object definition.');
      }
    } catch {
      setError('Failed to connect to the server. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [sessionToken, api, objectId]);

  useEffect(() => {
    void fetchObject();
  }, [fetchObject]);

  // ── Fetch relationships ─────────────────────────────────

  const fetchRelationships = useCallback(async () => {
    if (!sessionToken || !objectId) return;

    setRelationshipsLoading(true);
    setRelationshipsError(null);

    try {
      const response = await api.request(`/api/v1/admin/objects/${objectId}/relationships`);

      if (response.ok) {
        const data = (await response.json()) as RelationshipDefinition[];
        setRelationships(data);
      } else {
        setRelationshipsError('Failed to load relationships.');
      }
    } catch {
      setRelationshipsError('Failed to connect to the server. Please try again.');
    } finally {
      setRelationshipsLoading(false);
    }
  }, [sessionToken, api, objectId]);

  const fetchAllObjects = useCallback(async () => {
    if (!sessionToken) return;

    try {
      const response = await api.request('/api/v1/admin/objects');

      if (response.ok) {
        const data = (await response.json()) as ObjectDefinitionListItem[];
        setAllObjects(data);
      }
    } catch {
      // Silently fail — the dropdown will just be empty
    }
  }, [sessionToken, api]);

  // ── Fetch page layouts ─────────────────────────────────

  const fetchPageLayouts = useCallback(async () => {
    if (!sessionToken || !objectId) return;

    setPageLayoutsLoading(true);
    setPageLayoutsError(null);

    try {
      const response = await api.request(`/api/v1/admin/objects/${objectId}/page-layouts`);

      if (response.ok) {
        const data = (await response.json()) as PageLayoutListItem[];
        setPageLayouts(data);
      } else {
        setPageLayoutsError('Failed to load page layouts.');
      }
    } catch {
      setPageLayoutsError('Failed to connect to the server. Please try again.');
    } finally {
      setPageLayoutsLoading(false);
    }
  }, [sessionToken, api, objectId]);

  // ── Tab data loading ────────────────────────────────────

  const loadTabData = useCallback(
    (tab: TabName) => {
      if (tab === 'relationships') {
        void fetchRelationships();
        void fetchAllObjects();
      }
      if (tab === 'page_layout') {
        void fetchPageLayouts();
      }
    },
    [fetchRelationships, fetchAllObjects, fetchPageLayouts],
  );

  return {
    sessionToken,
    api,
    objectDef,
    fields,
    setFields,
    loading,
    error,
    fetchObject,
    relationships,
    relationshipsLoading,
    relationshipsError,
    fetchRelationships,
    allObjects,
    pageLayouts,
    pageLayoutsLoading,
    pageLayoutsError,
    setPageLayoutsError,
    loadTabData,
  };
}
