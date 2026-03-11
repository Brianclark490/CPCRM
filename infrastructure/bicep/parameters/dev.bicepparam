// parameters/dev.bicepparam
// Parameter values for the Development environment.
// Do NOT add secrets here. Pass postgresAdminPassword at deploy time:
//   --parameters postgresAdminPassword=<value-from-key-vault-or-ci-secret>

using '../main.bicep'

param environmentName = 'dev'
param location = 'eastus'
param postgresAdminLogin = 'cpcrmadmin'
