# Kysely Migration Plan

## Overview

This document outlines the phased approach to migrating CPCRM API services from raw `pg` queries to Kysely for type-safe database access.

**Decision:** See [ADR-006: Query Builder Evaluation](../architecture/adr-006-query-builder-evaluation.md)

**Timeline:** 16 weeks (8.5 dev-weeks of effort)

**Risk Level:** Low (incremental, parallel implementations, rollback-friendly)

---

## Migration Phases

### Phase 1: Foundation (Week 1)

**Status:** ⏳ Proposed

**Objective:** Establish Kysely infrastructure without changing existing code

**Tasks:**
- [x] Install dependencies (`kysely`, `kysely-codegen`)
- [ ] Set up database type generation script
- [ ] Generate initial types from database
- [ ] Create Kysely client wrapper
- [ ] Document usage in CONTRIBUTING.md
- [ ] Add CI checks for type freshness

**Deliverables:**
- Kysely configured and ready to use
- Type definitions generated from current schema
- Zero existing code changed
- Team documentation complete

**Exit Criteria:**
- `npm run db:types` generates correct types
- Kysely client imports successfully
- All existing tests still pass

---

### Phase 2: Pilot Service (Weeks 2-3)

**Status:** ⏳ Proposed

**Objective:** Validate approach with one service migration

**Target Service:** `pipelineService.ts` (500 lines)
- **Rationale:** Medium complexity, well-tested, high visibility
- **Complexity:** CRUD + joins + conditional logic
- **Risk:** Low (single service, parallel implementation)

**Tasks:**
- [ ] Create parallel Kysely implementation
- [ ] Write comparison tests (raw pg vs Kysely output)
- [ ] Validate query results match exactly
- [ ] Measure performance impact
- [ ] Replace raw implementation
- [ ] Monitor production for 1 week
- [ ] Collect team feedback

**Deliverables:**
- One service fully migrated to Kysely
- Test suite passing
- Performance validated (< 5% overhead)
- Developer feedback documented

**Exit Criteria:**
- All tests pass
- No query output differences
- No performance regression
- Team comfortable with Kysely syntax

**Rollback Plan:**
- Keep `pipelineService.pg.ts.backup` for 2 weeks
- Can swap back instantly if issues arise

---

### Phase 3: Incremental Rollout (Weeks 4-15)

**Status:** ⏳ Proposed

**Objective:** Migrate all remaining services incrementally

**Services to Migrate:** 20 services, prioritized by value/risk

#### Batch 1: High Value, Low Risk (Weeks 4-6)

1. **stageMovementService** (~400 lines)
   - Frequent changes (high churn)
   - Benefits from type safety
   - Medium complexity

2. **pipelineAnalyticsService** (~300 lines)
   - Complex SQL with aggregations
   - JSONB operations
   - Analytics-critical

3. **stageGateService** (~250 lines)
   - Simple CRUD
   - Easy migration
   - Low risk

#### Batch 2: High Value, Medium Risk (Weeks 7-10)

4. **recordService** (~1,000 lines)
   - Most complex service
   - Critical functionality
   - Requires careful testing

5. **fieldDefinitionService** (~500 lines)
   - Schema-critical
   - Metadata engine core
   - Medium complexity

6. **objectDefinitionService** (~400 lines)
   - Schema-critical
   - Metadata engine core
   - Medium complexity

#### Batch 3: Medium Value (Weeks 11-15)

7-20. **Remaining services** (accounts, organisations, relationships, layouts, etc.)
   - Migrate 2-3 per week
   - Lower priority
   - Can be parallelized with feature work

**Approach per Service:**
1. Create parallel Kysely implementation (`<service>.kysely.ts`)
2. Write comparison tests
3. Validate output matches
4. Replace original
5. Monitor for 1 week
6. Move to next service

**Exit Criteria:**
- All 21 services migrated
- Test suite passing
- No production issues
- Developer satisfaction positive

---

### Phase 4: Automation (Week 16)

**Status:** ⏳ Proposed

**Objective:** Automate type regeneration in CI/CD

**Tasks:**
- [ ] Add pre-migration hook for type generation
- [ ] Add CI check for type freshness
- [ ] Document type regeneration workflow
- [ ] Train team on automated process
- [ ] Remove backup files

**Deliverables:**
- Types auto-regenerate on migration
- CI enforces type freshness
- Documentation complete
- Team trained

**Exit Criteria:**
- CI fails if types out of date
- Team comfortable with workflow
- Backup files removed

---

## Service Priority Matrix

| Service | Lines | Complexity | Value | Risk | Priority | Batch |
|---------|-------|------------|-------|------|----------|-------|
| pipelineService | 500 | Medium | High | Low | 1 | Pilot |
| stageMovementService | 400 | Medium | High | Low | 2 | Batch 1 |
| pipelineAnalyticsService | 300 | High | High | Low | 3 | Batch 1 |
| stageGateService | 250 | Low | Medium | Low | 4 | Batch 1 |
| recordService | 1,000 | Very High | High | Medium | 5 | Batch 2 |
| fieldDefinitionService | 500 | Medium | High | Medium | 6 | Batch 2 |
| objectDefinitionService | 400 | Medium | High | Medium | 7 | Batch 2 |
| relationshipDefinitionService | 350 | Medium | Medium | Low | 8 | Batch 3 |
| layoutDefinitionService | 300 | Low | Medium | Low | 9 | Batch 3 |
| recordRelationshipService | 400 | Medium | Medium | Low | 10 | Batch 3 |
| accountService | 350 | Low | Medium | Low | 11 | Batch 3 |
| organisationService | 250 | Low | Low | Low | 12 | Batch 3 |
| tenantProvisioningService | 400 | Medium | High | Medium | 13 | Batch 3 |
| userSyncService | 200 | Low | Low | Low | 14 | Batch 3 |
| profileService | 150 | Low | Low | Low | 15 | Batch 3 |
| salesTargetService | 200 | Low | Low | Low | 16 | Batch 3 |
| adminUserService | 150 | Low | Low | Low | 17 | Batch 3 |
| leadConversionService | 500 | High | High | Medium | 18 | Batch 3 |
| pageLayoutService | 300 | Medium | Medium | Low | 19 | Batch 3 |
| teamService | 200 | Low | Low | Low | 20 | Batch 3 |
| objectPermissionService | 250 | Low | Medium | Low | 21 | Batch 3 |

---

## Migration Checklist (Per Service)

### 1. Pre-Migration

- [ ] Review service SQL queries
- [ ] Identify complex JSONB operations
- [ ] Check for transaction usage
- [ ] Review existing tests
- [ ] Estimate effort (0.5-2 days per service)

### 2. Implementation

- [ ] Create `<service>.kysely.ts` file
- [ ] Import Kysely client: `import { db } from '../db/kysely.js'`
- [ ] Convert queries one function at a time
- [ ] Preserve exact function signatures
- [ ] Keep domain model transformers unchanged
- [ ] Use `sql` template for JSONB operations

### 3. Testing

- [ ] Write comparison tests (raw vs Kysely)
- [ ] Verify query output matches exactly
- [ ] Run existing unit tests
- [ ] Run integration tests
- [ ] Test error handling
- [ ] Test edge cases (null values, empty results)

### 4. Deployment

- [ ] Create PR with parallel implementation
- [ ] Code review (focus on query correctness)
- [ ] Merge parallel implementation
- [ ] Deploy to staging
- [ ] Smoke test on staging
- [ ] Replace original with Kysely version
- [ ] Deploy to production
- [ ] Monitor for 1 week

### 5. Post-Migration

- [ ] Remove backup file (after 2 weeks)
- [ ] Update service documentation
- [ ] Collect developer feedback
- [ ] Note any issues for future services

---

## Query Conversion Patterns

### Pattern 1: Simple SELECT

**Before (raw pg):**
```typescript
const result = await pool.query(
  'SELECT * FROM pipeline_definitions WHERE id = $1 AND tenant_id = $2',
  [pipelineId, tenantId]
);
const row = result.rows[0];
```

**After (Kysely):**
```typescript
const row = await db
  .selectFrom('pipeline_definitions')
  .selectAll()
  .where('id', '=', pipelineId)
  .where('tenant_id', '=', tenantId)
  .executeTakeFirst();
```

### Pattern 2: INSERT with RETURNING

**Before (raw pg):**
```typescript
const result = await pool.query(
  'INSERT INTO pipeline_definitions (id, tenant_id, name, api_name, owner_id) VALUES ($1, $2, $3, $4, $5) RETURNING *',
  [id, tenantId, name, apiName, ownerId]
);
const row = result.rows[0];
```

**After (Kysely):**
```typescript
const row = await db
  .insertInto('pipeline_definitions')
  .values({
    id,
    tenant_id: tenantId,
    name,
    api_name: apiName,
    owner_id: ownerId,
  })
  .returningAll()
  .executeTakeFirstOrThrow();
```

### Pattern 3: Dynamic WHERE

**Before (raw pg):**
```typescript
const params: unknown[] = [tenantId];
let whereClause = 'WHERE tenant_id = $1';

if (search) {
  params.push(search);
  whereClause += ' AND name ILIKE $' + params.length;
}

const result = await pool.query(
  `SELECT * FROM records ${whereClause}`,
  params
);
```

**After (Kysely):**
```typescript
let query = db
  .selectFrom('records')
  .selectAll()
  .where('tenant_id', '=', tenantId);

if (search) {
  query = query.where('name', 'ilike', search);
}

const rows = await query.execute();
```

### Pattern 4: JSONB Operations

**Before (raw pg):**
```typescript
const result = await pool.query(
  `SELECT * FROM records WHERE field_values->>'email' ILIKE $1`,
  [email]
);
```

**After (Kysely):**
```typescript
const rows = await db
  .selectFrom('records')
  .selectAll()
  .where(sql`field_values->>'email' ILIKE ${email}`)
  .execute();
```

### Pattern 5: Aggregation

**Before (raw pg):**
```typescript
const result = await pool.query(
  'SELECT stage_id, COUNT(*) as count FROM records GROUP BY stage_id',
  []
);
```

**After (Kysely):**
```typescript
const rows = await db
  .selectFrom('records')
  .select([
    'stage_id',
    sql<number>`COUNT(*)`.as('count')
  ])
  .groupBy('stage_id')
  .execute();
```

---

## Common Gotchas

### 1. Column Name Transformation

**Issue:** Kysely uses snake_case from database, but service layer uses camelCase

**Solution:** Keep using transformation functions:
```typescript
function rowToPipeline(row: SelectRow) {
  return {
    id: row.id,
    tenantId: row.tenant_id,  // Transform snake_case → camelCase
    apiName: row.api_name,
    // ...
  };
}
```

### 2. JSONB Requires sql Template

**Issue:** Kysely doesn't have built-in JSONB operators

**Solution:** Use `sql` template for JSONB:
```typescript
import { sql } from 'kysely';

.where(sql`field_values->>'email' ILIKE ${searchTerm}`)
```

### 3. Transactions

**Issue:** Kysely doesn't wrap existing pool transactions

**Solution:** Continue using `pool.connect()` for transactions:
```typescript
const client = await pool.connect();
try {
  await client.query('BEGIN');
  // Use client.query() for transaction queries
  await client.query('COMMIT');
} finally {
  client.release();
}
```

### 4. Type Inference Issues

**Issue:** Complex queries may have type inference errors

**Solution:** Use explicit type annotations:
```typescript
const rows = await db
  .selectFrom('records')
  .select(sql<number>`COUNT(*)`.as('count'))
  .execute();
```

---

## Performance Monitoring

### Metrics to Track

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Query execution time | < 5% overhead | Application Insights |
| API response time | No regression | Application Insights |
| Error rate | No increase | Application Insights |
| Developer velocity | Improvement | Refactoring time tracking |
| Type errors caught | Increase | CI build logs |

### Monitoring Plan

**Week 1 (Pilot):**
- Compare pipelineService response times before/after
- Monitor error logs for Kysely-related issues
- Track developer feedback

**Weeks 2-15 (Rollout):**
- Monitor each migrated service for 1 week
- Track cumulative metrics across all services
- Bi-weekly team retrospectives

**Week 16+ (Post-Migration):**
- Continue monitoring in production
- Track refactoring time savings
- Measure developer satisfaction

---

## Rollback Procedures

### During Pilot (Phase 2)

If issues arise with pipelineService migration:

1. Restore backup:
   ```bash
   mv src/services/pipelineService.ts src/services/pipelineService.kysely.ts.failed
   mv src/services/pipelineService.pg.ts.backup src/services/pipelineService.ts
   ```

2. Deploy hotfix immediately

3. Document failure reason

4. Revise approach before continuing

### During Rollout (Phase 3)

If issues arise with any service:

1. Each service can be rolled back independently

2. Keep backup files for 2 weeks after migration

3. Gradual rollback service-by-service if needed

4. No system-wide rollback required (services are independent)

### Post-Migration

If fundamental issue discovered:

1. Kysely is thin wrapper — can coexist with raw pg

2. Gradually convert back service-by-service

3. Not locked in, minimal vendor lock

---

## Team Training

### Training Materials

1. **Kysely Basics** (1 hour)
   - Type-safe query building
   - Common patterns (SELECT, INSERT, UPDATE, DELETE)
   - Dynamic query building
   - JSONB handling

2. **Migration Guide** (30 minutes)
   - Per-service migration checklist
   - Common gotchas
   - Testing approach

3. **Hands-on Workshop** (2 hours)
   - Migrate a small service together
   - Code review session
   - Q&A

### Training Schedule

- **Week 1:** Basics + Migration Guide
- **Week 2:** Hands-on Workshop
- **Week 3+:** On-the-job learning during pilot

---

## Success Metrics

| Metric | Baseline | Target | How to Measure |
|--------|----------|--------|----------------|
| Column rename refactoring time | 4 hours | 30 minutes | Simulated refactoring |
| Type errors caught at compile time | 0% | 40% | Error log analysis |
| Developer satisfaction | N/A | 8/10 | Survey |
| Query runtime overhead | 0ms | < 0.5ms | Performance testing |
| Code readability | N/A | Improved | Code review feedback |

---

## Timeline Visualization

```
Week 1: [Foundation Setup]
Week 2-3: [Pilot: pipelineService] → 1 service migrated
Week 4-6: [Batch 1: High Value, Low Risk] → 4 services migrated
Week 7-10: [Batch 2: High Value, Medium Risk] → 7 services migrated
Week 11-15: [Batch 3: Medium Value] → 21 services migrated
Week 16: [Automation & Documentation] → Complete
```

**Total:** 21 services migrated in 16 weeks

---

## Decision Log

- **2026-04-14:** Migration plan drafted
- **[TBD]:** Plan reviewed by team
- **[TBD]:** Plan approved by tech lead
- **[TBD]:** Phase 1 kickoff

---

## Contact

**Plan Owner:** @metadata-engine
**Technical Lead:** [TBD]
**Questions:** Open an issue or discussion in GitHub

---

## Appendix: Service Migration Status

| Service | Status | Started | Completed | Notes |
|---------|--------|---------|-----------|-------|
| pipelineService | ⏳ Planned | - | - | Pilot service |
| stageMovementService | ⏳ Planned | - | - | Batch 1 |
| pipelineAnalyticsService | ⏳ Planned | - | - | Batch 1 |
| stageGateService | ⏳ Planned | - | - | Batch 1 |
| recordService | ⏳ Planned | - | - | Batch 2 |
| fieldDefinitionService | ⏳ Planned | - | - | Batch 2 |
| objectDefinitionService | ⏳ Planned | - | - | Batch 2 |
| [Additional services...] | ⏳ Planned | - | - | Batch 3 |

**Legend:**
- ⏳ Planned
- 🚧 In Progress
- ✅ Completed
- ❌ Blocked
- ⏸️ Paused
