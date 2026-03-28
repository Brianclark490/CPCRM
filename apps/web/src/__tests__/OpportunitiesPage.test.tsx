/**
 * @deprecated The legacy OpportunitiesPage has been retired.
 * Opportunity listing now goes through RecordListPage at /objects/opportunity.
 * See RecordListPage.test.tsx for current tests.
 */
import { describe, it } from 'vitest';

describe('OpportunitiesPage (DEPRECATED)', () => {
  it('has been retired — opportunity listing uses RecordListPage', () => {
    // No-op: this page is no longer routed to.
    // /opportunities redirects to /objects/opportunity.
  });
});
