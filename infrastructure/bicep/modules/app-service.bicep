// modules/app-service.bicep
// Provisions an App Service Plan and a Linux Node.js App Service for the backend API.

@description('Short environment label, e.g. dev | stg | prod')
param environmentName string

@description('Azure region for all resources in this module')
param location string

@description('Application Insights connection string for APM')
param appInsightsConnectionString string

@description('Key Vault URI so the app can reference secrets')
param keyVaultUri string

@description('Key Vault reference expression for the PostgreSQL connection string app setting')
param postgresConnectionStringReference string

@description('Resource tags to apply to all resources')
param tags object = {}

// ---------------------------------------------------------------------------
// App Service Plan
// ---------------------------------------------------------------------------
resource appServicePlan 'Microsoft.Web/serverfarms@2023-01-01' = {
  name: 'asp-cpcrm-api-${environmentName}'
  location: location
  tags: tags
  kind: 'linux'
  sku: {
    name: 'B1'
    tier: 'Basic'
  }
  properties: {
    reserved: true
  }
}

// ---------------------------------------------------------------------------
// App Service (API)
// ---------------------------------------------------------------------------
resource apiApp 'Microsoft.Web/sites@2023-01-01' = {
  name: 'app-cpcrm-api-${environmentName}'
  location: location
  tags: tags
  kind: 'app,linux'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: appServicePlan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'NODE|20-lts'
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      appCommandLine: 'node dist/index.js'
      appSettings: [
        {
          name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
          value: appInsightsConnectionString
        }
        {
          name: 'KEY_VAULT_URI'
          value: keyVaultUri
        }
        {
          name: 'NODE_ENV'
          value: environmentName == 'prod' ? 'production' : 'development'
        }
        {
          name: 'WEBSITE_NODE_DEFAULT_VERSION'
          value: '~20'
        }
        {
          name: 'DATABASE_URL'
          value: postgresConnectionStringReference
        }
      ]
    }
  }
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------
output apiAppName string = apiApp.name
output apiAppHostname string = apiApp.properties.defaultHostName
output apiAppPrincipalId string = apiApp.identity.principalId
