# Observability — Logging, Monitoring, and Diagnostics

This document describes the observability approach for the CPCRM platform: how logs are produced and collected, where to view them, and how to diagnose common issues.

---

## Overview

The CPCRM observability stack is built on Azure-native PaaS services and aligned with the infrastructure provisioned in `infrastructure/bicep/`.

| Concern | Local development | Deployed (Azure) |
|---|---|---|
| **Structured logging** | pino JSON to stdout | Captured by App Service → Log Analytics |
| **HTTP request logs** | pino-http per-request JSON | Same |
| **Browser telemetry** | Console / browser DevTools | Azure Application Insights (browser SDK) |
| **APM / distributed traces** | — | Azure Application Insights |
| **Log querying** | Terminal output | Azure Log Analytics (KQL) |
| **Alerts** | — | Azure Monitor alert rules |

---

## Application Logging (API)

The backend API uses **[pino](https://getpino.io/)** for structured, JSON-formatted logging. All log entries include a `level`, `time`, `name`, and any additional context fields passed by the caller.

### Logger module

`apps/api/src/lib/logger.ts` exports a single `logger` instance used throughout the API:

```typescript
import { logger } from './lib/logger.js';

logger.info({ port: 3001, env: 'development' }, 'API server started');
logger.warn({ path: '/me' }, 'Auth rejected: token validation failed');
logger.error({ err }, 'Unexpected error processing request');
```

Logs are written to **stdout** in JSON format. In local development this can be piped through `pino-pretty` for human-readable output:

```bash
npm run dev | npx pino-pretty
```

### HTTP request logging

**[pino-http](https://github.com/pinojs/pino-http)** is registered as an Express middleware in `src/index.ts`. It automatically emits a log entry for every incoming HTTP request, including:

- HTTP method and URL
- Response status code
- Response time (ms)
- Request and response content lengths

### Log levels

| Level | When to use |
|---|---|
| `trace` | Very detailed internal state (disabled by default) |
| `debug` | Development diagnostics |
| `info` | Normal operational events (server start, route registered) |
| `warn` | Expected error conditions (auth failure, validation error) |
| `error` | Unexpected errors that need investigation |
| `fatal` | Application cannot continue; will exit |

Set `LOG_LEVEL=debug` in your local `.env` to enable more verbose output.

### Suppression during tests

The logger level is forced to `silent` when `NODE_ENV=test` (set automatically by Vitest), so test output is not polluted with log lines.

---

## Monitoring and Diagnostics (Azure)

### Infrastructure provisioned

The Bicep templates in `infrastructure/bicep/modules/monitoring.bicep` provision:

| Resource | Name (dev) | Purpose |
|---|---|---|
| Log Analytics Workspace | `law-cpcrm-dev` | Central log store for all services |
| Application Insights | `appi-cpcrm-dev` | APM, request tracing, exceptions, browser SDK |

The App Service is configured with `APPLICATIONINSIGHTS_CONNECTION_STRING` as an application setting, which enables the Application Insights SDK to automatically capture:

- HTTP request/response telemetry
- Dependency tracking (outbound HTTP, database calls)
- Exception tracking
- Performance counters

The PostgreSQL Flexible Server sends diagnostic logs (query logs, error logs, connection stats) to the same Log Analytics Workspace via diagnostic settings.

### Where to view logs

#### Azure Portal — Log Analytics

1. Navigate to the [Azure Portal](https://portal.azure.com).
2. Go to **Log Analytics Workspaces** → `law-cpcrm-dev`.
3. Select **Logs** and run a KQL query.

**Useful KQL queries:**

```kql
// Last 100 API application log lines
AppServiceConsoleLogs
| where TimeGenerated > ago(1h)
| order by TimeGenerated desc
| take 100

// HTTP requests by status code (last hour)
AppRequests
| where TimeGenerated > ago(1h)
| summarize count() by resultCode
| order by count_ desc

// All failed requests (4xx and 5xx)
AppRequests
| where success == false
| project TimeGenerated, name, resultCode, duration, url
| order by TimeGenerated desc

// Authentication failures
AppTraces
| where message contains "Auth rejected"
| project TimeGenerated, message, customDimensions
| order by TimeGenerated desc

// Exceptions in the last 24 hours
AppExceptions
| where TimeGenerated > ago(24h)
| project TimeGenerated, type, outerMessage, details
| order by TimeGenerated desc
```

#### Azure Portal — Application Insights

1. Navigate to **Application Insights** → `appi-cpcrm-dev`.
2. Use the following blades:
   - **Live Metrics** — real-time request/failure rates and performance
   - **Failures** — exception details grouped by operation
   - **Performance** — response time percentiles, slowest operations
   - **Transaction Search** — search individual requests by URL, user, or correlation ID
   - **Availability** — configure synthetic probes to test the `/health` endpoint from Azure regions

#### App Service — Log Stream

For a quick look at live stdout logs from a running App Service:

```bash
az webapp log tail \
  --resource-group rg-cpcrm-dev \
  --name app-cpcrm-api-dev
```

Or from the Azure Portal: **App Service** → `app-cpcrm-api-dev` → **Log stream**.

---

## Troubleshooting Common Issues

| Symptom | Where to look | What to check |
|---|---|---|
| API returns 401 for valid user | App Insights Failures or Log Analytics `AppTraces` | Filter by `"Auth rejected"` messages; check `DESCOPE_PROJECT_ID` is set correctly |
| Requests are slow | App Insights Performance | Review dependency durations (outbound calls, DB queries) |
| Application crashes on startup | App Service Log stream / `AppServiceConsoleLogs` | Check for missing required env vars (`DESCOPE_PROJECT_ID`) |
| Missing logs in Log Analytics | App Service → Diagnostic settings | Confirm `APPLICATIONINSIGHTS_CONNECTION_STRING` is set; allow up to 5 min ingestion lag |
| Database connection failures | PostgreSQL → Logs in Log Analytics | Query `AzureDiagnostics` for `psql-cpcrm-dev`; check VNet / firewall rules |
| Build or deployment fails | GitHub Actions → CI workflow run | Review Actions logs; check `AZURE_CLIENT_ID` / `AZURE_SUBSCRIPTION_ID` secrets |

---

## Local Development Diagnostics

- **API startup:** Look for `"API server started"` in console output with `port` and `env` fields.
- **Auth failures:** pino-http will log each request. Auth middleware emits a `warn` log with the rejection reason.
- **Increase verbosity:** Set `LOG_LEVEL=debug` in `apps/api/.env` and restart the server.
- **Pretty-print logs:** Pipe dev server output through `pino-pretty`:
  ```bash
  cd apps/api && npm run dev | npx pino-pretty
  ```

---

## Future Enhancements

- **Browser-side telemetry:** Add the [Application Insights JavaScript SDK](https://learn.microsoft.com/en-us/azure/azure-monitor/app/javascript) to the React frontend for client-side error tracking, page-view telemetry, and user behaviour analytics.
- **Correlation IDs:** Propagate a request correlation ID through the full stack (frontend → API → database) using `x-request-id` headers and pino child loggers.
- **Azure Monitor alert rules:** Configure availability and error-rate alerts on `appi-cpcrm-dev` to notify the team via email or Teams when thresholds are exceeded.
- **Structured log schema:** Establish a shared `packages/types` schema for log context fields to keep telemetry consistent across services.
