# Runbook: Environment Provisioning Order

## Purpose

This runbook defines the step-by-step order for provisioning a new CPCRM Azure environment (dev, stg, or prod) from scratch. Follow these steps in sequence to avoid dependency errors.

## Prerequisites

| Requirement | Notes |
|---|---|
| Azure CLI ≥ 2.57 | `az --version` |
| Contributor on the target subscription | Contact platform team if access is missing |
| PostgreSQL admin password chosen | Store in a password manager; **never commit to source control** |
| GitHub repository access | Required to link Static Web App to CI/CD |

Log in to Azure before starting:

```bash
az login
az account set --subscription "<subscription-id>"
```

---

## Step 1 – Create the Resource Group

```bash
az group create \
  --name rg-cpcrm-dev \
  --location eastus \
  --tags project=cpcrm environment=dev managedBy=bicep
```

Verify: `az group show --name rg-cpcrm-dev`

---

## Step 2 – Set the PostgreSQL Password

Choose a strong password and export it for use in subsequent steps. Do not commit this value.

```bash
export CPCRM_POSTGRES_PASSWORD="<your-strong-password>"
```

---

## Step 3 – Deploy the Bicep Template

Run the deployment script from the repository root:

```bash
bash infrastructure/scripts/deploy-dev.sh
```

This deploys the following resources in dependency order:

1. **Log Analytics Workspace** (`law-cpcrm-dev`) — other services send logs here
2. **Application Insights** (`appi-cpcrm-dev`) — backed by the workspace above
3. **App Service Plan** (`asp-cpcrm-api-dev`) — compute tier for the API
4. **App Service** (`app-cpcrm-api-dev`) — Node.js 20 API, system-assigned managed identity
5. **Key Vault** (`kv-cpcrm-dev`) — RBAC-enabled; API managed identity granted *Secrets User*
6. **PostgreSQL Flexible Server** (`psql-cpcrm-dev`) — database `cpcrm` created automatically
7. **Static Web App** (`swa-cpcrm-dev`) — React frontend, connected to GitHub for CI/CD

Expected duration: ~8–12 minutes.

---

## Step 4 – Add Secrets to Key Vault

After the Key Vault is provisioned, add the secrets that the application needs at runtime:

```bash
KV="kv-cpcrm-dev"

# PostgreSQL connection string
az keyvault secret set \
  --vault-name "$KV" \
  --name "postgres-connection-string" \
  --value "postgresql://cpcrmadmin:${CPCRM_POSTGRES_PASSWORD}@psql-cpcrm-dev.postgres.database.azure.com/cpcrm?sslmode=require"

# Descope API key (replace with real value)
az keyvault secret set \
  --vault-name "$KV" \
  --name "descope-api-key" \
  --value "<descope-api-key>"
```

---

## Step 5 – Link Static Web App to GitHub

The Static Web App (`swa-cpcrm-dev`) is already created by the Bicep deployment. It now needs to be connected to the GitHub repository so that GitHub Actions can deploy the frontend automatically.

Use the Azure Portal to complete the GitHub integration:

1. In the Azure Portal, navigate to **Static Web Apps** and select **swa-cpcrm-dev** in **rg-cpcrm-dev**.
2. In the left menu, select **Configuration** (or **Deployment** → **GitHub**, depending on portal version).
3. Choose **Connect to a GitHub repository** (or **Change** / **Manage** connection).
4. When prompted, authorise Azure Static Web Apps with your GitHub account and select:
   - **Organization:** The GitHub org/user that owns `CPCRM`
   - **Repository:** `Brianclark490/CPCRM`
   - **Branch:** `develop`
   - **App location:** `apps/web`
   - **Output location:** `dist`
5. Save/apply the configuration.

> **Note:** The GitHub authorisation flow opens a browser window to complete the integration. Ensure you are logged in to GitHub with appropriate repository access.

The deployment token generated for this Static Web App connection should be stored as a GitHub Actions secret:
`AZURE_STATIC_WEB_APPS_API_TOKEN`

---

## Step 6 – Verify Deployments

```bash
# Check all resources in the resource group
az resource list --resource-group rg-cpcrm-dev --output table

# Confirm App Service is running
az webapp show --resource-group rg-cpcrm-dev --name app-cpcrm-api-dev --query state -o tsv

# Confirm PostgreSQL server is ready
az postgres flexible-server show --resource-group rg-cpcrm-dev --name psql-cpcrm-dev --query state -o tsv
```

Expected outputs: `Running` for the App Service and `Ready` for PostgreSQL.

---

## Step 7 – Configure GitHub Actions (CI/CD)

Ensure the following GitHub Actions secrets are set at the repository level:

| Secret Name | Value |
|---|---|
| `AZURE_CLIENT_ID` | Client ID of the Azure AD app registration (OIDC) |
| `AZURE_TENANT_ID` | Azure AD tenant ID |
| `AZURE_SUBSCRIPTION_ID` | Azure subscription ID |
| `AZURE_STATIC_WEB_APPS_API_TOKEN` | Deployment token from Step 5 |

These secrets use OIDC federation — no client secrets or certificates are required.

---

## Teardown (dev only)

To delete the entire dev environment and avoid ongoing costs:

```bash
az group delete --name rg-cpcrm-dev --yes --no-wait
```

> **Warning:** This permanently deletes all resources including the database. Ensure data is backed up if needed.

---

## Troubleshooting

| Symptom | Likely cause | Resolution |
|---|---|---|
| Deployment fails with `AuthorizationFailed` | Missing Contributor role | Ask platform team to grant access |
| Key Vault name already taken globally | KV names are globally unique | Add a short suffix to `kv-cpcrm-dev` |
| PostgreSQL password rejected | Does not meet complexity requirements | Use 16+ chars with upper, lower, digit, symbol |
| Static Web App CI not triggering | GitHub connection not configured or token expired | Re-do Step 5 via the Azure Portal to re-link/regenerate the token |
