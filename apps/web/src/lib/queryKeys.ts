/**
 * Centralised TanStack Query key factory.
 *
 * Every `useQuery` / `useMutation` hook in the web app **must** source its
 * `queryKey` from this module. Hand-rolled string arrays drift over time and
 * make targeted invalidation a guessing game; a single hierarchical factory
 * keeps keys typed, discoverable, and trivial to invalidate at the right
 * scope.
 *
 * See `docs/adr/0001-query-key-factory.md` for the convention.
 */

// ─── Domain primitives ──────────────────────────────────────────────────────

/**
 * Object API name (e.g. `'account'`, `'opportunity'`). The string the
 * `/api/v1/objects/:apiName/...` routes use as the path parameter.
 */
export type ObjectApiName = string;

/** Opaque identifier for a single record. */
export type RecordId = string;

/** Opaque identifier for an object definition. */
export type ObjectDefinitionId = string;

/** Opaque identifier for a pipeline. */
export type PipelineId = string;

/** Opaque identifier for a page layout. */
export type PageLayoutId = string;

/**
 * Parameters that materially affect the response of a list endpoint.
 *
 * Kept open-ended so each caller can pass the filters/sort/pagination it
 * actually uses without having to extend a central enum. Values are inlined
 * into the query key, so prefer plain primitives (string / number / boolean)
 * over object references.
 */
export type ListParams = Readonly<Record<string, unknown>>;

// ─── Records ────────────────────────────────────────────────────────────────

/**
 * Keys for `/api/v1/objects/:apiName/records` and friends.
 *
 * Hierarchy:
 *   ['records']                                — invalidate every record query
 *   ['records', apiName]                       — every query for one object
 *   ['records', apiName, 'list', params]       — a specific list view
 *   ['records', apiName, 'detail', id]         — a specific record
 */
export const recordsKeys = {
  all: () => ['records'] as const,
  byObject: (apiName: ObjectApiName) => ['records', apiName] as const,
  list: (apiName: ObjectApiName, params?: ListParams) =>
    ['records', apiName, 'list', params ?? {}] as const,
  detail: (apiName: ObjectApiName, id: RecordId) => ['records', apiName, 'detail', id] as const,
} as const;

// ─── Object definitions ─────────────────────────────────────────────────────

/**
 * Keys for `/api/v1/admin/objects` (object definitions / metadata).
 *
 * Hierarchy:
 *   ['objectDefinitions']                      — invalidate everything
 *   ['objectDefinitions', 'all']               — the list of all definitions
 *   ['objectDefinitions', 'detail', id]        — one definition
 */
export const objectDefinitionsKeys = {
  root: () => ['objectDefinitions'] as const,
  all: () => ['objectDefinitions', 'all'] as const,
  detail: (id: ObjectDefinitionId) => ['objectDefinitions', 'detail', id] as const,
} as const;

// ─── Field definitions ──────────────────────────────────────────────────────

/**
 * Keys for the field-definition endpoints scoped to an object.
 *
 * Hierarchy:
 *   ['fieldDefinitions']                       — invalidate everything
 *   ['fieldDefinitions', objectId]             — every field-def query for one object
 *   ['fieldDefinitions', objectId, 'list']     — the list of fields on one object
 */
export const fieldDefinitionsKeys = {
  all: () => ['fieldDefinitions'] as const,
  byObject: (objectId: ObjectDefinitionId) => ['fieldDefinitions', objectId] as const,
  list: (objectId: ObjectDefinitionId) => ['fieldDefinitions', objectId, 'list'] as const,
} as const;

// ─── Pipelines ──────────────────────────────────────────────────────────────

/**
 * Keys for `/api/v1/admin/pipelines` and `/api/v1/pipelines/:id/...`.
 *
 * Hierarchy:
 *   ['pipelines']                                    — invalidate everything
 *   ['pipelines', 'list']                            — the list of all pipelines
 *   ['pipelines', 'detail', pipelineId]              — one pipeline's full payload
 *   ['pipelines', 'analytics', pipelineId]           — every analytics query (summary/velocity/overdue)
 */
export const pipelinesKeys = {
  all: () => ['pipelines'] as const,
  list: () => ['pipelines', 'list'] as const,
  detail: (pipelineId: PipelineId) => ['pipelines', 'detail', pipelineId] as const,
  analytics: (pipelineId: PipelineId) =>
    ['pipelines', 'analytics', pipelineId] as const,
} as const;

// ─── Relationships ──────────────────────────────────────────────────────────

/**
 * Keys for `/api/v1/admin/objects/:objectId/relationships` and
 * `/api/v1/admin/relationships`.
 *
 * Hierarchy:
 *   ['relationships']                          — invalidate everything
 *   ['relationships', objectId]                — every relationship query for one object
 *   ['relationships', objectId, 'list']        — the list of relationships for one object
 */
export const relationshipsKeys = {
  all: () => ['relationships'] as const,
  byObject: (objectId: ObjectDefinitionId) => ['relationships', objectId] as const,
  list: (objectId: ObjectDefinitionId) => ['relationships', objectId, 'list'] as const,
} as const;

// ─── Page layouts ───────────────────────────────────────────────────────────

/**
 * Keys for the page-layout endpoints.
 *
 * Hierarchy:
 *   ['pageLayouts']                                        — invalidate everything
 *   ['pageLayouts', 'object', objectId]                    — every layout query for one object
 *   ['pageLayouts', 'object', objectId, 'list']            — the list of layouts for one object
 *   ['pageLayouts', 'object', objectId, 'resolved', type]  — the default-of-type layout for one object
 *   ['pageLayouts', 'detail', layoutId]                    — one specific layout
 *   ['pageLayouts', 'effective', apiName]                  — the effective published layout the record page consumes
 */
export const pageLayoutsKeys = {
  all: () => ['pageLayouts'] as const,
  byObject: (objectId: ObjectDefinitionId) => ['pageLayouts', 'object', objectId] as const,
  list: (objectId: ObjectDefinitionId) => ['pageLayouts', 'object', objectId, 'list'] as const,
  resolved: (objectId: ObjectDefinitionId, layoutType: string) =>
    ['pageLayouts', 'object', objectId, 'resolved', layoutType] as const,
  detail: (layoutId: PageLayoutId) => ['pageLayouts', 'detail', layoutId] as const,
  effective: (apiName: ObjectApiName) => ['pageLayouts', 'effective', apiName] as const,
} as const;

// ─── Aggregate export ───────────────────────────────────────────────────────

/**
 * Single namespace import for callers that want to write
 * `queryKeys.records.detail(...)` rather than juggling individual factories.
 */
export const queryKeys = {
  records: recordsKeys,
  objectDefinitions: objectDefinitionsKeys,
  fieldDefinitions: fieldDefinitionsKeys,
  relationships: relationshipsKeys,
  pipelines: pipelinesKeys,
  pageLayouts: pageLayoutsKeys,
} as const;

/**
 * Union of every key shape produced by this module. Useful for typing
 * helpers that accept "any query key from our factory" without resorting to
 * `unknown[]`.
 */
export type AppQueryKey =
  | ReturnType<(typeof recordsKeys)[keyof typeof recordsKeys]>
  | ReturnType<(typeof objectDefinitionsKeys)[keyof typeof objectDefinitionsKeys]>
  | ReturnType<(typeof fieldDefinitionsKeys)[keyof typeof fieldDefinitionsKeys]>
  | ReturnType<(typeof relationshipsKeys)[keyof typeof relationshipsKeys]>
  | ReturnType<(typeof pipelinesKeys)[keyof typeof pipelinesKeys]>
  | ReturnType<(typeof pageLayoutsKeys)[keyof typeof pageLayoutsKeys]>;
