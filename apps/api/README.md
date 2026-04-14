# @cpcrm/api

The Express + PostgreSQL API for CPCRM.

## Database access

The API talks to PostgreSQL through two layers that share a single
RLS-aware connection pool (`src/db/client.ts`):

- **`pg` directly**, via `TenantScopedClient` in `src/db/tenantScope.ts`.
  This is the legacy pattern used across most existing services and is
  still fully supported.
- **[Kysely](https://kysely.dev)**, via the `db` instance exported from
  `src/db/kysely.ts`. This is the type-safe query builder adopted in
  ADR-006 (query-builder evaluation — the ADR document lands in a
  separate PR; see #440).

Both paths go through the same `Pool` proxy, so Row-Level Security
(migration 025) applies to either style. Services can migrate to Kysely
one at a time — there is no "big bang" cutover.

### Using Kysely

```ts
import { db } from '../db/kysely.js';

export async function listRecordsForObject(objectId: string) {
  return db
    .selectFrom('records')
    .selectAll()
    .where('object_id', '=', objectId)
    .orderBy('created_at', 'desc')
    .execute();
}
```

Because the pool proxy sets `app.current_tenant_id` on every checked-out
connection, the query is automatically scoped to the current tenant by
Postgres RLS. You do **not** need to add `where('tenant_id', '=', ...)`
— though doing so is harmless and recommended as defence-in-depth.

Transactions work the same way: the tenant context is set on the
connection before `BEGIN` is issued.

```ts
await db.transaction().execute(async (trx) => {
  const record = await trx
    .insertInto('records')
    .values({ ... })
    .returningAll()
    .executeTakeFirstOrThrow();

  await trx
    .insertInto('stage_history')
    .values({ record_id: record.id, ... })
    .execute();
});
```

### Generating the Kysely schema types

The `DB` interface in `src/db/kysely.types.ts` is **generated** by
[`kysely-codegen`](https://github.com/RobinBlomberg/kysely-codegen)
against a live database. Do not edit it by hand.

Regenerate after every SQL migration:

```bash
DATABASE_URL=postgres://... npm run db:types --workspace @cpcrm/api
```

The command introspects every table in the `public` schema and rewrites
`src/db/kysely.types.ts`. Commit the result alongside the migration that
produced it so reviewers can see the type impact of the schema change.

A CI check that fails when the committed types drift from the migrations
is tracked separately and is **not** part of this phase.

### Running the RLS integration test against a live database

`src/db/__tests__/kyselyRls.test.ts` has two parts:

1. A **mocked** suite that always runs. It verifies that Kysely queries
   and transactions go through the pool proxy and that
   `SELECT set_config('app.current_tenant_id', ...)` is issued before
   the user SQL.
2. A **live-DB** suite gated on the `TEST_DATABASE_URL` environment
   variable. When that variable points at a migrated database whose
   connecting role is **not** a superuser (superusers bypass RLS in
   Postgres), the test seeds two tenants, inserts a record for each,
   and asserts that RLS filters rows correctly for both a plain
   `selectFrom('records')` query and a `db.transaction()` block.

To run the live suite locally:

```bash
# Against a role that does not bypass RLS (e.g. cpcrm_app, not postgres):
TEST_DATABASE_URL=postgres://cpcrm_app@localhost:5432/cpcrm_dev \
  npm run test --workspace @cpcrm/api -- src/db/__tests__/kyselyRls.test.ts
```

## Migrating a service to Kysely

ADR-006 lays out an incremental "strangler" migration pattern. In
practice, each service is converted by repeating these four steps:

1. **Parallel implementation.** Write a new Kysely implementation of the
   service next to the existing raw-SQL one (e.g.
   `recordService.ts` ↔ `recordService.kysely.ts`). Do not delete the
   old code yet.
2. **Comparison tests.** Add a test that runs both implementations
   against the same fixtures and asserts the outputs are identical.
   This is the safety net that catches subtle differences (parameter
   binding, implicit casts, null handling).
3. **Replace.** Once the comparison tests are green, update the route
   handlers to call the Kysely implementation and delete the raw-SQL
   version in the same PR. The comparison test can also be deleted at
   this point.
4. **Regenerate types if the schema moved.** Any migration that lands
   between step 1 and step 3 requires a re-run of `npm run db:types`.

Follow-up services will each be tracked as their own issue so the
review surface stays small.
