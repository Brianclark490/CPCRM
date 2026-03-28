/**
 * @deprecated The legacy /api/opportunities route has been retired.
 * All opportunity CRUD now goes through /api/objects/opportunity/records
 * (the dynamic records engine). See records.test.ts for current tests.
 *
 * This test file is preserved as a placeholder and will be removed
 * in a future cleanup.
 */
import { describe, it } from 'vitest';

describe('Legacy /api/opportunities route (DEPRECATED)', () => {
  it('has been retired — all opportunity CRUD uses /api/objects/opportunity/records', () => {
    // No-op: the legacy route is no longer registered in index.ts.
    // Opportunity CRUD is handled by the dynamic records engine.
  });
});
