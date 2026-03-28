/**
 * @deprecated This page has been retired. Opportunity listing now goes
 * through the generic RecordListPage at /objects/opportunity.
 *
 * The App.tsx router redirects /opportunities to /objects/opportunity.
 * This file is preserved only as a reference and will be removed in a
 * future cleanup.
 */
export function OpportunitiesPage() {
  return (
    <div style={{ padding: '2rem' }}>
      <h1>Deprecated</h1>
      <p>
        This page has been retired. Opportunity listing now uses the dynamic
        record engine at <code>/objects/opportunity</code>.
      </p>
    </div>
  );
}
