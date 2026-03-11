// parameters/stg.bicepparam
// Parameter values for the Staging environment.
// Do NOT add secrets here. Pass postgresAdminPassword at deploy time:
//   --parameters postgresAdminPassword=<value-from-key-vault-or-ci-secret>

using '../main.bicep'

param environmentName = 'stg'
param location = 'eastus'
param postgresAdminLogin = 'cpcrmadmin'
