// modules/static-web-app.bicep
// Provisions an Azure Static Web App for the React + TypeScript frontend.

@description('Short environment label, e.g. dev | stg | prod')
param environmentName string

@description('Azure region for all resources in this module')
param location string

@description('Application Insights connection string for browser-side APM')
param appInsightsConnectionString string

@description('Resource tags to apply to all resources')
param tags object = {}

// ---------------------------------------------------------------------------
// Static Web App
// ---------------------------------------------------------------------------
resource staticWebApp 'Microsoft.Web/staticSites@2023-01-01' = {
  name: 'swa-cpcrm-${environmentName}'
  location: location
  tags: tags
  sku: {
    name: 'Free'
    tier: 'Free'
  }
  properties: {
    buildProperties: {
      appLocation: 'apps/web'
      outputLocation: 'dist'
    }
  }
}

// ---------------------------------------------------------------------------
// App settings for browser-side Application Insights
// ---------------------------------------------------------------------------
resource swaAppSettings 'Microsoft.Web/staticSites/config@2023-01-01' = {
  parent: staticWebApp
  name: 'appsettings'
  properties: {
    APPLICATIONINSIGHTS_CONNECTION_STRING: appInsightsConnectionString
  }
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------
output staticWebAppName string = staticWebApp.name
output staticWebAppHostname string = staticWebApp.properties.defaultHostname
