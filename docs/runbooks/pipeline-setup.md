# Pipeline Setup Guide

This runbook documents the one-time configuration required before the automated
deployment pipelines (`deploy.yml` and `deploy-infra.yml`) can run successfully.

---

## 1. Azure service principal (OIDC)

The pipelines authenticate to Azure using OIDC federated credentials — no
long-lived client secrets are stored in GitHub.

### Create the service principal

```bash
az ad sp create-for-rbac \
  --name "sp-cpcrm-github-actions" \
  --role Contributor \
  --scopes /subscriptions/<SUBSCRIPTION_ID> \
  --output json
```

Note the output values: `appId` (client ID), `tenant` (tenant ID), `subscriptionId`.

### Add federated credentials (one per environment branch)

In the Azure Portal → **App registrations** → your SP → **Certificates & secrets**
→ **Federated credentials**, add three credentials:

| Name              | Organization      | Repository         | Entity       | Branch  |
|-------------------|-------------------|--------------------|--------------|---------|
| `github-develop`  | `<YOUR_ORG>`      | `<YOUR_REPO>`      | Branch       | develop |
| `github-staging`  | `<YOUR_ORG>`      | `<YOUR_REPO>`      | Branch       | staging |
| `github-main`     | `<YOUR_ORG>`      | `<YOUR_REPO>`      | Branch       | main    |

For `deploy-infra.yml` manual dispatch, also add:

| Name                    | Entity                  |
|-------------------------|-------------------------|
| `github-workflow-dispatch` | `workflow_dispatch`  |

---

## 2. GitHub Environments

Create three **Environments** in the repository settings
(**Settings → Environments**): `dev`, `stg`, `prod`.

For the `prod` environment, configure **Required reviewers** to enforce a manual
approval gate before any production deployment runs.

---

## 3. Repository-level variables (Settings → Secrets and variables → Actions → Variables)

These are not secrets — they are the same for all environments.

| Variable | Description |
|---|---|
| *(none required at repo level)* | — |

---

## 4. Environment-level variables (set per environment)

Navigate to each environment (**Settings → Environments → `<env>` → Variables**).

| Variable | Description | Example |
|---|---|---|
| `AZURE_CLIENT_ID` | App registration client ID from step 1 | `00000000-...` |
| `AZURE_TENANT_ID` | Azure AD tenant ID | `00000000-...` |
| `AZURE_SUBSCRIPTION_ID` | Azure subscription ID | `00000000-...` |
| `AZURE_LOCATION` | Azure region (optional, defaults to `eastus`) | `eastus` |
| `DESCOPE_PROJECT_ID` | Descope project ID for this environment | `P...` |
| `API_BASE_URL` | Public URL of the deployed API App Service | `https://app-cpcrm-api-dev.azurewebsites.net` |
| `POSTGRES_ADMIN_LOGIN` | PostgreSQL admin login (optional, defaults to `cpcrmadmin`) | `cpcrmadmin` |

---

## 5. Environment-level secrets (Settings → Environments → `<env>` → Secrets)

| Secret | Description |
|---|---|
| `POSTGRES_ADMIN_PASSWORD` | PostgreSQL administrator password (used by `deploy-infra.yml` to provision the server and populate Key Vault) |
| `DATABASE_URL` | Full PostgreSQL connection string used by the migration runner in `deploy.yml`. Format: `postgresql://user:password@host/cpcrm?sslmode=require` |
| `AZURE_STATIC_WEB_APPS_API_TOKEN` | Deployment token for the Azure Static Web App. Retrieve from: **Azure Portal → Static Web App → Manage deployment token** |

> **Note:** `DATABASE_URL` and `AZURE_STATIC_WEB_APPS_API_TOKEN` are only available
> after the infrastructure has been deployed for the first time (see step 6).

---

## 6. First-time deployment order

Run these steps once per environment (starting with `dev`):

1. **Deploy infrastructure** — trigger `deploy-infra.yml` manually via
   **Actions → Deploy Infrastructure → Run workflow**, selecting the target environment.

   This creates all Azure resources and stores the PostgreSQL connection string in
   Key Vault automatically.

2. **Retrieve the SWA deployment token** — in the Azure Portal, open the Static Web App
   (`swa-cpcrm-<env>`), go to **Manage deployment token**, copy the token, and add it
   as the `AZURE_STATIC_WEB_APPS_API_TOKEN` secret in the corresponding GitHub Environment.

3. **Set `DATABASE_URL` secret** — copy the connection string from Key Vault
   (`postgres-connection-string`) and add it as the `DATABASE_URL` secret in the
   corresponding GitHub Environment. This is used by the migration runner in `deploy.yml`.

4. **Deploy the application** — push to the environment branch (`develop` → dev,
   `staging` → stg, `main` → prod) or trigger `deploy.yml` manually. The pipeline will:
   - Build and deploy the API to Azure App Service
   - Run pending database migrations against PostgreSQL
   - Build and deploy the React frontend to Azure Static Web App

---

## 7. Ongoing deployments

After initial setup, deployments are fully automated:

| Push to branch | Deploys to |
|---|---|
| `develop` | `dev` |
| `staging` | `stg` |
| `main` | `prod` (requires reviewer approval) |

Infrastructure changes under `infrastructure/bicep/**` automatically trigger
`deploy-infra.yml` for the matching environment branch.
