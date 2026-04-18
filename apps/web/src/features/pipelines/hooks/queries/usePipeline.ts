import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useSession } from '@descope/react-sdk';
import { useApiClient } from '../../../../lib/apiClient.js';
import { pipelinesKeys } from '../../../../lib/queryKeys.js';

export interface PipelineStage {
  id: string;
  name: string;
  apiName: string;
  sortOrder: number;
  stageType: string;
  colour: string;
  defaultProbability?: number;
  expectedDays?: number;
}

export interface Pipeline {
  id: string;
  name: string;
  objectId: string;
  stages: PipelineStage[];
}

/**
 * Fetches a single pipeline definition by id from
 * `GET /api/v1/admin/pipelines/{id}`.
 *
 * The query is disabled until both a session and a pipeline id are available,
 * so callers can pass `undefined` while resolving the id without triggering
 * a request.
 */
export function usePipeline(
  pipelineId: string | undefined,
): UseQueryResult<Pipeline> {
  const { sessionToken } = useSession();
  const api = useApiClient();

  return useQuery({
    queryKey: pipelinesKeys.detail(pipelineId ?? ''),
    queryFn: () => api.get<Pipeline>(`/api/v1/admin/pipelines/${pipelineId}`),
    enabled: Boolean(sessionToken && pipelineId),
  });
}
