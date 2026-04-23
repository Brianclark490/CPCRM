import { logger } from '../lib/logger.js';
import { renewExpiringSubscriptions } from '../services/graphSubscriptionService.js';

/**
 * In-process renewal tick for Microsoft Graph subscriptions. Every 24 hours
 * we renew anything expiring in the next 48h and reconcile active
 * connections that are missing an open subscription.
 *
 * No queue — this is an App Service-hosted Express app and this loop is
 * sufficient at MVP scale. If we move to multiple instances we'll need a
 * distributed lock (or a dedicated scheduler) so we don't renew twice.
 */

const RENEW_INTERVAL_MS = 24 * 60 * 60 * 1000;

let timer: NodeJS.Timeout | undefined;

export function startSubscriptionRenewalJob(): void {
  if (timer) return;
  // First tick is delayed by a minute so the web process has a chance to
  // settle before it makes outbound Graph calls.
  timer = setInterval(tick, RENEW_INTERVAL_MS);
  setTimeout(tick, 60_000).unref();
  timer.unref();
}

export function stopSubscriptionRenewalJob(): void {
  if (timer) {
    clearInterval(timer);
    timer = undefined;
  }
}

async function tick(): Promise<void> {
  try {
    await renewExpiringSubscriptions();
    logger.debug('Graph subscription renewal tick complete');
  } catch (err) {
    logger.warn({ err }, 'Graph subscription renewal tick failed');
  }
}
