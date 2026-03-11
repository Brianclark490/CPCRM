// modules/postgresql.bicep
// Provisions an Azure Database for PostgreSQL Flexible Server.

@description('Short environment label, e.g. dev | stg | prod')
param environmentName string

@description('Azure region for all resources in this module')
param location string

@description('PostgreSQL administrator login name')
param adminLogin string

@description('PostgreSQL administrator password (store in Key Vault; passed securely at deploy time)')
@secure()
param adminPassword string

@description('Resource tags to apply to all resources')
param tags object = {}

// ---------------------------------------------------------------------------
// PostgreSQL Flexible Server
// ---------------------------------------------------------------------------
resource postgresServer 'Microsoft.DBforPostgreSQL/flexibleServers@2023-12-01' = {
  name: 'psql-cpcrm-${environmentName}'
  location: location
  tags: tags
  sku: {
    name: 'Standard_B1ms'
    tier: 'Burstable'
  }
  properties: {
    administratorLogin: adminLogin
    administratorLoginPassword: adminPassword
    version: '16'
    storage: {
      storageSizeGB: 32
    }
    backup: {
      backupRetentionDays: 7
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: {
      mode: 'Disabled'
    }
  }
}

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------
resource crmDatabase 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2023-12-01' = {
  parent: postgresServer
  name: 'cpcrm'
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

// ---------------------------------------------------------------------------
// Firewall rule – allow Azure services to connect (dev/stg only; not production)
// ---------------------------------------------------------------------------
resource allowAzureServices 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2023-12-01' = if (environmentName != 'prod') {
  parent: postgresServer
  name: 'AllowAllAzureServicesAndResourcesWithinAzureIps'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------
output serverFqdn string = postgresServer.properties.fullyQualifiedDomainName
output databaseName string = crmDatabase.name
