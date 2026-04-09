# TODO / @deprecated Catalogue

> Generated as part of Issue 0.1 — Delete dead code and stubs.
> Last updated: 2026-04-09

## Summary

After cleaning up deprecated files and stale TODO comments, a full search of the
codebase found **no remaining `// TODO` or `@deprecated` markers**.

## What was removed

| File | Marker | Action |
|------|--------|--------|
| `apps/api/src/routes/opportunities.ts` | `@deprecated` | Cleared — route was retired in favour of `/api/objects/opportunity/records` |
| `apps/api/src/routes/__tests__/opportunities.test.ts` | `@deprecated` | Cleared — test for the retired route |
| `apps/api/src/services/opportunityService.ts` | `@deprecated` | Cleared — validation helpers were unused after migration to dynamic records engine |
| `apps/api/src/services/__tests__/opportunityService.test.ts` | `@deprecated` | Cleared — tests for the deprecated service |
| `apps/api/src/services/organisationService.ts` | `TODO` | Removed stale comment — the function already uses real database writes via `pool.query()` |

## Remaining items

None found. The codebase is clean of `// TODO` and `@deprecated` markers.
