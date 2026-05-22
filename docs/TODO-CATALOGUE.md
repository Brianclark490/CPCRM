# TODO / @deprecated Catalogue

> Generated as part of Issue 0.1 — Delete dead code and stubs.
> Last updated: 2026-05-22

## Summary

All deprecated code and stale TODO comments have been removed from both the
backend (`apps/api`) and the frontend (`apps/web`). No `// TODO`,
`@deprecated`, `// FIXME`, or `// HACK` markers remain anywhere in the
codebase. Verified via full grep on 2026-05-22.

## What was removed

| File | Marker | Action |
|------|--------|--------|
| `apps/api/src/routes/opportunities.ts` | `@deprecated` | Deleted — route was retired in favour of `/api/objects/opportunity/records` |
| `apps/api/src/routes/__tests__/opportunities.test.ts` | `@deprecated` | Deleted — test for the retired route |
| `apps/api/src/services/opportunityService.ts` | `@deprecated` | Deleted — validation helpers were unused after migration to dynamic records engine |
| `apps/api/src/services/__tests__/opportunityService.test.ts` | `@deprecated` | Deleted — tests for the deprecated service |
| `apps/api/src/services/organisationService.ts` | `TODO` | Removed stale comment — the function already uses real database writes via `pool.query()` |
| `apps/web/src/pages/CreateOpportunityPage.tsx` | `@deprecated` | Deleted — replaced by dynamic records engine |
| `apps/web/src/pages/OpportunitiesPage.tsx` | `@deprecated` | Deleted — replaced by dynamic records engine |
| `apps/web/src/pages/OpportunityDetailPage.tsx` | `@deprecated` | Deleted — replaced by dynamic records engine |
| `apps/web/src/__tests__/CreateOpportunityPage.test.tsx` | `@deprecated` | Deleted — tests for deprecated page |
| `apps/web/src/__tests__/OpportunitiesPage.test.tsx` | `@deprecated` | Deleted — tests for deprecated page |
| `apps/web/src/__tests__/OpportunityDetailPage.test.tsx` | `@deprecated` | Deleted — tests for deprecated page |

## Remaining items

None. Codebase is clean.
