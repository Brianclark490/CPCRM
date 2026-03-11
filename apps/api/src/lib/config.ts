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

export const config = {
  /** Runtime environment */
  env: nodeEnv,

  /** Port the HTTP server listens on */
  port: parseInt(process.env.PORT ?? '3001', 10),

  /** Allowed CORS origin for the frontend */
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',

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
} as const;
