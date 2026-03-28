/**
 * @deprecated The legacy OpportunityDetailPage has been retired.
 * Opportunity details now go through RecordDetailPage at /objects/opportunity/:id.
 * See RecordDetailPage.test.tsx for current tests.
 */
import { describe, it } from 'vitest';

describe('OpportunityDetailPage (DEPRECATED)', () => {
  it('has been retired — opportunity details use RecordDetailPage', () => {
    // No-op: this page is no longer routed to.
    // /opportunities/:id redirects to /objects/opportunity/:id.
  });
});

