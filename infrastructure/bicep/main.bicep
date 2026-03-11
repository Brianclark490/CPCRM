// main.bicep
// Entry-point Bicep template for the CPCRM platform.
// Orchestrates all environment modules. Deploy once per environment using the
// corresponding parameters file (e.g. parameters/dev.bicepparam).
//
// Usage:
//   az deployment group create \
//     --resource-group rg-cpcrm-dev \
//     --template-file infrastructure/bicep/main.bicep \
//     --parameters infrastructure/bicep/parameters/dev.bicepparam \
//     --parameters postgresAdminPassword=<secret>

targetScope = 'resourceGroup'

// ---------------------------------------------------------------------------
// Parameters
// ---------------------------------------------------------------------------
@description('Short environment label used in resource names and tags')
@allowed(['dev', 'stg', 'prod'])
param environmentName string

@description('Azure region for all resources')
param location string = resourceGroup().location

@description('PostgreSQL administrator login name')
param postgresAdminLogin string = 'cpcrmadmin'

@description('PostgreSQL administrator password – must be provided at deploy time and never committed')
@secure()
param postgresAdminPassword string

// ---------------------------------------------------------------------------
// Tags applied to every resource
// ---------------------------------------------------------------------------
var commonTags = {
  project: 'cpcrm'
  environment: environmentName
  managedBy: 'bicep'
}

// ---------------------------------------------------------------------------
// 1. Monitoring (deployed first – other modules consume its outputs)
// ---------------------------------------------------------------------------
module monitoring 'modules/monitoring.bicep' = {
  name: 'monitoring'
  params: {
    environmentName: environmentName
    location: location
    tags: commonTags
  }
}

// ---------------------------------------------------------------------------
// 2. App Service (API) – deployed before Key Vault to get the managed identity
// ---------------------------------------------------------------------------
module appService 'modules/app-service.bicep' = {
  name: 'appService'
  params: {
    environmentName: environmentName
    location: location
    appInsightsConnectionString: monitoring.outputs.appInsightsConnectionString
    // Key Vault URI is passed after Key Vault is created; use a placeholder here
    // and update via a second deployment or slot config if needed.
    // In practice the URI follows the predictable pattern below.
    keyVaultUri: 'https://kv-cpcrm-${environmentName}${environment().suffixes.keyvaultDns}'
    tags: commonTags
  }
}

// ---------------------------------------------------------------------------
// 3. Key Vault – created after App Service so we can assign the managed identity
// ---------------------------------------------------------------------------
module keyVault 'modules/key-vault.bicep' = {
  name: 'keyVault'
  params: {
    environmentName: environmentName
    location: location
    apiAppPrincipalId: appService.outputs.apiAppPrincipalId
    tags: commonTags
  }
}

// ---------------------------------------------------------------------------
// 4. PostgreSQL
// ---------------------------------------------------------------------------
module postgresql 'modules/postgresql.bicep' = {
  name: 'postgresql'
  params: {
    environmentName: environmentName
    location: location
    adminLogin: postgresAdminLogin
    adminPassword: postgresAdminPassword
    tags: commonTags
  }
}

// ---------------------------------------------------------------------------
// 5. Static Web App (frontend)
// ---------------------------------------------------------------------------
module staticWebApp 'modules/static-web-app.bicep' = {
  name: 'staticWebApp'
  params: {
    environmentName: environmentName
    location: location
    appInsightsConnectionString: monitoring.outputs.appInsightsConnectionString
    tags: commonTags
  }
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------
output frontendHostname string = staticWebApp.outputs.staticWebAppHostname
output apiHostname string = appService.outputs.apiAppHostname
output keyVaultName string = keyVault.outputs.keyVaultName
output postgresServerFqdn string = postgresql.outputs.serverFqdn
output logAnalyticsWorkspaceId string = monitoring.outputs.logAnalyticsWorkspaceId
