/**
 * @deprecated This page has been retired. Opportunity creation now goes
 * through the generic RecordCreatePage at /objects/opportunity/new.
 *
 * The App.tsx router redirects /opportunities/new to /objects/opportunity/new.
 * This file is preserved only as a reference and will be removed in a
 * future cleanup.
 */
export function CreateOpportunityPage() {
  return (
    <div style={{ padding: '2rem' }}>
      <h1>Deprecated</h1>
      <p>
        This page has been retired. Opportunity creation now uses the dynamic
        record engine at <code>/objects/opportunity/new</code>.
      </p>
    </div>
  );
}
