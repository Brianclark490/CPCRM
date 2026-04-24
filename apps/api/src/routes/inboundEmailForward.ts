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

// Two supported address shapes:
//   u-<userId>@...              – user is in exactly one tenant
//   u-<userId>.<tenantSlug>@... – explicit tenant selector for multi-tenant users
const USER_ADDRESS_RE = /^u-([a-zA-Z0-9_-]+)(?:\.([a-zA-Z0-9_-]+))?@/;

interface ForwardAddress {
  userId: string;
  tenantSlug?: string;
}

function extractAddressFromTo(payload: PostmarkInboundPayload): ForwardAddress | undefined {
  const candidates: string[] = [];
  if (payload.OriginalRecipient) candidates.push(payload.OriginalRecipient);
  for (const t of payload.ToFull ?? []) candidates.push(t.Email);
  for (const email of candidates) {
    const m = USER_ADDRESS_RE.exec(email);
    if (m) return { userId: m[1], tenantSlug: m[2] };
  }
  return undefined;
}

type TenantResolution =
  | { kind: 'ok'; tenantId: string }
  | { kind: 'none' }
  | { kind: 'ambiguous'; tenantSlugs: string[] };

/**
 * Resolves the forward recipient to a specific tenant.
 *
 * - If the address carries a tenant slug (`u-<id>.<slug>@...`), we require an
 *   exact match — never silently fall back to another tenant.
 * - If the address has no slug and the user belongs to exactly one tenant,
 *   that tenant is used.
 * - If the user belongs to multiple tenants and no slug was provided, the
 *   result is `ambiguous` and the webhook refuses rather than guessing — this
 *   prevents routing email content into the wrong organisation (reviewer
 *   flagged the previous `LIMIT 1` as non-deterministic; returning 409 with
 *   an explicit list is safer and tells the user how to re-send).
 */
async function resolveTenantForAddress(
  address: ForwardAddress,
): Promise<TenantResolution> {
  const { userId, tenantSlug } = address;

  if (tenantSlug) {
    const result = await pool.query<{ id: string }>(
      `SELECT t.id
         FROM tenant_memberships m
         JOIN tenants t ON t.id = m.tenant_id
        WHERE m.user_id = $1 AND t.slug = $2
        LIMIT 1`,
      [userId, tenantSlug],
    );
    if (result.rows.length === 0) return { kind: 'none' };
    return { kind: 'ok', tenantId: result.rows[0].id };
  }

  const result = await pool.query<{ tenant_id: string; slug: string }>(
    `SELECT m.tenant_id, t.slug
       FROM tenant_memberships m
       JOIN tenants t ON t.id = m.tenant_id
      WHERE m.user_id = $1
      ORDER BY m.created_at ASC`,
    [userId],
  );
  if (result.rows.length === 0) return { kind: 'none' };
  if (result.rows.length === 1) {
    return { kind: 'ok', tenantId: result.rows[0].tenant_id };
  }
  return {
    kind: 'ambiguous',
    tenantSlugs: result.rows.map((r) => r.slug),
  };
}

inboundEmailForwardRouter.post(
  '/inbound-email',
  async (req: Request, res: Response) => {
    if (!verifySignature(req)) {
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }
    const payload = req.body as PostmarkInboundPayload;
    const address = extractAddressFromTo(payload);
    if (!address) {
      res.status(400).json({ error: 'Unable to derive user from To address' });
      return;
    }
    const { userId } = address;
    const tenant = await resolveTenantForAddress(address);
    if (tenant.kind === 'none') {
      res.status(403).json({
        error: address.tenantSlug
          ? `User is not a member of tenant '${address.tenantSlug}'`
          : 'User has no tenant membership',
      });
      return;
    }
    if (tenant.kind === 'ambiguous') {
      // Refuse rather than silently filing email into the wrong tenant.
      // The user can re-send to `u-<userId>.<tenantSlug>@...` to disambiguate.
      res.status(409).json({
        error: 'User belongs to multiple tenants',
        detail:
          `Re-send to u-${userId}.<tenantSlug>@<inbound domain> with one of ` +
          `[${tenant.tenantSlugs.join(', ')}] to choose which tenant the ` +
          `email should be filed in.`,
      });
      return;
    }
    const tenantId = tenant.tenantId;

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
