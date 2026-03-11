// modules/key-vault.bicep
// Provisions an Azure Key Vault instance with RBAC-based access control.

@description('Short environment label, e.g. dev | stg | prod')
param environmentName string

@description('Azure region for all resources in this module')
param location string

@description('Object ID of the App Service managed identity that needs secret access')
param apiAppPrincipalId string

@description('Optional suffix appended to the Key Vault name to ensure global uniqueness (e.g. a 5-char token). Defaults to empty, preserving the standard naming convention.')
param kvNameSuffix string = ''

@description('Resource tags to apply to all resources')
param tags object = {}

// Derive the Key Vault name: append suffix only when provided
var keyVaultName = empty(kvNameSuffix) ? 'kv-cpcrm-${environmentName}' : 'kv-cpcrm-${environmentName}-${kvNameSuffix}'

// ---------------------------------------------------------------------------
// Key Vault
// ---------------------------------------------------------------------------
resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: keyVaultName
  location: location
  tags: tags
  properties: {
    sku: {
      family: 'A'
      name: 'standard'
    }
    tenantId: subscription().tenantId
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 7
    publicNetworkAccess: environmentName == 'prod' ? 'Disabled' : 'Enabled'
  }
}

// ---------------------------------------------------------------------------
// Role assignment – Key Vault Secrets User for the API managed identity
// ---------------------------------------------------------------------------
var keyVaultSecretsUserRoleId = '4633458b-17de-408a-b874-0445c86b69e6'

resource secretsUserAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, apiAppPrincipalId, keyVaultSecretsUserRoleId)
  scope: keyVault
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', keyVaultSecretsUserRoleId)
    principalId: apiAppPrincipalId
    principalType: 'ServicePrincipal'
  }
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------
output keyVaultName string = keyVault.name
output keyVaultUri string = keyVault.properties.vaultUri
