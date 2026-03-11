#!/usr/bin/env bash
# deploy-dev.sh
# Provisions the CPCRM dev environment in Azure using Bicep.
#
# Prerequisites:
#   - Azure CLI installed and logged in (az login)
#   - Contributor access on the subscription
#   - The CPCRM_POSTGRES_PASSWORD environment variable set
#
# Usage:
#   export CPCRM_POSTGRES_PASSWORD="<password>"
#   bash infrastructure/scripts/deploy-dev.sh

set -euo pipefail

# Resolve repository root so template/parameter paths work from any CWD
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "${SCRIPT_DIR}" rev-parse --show-toplevel 2>/dev/null || cd "${SCRIPT_DIR}/../.." && pwd)"

ENVIRONMENT="dev"
RESOURCE_GROUP="rg-cpcrm-${ENVIRONMENT}"
LOCATION="eastus"
TEMPLATE_FILE="${REPO_ROOT}/infrastructure/bicep/main.bicep"
PARAMS_FILE="${REPO_ROOT}/infrastructure/bicep/parameters/dev.bicepparam"

# ---------------------------------------------------------------------------
# Validate prerequisites
# ---------------------------------------------------------------------------
if ! command -v az &>/dev/null; then
  echo "ERROR: Azure CLI (az) is not installed. Install it from https://aka.ms/install-azure-cli" >&2
  exit 1
fi

if [[ -z "${CPCRM_POSTGRES_PASSWORD:-}" ]]; then
  echo "ERROR: CPCRM_POSTGRES_PASSWORD environment variable is not set." >&2
  echo "  Export it before running this script:" >&2
  echo "    export CPCRM_POSTGRES_PASSWORD='<password>'" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Ensure the resource group exists
# ---------------------------------------------------------------------------
echo "==> Ensuring resource group '${RESOURCE_GROUP}' exists in '${LOCATION}'..."
az group create \
  --name "${RESOURCE_GROUP}" \
  --location "${LOCATION}" \
  --tags project=cpcrm environment="${ENVIRONMENT}" managedBy=bicep \
  --output none

echo "    Resource group ready."

# ---------------------------------------------------------------------------
# Deploy Bicep template
# ---------------------------------------------------------------------------
echo "==> Deploying Bicep template to '${RESOURCE_GROUP}'..."
az deployment group create \
  --resource-group "${RESOURCE_GROUP}" \
  --template-file "${TEMPLATE_FILE}" \
  --parameters "${PARAMS_FILE}" \
  --parameters postgresAdminPassword="${CPCRM_POSTGRES_PASSWORD}" \
  --name "cpcrm-${ENVIRONMENT}-$(date +%Y%m%d%H%M%S)"

echo ""
echo "==> Deployment complete."
echo "    You can query outputs with:"
echo "    az deployment group show -g ${RESOURCE_GROUP} -n <deployment-name> --query properties.outputs"
