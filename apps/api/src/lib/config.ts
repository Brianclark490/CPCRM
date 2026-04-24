/**
 * Application configuration.
 *
 * Non-sensitive settings are read here with safe defaults.
 * Sensitive settings (secrets, credentials) must be provided as environment
 * variables and are read at the point of use — never committed to source control.
 *
 * For deployed environments, sensitive values should be stored in Azure Key Vault
 * and surfaced to the application via App Service application settings or Key Vault
 * references. See docs/configuration.md for full guidance.
 */

const nodeEnv = (process.env.NODE_ENV ?? 'development') as
  | 'development'
  | 'production'
  | 'test';

/**
 * Resolves the allowed CORS origin(s) for the API server.
 *
 * Resolution order:
 * 1. CORS_ORIGIN env var — supports a single value or a comma-separated list
 *    of origins (e.g. "https://myapp.com,https://staging.myapp.com")
 * 2. WEBSITE_HOSTNAME — Azure App Service injects this automatically, so CORS
 *    works in Azure without any manual configuration
 * 3. http://localhost:5173 — local development fallback
 */
function resolveCorsOrigin(): string | string[] {
  const envOrigin = process.env.CORS_ORIGIN;
  if (envOrigin) {
    const origins = envOrigin
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);
    return origins.length === 1 ? origins[0] : origins;
  }

  const azureHostname = process.env.WEBSITE_HOSTNAME;
  if (azureHostname) {
    return `https://${azureHostname}`;
  }

  return 'http://localhost:5173';
}

export const config = {
  /** Runtime environment */
  env: nodeEnv,

  /** Port the HTTP server listens on */
  port: parseInt(process.env.PORT ?? '3001', 10),

  /**
   * Allowed CORS origin(s) for the frontend.
   * Supports a single origin string or an array of origins.
   * See resolveCorsOrigin() for the full resolution strategy.
   */
  corsOrigin: resolveCorsOrigin(),

  /**
   * Minimum log level. Accepts pino levels: trace, debug, info, warn, error, fatal.
   * Defaults to 'info'. Set to 'debug' for more verbose local output.
   */
  logLevel: process.env.LOG_LEVEL ?? 'info',

  /**
   * Azure Application Insights connection string.
   * Optional — only required in deployed Azure environments.
   * Store in Azure Key Vault; do not commit to source control.
   */
  appInsightsConnectionString: process.env.APPLICATIONINSIGHTS_CONNECTION_STRING,

  /**
   * Trust proxy setting for Express.
   * When deployed behind Azure's reverse proxy, we need to trust the X-Forwarded-*
   * headers to get the correct client IP for rate limiting.
   * Set to true in production, false in development.
   */
  trustProxy: nodeEnv === 'production',

  /**
   * Email-to-CRM ingest agent configuration. All sensitive values are resolved
   * at point-of-use (not cached here) so rotations take effect on next call.
   */
  emailIngest: {
    /** Anthropic model used for extraction. */
    llmModel: process.env.LLM_MODEL ?? 'claude-sonnet-4-6',
    /** Upper bound on completion tokens per extraction call. */
    anthropicMaxTokens: parseInt(process.env.ANTHROPIC_MAX_TOKENS ?? '1500', 10),
    /** Domain advertised to users for the forwarding fallback. */
    inboundEmailDomain: process.env.INBOUND_EMAIL_DOMAIN ?? 'inbound.example.com',
    /** Public HTTPS base URL the Graph service posts notifications to. */
    graphWebhookBaseUrl: process.env.GRAPH_WEBHOOK_BASE_URL,
    /** Microsoft Entra multi-tenant app client id. */
    msGraphClientId: process.env.MS_GRAPH_CLIENT_ID,
    /** Entra tenant id — use 'common' for multi-tenant apps. */
    msGraphTenantId: process.env.MS_GRAPH_TENANT_ID ?? 'common',
    /** Redirect URI registered in Entra for the OAuth callback. */
    msGraphRedirectUri: process.env.MS_GRAPH_REDIRECT_URI,
    /** Confidence ≥ this auto-applies the activity to the matched Account. */
    autoApplyThreshold: parseFloat(process.env.EMAIL_INGEST_AUTO_APPLY_THRESHOLD ?? '0.85'),
    /** Confidence < this creates a new Account without review. */
    autoCreateThreshold: parseFloat(process.env.EMAIL_INGEST_AUTO_CREATE_THRESHOLD ?? '0.55'),
  },
} as const;
