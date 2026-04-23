import { useCallback, useMemo, type Dispatch, type SetStateAction } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@descope/react-sdk';
import { ApiError, useApiClient } from '../../../lib/apiClient.js';
import { recordsKeys } from '../../../lib/queryKeys.js';
import { usePageLayout } from '../../../usePageLayout.js';
import { useObjectDefinition } from '../../records/hooks/queries/useObjectDefinition.js';
import { useLayout } from '../../records/hooks/queries/useLayout.js';
import { groupFieldsBySection } from '../helpers.js';
import type {
  LayoutFieldWithMetadata,
  LayoutSection,
  ObjectDefinition,
  RecordDetail,
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
  setRecord: Dispatch<SetStateAction<RecordDetail | null>>;
}

/**
 * Composes the three queries a record-detail page needs (record + object
 * definition + form layout) into a single hook.
 *
 * Each query is cached under its shared key factory entry so unrelated
 * record pages share the object-definition list, the layout list, and the
 * layout detail rather than re-fetching them per-mount. `loadRecord`
 * invalidates only the record detail so save/delete/related-create flows
 * refresh the visible data without bouncing the form-layout request.
 */
export function useRecord(
  apiName: string | undefined,
  id: string | undefined,
): UseRecordResult {
  const { sessionToken } = useSession();
  const api = useApiClient();
  const queryClient = useQueryClient();

  const recordKey = recordsKeys.detail(apiName ?? '', id ?? '');
  const recordEnabled = Boolean(sessionToken && apiName && id);

  const recordQuery = useQuery<RecordDetail, ApiError>({
    queryKey: recordKey,
    queryFn: () =>
      api.get<RecordDetail>(
        `/api/v1/objects/${apiName}/records/${id}`,
      ),
    enabled: recordEnabled,
  });

  const objectDefQuery = useObjectDefinition(apiName);
  const objectDefData = objectDefQuery.data;
  const objectDef = useMemo<ObjectDefinition | null>(() => {
    if (!objectDefData) return null;
    return {
      id: objectDefData.id,
      apiName: objectDefData.apiName,
      label: objectDefData.label ?? objectDefData.apiName,
      pluralLabel: objectDefData.pluralLabel ?? objectDefData.apiName,
      isSystem: objectDefData.isSystem ?? false,
    };
  }, [objectDefData]);

  const { layout: pageLayout } = usePageLayout(apiName);

  const formLayoutQuery = useLayout(objectDefData?.id, 'form');
  const layoutSections = useMemo<LayoutSection[] | null>(() => {
    const layout = formLayoutQuery.data;
    if (!layout || layout.fields.length === 0) return null;
    const fields: LayoutFieldWithMetadata[] = layout.fields.map((lf) => ({
      fieldId: lf.fieldId,
      fieldApiName: lf.fieldApiName,
      fieldLabel: lf.fieldLabel,
      fieldType: lf.fieldType,
      fieldRequired: lf.fieldRequired ?? false,
      fieldOptions: lf.fieldOptions ?? {},
      sortOrder: lf.sortOrder,
      section: lf.section,
      sectionLabel: lf.sectionLabel,
      width: lf.width,
    }));
    return groupFieldsBySection(fields);
  }, [formLayoutQuery.data]);

  const loadError = useMemo<string | null>(() => {
    const err = recordQuery.error;
    if (!err) return null;
    if (err instanceof ApiError) {
      if (err.status === 404) return 'Record not found.';
      if (err.isNetwork) {
        return 'Failed to connect to the server. Please try again.';
      }
      return 'Failed to load record.';
    }
    return 'Failed to connect to the server. Please try again.';
  }, [recordQuery.error]);

  // Mirror the pre-TQ contract: `loading` gates the whole page on the
  // primary record fetch. Object-definition / layout queries fill in
  // progressively and never block the initial render.
  const loading = recordEnabled && recordQuery.isPending;

  const loadRecord = useCallback(async () => {
    if (!apiName || !id) return;
    await queryClient.invalidateQueries({ queryKey: recordKey });
  }, [queryClient, recordKey, apiName, id]);

  const setRecord = useCallback<Dispatch<SetStateAction<RecordDetail | null>>>(
    (value) => {
      queryClient.setQueryData<RecordDetail | null>(recordKey, (current) => {
        if (typeof value === 'function') {
          return (value as (prev: RecordDetail | null) => RecordDetail | null)(
            current ?? null,
          );
        }
        return value;
      });
    },
    [queryClient, recordKey],
  );

  return {
    record: recordQuery.data ?? null,
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
