# Phase 2 Kysely Migration: pipelineService - Summary

## Outcome: Pilot Complete with Important Findings

### What Was Accomplished

✅ **Complete Kysely Implementation**
- Created `apps/api/src/services/pipelineService.kysely.ts` (909 lines)
- All 15 exported functions migrated with identical signatures
- Full type safety using `Selectable<T>`, `Insertable<T>`, `Updateable<T>`
- Transaction support via `db.transaction().execute()`
- Zero raw SQL - all queries type-checked
- Passes `npm run typecheck`

### Critical Discovery: Test Strategy Needs Updating

**Finding:** The existing mock-based testing approach is incompatible with Kysely's query builder pattern.

**Why:**
Current tests mock `pool.query(sql, params)` and parse SQL strings:
```typescript
const mockQuery = vi.fn(async (sql: string, params?: unknown[]) => {
  if (sql.toUpperCase().startsWith('SELECT ID FROM OBJECT_DEFINITIONS')) {
    return { rows: [fakeData] };
  }
});
```

Kysely doesn't expose raw SQL in user code - queries are built and compiled internally. The mocks intercept at the wrong layer.

**Impact:**
- Existing 57 tests cannot verify Kysely implementation
- This affects ALL future service migrations
- Need organization-wide decision on testing strategy

### Recommendations for Path Forward

#### Option A: Integration Tests (Recommended for Production)
**Setup:**
```bash
npm install --save-dev @testcontainers/postgresql
```

**Benefits:**
- Tests real SQL execution
- Works for both pg and Kysely
- Catches actual database bugs
- Future-proof

**Trade-offs:**
- Requires Docker in CI
- ~500ms overhead per test suite
- More complex setup

**Estimated effort:** 2-3 days to update all pipeline tests

#### Option B: Accept Gap for Pilot
**Approach:**
- Merge Kysely implementation as "experimental"
- Mark Phase 2 as "technical proof of concept"
- Defer test updates to Phase 3
- Document risk

**Benefits:**
- Unblocks Phase 3 planning
- Proves migration is technically viable
- Fast path to learning

**Trade-offs:**
- No automated regression tests for Kysely version
- Requires manual testing before production use
- Risk of bugs in production

**Estimated effort:** Already complete

#### Option C: Manual Integration Testing
**Approach:**
- Deploy to staging environment
- Run manual test scenarios
- Use production-like database
- Monitor for 1 week

**Benefits:**
- Real-world validation
- No test refactoring needed
- Confidence from actual usage

**Trade-offs:**
- Manual effort for each change
- Not repeatable
- Doesn't scale to 40+ services

**Estimated effort:** 1-2 days of manual testing

### Code Quality Metrics

| Metric | Raw SQL | Kysely | Change |
|--------|---------|--------|--------|
| Lines of Code | 844 | 909 | +7.7% |
| Type Safety | Partial | Full | ✅ |
| Compile-time Errors | No | Yes | ✅ |
| IDE Autocomplete | No | Yes | ✅ |
| SQL Injection Risk | Low* | None | ✅ |
| Query Readability | Medium | High | ✅ |

*Uses parameterized queries, but no compile-time checking

### Sample Code Comparison

**Before (Raw SQL):**
```typescript
const result = await pool.query(
  `SELECT * FROM pipeline_definitions
   WHERE tenant_id = $1
   ORDER BY is_system DESC, created_at ASC`,
  [tenantId]
);
return result.rows.map(row => rowToPipeline(row));
```

**After (Kysely):**
```typescript
const rows = await db
  .selectFrom('pipeline_definitions')
  .selectAll()
  .where('tenant_id', '=', tenantId)
  .orderBy('is_system', 'desc')
  .orderBy('created_at', 'asc')
  .execute();
return rows.map(rowToPipeline);
```

**Benefits:**
- Typo in table name → compile error (not runtime)
- Typo in column name → compile error
- Wrong operator → type error
- Missing parameter → type error

### Next Steps (Pending Decision)

**If proceeding with integration tests:**
1. Set up testcontainers infrastructure
2. Rewrite `pipelineService.test.ts` for test DB
3. Run comparison tests (pg vs Kysely)
4. Benchmark performance
5. Swap implementation
6. Document pattern for Phase 3

**If accepting pilot as-is:**
1. Update ADR-006 with test findings
2. Mark pipelineService as "migrated pending test coverage"
3. Plan Phase 3 with test strategy included
4. Use this pilot to inform broader migration plan

### Questions for Product/Engineering Leadership

1. **Test Strategy:** Which option (A/B/C) aligns with organization's risk tolerance and timeline?

2. **Scope Creep:** Should Phase 2 include test infrastructure setup, or is that Phase 3 work?

3. **Pilot Definition:** Is the goal to fully production-ize one service, or prove technical feasibility?

4. **Resource Allocation:** Is 2-3 days for test setup within Phase 2 budget?

### Files Delivered

- ✅ `apps/api/src/services/pipelineService.kysely.ts` - Full implementation
- ✅ `apps/api/KYSELY_MIGRATION_NOTES.md` - Detailed technical notes
- ✅ `apps/api/PHASE2_SUMMARY.md` - This summary
- ❌ `apps/api/src/services/__tests__/pipelineService.comparison.test.ts` - Blocked on test strategy decision
- ❌ Performance benchmark - Blocked on test database setup

### Recommendation

**For this PR:**
- Merge Kysely implementation as parallel file
- Update ADR-006 with test strategy findings
- Do NOT swap implementation yet
- Mark as "experimental - not production ready"

**For Phase 3:**
- Address test infrastructure first (before migrating more services)
- This unblocks the remaining 40+ services
- Establishes reusable pattern

**Rationale:**
The test compatibility issue is not unique to pipelineService - it will affect every service migration. Solving it once benefits all future work.

---

**Prepared by:** Claude Code Agent
**Date:** 2026-04-14
**Branch:** `claude/kysely-migrate-pipelineservice`
**Related:** Issue #XXX (Phase 2 Pilot), ADR-006
