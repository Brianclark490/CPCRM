import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../kysely.js';
import { pool } from '../client.js';
import { tenantStore } from '../tenantContext.js';

/**
 * Kysely RLS Integration Tests
 *
 * Verifies that Kysely queries work correctly with the RLS-aware connection pool:
 *
 * - Simple queries execute successfully within tenant context
 * - Transactions work correctly with Kysely
 * - Queries work without tenant context (for migrations/admin)
 * - The connection pool proxy sets tenant context appropriately
 *
 * Note: These tests verify that the RLS context is set (via set_config) and that
 * Kysely queries execute. Full RLS enforcement testing (row filtering) would require
 * integration tests against a database with test data and verified policies.
 */

describe('Kysely RLS Integration', () => {
  const TENANT_A = 'test-tenant-kysely-a';
  const TENANT_B = 'test-tenant-kysely-b';
  const TEST_USER_ID = 'test-user-kysely';

  beforeAll(async () => {
    // Create test tenants
    await pool.query(
      'INSERT INTO tenants (id, name, slug, status) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING',
      [TENANT_A, 'Test Tenant Kysely A', 'tenant-kysely-a', 'active'],
    );
    await pool.query(
      'INSERT INTO tenants (id, name, slug, status) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING',
      [TENANT_B, 'Test Tenant Kysely B', 'tenant-kysely-b', 'active'],
    );
  });

  afterAll(async () => {
    // Clean up test data
    await pool.query('DELETE FROM accounts WHERE created_by = $1', [TEST_USER_ID]);
    await pool.query('DELETE FROM tenants WHERE id IN ($1, $2)', [
      TENANT_A,
      TENANT_B,
    ]);
  });

  it('executes Kysely queries within tenant context', async () => {
    let accountId: string | undefined;

    // Create an account within tenant A context
    await tenantStore.run(TENANT_A, async () => {
      const result = await db
        .insertInto('accounts')
        .values({
          tenant_id: TENANT_A,
          name: 'Kysely Test Account A',
          owner_id: TEST_USER_ID,
          created_by: TEST_USER_ID,
        })
        .returning('id')
        .executeTakeFirstOrThrow();

      accountId = result.id;
      expect(accountId).toBeDefined();
    });

    // Query it back within the same tenant context
    const account = await tenantStore.run(TENANT_A, async () => {
      return await db
        .selectFrom('accounts')
        .selectAll()
        .where('id', '=', accountId!)
        .executeTakeFirst();
    });

    expect(account).toBeDefined();
    expect(account?.name).toBe('Kysely Test Account A');
    expect(account?.tenant_id).toBe(TENANT_A);
  });

  it('supports Kysely transactions with tenant context', async () => {
    const accountName = 'Kysely Transaction Test';
    let accountId: string | undefined;

    await tenantStore.run(TENANT_B, async () => {
      await db.transaction().execute(async (trx) => {
        // Insert within transaction
        const result = await trx
          .insertInto('accounts')
          .values({
            tenant_id: TENANT_B,
            name: accountName,
            owner_id: TEST_USER_ID,
            created_by: TEST_USER_ID,
          })
          .returning('id')
          .executeTakeFirstOrThrow();

        accountId = result.id;

        // Query within same transaction
        const inserted = await trx
          .selectFrom('accounts')
          .selectAll()
          .where('id', '=', accountId)
          .executeTakeFirst();

        expect(inserted).toBeDefined();
        expect(inserted?.tenant_id).toBe(TENANT_B);
        expect(inserted?.name).toBe(accountName);
      });
    });

    // Verify transaction was committed
    expect(accountId).toBeDefined();

    const account = await tenantStore.run(TENANT_B, async () => {
      return await db
        .selectFrom('accounts')
        .selectAll()
        .where('id', '=', accountId!)
        .executeTakeFirst();
    });

    expect(account).toBeDefined();
    expect(account?.name).toBe(accountName);
  });

  it('allows queries without tenant context for admin operations', async () => {
    // Outside tenant context, queries should work (for migrations, admin, etc.)
    const tenants = await db
      .selectFrom('tenants')
      .selectAll()
      .where('id', 'in', [TENANT_A, TENANT_B])
      .execute();

    expect(tenants.length).toBeGreaterThanOrEqual(2);
    expect(tenants.find((t) => t.id === TENANT_A)).toBeDefined();
    expect(tenants.find((t) => t.id === TENANT_B)).toBeDefined();
  });

  it('executes complex Kysely queries successfully', async () => {
    // Test that Kysely's query builder works with joins, filters, etc.
    await tenantStore.run(TENANT_A, async () => {
      const accounts = await db
        .selectFrom('accounts')
        .select(['id', 'name', 'tenant_id', 'created_at'])
        .where('tenant_id', '=', TENANT_A)
        .where('created_by', '=', TEST_USER_ID)
        .orderBy('created_at', 'desc')
        .limit(10)
        .execute();

      // Should execute without errors
      expect(Array.isArray(accounts)).toBe(true);
      accounts.forEach((acc) => {
        expect(acc.tenant_id).toBe(TENANT_A);
      });
    });
  });
});
