import { Router } from 'express';
import type { Request, Response } from 'express';
import { pool } from '../db/client.js';
import { tenantStore } from '../db/tenantContext.js';
import { logger } from '../lib/logger.js';
import {
  fetchMessage,
  validateClientState,
  type GraphMessageDetail,
} from '../services/graphSubscriptionService.js';
import { ingestEmail } from '../services/emailIngestService.js';

/**
 * Graph change-notification webhook.
 *
 * Two quirks that drive the shape of this handler:
 *
 * 1. **Validation handshake.** When Graph creates or renews a subscription it
 *    POSTs to the notificationUrl with `?validationToken=...` and expects a
 *    plaintext 200 echoing the token within 10 seconds. We short-circuit that
 *    at the top of the handler before any other work.
 *
 * 2. **No JWT auth.** Graph doesn't present our session cookie, so we
 *    authenticate each notification by matching the per-subscription
 *    `clientState` we stored at creation time. On success we manually set up
 *    the tenant context via `tenantStore.run` so RLS policies fire.
 */

export const graphWebhookRouter = Router();

interface ChangeNotification {
  subscriptionId: string;
  subscriptionExpirationDateTime: string;
  changeType: string;
  resource: string;
  resourceData?: { id?: string; '@odata.type'?: string };
  clientState?: string;
  tenantId?: string;
  lifecycleEvent?: 'reauthorizationRequired' | 'subscriptionRemoved' | 'missed';
}

interface NotificationCollection {
  value: ChangeNotification[];
  validationTokens?: string[];
}

async function processNotification(
  n: ChangeNotification,
): Promise<void> {
  if (!n.clientState) return;
  const binding = await validateClientState(n.subscriptionId, n.clientState);
  if (!binding) {
    logger.warn(
      { subscriptionId: n.subscriptionId },
      'Graph notification clientState did not match',
    );
    return;
  }

  const messageId = n.resourceData?.id;
  if (!messageId) return;

  // Load the mailbox owner's Descope userId so the ingest is attributed to them.
  const ownerRow = await pool.query<{ user_id: string; email_address: string }>(
    `SELECT user_id, email_address FROM mailbox_connections WHERE id = $1`,
    [binding.mailboxConnectionId],
  );
  if (ownerRow.rows.length === 0) return;
  const { user_id: userId, email_address: ownerEmail } = ownerRow.rows[0];

  // All downstream work runs inside the tenant context so RLS is enforced.
  await tenantStore.run(binding.tenantId, async () => {
    let detail: GraphMessageDetail;
    try {
      detail = await fetchMessage(binding.mailboxConnectionId, messageId);
    } catch (err) {
      logger.warn(
        { err, subscriptionId: n.subscriptionId, messageId },
        'Failed to fetch Graph message',
      );
      return;
    }

    const headers: Record<string, string> = {};
    for (const h of detail.internetMessageHeaders ?? []) {
      headers[h.name] = h.value;
    }

    try {
      await ingestEmail(
        {
          provider: 'microsoft',
          providerMsgId: detail.internetMessageId,
          from: {
            email: detail.from?.emailAddress?.address ?? '',
            name: detail.from?.emailAddress?.name,
          },
          to: (detail.toRecipients ?? []).map((r) => ({
            email: r.emailAddress.address,
            name: r.emailAddress.name,
          })),
          cc: (detail.ccRecipients ?? []).map((r) => ({
            email: r.emailAddress.address,
            name: r.emailAddress.name,
          })),
          subject: detail.subject,
          textBody: detail.body?.contentType === 'text' ? detail.body.content : undefined,
          htmlBody: detail.body?.contentType === 'html' ? detail.body.content : undefined,
          receivedAt: new Date(detail.receivedDateTime),
          conversationId: detail.conversationId,
          headers,
          hasCalendarAttachment: detail.hasAttachments === true, // rough — refine later
        },
        {
          tenantId: binding.tenantId,
          userId,
          ownerEmail,
        },
      );
    } catch (err) {
      logger.error({ err, messageId }, 'ingestEmail failed');
    }
  });
}

graphWebhookRouter.post('/notifications', async (req: Request, res: Response) => {
  // Subscription-creation handshake.
  if (typeof req.query.validationToken === 'string') {
    res.set('Content-Type', 'text/plain');
    res.status(200).send(req.query.validationToken);
    return;
  }

  const body = req.body as NotificationCollection | undefined;
  if (!body || !Array.isArray(body.value)) {
    res.status(400).json({ error: 'Invalid notification payload' });
    return;
  }

  // Acknowledge synchronously — Graph retries if we don't respond quickly.
  res.status(202).end();

  // Process asynchronously but do not lose error context.
  for (const n of body.value) {
    processNotification(n).catch((err: unknown) => {
      logger.error({ err }, 'Failed processing Graph notification');
    });
  }
});

graphWebhookRouter.post('/lifecycle', async (req: Request, res: Response) => {
  if (typeof req.query.validationToken === 'string') {
    res.set('Content-Type', 'text/plain');
    res.status(200).send(req.query.validationToken);
    return;
  }

  const body = req.body as NotificationCollection | undefined;
  res.status(202).end();

  for (const n of body?.value ?? []) {
    if (!n.clientState) continue;
    const binding = await validateClientState(n.subscriptionId, n.clientState);
    if (!binding) continue;
    logger.info(
      { event: n.lifecycleEvent, subscriptionId: n.subscriptionId },
      'Graph lifecycle notification received',
    );
    // Missed / reauthorizationRequired / subscriptionRemoved all need the
    // subscription to be recreated; the renewal job reconciles every 24h
    // and also runs on demand here.
    if (n.lifecycleEvent === 'subscriptionRemoved') {
      await pool.query(
        `DELETE FROM mailbox_subscriptions WHERE provider_subscription_id = $1`,
        [n.subscriptionId],
      );
    }
  }
});
