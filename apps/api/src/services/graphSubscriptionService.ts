import { randomBytes, randomUUID } from 'node:crypto';
import { pool } from '../db/client.js';
import { config } from '../lib/config.js';
import { logger } from '../lib/logger.js';
import { MS_GRAPH_BASE, getAccessToken, markConnectionError } from './mailboxConnectionService.js';

/**
 * Microsoft Graph change-notification subscriptions for inbound mail.
 *
 * A subscription lives for roughly 3 days on Outlook resources, so the
 * renewal job runs every 24h and extends anything within 48h of expiry.
 * On creation Graph POSTs a validation request to our webhook and expects
 * the echoed token in the response body within 10 seconds — the webhook
 * route handles that case before any signature check.
 */

// Graph caps messages-resource subscriptions at 4230 minutes (~70.5 hours).
const SUBSCRIPTION_LIFETIME_MS = 70 * 60 * 60 * 1000;

// Renew whenever a subscription is within this window of expiring.
const RENEW_AHEAD_MS = 48 * 60 * 60 * 1000;

export interface MailboxSubscriptionRow {
  id: string;
  mailboxConnectionId: string;
  tenantId: string;
  provider: string;
  providerSubscriptionId: string;
  resource: string;
  clientState: string;
  expiresAt: Date;
}

function notificationUrl(): string {
  const base = config.emailIngest.graphWebhookBaseUrl;
  if (!base) {
    throw new Error('GRAPH_WEBHOOK_BASE_URL is not configured');
  }
  return `${base.replace(/\/$/, '')}/api/v1/webhooks/graph/notifications`;
}

function lifecycleUrl(): string {
  const base = config.emailIngest.graphWebhookBaseUrl;
  if (!base) {
    throw new Error('GRAPH_WEBHOOK_BASE_URL is not configured');
  }
  return `${base.replace(/\/$/, '')}/api/v1/webhooks/graph/lifecycle`;
}

interface GraphSubscription {
  id: string;
  resource: string;
  changeType: string;
  notificationUrl: string;
  expirationDateTime: string;
  clientState: string;
}

async function graphPost<T>(
  accessToken: string,
  path: string,
  body: unknown,
): Promise<T> {
  const res = await fetch(`${MS_GRAPH_BASE}/v1.0${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph ${path} ${res.status}: ${text}`);
  }
  return (await res.json()) as T;
}

async function graphPatch<T>(
  accessToken: string,
  path: string,
  body: unknown,
): Promise<T> {
  const res = await fetch(`${MS_GRAPH_BASE}/v1.0${path}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph ${path} ${res.status}: ${text}`);
  }
  return (await res.json()) as T;
}

async function graphDelete(accessToken: string, path: string): Promise<void> {
  const res = await fetch(`${MS_GRAPH_BASE}/v1.0${path}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    throw new Error(`Graph ${path} ${res.status}: ${text}`);
  }
}

export async function createInboxSubscription(params: {
  mailboxConnectionId: string;
  tenantId: string;
}): Promise<MailboxSubscriptionRow> {
  const { mailboxConnectionId, tenantId } = params;
  const accessToken = await getAccessToken(mailboxConnectionId);

  const clientState = randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + SUBSCRIPTION_LIFETIME_MS);
  const resource = `/me/mailFolders('Inbox')/messages`;

  try {
    const sub = await graphPost<GraphSubscription>(accessToken, '/subscriptions', {
      changeType: 'created',
      notificationUrl: notificationUrl(),
      lifecycleNotificationUrl: lifecycleUrl(),
      resource,
      expirationDateTime: expiresAt.toISOString(),
      clientState,
    });

    const id = randomUUID();
    await pool.query(
      `INSERT INTO mailbox_subscriptions (
         id, mailbox_connection_id, tenant_id, provider,
         provider_subscription_id, resource, client_state, expires_at
       ) VALUES ($1,$2,$3,'microsoft',$4,$5,$6,$7)`,
      [
        id,
        mailboxConnectionId,
        tenantId,
        sub.id,
        resource,
        clientState,
        new Date(sub.expirationDateTime),
      ],
    );

    return {
      id,
      mailboxConnectionId,
      tenantId,
      provider: 'microsoft',
      providerSubscriptionId: sub.id,
      resource,
      clientState,
      expiresAt: new Date(sub.expirationDateTime),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ err, mailboxConnectionId }, 'Failed to create Graph subscription');
    await markConnectionError(mailboxConnectionId, message);
    throw err;
  }
}

export async function renewSubscription(
  subscriptionRowId: string,
): Promise<void> {
  const result = await pool.query<{
    mailbox_connection_id: string;
    provider_subscription_id: string;
  }>(
    `SELECT mailbox_connection_id, provider_subscription_id
       FROM mailbox_subscriptions
      WHERE id = $1`,
    [subscriptionRowId],
  );
  if (result.rows.length === 0) return;
  const row = result.rows[0];
  const accessToken = await getAccessToken(row.mailbox_connection_id);
  const nextExpiresAt = new Date(Date.now() + SUBSCRIPTION_LIFETIME_MS);

  try {
    const updated = await graphPatch<GraphSubscription>(
      accessToken,
      `/subscriptions/${row.provider_subscription_id}`,
      { expirationDateTime: nextExpiresAt.toISOString() },
    );
    await pool.query(
      `UPDATE mailbox_subscriptions
          SET expires_at = $2, updated_at = NOW()
        WHERE id = $1`,
      [subscriptionRowId, new Date(updated.expirationDateTime)],
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ err, subscriptionRowId }, 'Failed to renew Graph subscription');
    // If Graph rejects the renewal (404, the sub may have lapsed), drop the
    // row so the next-tick reconcile creates a fresh one.
    if (message.includes(' 404')) {
      await pool.query(`DELETE FROM mailbox_subscriptions WHERE id = $1`, [
        subscriptionRowId,
      ]);
    }
  }
}

export async function deleteSubscription(
  mailboxConnectionId: string,
): Promise<void> {
  const result = await pool.query<{ id: string; provider_subscription_id: string }>(
    `SELECT id, provider_subscription_id FROM mailbox_subscriptions
      WHERE mailbox_connection_id = $1`,
    [mailboxConnectionId],
  );
  if (result.rows.length === 0) return;

  const accessToken = await getAccessToken(mailboxConnectionId).catch(() => undefined);
  for (const row of result.rows) {
    if (accessToken) {
      try {
        await graphDelete(accessToken, `/subscriptions/${row.provider_subscription_id}`);
      } catch (err) {
        logger.warn({ err }, 'Ignoring subscription delete failure');
      }
    }
    await pool.query(`DELETE FROM mailbox_subscriptions WHERE id = $1`, [row.id]);
  }
}

/**
 * Renews every subscription whose `expires_at` is within the renewal window,
 * and reconciles active connections that have no subscription at all.
 */
export async function renewExpiringSubscriptions(): Promise<void> {
  const now = new Date();
  const cutoff = new Date(now.getTime() + RENEW_AHEAD_MS);

  const subs = await pool.query<{ id: string }>(
    `SELECT id FROM mailbox_subscriptions WHERE expires_at < $1`,
    [cutoff],
  );

  for (const row of subs.rows) {
    await renewSubscription(row.id);
  }

  // Reconcile: every active connection should have an open subscription.
  const missing = await pool.query<{ id: string; tenant_id: string }>(
    `SELECT c.id, c.tenant_id
       FROM mailbox_connections c
  LEFT JOIN mailbox_subscriptions s ON s.mailbox_connection_id = c.id
      WHERE c.status = 'active' AND s.id IS NULL`,
  );
  for (const row of missing.rows) {
    try {
      await createInboxSubscription({
        mailboxConnectionId: row.id,
        tenantId: row.tenant_id,
      });
    } catch (err) {
      logger.warn({ err, connectionId: row.id }, 'Reconcile: failed to create subscription');
    }
  }
}

export async function validateClientState(
  providerSubscriptionId: string,
  clientState: string,
): Promise<{
  mailboxConnectionId: string;
  tenantId: string;
} | undefined> {
  const result = await pool.query<{
    mailbox_connection_id: string;
    tenant_id: string;
    client_state: string;
  }>(
    `SELECT mailbox_connection_id, tenant_id, client_state
       FROM mailbox_subscriptions
      WHERE provider_subscription_id = $1`,
    [providerSubscriptionId],
  );
  const row = result.rows[0];
  if (!row) return undefined;
  if (row.client_state !== clientState) return undefined;
  return {
    mailboxConnectionId: row.mailbox_connection_id,
    tenantId: row.tenant_id,
  };
}

export interface GraphMessageDetail {
  id: string;
  internetMessageId: string;
  subject?: string;
  bodyPreview?: string;
  body?: { contentType: 'html' | 'text'; content: string };
  from?: { emailAddress: { address: string; name?: string } };
  toRecipients?: Array<{ emailAddress: { address: string; name?: string } }>;
  ccRecipients?: Array<{ emailAddress: { address: string; name?: string } }>;
  receivedDateTime: string;
  conversationId?: string;
  hasAttachments?: boolean;
  internetMessageHeaders?: Array<{ name: string; value: string }>;
}

export async function fetchMessage(
  mailboxConnectionId: string,
  messageId: string,
): Promise<GraphMessageDetail> {
  const accessToken = await getAccessToken(mailboxConnectionId);
  const url = `${MS_GRAPH_BASE}/v1.0/me/messages/${messageId}?$select=id,internetMessageId,subject,bodyPreview,body,from,toRecipients,ccRecipients,receivedDateTime,conversationId,hasAttachments,internetMessageHeaders`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Prefer: 'IdType="ImmutableId"',
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph /me/messages/${messageId} ${res.status}: ${text}`);
  }
  return (await res.json()) as GraphMessageDetail;
}
