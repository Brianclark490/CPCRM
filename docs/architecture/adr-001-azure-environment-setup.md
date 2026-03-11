# ADR-001: Azure Environment Setup

## Status

Accepted

## Context

The CPCRM platform requires a baseline Azure environment for the development stage of the project. Before any application code can be deployed, we need to agree on:

- Which Azure services to use for each component
- How resources will be named
- How secrets will be managed
- How monitoring and logging will be handled
- The provisioning order for environment setup

## Decisions

### 1. Resource Group

A dedicated Azure resource group is created per environment to provide clear isolation, cost visibility, and access control.

| Environment | Resource Group      |
|-------------|---------------------|
| Development | `rg-cpcrm-dev`      |
| Staging     | `rg-cpcrm-stg`      |
| Production  | `rg-cpcrm-prod`     |

### 2. Naming Convention

All resources follow the pattern: `<type>-cpcrm-<environment>`

This aligns with the [Azure Naming Convention](https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/ready/azure-best-practices/resource-naming) and the suffix convention already established in `CONTRIBUTING.md`.

| Resource Type              | Abbreviation | Dev Example             |
|----------------------------|--------------|-------------------------|
| Resource Group             | `rg`         | `rg-cpcrm-dev`          |
| Static Web App             | `swa`        | `swa-cpcrm-dev`         |
| App Service Plan           | `asp`        | `asp-cpcrm-api-dev`     |
| App Service (API)          | `app`        | `app-cpcrm-api-dev`     |
| PostgreSQL Flexible Server | `psql`       | `psql-cpcrm-dev`        |
| Key Vault                  | `kv`         | `kv-cpcrm-dev`          |
| Log Analytics Workspace    | `law`        | `law-cpcrm-dev`         |
| Application Insights       | `appi`       | `appi-cpcrm-dev`        |

### 3. Frontend Hosting

**Decision:** Azure Static Web Apps

**Rationale:**
- Purpose-built PaaS service for static frontends and SPAs (React + TypeScript)
- Built-in global CDN with SSL/TLS certificate management
- Native GitHub Actions integration for CI/CD
- Supports staging environments and preview deployments per pull request
- No infrastructure to manage; fully serverless

### 4. Backend Hosting

**Decision:** Azure App Service (Linux, Node.js 20)

**Rationale:**
- Fully managed PaaS; no container orchestration complexity required at this stage
- Native support for Node.js runtimes
- Built-in autoscaling, deployment slots (for zero-downtime deploys), and managed identity
- Simple integration with Key Vault via managed identity references
- Can be migrated to Azure Container Apps if containerisation becomes necessary later

App Service Plan SKU for dev: `B1` (Basic tier) — sufficient for development workloads while keeping costs low.

### 5. Managed Relational Database

**Decision:** Azure Database for PostgreSQL – Flexible Server

**Rationale:**
- Fully managed PostgreSQL 16, with automated backups and high availability options
- Flexible Server model provides more configuration control than Single Server (which is deprecated)
- Private networking via VNet integration for production; public access with firewall rules for dev
- Compatible with standard PostgreSQL drivers (no vendor lock-in for the application layer)
- Dev SKU: `Standard_B1ms` (Burstable, 1 vCore, 2 GiB RAM) — appropriate for development

### 6. Secrets Management

**Decision:** Azure Key Vault

**Rationale:**
- Azure-native secrets, keys, and certificates store
- Access controlled via Azure RBAC and managed identity (no credential rotation needed)
- App Service references Key Vault secrets directly via `@Microsoft.KeyVault(...)` syntax — no secrets in environment variables or application config files
- GitHub Actions uses OIDC federation (`AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`) — no long-lived credentials stored in GitHub Secrets

Secrets stored in Key Vault:
- PostgreSQL admin password
- Descope API key
- Any third-party integration credentials

### 7. Monitoring and Logging

**Decision:** Azure Monitor + Application Insights (backed by a Log Analytics Workspace)

**Rationale:**
- Application Insights provides APM (request tracing, dependency tracking, exceptions, performance) for both the frontend (browser SDK) and the API
- Log Analytics Workspace aggregates logs from all services in one queryable store (Kusto query language)
- Azure Monitor alerts can be configured on top of the workspace for proactive notification
- No additional cost for the Log Analytics workspace storage in dev at low data volumes

## Consequences

- All infrastructure will be provisioned via Bicep templates in `infrastructure/bicep/` following IaC principles
- Every environment (dev, stg, prod) will use the same Bicep templates, parameterised per environment
- Secrets are never committed to source control — see `CONTRIBUTING.md`
- Developers will need Contributor access on `rg-cpcrm-dev` to deploy locally; production deployments are CI-only
