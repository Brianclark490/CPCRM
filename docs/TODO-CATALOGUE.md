# TODO / @deprecated Catalogue

> Generated as part of Issue 0.1 — Delete dead code and stubs.
> Last updated: 2026-04-09

## Summary

After cleaning up deprecated files and stale TODO comments in the **backend
(`apps/api`)**, no `// TODO` or `@deprecated` markers remain in that layer.
The frontend (`apps/web`) still contains deprecated opportunity pages that are
tracked in the "Remaining items" section below.

## What was removed

| File | Marker | Action |
|------|--------|--------|
| `apps/api/src/routes/opportunities.ts` | `@deprecated` | Deleted — route was retired in favour of `/api/objects/opportunity/records` |
| `apps/api/src/routes/__tests__/opportunities.test.ts` | `@deprecated` | Deleted — test for the retired route |
| `apps/api/src/services/opportunityService.ts` | `@deprecated` | Deleted — validation helpers were unused after migration to dynamic records engine |
| `apps/api/src/services/__tests__/opportunityService.test.ts` | `@deprecated` | Deleted — tests for the deprecated service |
| `apps/api/src/services/organisationService.ts` | `TODO` | Removed stale comment — the function already uses real database writes via `pool.query()` |

## Remaining items

The following **frontend** files still carry `@deprecated` markers and can be
removed in a follow-up cleanup:

| File | Marker |
|------|--------|
| `apps/web/src/pages/CreateOpportunityPage.tsx` | `@deprecated` |
| `apps/web/src/pages/OpportunitiesPage.tsx` | `@deprecated` |
| `apps/web/src/pages/OpportunityDetailPage.tsx` | `@deprecated` |
| `apps/web/src/__tests__/CreateOpportunityPage.test.tsx` | `@deprecated` |
| `apps/web/src/__tests__/OpportunitiesPage.test.tsx` | `@deprecated` |
| `apps/web/src/__tests__/OpportunityDetailPage.test.tsx` | `@deprecated` |
