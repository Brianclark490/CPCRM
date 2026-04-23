# TanStack Query migration — retrospective

Closes the cleanup milestone of epic [#379](https://github.com/Brianclark490/CPCRM/issues/379).
Covers the four milestones landed between 2026-04-18 and 2026-04-23: foundation,
Kanban optimistic UI, Records + Field builder, and cleanup.

## What shipped

- `@tanstack/react-query` installed, `QueryClientProvider` mounted at
  `apps/web/src/App.tsx`, `ReactQueryDevtools` wired in dev builds only
  (`App.tsx:349`).
- Global client defaults in `apps/web/src/lib/queryClient.ts`: 5-minute
  `staleTime`, single retry, refetch-on-focus and refetch-on-reconnect.
- Single query-key factory in `apps/web/src/lib/queryKeys.ts` covering
  records, object definitions, field definitions, relationships, pipelines,
  and page layouts. Convention documented in
  [ADR 0001](adr/0001-query-key-factory.md).
- Test helper `renderWithQuery` (plus `createTestQueryClient`) so hooks
  render in unit tests against a fresh client per test.
- Hooks migrated off hand-rolled `useEffect` + `useState` fetchers:
  `usePipeline`, `useRecords`, `useObjectDefinition`, `useObjectDefinitions`,
  `useLayout`, `useFieldDefinitions`, `usePageLayoutList`,
  `useObjectRelationships`, `useRecord` (record detail composite),
  `AdminUsersPage` CRM-users query.
- Mutations landed on TanStack: `useMoveStage` (optimistic with 422
  rollback), `useUpdateRecord`, `useFieldMutations`,
  `useRelationshipMutations`, `usePageLayoutActions`.

## Measured dedup

Methodology: open Chrome DevTools → Network, filter on `/api/v1/`, hard-reload
the page, navigate through the flow, and count duplicate URLs within a
session. Numbers below are for a warm session (login already established).

| Flow                  | Before                                                                                | After                                                              |
| --------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| **Kanban board**      | Pipeline + records fetched on every mount; filter-bar edits re-fetched the full list. | Single `queryKeys.pipelines.detail` + `queryKeys.records.list` per `(pipelineId, filters)`; filter edits hit cache. |
| **Records list**      | Object definition re-fetched per page mount; pagination cleared data between pages.   | `queryKeys.objectDefinitions.detail` shared with record-detail; `keepPreviousData` removes the empty-flash between pages. |
| **Field builder**     | Object detail re-fetched after every field save; list jitter while the round-trip ran. | Mutations `invalidateQueries({ queryKey: queryKeys.objectDefinitions.detail(id) })` — one refetch per save, reordering is optimistic. |

The structural wins come from three places, not from tuning:

1. **One key per resource.** Every caller of "the account record with id
   X" routes through `queryKeys.records.detail('account', 'X')` (aka
   `recordsKeys.detail('account', 'X')`), so the second mount is a cache
   hit rather than a second network round-trip.
2. **5-minute `staleTime`.** Most navigations within a session reuse cache;
   the devtools refetch button still works when truly needed.
3. **`keepPreviousData` on `useRecords`.** Paginating/filtering a record
   list no longer empties the table between pages — one of the most visible
   UX wins.

## Cache-hit behaviour

Observed in React Query Devtools on a typical session (login → Kanban → open
a record → back to list → open field builder → back):

- The first visit to each surface populates its cache entry once. Re-visits
  within the 5-minute `staleTime` do not trigger a refetch.
- The shared `queryKeys.objectDefinitions.detail(id)` entry is used by both
  the record page and the field builder. Navigating between them is a
  cache hit.
- Mutations scope their invalidation: editing a field invalidates
  `queryKeys.objectDefinitions.detail(id)` and
  `queryKeys.fieldDefinitions.byObject(id)` only — unrelated objects'
  caches stay warm.
- `refetchOnWindowFocus` still fires a background refetch when the tab
  regains focus. The UI is served from cache in the meantime, so the user
  doesn't see a loading state for data they're already looking at.

## Wins

- **Optimistic Kanban drag-drop with 422 rollback.** `useMoveStage` snapshots
  one record (not the whole list), so concurrent successful moves on
  siblings aren't clobbered when one fails a gate check.
- **Targeted invalidation.** The hierarchical key factory means
  `invalidateQueries({ queryKey: queryKeys.records.byObject('account') })`
  refreshes the list and every detail view for accounts without touching
  other objects.
- **Smaller components.** Pages that used to own
  `useState<Data>()`+`useState<Error>()`+`useState<Loading>()` plus a
  `useEffect` fetch now pull a single hook and render the three result
  branches. `RecordListPage.tsx` and `KanbanBoard.tsx` are the clearest
  examples.
- **Testability.** `renderWithQuery` gives each test a clean client with
  retries off, so hooks test in isolation without mocking `useEffect`
  timing.
- **Dev ergonomics.** ReactQueryDevtools makes cache state inspectable at a
  glance — previously debugging a stale fetch meant `console.log` and
  guessing.

## Surprises

- **Tenant scoping belongs in the key, not just the URL.** `useRecords`
  accepts a `scope` option that's merged into the key but not the query
  string, because the records endpoint is tenant-filtered server-side via
  the session cookie. Without the scope in the key, switching
  organisations transiently showed the previous tenant's records from
  cache. PR #509 added this after review feedback.
- **`keepPreviousData` is worth the extra line.** The records list flicker
  when paginating was immediately noticeable in review, and adding
  `placeholderData: keepPreviousData` fixed it without any other changes.
- **Optimistic updates need record-level snapshots.** The first cut of
  `useMoveStage` snapshotted the whole list for rollback. Under concurrent
  drags, a rollback on one card clobbered another card's successful move.
  The fix — snapshot and restore only the affected record — is in
  `useMoveStage.ts:103-116`.
- **Mutations should key off variables, not closure.** `useFieldMutations`
  invalidates using `vars.objectId`, not the closed-over hook argument, so
  a route-param change while a save is in-flight can't hit the wrong cache
  entry. Easy bug to write, easy to miss in review.
- **Composite hooks are fine.** `useRecord` (record-detail) composes three
  queries and still feels tidy. The pre-TQ version of the same hook was
  ~150 lines of manual state juggling; the TQ version is ~140 lines mostly
  of type plumbing and error-message mapping.
- **Cache invalidation after cross-feature writes.** Publishing a page
  layout needed to refresh record pages that consume it; caught in the
  `refresh record pages after page-layout publish` fix (commit `0942923`).
  Worth checking any new mutation against "what other query keys render
  this data?".

## Next steps

Not blocking the epic, but worth tracking:

- 16 page-level `useEffect` fetchers remain (see `AccountsPage`,
  `AdminTargetsPage`, `AdminTenantSettingsPage`, `DashboardPage`,
  `ObjectManagerPage`, `PipelineManagerPage`, `PlatformTenantsPage`,
  `PlatformTenantDetailPage`, `ProfilePage`, `RecordCreatePage`,
  `TenantPickerPage`, etc.). These are lower-traffic admin surfaces and
  were out of scope for the epic; migrate opportunistically when touching
  those pages for unrelated work.
- Consider per-resource `staleTime` overrides for truly cheap, never-stale
  lookups (e.g. tenant locale) — currently they share the 5-minute default.
- Add a lint rule or review checklist item: `useQuery({ queryKey: [...] })`
  must source the key from `queryKeys.ts`. ADR 0001 says "code review
  should reject" but a mechanical check would be cheaper.
- Revisit the open-ended `ListParams = Readonly<Record<string, unknown>>`
  once we have two or three callers that would benefit from narrower types
  (filtering enums, pagination shape).

## References

- Epic: [#379 Adopt TanStack Query for server state](https://github.com/Brianclark490/CPCRM/issues/379)
- ADR: [0001 Query-key factory + shared types](adr/0001-query-key-factory.md)
- Key factory: `apps/web/src/lib/queryKeys.ts`
- Client config: `apps/web/src/lib/queryClient.ts`
- Provider wrap point: `apps/web/src/App.tsx`
- Test helper: `apps/web/src/__tests__/utils/renderWithQuery.tsx`
