# ADR 0001: TanStack Query key factory + shared types

## Status

Accepted — 2026-04-18

## Context

Epic [#379](https://github.com/Brianclark490/CPCRM/issues/379) migrates the
web app from hand-rolled `useEffect` + `useState` server-state code to
TanStack Query. Once even a handful of hooks land, two failure modes appear
within days of any "agree on a convention later" approach:

1. **Drift in query keys.** Two hooks that fetch the same resource end up
   with subtly different keys (`['account', id]` vs `['accounts', id]` vs
   `['records', 'account', id]`). The cache silently double-fetches and the
   developer who has to invalidate has to grep for every variant.
2. **Imprecise invalidation.** Without a hierarchy it's tempting to either
   `invalidateQueries()` everything (kills perf) or pass a hand-typed array
   that doesn't match what a sibling hook produced (silent staleness).

A central, hierarchical query-key factory — the pattern popularised by
`tkdodo` — fixes both. Every hook imports its key from one module, and
`queryClient.invalidateQueries({ queryKey: queryKeys.records.byObject(name) })`
hits exactly the right scope.

This ADR is part of the **TQ: Foundation** milestone (issue
[#471](https://github.com/Brianclark490/CPCRM/issues/471)) and must land
before the first real hook in milestone M2.

## Decision

### 1. Single source of truth

All query keys live in `apps/web/src/lib/queryKeys.ts`. Hooks **never**
inline key arrays. Code review should reject any new `useQuery({ queryKey:
['...'] })` whose key isn't sourced from this file.

### 2. Hierarchical shape

Every key is a tuple beginning with a stable string discriminator and
narrowing left-to-right:

```
[domain, ...scope, kind, ...args]
```

For example:

| Factory call                                  | Resulting key                                       |
| --------------------------------------------- | --------------------------------------------------- |
| `records.all()`                               | `['records']`                                       |
| `records.byObject('account')`                 | `['records', 'account']`                            |
| `records.list('account', { limit: 25 })`      | `['records', 'account', 'list', { limit: 25 }]`    |
| `records.detail('account', 'rec-1')`          | `['records', 'account', 'detail', 'rec-1']`        |
| `objectDefinitions.all()`                     | `['objectDefinitions', 'all']`                      |
| `objectDefinitions.detail('obj-1')`           | `['objectDefinitions', 'detail', 'obj-1']`          |
| `fieldDefinitions.list('obj-1')`              | `['fieldDefinitions', 'obj-1', 'list']`             |
| `pipelines.detail('pipe-1')`                  | `['pipelines', 'detail', 'pipe-1']`                 |
| `pageLayouts.list('obj-1')`                   | `['pageLayouts', 'object', 'obj-1', 'list']`        |
| `pageLayouts.detail('layout-1')`              | `['pageLayouts', 'detail', 'layout-1']`             |

The hierarchy directly mirrors what we want to be able to invalidate:

- After a record mutation: `invalidateQueries({ queryKey: records.byObject(apiName) })`
  refreshes both the list and the detail without touching unrelated objects.
- After an admin edits an object's fields: `invalidateQueries({ queryKey:
  fieldDefinitions.byObject(objectId) })` clears the field list for that one
  object but leaves every other object's metadata cached.

### 3. `as const` everywhere

Every factory returns an `as const` tuple and is itself declared `as const`.
This gives TanStack Query the literal-type information it needs for the
generic inference on `useQuery`/`useMutation`, and lets the exported
`AppQueryKey` union catch typos at compile time.

### 4. List parameters are inlined into the key

`records.list(apiName, params)` includes `params` as the final tuple element.
TanStack Query hashes keys structurally, so two calls with equivalent params
share a cache entry without any extra work from the caller. Callers should
pass primitives only (no functions, dates, or class instances) so the hash
is stable across renders.

When a caller has no params, `records.list(apiName)` defaults to `{}` so the
key is still well-formed and stable.

### 5. Folder convention

This ADR establishes `docs/adr/` as the home for **frontend / cross-cutting
engineering** ADRs that aren't tied to backend architecture. The existing
`docs/architecture/adr-NNN-*.md` files (API versioning, tenant isolation,
etc.) remain where they are — they document long-lived backend decisions
and renaming them would invalidate every inbound link.

New ADRs in this folder are numbered `NNNN-kebab-case.md` starting at
`0001`.

## Consequences

**Positive**

- Cache hits go up because every hook fetching the same resource uses the
  same key.
- Invalidation becomes a one-line, scoped call instead of a grep-and-pray
  exercise.
- Adding a new resource family (e.g. `notifications`) is a single ~10-line
  addition to one file, reviewable in isolation.
- TypeScript catches misspelled keys (`recordsKeys.detial(...)`) before they
  ship.

**Negative**

- One more file every PR touches when adding a new server-state hook. Worth
  it: the cost of getting cache keys wrong vastly exceeds the cost of
  editing one well-known file.
- Some callers will want richer parameter types than the open-ended
  `ListParams = Readonly<Record<string, unknown>>`. We start permissive and
  tighten per-resource if/when the looseness causes a real bug.

## Alternatives considered

- **Inline string-array keys in each hook.** Rejected: this is exactly the
  drift the epic is trying to eliminate.
- **One enormous typed enum of every key.** Rejected: forces every new key
  through a single hot file and produces unwieldy union types. The factory
  pattern gives the same compile-time safety with better ergonomics.
- **A third-party library (e.g. `@lukemorales/query-key-factory`).** Out of
  scope for the foundation milestone — adding a dependency for ~150 lines of
  code we'd otherwise own outright is a poor trade. Revisit if the factory
  grows past ~500 lines.

## References

- Epic: [#379 Adopt TanStack Query for server state](https://github.com/Brianclark490/CPCRM/issues/379)
- Issue: [#471 TQ: Query-key factory + shared types](https://github.com/Brianclark490/CPCRM/issues/471)
- Implementation: `apps/web/src/lib/queryKeys.ts`
- Tests: `apps/web/src/lib/__tests__/queryKeys.test.ts`
- Background reading: <https://tkdodo.eu/blog/effective-react-query-keys>
