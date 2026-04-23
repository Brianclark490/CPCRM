import { Router } from 'express';
import type { Request, Response } from 'express';
import crypto from 'node:crypto';
import { pool } from '../db/client.js';
import { tenantStore } from '../db/tenantContext.js';
import { logger } from '../lib/logger.js';
import { ingestEmail } from '../services/emailIngestService.js';

/**
 * Postmark inbound webhook — the fallback path that lets users forward an
 * email to `u-<userId>@<INBOUND_EMAIL_DOMAIN>` when the Graph integration
 * isn't an option (partner threads, personal email, legacy workflows).
 *
 * Authentication is a shared HMAC secret (`POSTMARK_INBOUND_SIGNING_SECRET`)
 * verified against the `X-Postmark-Webhook-Signature` header computed over
 * the raw request body. We don't use the Bearer/JWT path because Postmark
 * doesn't carry our session.
 */

export const inboundEmailForwardRouter = Router();

interface PostmarkAddress {
  Email: string;
  Name?: string;
}

interface PostmarkInboundPayload {
  MessageID: string;
  Subject?: string;
  TextBody?: string;
  HtmlBody?: string;
  From?: string;
  FromName?: string;
  FromFull?: PostmarkAddress;
  ToFull?: PostmarkAddress[];
  CcFull?: PostmarkAddress[];
  Date?: string;
  Headers?: Array<{ Name: string; Value: string }>;
  Attachments?: Array<{ ContentType: string }>;
  OriginalRecipient?: string;
}

function verifySignature(req: Request): boolean {
  const secret = process.env.POSTMARK_INBOUND_SIGNING_SECRET;
  if (!secret) {
    // Misconfigured — refuse to accept anything rather than accept everything.
    return false;
  }
  const sig = req.header('X-Postmark-Webhook-Signature');
  if (!sig) return false;
  const raw = (req as Request & { rawBody?: Buffer }).rawBody;
  if (!raw) return false;
  const expected = crypto.createHmac('sha256', secret).update(raw).digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
  } catch {
    return false;
  }
}

const USER_ADDRESS_RE = /^u-([a-zA-Z0-9_-]+)@/;

function extractUserIdFromTo(payload: PostmarkInboundPayload): string | undefined {
  const candidates: string[] = [];
  if (payload.OriginalRecipient) candidates.push(payload.OriginalRecipient);
  for (const t of payload.ToFull ?? []) candidates.push(t.Email);
  for (const email of candidates) {
    const m = USER_ADDRESS_RE.exec(email);
    if (m) return m[1];
  }
  return undefined;
}

async function resolveTenantForUser(userId: string): Promise<string | undefined> {
  const result = await pool.query<{ tenant_id: string }>(
    `SELECT tenant_id FROM tenant_memberships WHERE user_id = $1 LIMIT 1`,
    [userId],
  );
  return result.rows[0]?.tenant_id;
}

inboundEmailForwardRouter.post(
  '/inbound-email',
  async (req: Request, res: Response) => {
    if (!verifySignature(req)) {
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }
    const payload = req.body as PostmarkInboundPayload;
    const userId = extractUserIdFromTo(payload);
    if (!userId) {
      res.status(400).json({ error: 'Unable to derive user from To address' });
      return;
    }
    const tenantId = await resolveTenantForUser(userId);
    if (!tenantId) {
      res.status(403).json({ error: 'User has no tenant membership' });
      return;
    }

    // Respond fast so Postmark marks the delivery successful — process inline
    // within an AsyncLocalStorage context so RLS is active.
    res.status(202).end();

    await tenantStore.run(tenantId, async () => {
      try {
        await ingestEmail(
          {
            provider: 'postmark',
            providerMsgId: payload.MessageID,
            from: {
              email: payload.FromFull?.Email ?? payload.From ?? '',
              name: payload.FromFull?.Name ?? payload.FromName,
            },
            to: (payload.ToFull ?? []).map((t) => ({ email: t.Email, name: t.Name })),
            cc: (payload.CcFull ?? []).map((t) => ({ email: t.Email, name: t.Name })),
            subject: payload.Subject,
            textBody: payload.TextBody,
            htmlBody: payload.HtmlBody,
            receivedAt: payload.Date ? new Date(payload.Date) : new Date(),
            headers: Object.fromEntries(
              (payload.Headers ?? []).map((h) => [h.Name, h.Value]),
            ),
            hasCalendarAttachment: (payload.Attachments ?? []).some(
              (a) => a.ContentType === 'text/calendar',
            ),
          },
          {
            tenantId,
            userId,
            // Forwarding doesn't carry the owner's email — ingest service
            // falls back to mailbox_connections or leaves ownerDomain empty.
            forceInclude: true,
          },
        );
      } catch (err) {
        logger.error({ err }, 'Postmark inbound ingest failed');
      }
    });
  },
);
