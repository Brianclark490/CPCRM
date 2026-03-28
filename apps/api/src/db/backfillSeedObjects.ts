import { pool } from './client.js';
import { seedDefaultObjects } from '../services/seedDefaultObjects.js';
import { logger } from '../lib/logger.js';

/**
 * Re-runs `seedDefaultObjects` for every tenant in the database.
 *
 * The seed is fully idempotent (uses ON CONFLICT DO NOTHING), so this is safe
 * to call on every startup.  It ensures that objects added to the seed data
 * after a tenant was provisioned — such as User and Team — are backfilled
 * automatically.
 */
export async function backfillSeedObjects(): Promise<void> {
  const { rows: tenants } = await pool.query<{ id: string }>(
    'SELECT id FROM tenants',
  );

  if (tenants.length === 0) {
    logger.debug('No tenants found; skipping seed backfill');
    return;
  }

  logger.info({ tenantCount: tenants.length }, 'Backfilling seed objects for all tenants');

  for (const tenant of tenants) {
    try {
      const result = await seedDefaultObjects(tenant.id, 'SYSTEM');

      const totalCreated =
        result.objectsCreated +
        result.fieldsCreated +
        result.relationshipsCreated +
        result.layoutsCreated +
        result.layoutFieldsCreated;

      if (totalCreated > 0) {
        logger.info({ tenantId: tenant.id, ...result }, 'Backfilled seed data for tenant');
      }
    } catch (err) {
      logger.error({ err, tenantId: tenant.id }, 'Failed to backfill seed data for tenant');
    }
  }
}
