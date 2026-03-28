/**
 * @deprecated This page has been retired. Opportunity details now render
 * through the generic RecordDetailPage at /objects/opportunity/:id.
 *
 * The App.tsx router redirects /opportunities/:id to /objects/opportunity/:id.
 * This file is preserved only as a reference and will be removed in a
 * future cleanup.
 */
export function OpportunityDetailPage() {
  return (
    <div style={{ padding: '2rem' }}>
      <h1>Deprecated</h1>
      <p>
        This page has been retired. Opportunity details now use the dynamic
        record engine at <code>/objects/opportunity/:id</code>.
      </p>
    </div>
  );
}

