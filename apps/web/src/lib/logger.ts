/**
 * Minimal frontend logger.
 *
 * This is a lightweight, replaceable shim.  When Issue 4.4 introduces a
 * proper logging backend (Sentry / OTel browser SDK / etc.), the
 * implementation here can be swapped out without touching callers.
 *
 * By design:
 *  - `info` and `warn` are no-ops in production to avoid noisy console logs.
 *  - `error` always forwards to `console.error` so real failures remain
 *    visible in devtools regardless of environment.
 */

export interface Logger {
  info: (message: string, context?: Record<string, unknown>) => void;
  warn: (message: string, context?: Record<string, unknown>) => void;
  error: (message: string, context?: Record<string, unknown>) => void;
}

function isDev(): boolean {
  // `import.meta.env.DEV` is set by Vite. Fall back to true in test envs.
  try {
    return Boolean((import.meta as { env?: { DEV?: boolean } }).env?.DEV);
  } catch {
    return true;
  }
}

export const logger: Logger = {
  info(message, context) {
    if (isDev()) {
      console.info(`[cpcrm] ${message}`, context ?? {});
    }
  },
  warn(message, context) {
    if (isDev()) {
      console.warn(`[cpcrm] ${message}`, context ?? {});
    }
  },
  error(message, context) {
    console.error(`[cpcrm] ${message}`, context ?? {});
  },
};
