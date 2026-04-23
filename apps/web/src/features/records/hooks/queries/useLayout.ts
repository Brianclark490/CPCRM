import {
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import { useSession } from '@descope/react-sdk';
import { unwrapList, useApiClient } from '../../../../lib/apiClient.js';
import { pageLayoutsKeys } from '../../../../lib/queryKeys.js';

export interface LayoutFieldWithMetadata {
  fieldId: string;
  fieldApiName: string;
  fieldLabel: string;
  fieldType: string;
  sortOrder: number;
  section: number;
  width: string;
  // The backend also returns these on form layouts; list-layout callers
  // ignore them, record-detail callers depend on them.
  fieldRequired?: boolean;
  fieldOptions?: Record<string, unknown>;
  sectionLabel?: string;
}

export interface LayoutDefinition {
  id: string;
  objectId: string;
  name: string;
  layoutType: string;
  isDefault: boolean;
  fields: LayoutFieldWithMetadata[];
}

export interface LayoutListItem {
  id: string;
  objectId: string;
  name: string;
  layoutType: string;
  isDefault: boolean;
}

export type LayoutType = 'list' | 'form';

/**
 * Resolve the default layout of a given `layoutType` for an object, and
 * return its full definition (sections + fields).
 *
 * Hitting `/api/v1/admin/objects/:objectId/layouts` first gives us the list
 * of layouts; we pick the default (or the first of that type) and then fetch
 * its detail. Each response is cached independently under
 * `pageLayoutsKeys.list(objectId)` and `pageLayoutsKeys.detail(layoutId)` so
 * invalidating one object's layouts doesn't wipe unrelated caches.
 *
 * Returns `null` when the object has no matching layout — callers should
 * fall back to a default rendering (e.g. RecordListPage uses the record's
 * own field list when no list layout is configured).
 */
export function useLayout(
  objectId: string | undefined,
  layoutType: LayoutType,
): UseQueryResult<LayoutDefinition | null> {
  const { sessionToken } = useSession();
  const api = useApiClient();
  const queryClient = useQueryClient();

  return useQuery<LayoutDefinition | null>({
    queryKey: pageLayoutsKeys.resolved(objectId ?? '', layoutType),
    queryFn: async () => {
      const listPayload = await queryClient.fetchQuery<LayoutListItem[]>({
        queryKey: pageLayoutsKeys.list(objectId ?? ''),
        queryFn: async () => {
          const payload = await api.get<unknown>(
            `/api/v1/admin/objects/${objectId}/layouts`,
          );
          return unwrapList<LayoutListItem>(payload);
        },
      });

      const match =
        listPayload.find(
          (l) => l.layoutType === layoutType && l.isDefault,
        ) ?? listPayload.find((l) => l.layoutType === layoutType);

      if (!match) return null;

      const detail = await queryClient.fetchQuery<LayoutDefinition>({
        queryKey: pageLayoutsKeys.detail(match.id),
        queryFn: () =>
          api.get<LayoutDefinition>(
            `/api/v1/admin/objects/${objectId}/layouts/${match.id}`,
          ),
      });

      return detail.fields.length > 0 ? detail : null;
    },
    enabled: Boolean(sessionToken && objectId),
  });
}
