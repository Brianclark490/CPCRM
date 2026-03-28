/**
 * @deprecated The legacy CreateOpportunityPage has been retired.
 * Opportunity creation now goes through RecordCreatePage at /objects/opportunity/new.
 * See RecordCreatePage.test.tsx for current tests.
 */
import { describe, it } from 'vitest';

describe('CreateOpportunityPage (DEPRECATED)', () => {
  it('has been retired — opportunity creation uses RecordCreatePage', () => {
    // No-op: this page is no longer routed to.
    // /opportunities/new redirects to /objects/opportunity/new.
  });
});
