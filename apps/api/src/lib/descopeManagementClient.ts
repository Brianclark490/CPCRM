import DescopeClient from '@descope/node-sdk';

let descopeManagementClient: ReturnType<typeof DescopeClient> | undefined;

/**
 * Returns a Descope SDK client configured with the management key.
 * The management client is required for tenant and user management operations.
 *
 * Uses a module-level singleton so the client is created once and reused.
 *
 * Requires DESCOPE_PROJECT_ID and DESCOPE_MANAGEMENT_KEY environment variables.
 */
export function getDescopeManagementClient(): ReturnType<typeof DescopeClient> {
  if (!descopeManagementClient) {
    const projectId = process.env.DESCOPE_PROJECT_ID;
    if (!projectId) {
      throw new Error('DESCOPE_PROJECT_ID environment variable is required');
    }
    const managementKey = process.env.DESCOPE_MANAGEMENT_KEY;
    if (!managementKey) {
      throw new Error('DESCOPE_MANAGEMENT_KEY environment variable is required');
    }
    descopeManagementClient = DescopeClient({ projectId, managementKey });
  }
  return descopeManagementClient;
}
