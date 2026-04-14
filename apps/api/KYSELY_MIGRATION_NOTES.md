# Kysely Migration: pipelineService (Phase 2)

## Status: Implementation Complete, Test Adaptation Required

### Completed Work

✅ **Full Kysely Implementation** (`pipelineService.kysely.ts`)
- All 15 exported functions ported with identical signatures
- Type-safe query building using Kysely's `Selectable`, `Insertable`, `Updateable`
- Transaction support via `db.transaction().execute()`
- RLS-aware (uses same `pool` proxy as original)
- Zero raw SQL strings - all type-checked queries
- Passes TypeScript compilation

### Key Changes from Raw SQL → Kysely

#### Before (Raw SQL):
```typescript
const result = await pool.query(
  'SELECT * FROM pipeline_definitions WHERE id = $1 AND tenant_id = $2',
  [id, tenantId]
);
return result.rows[0] ? rowToPipeline(result.rows[0]) : null;
```

#### After (Kysely):
```typescript
const row = await db
  .selectFrom('pipeline_definitions')
  .selectAll()
  .where('id', '=', id)
  .where('tenant_id', '=', tenantId)
  .executeTakeFirst();
return row ? rowToPipeline(row) : null;
```

#### Transaction Pattern (Before):
```typescript
const client = await pool.connect();
try {
  await client.query('BEGIN');
  // ... queries
  await client.query('COMMIT');
  return result;
} catch (err) {
  await client.query('ROLLBACK');
  throw err;
} finally {
  client.release();
}
```

#### Transaction Pattern (After):
```typescript
return await db.transaction().execute(async (trx) => {
  // ... queries using trx instead of db
  return result;
  // automatic commit/rollback
});
```

### Test Compatibility Challenge

**Issue:**
The existing `pipelineService.test.ts` uses sophisticated SQL string-based mocking:

```typescript
const mockQuery = vi.fn(async (sql: string, params?: unknown[]) => {
  const s = sql.replace(/\s+/g, ' ').trim().toUpperCase();
  if (s.startsWith('SELECT ID FROM OBJECT_DEFINITIONS WHERE ID')) {
    // ... return mocked data
  }
  // ... 20+ SQL pattern matches
});

vi.mock('../../db/client.js', () => ({
  pool: { query: mockQuery, connect: ... }
}));
```

This approach:
- Parses and matches raw SQL strings
- Works perfectly for `pool.query(sql, params)` calls
- Does NOT intercept Kysely query builder calls

**Why Kysely is Different:**
Kysely doesn't call `pool.query(sql, params)` directly in user code. Instead:
1. User builds query objects via method chaining
2. Kysely compiles query objects to SQL internally
3. The compiled SQL is passed to the dialect's driver
4. The PostgresDialect eventually calls `pool.query()`, but this happens deep in Kysely's internals

The mock intercepts the *original* `pool.query()` calls, but Kysely's internal query execution path is different enough that the string-based pattern matching doesn't work reliably.

### Solutions (Ranked by Recommendation)

#### Option 1: Integration Tests with Test Database (RECOMMENDED)
Use a real PostgreSQL instance for testing:

```typescript
import { db } from '../db/kysely.js';
import { sql } from 'kysely';

beforeEach(async () => {
  // Clean slate for each test
  await db.transaction().execute(async (trx) => {
    await sql`TRUNCATE TABLE pipeline_definitions, stage_definitions, stage_gates CASCADE`.execute(trx);
  });
});

it('creates pipeline with terminal stages', async () => {
  const result = await createPipeline(TENANT_ID, { ... });
  expect(result.stages).toHaveLength(2);
  expect(result.stages[0].stageType).toBe('won');
});
```

**Pros:**
- Tests actual SQL execution
- Catches real database issues (constraints, indexes, etc.)
- More realistic than mocks
- Works identically for both pg and Kysely

**Cons:**
- Requires test database setup
- Slightly slower than in-memory mocks

**Implementation:**
- Use `testcontainers` or `@databases/pg-test` for ephemeral PostgreSQL
- Run migrations before tests
- Clean up between tests with `TRUNCATE CASCADE`

#### Option 2: Mock Kysely Dialect
Create a custom test dialect that uses in-memory storage:

```typescript
import { Kysely } from 'kysely';
import { InMemoryDialect } from './testing/InMemoryDialect';

vi.mock('../db/kysely.js', () => ({
  db: new Kysely({ dialect: new InMemoryDialect() })
}));
```

**Pros:**
- Fast (in-memory)
- No external dependencies

**Cons:**
- Need to implement full dialect interface
- Complex to maintain
- May not catch real SQL bugs

#### Option 3: Hybrid - Keep Raw SQL for Tests
Keep the original implementation for testing purposes:

```typescript
// pipelineService.ts - use Kysely
// pipelineService.pg.ts - keep for test compatibility
```

**Pros:**
- Tests continue to work unchanged
- Can gradually migrate tests

**Cons:**
- Maintains two implementations
- Risk of divergence
- Defeats purpose of migration

### Recommendation

**For Phase 2 Pilot:**
Use **Option 1** (test database) with the following approach:

1. Install `@databases/pg-test`:
   ```bash
   npm install --save-dev @databases/pg-test
   ```

2. Create test helper:
   ```typescript
   // src/testing/db.ts
   import createConnectionPool, { sql } from '@databases/pg';
   import { Kysely, PostgresDialect } from 'kysely';

   export const testDb = new Kysely({
     dialect: new PostgresDialect({
       pool: createConnectionPool(process.env.DATABASE_URL)
     })
   });

   export async function cleanDatabase() {
     await sql`TRUNCATE TABLE pipeline_definitions, stage_definitions, stage_gates CASCADE`.execute(testDb);
   }
   ```

3. Rewrite tests to use real DB:
   ```typescript
   beforeEach(async () => {
     await cleanDatabase();
     // Seed test data using Kysely
   });
   ```

### Migration Checklist

- [x] Kysely implementation complete (`pipelineService.kysely.ts`)
- [x] All functions ported with identical signatures
- [x] Transactions use `db.transaction().execute()`
- [x] Type safety verified (passes `npm run typecheck`)
- [x] No `pool.query()` calls in Kysely version
- [ ] Test database setup configured
- [ ] Tests rewritten for integration testing
- [ ] Performance benchmark (compare pg vs Kysely)
- [ ] Swap `pipelineService.ts` with Kysely version
- [ ] Verify routes work unchanged
- [ ] Full test suite passes
- [ ] Production deployment and monitoring

### Performance Considerations

**Expected:**
- Kysely adds ~1-2ms overhead per query (query builder compilation)
- Transaction performance should be identical (same underlying pool)
- Type safety prevents entire classes of runtime errors

**To Measure:**
Run 1000 iterations of:
- `listPipelines()`
- `getPipelineById()`
- `updatePipeline()`

Record p50, p95, p99 latencies for both implementations.

### Rollback Plan

If issues arise after deployment:

```bash
# Revert to raw SQL implementation
git revert <merge-sha>
git push origin main
```

The original implementation is preserved in git history and can be restored with a single revert.

### Next Steps

1. **Immediate:** Set up test database infrastructure
2. **Next:** Rewrite `pipelineService.test.ts` to use test DB
3. **Then:** Run comparison tests (pg vs Kysely) to verify parity
4. **Finally:** Swap implementation and monitor production

### Questions for Review

1. Should we invest in test database setup for this pilot, or defer to Phase 3?
2. Is it acceptable to merge the Kysely implementation without full test coverage, documenting the testing gap?
3. Should we run manual integration tests instead of automated tests for this pilot?

---

**Author:** Claude Code Agent
**Date:** 2026-04-14
**Related:** ADR-006, Phase 2 Pilot Issue
