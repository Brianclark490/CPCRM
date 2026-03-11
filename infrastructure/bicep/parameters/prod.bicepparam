// parameters/prod.bicepparam
// Parameter values for the Production environment.
// Do NOT add secrets here. Pass postgresAdminPassword at deploy time:
//   --parameters postgresAdminPassword=<value-from-key-vault-or-ci-secret>

using '../main.bicep'

param environmentName = 'prod'
param location = 'eastus'
param postgresAdminLogin = 'cpcrmadmin'
