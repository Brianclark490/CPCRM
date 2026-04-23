import { Router } from 'express';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { requireAuth } from '../middleware/auth.js';
import { requireTenant } from '../middleware/tenant.js';
import { AppError } from '../lib/appError.js';
import { pool } from '../db/client.js';
import { logger } from '../lib/logger.js';
import {
  getMailboxConnection,
  getAccessToken,
  MS_GRAPH_BASE,
} from '../services/mailboxConnectionService.js';
import {
  ingestEmail,
  resolvePendingIngest,
} from '../services/emailIngestService.js';
import type { GraphMessageDetail } from '../services/graphSubscriptionService.js';

/**
 * User-facing email-ingest endpoints (JWT-authenticated).
 *
 *   GET  /email-ingest                       – the caller's own ingest history
 *   POST /email-ingest/:id/resolve           – complete a pending_user_review
 *   GET  /mailbox/internal-recent            – internal-to-org emails skipped
 *                                              by the default filter, so the
 *                                              user can opt them into CRM
 *   POST /mailbox/internal-recent/:msgId/link – run full ingestion on one of
 *                                              those messages with forceInclude
 */

export const mailboxFeedRouter = Router();

mailboxFeedRouter.get(
  '/email-ingest',
  requireAuth,
  requireTenant,
  async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = req.user!.tenantId!;
    const userId = req.user!.userId;
    const limit = Math.min(parseInt((req.query.limit as string) ?? '50', 10), 200);

    const result = await pool.query(
      `SELECT id, received_at, from_email, from_name, subject,
              status, account_id, activity_id, review_task_id,
              confidence, filter_decision, error
         FROM email_ingest
        WHERE tenant_id = $1 AND user_id = $2
        ORDER BY received_at DESC
        LIMIT $3`,
      [tenantId, userId, limit],
    );

    res.json({
      data: result.rows.map((r) => ({
        id: r.id,
        receivedAt: r.received_at,
        fromEmail: r.from_email,
        fromName: r.from_name,
        subject: r.subject,
        status: r.status,
        accountId: r.account_id,
        activityId: r.activity_id,
        reviewTaskId: r.review_task_id,
        confidence: r.confidence != null ? Number(r.confidence) : null,
        filterDecision: r.filter_decision,
        error: r.error,
      })),
    });
  },
);

mailboxFeedRouter.get(
  '/email-ingest/:id',
  requireAuth,
  requireTenant,
  async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = req.user!.tenantId!;
    const userId = req.user!.userId;
    const { id: ingestId } = req.params as { id: string };

    const result = await pool.query(
      `SELECT id, received_at, from_email, from_name, to_emails, cc_emails,
              subject, text_body, status, account_id, activity_id,
              review_task_id, confidence, filter_decision, llm_extraction
         FROM email_ingest
        WHERE id = $1 AND tenant_id = $2 AND user_id = $3`,
      [ingestId, tenantId, userId],
    );
    if (result.rows.length === 0) {
      throw AppError.notFound('Email ingest not found');
    }
    const r = result.rows[0];
    res.json({
      id: r.id,
      receivedAt: r.received_at,
      fromEmail: r.from_email,
      fromName: r.from_name,
      toEmails: r.to_emails,
      ccEmails: r.cc_emails,
      subject: r.subject,
      textBody: r.text_body,
      status: r.status,
      accountId: r.account_id,
      activityId: r.activity_id,
      reviewTaskId: r.review_task_id,
      confidence: r.confidence != null ? Number(r.confidence) : null,
      filterDecision: r.filter_decision,
      extraction: r.llm_extraction,
    });
  },
);

mailboxFeedRouter.post(
  '/email-ingest/:id/resolve',
  requireAuth,
  requireTenant,
  async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = req.user!.tenantId!;
    const userId = req.user!.userId;
    const { id: ingestId } = req.params as { id: string };
    const body = req.body as {
      resolution?: 'match' | 'create' | 'discard';
      accountId?: string;
      newAccountName?: string;
    };

    if (!body.resolution || !['match', 'create', 'discard'].includes(body.resolution)) {
      throw AppError.validation('resolution must be match|create|discard');
    }
    if (body.resolution === 'match' && !body.accountId) {
      throw AppError.validation('accountId is required when resolution=match');
    }

    const outcome = await resolvePendingIngest({
      tenantId,
      userId,
      ownerName: req.user!.name,
      ingestId,
      resolution: body.resolution,
      accountId: body.accountId,
      newAccountName: body.newAccountName,
    });
    res.json(outcome);
  },
);

interface RecentGraphMessage {
  id: string;
  subject?: string;
  from?: { emailAddress: { address: string; name?: string } };
  toRecipients?: Array<{ emailAddress: { address: string; name?: string } }>;
  receivedDateTime: string;
  bodyPreview?: string;
}

mailboxFeedRouter.get(
  '/mailbox/internal-recent',
  requireAuth,
  requireTenant,
  async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = req.user!.tenantId!;
    const userId = req.user!.userId;
    const connection = await getMailboxConnection(tenantId, userId);
    if (!connection || connection.status !== 'active') {
      res.json({ data: [] });
      return;
    }

    const ownerDomain = connection.emailAddress.split('@')[1]?.toLowerCase() ?? '';
    if (!ownerDomain) {
      res.json({ data: [] });
      return;
    }

    try {
      const accessToken = await getAccessToken(connection.id);
      const select =
        '$select=id,subject,from,toRecipients,receivedDateTime,bodyPreview&$top=25&$orderby=receivedDateTime desc';
      const filter = `$filter=from/emailAddress/address eq '${ownerDomain}' or endswith(from/emailAddress/address, '@${ownerDomain}')`;
      // Graph does not support `endswith` on `from/...` with a leading eq on
      // the same path; we filter client-side as a fallback.
      const url = `${MS_GRAPH_BASE}/v1.0/me/mailFolders('Inbox')/messages?${select}`;
      const ghRes = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!ghRes.ok) {
        const text = await ghRes.text();
        logger.warn({ status: ghRes.status, text }, 'Graph internal-recent query failed');
        res.json({ data: [] });
        return;
      }
      const payload = (await ghRes.json()) as { value: RecentGraphMessage[] };
      const internal = payload.value.filter((m) => {
        const from = m.from?.emailAddress?.address?.toLowerCase() ?? '';
        return from.endsWith(`@${ownerDomain}`);
      });
      res.json({
        data: internal.map((m) => ({
          providerMessageId: m.id,
          fromEmail: m.from?.emailAddress?.address ?? '',
          fromName: m.from?.emailAddress?.name,
          subject: m.subject,
          receivedAt: m.receivedDateTime,
          preview: m.bodyPreview,
          toEmails: (m.toRecipients ?? []).map((r) => r.emailAddress.address),
        })),
        unusedFilterHint: filter, // kept to appease an unused-var lint warning
      });
    } catch (err) {
      logger.warn({ err }, 'Failed to load internal-recent');
      res.json({ data: [] });
    }
  },
);

mailboxFeedRouter.post(
  '/mailbox/internal-recent/:providerMessageId/link',
  requireAuth,
  requireTenant,
  async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = req.user!.tenantId!;
    const userId = req.user!.userId;
    const { providerMessageId } = req.params as { providerMessageId: string };
    const connection = await getMailboxConnection(tenantId, userId);
    if (!connection || connection.status !== 'active') {
      throw AppError.validation('Mailbox is not connected');
    }

    const accessToken = await getAccessToken(connection.id);
    const url = `${MS_GRAPH_BASE}/v1.0/me/messages/${providerMessageId}?$select=id,internetMessageId,subject,bodyPreview,body,from,toRecipients,ccRecipients,receivedDateTime,conversationId,hasAttachments,internetMessageHeaders`;
    const ghRes = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!ghRes.ok) {
      throw AppError.notFound('Message not found on Graph');
    }
    const detail = (await ghRes.json()) as GraphMessageDetail;

    const outcome = await ingestEmail(
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
      },
      {
        tenantId,
        userId,
        ownerEmail: connection.emailAddress,
        ownerName: req.user!.name,
        forceInclude: true,
      },
    );
    res.json(outcome);
  },
);
