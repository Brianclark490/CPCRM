# Configuration Management

This document describes the configuration strategy for the CPCRM platform across local development and deployed Azure environments.

---

## Principles

1. **Sensitive settings are never committed to source control.**  
   All credentials, connection strings, and secrets are supplied as environment variables and stored in Azure Key Vault for deployed environments.

2. **Non-sensitive settings have safe defaults.**  
   Config values like `PORT` and `CORS_ORIGIN` default to values that work for local development and are overridden per environment.

3. **A single configuration module is the source of truth.**  
   The API's `src/lib/config.ts` centralises all non-sensitive runtime settings. Sensitive values are read from `process.env` at the point of use and validated at startup.

4. **Configuration is environment-specific, not environment-aware.**  
   Each environment (local, dev, staging, prod) supplies its own values. The application code does not contain environment names as branching conditions.

---

## Environment Variable Reference

### API (`apps/api`)

| Variable | Required | Sensitive | Default | Description |
|---|---|---|---|---|
| `DESCOPE_PROJECT_ID` | Yes | No | — | Descope project identifier for JWT validation. |
| `PORT` | No | No | `3001` | Port the HTTP server listens on. |
| `CORS_ORIGIN` | No | No | `http://localhost:5173` | Allowed CORS origin. |
| `LOG_LEVEL` | No | No | `info` | Pino log level (`trace`, `debug`, `info`, `warn`, `error`, `fatal`). |
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | No (local) / Yes (Azure) | Yes | — | Azure Application Insights connection string. |
| `NODE_ENV` | No | No | `development` | Runtime environment hint (`development`, `production`, `test`). |

### Web (`apps/web`)

| Variable | Required | Sensitive | Default | Description |
|---|---|---|---|---|
| `VITE_DESCOPE_PROJECT_ID` | Yes | No | — | Descope project ID used by the React SDK. Embedded in the frontend bundle. |
| `VITE_API_BASE_URL` | No | No | `http://localhost:3001` | API base URL (used in non-proxy contexts). |
| `VITE_APPLICATIONINSIGHTS_CONNECTION_STRING` | No (local) / Yes (Azure) | No† | — | App Insights connection string for browser-side telemetry. |

> †The Application Insights connection string contains an instrumentation key visible in the browser bundle. It is not a secret in the traditional sense, but treat it as sensitive in terms of source control to avoid unwanted usage outside your Azure subscription.

---

## Local Development Setup

1. Copy the example files:
   ```bash
   cp apps/api/.env.example apps/api/.env
   cp apps/web/.env.example apps/web/.env.local
   ```

2. Fill in your Descope Project ID from the [Descope Console](https://app.descope.com/settings/project).

3. Leave all other values at their defaults unless you are running on a non-standard port.

The `.gitignore` at the repository root excludes `.env`, `.env.local`, and all `.env.*.local` files.

---

## Deployed Azure Environments

In deployed environments all configuration is supplied via Azure App Service application settings. Sensitive values are stored in Azure Key Vault and referenced using the Key Vault reference syntax:

```
@Microsoft.KeyVault(VaultName=kv-cpcrm-dev;SecretName=descope-api-key)
```

The App Service's system-assigned managed identity is granted the **Key Vault Secrets User** role on the Key Vault. No credentials are stored in GitHub Secrets or environment files.

### Secrets stored in Azure Key Vault

| Key Vault Secret Name | Consumed by | Description |
|---|---|---|
| `postgres-connection-string` | API App Service | PostgreSQL connection string including credentials |
| `descope-api-key` | API App Service | Descope management API key (if needed for server-side flows) |

### Application Insights connection string

The `APPLICATIONINSIGHTS_CONNECTION_STRING` is set directly as an App Service application setting (not a Key Vault reference) because it does not contain account-level credentials — it identifies the Application Insights resource within your Azure subscription.

---

## Separating Sensitive from Non-Sensitive Config

| Category | Examples | Where stored |
|---|---|---|
| **Non-sensitive defaults** | `PORT`, `CORS_ORIGIN`, `LOG_LEVEL` | `src/lib/config.ts` with safe defaults |
| **Non-sensitive identifiers** | `DESCOPE_PROJECT_ID`, `VITE_DESCOPE_PROJECT_ID` | `.env` / `.env.local` locally; App Service settings in Azure |
| **Sensitive secrets** | DB credentials, API keys | Azure Key Vault (never in source control) |
| **Sensitive connection strings** | `APPLICATIONINSIGHTS_CONNECTION_STRING` | App Service settings in Azure (not committed) |

---

## Adding a New Config Value

1. Add the environment variable to `apps/api/.env.example` (or `apps/web/.env.example`) with a comment explaining it.
2. If non-sensitive, add it to `src/lib/config.ts` with an appropriate default.
3. If sensitive (credentials, connection strings), read directly from `process.env` in the module that uses it and validate at startup.
4. For deployed environments, add the value to the Bicep parameter file and/or document it in the Key Vault setup step of the provisioning runbook.
