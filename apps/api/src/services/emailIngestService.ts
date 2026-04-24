import { randomUUID } from 'node:crypto';
import { pool } from '../db/client.js';
import { logger } from '../lib/logger.js';
import { config } from '../lib/config.js';
import { createAccount } from './accountService.js';
import { createRecord } from './recordService.js';
import { linkRecords } from './recordRelationshipService.js';
import { matchAccount, hostFromWebsite } from './accountMatchService.js';
import {
  classifyMessage,
  type FilterableMessage,
  type FilterContext,
  type FilterDecision,
} from './mailFilterService.js';
import {
  extractFromEmail,
  type EmailExtraction,
  type EmailForExtraction,
} from './llmExtractionService.js';

/**
 * Orchestrates: filter → LLM extraction → account match → apply / create / review.
 *
 * This service is called by every ingest entry point (Graph webhook, Postmark
 * forward, in-app "Link to account" action). The caller is responsible for
 * authenticating the request, resolving tenant context, and wrapping the call
 * in `tenantStore.run()` so RLS is active.
 */

export type IngestStatus =
  | 'processing'          // transient — row is inserted, extraction not yet finalised
  | 'auto_applied'
  | 'new_account'
  | 'pending_user_review'
  | 'resolved'
  | 'failed'
  | 'skipped';

export interface InboundEmail {
  /** Provider-assigned message id used for idempotency (internetMessageId). */
  providerMsgId: string;
  provider: 'microsoft' | 'postmark';
  from: { email: string; name?: string };
  to: Array<{ email: string; name?: string }>;
  cc?: Array<{ email: string; name?: string }>;
  subject?: string;
  textBody?: string;
  htmlBody?: string;
  receivedAt: Date;
  conversationId?: string;
  headers?: Record<string, string | string[] | undefined>;
  hasCalendarAttachment?: boolean;
}

export interface IngestContext {
  tenantId: string;
  /** Descope userId of the mailbox owner. Emails/activities are attributed to them. */
  userId: string;
  ownerName?: string;
  ownerEmail?: string;
  /**
   * Forces the orchestrator to run extraction even if the filter would have
   * skipped (used by the "Link to account" action from the in-app inspector).
   */
  forceInclude?: boolean;
}

export interface IngestOutcome {
  ingestId: string;
  status: IngestStatus;
  accountId?: string;
  activityId?: string;
  reviewTaskId?: string;
  confidence?: number;
  filterDecision?: FilterDecision | 'manual';
}

function stripHtml(html: string): string {
  // A deliberately simple HTML stripper for the LLM prompt — full sanitisation
  // isn't required because we never render this string, we only feed it to
  // the model.
  //
  // We cap the input length BEFORE running the regexes so a pathological body
  // can't trigger polynomial backtracking on the `<style>` / `<script>`
  // patterns (CodeQL js/polynomial-redos).
  //
  // Entity unescaping is done in a single pass via a lookup map so an input
  // like `&amp;lt;` doesn't get double-unescaped into `<` (the two-step
  // approach would first produce `&lt;` then `<`).
  const MAX_INPUT = 200_000;
  const capped = html.length > MAX_INPUT ? html.slice(0, MAX_INPUT) : html;

  // `[\s\S]` so the match crosses newlines. The closing-tag pattern
  // `<\/(style|script)\b[^>]*>` matches `</style>`, `</style >`, and the
  // browser-tolerated `</style\n  bar>` form — the latter would bypass a
  // `<\/style\s*>` regex and leave the block untouched (CodeQL js/bad-tag-filter).
  const withoutBlocks = capped
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\b[^>]*>/gi, ' ')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\b[^>]*>/gi, ' ');

  const withoutTags = withoutBlocks.replace(/<[^>]+>/g, ' ');

  const entityMap: Record<string, string> = {
    '&nbsp;': ' ',
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
  };
  const unescaped = withoutTags.replace(
    /&(?:nbsp|amp|lt|gt|quot|apos|#39);/gi,
    (m) => entityMap[m.toLowerCase()] ?? m,
  );

  return unescaped.replace(/\s+/g, ' ').trim();
}

function bodyForLlm(email: InboundEmail): string {
  if (email.textBody && email.textBody.trim().length > 0) return email.textBody;
  if (email.htmlBody) return stripHtml(email.htmlBody);
  return '';
}

function domainOfEmail(email: string): string | undefined {
  const at = email.lastIndexOf('@');
  return at === -1 ? undefined : email.slice(at + 1).toLowerCase();
}

function loadOwnerDomain(ownerEmail: string | undefined): string {
  // The owner domain is only used by the filter to classify a thread as
  // internal-to-org. When we don't know the mailbox owner's email (e.g. a
  // Postmark forward where the forwarder's identity is encoded in the
  // local-part only), we return ''. An empty owner domain disables the
  // internal-thread skip rule — which is strictly safer than guessing with
  // another user's mailbox domain.
  return (ownerEmail ? domainOfEmail(ownerEmail) : undefined) ?? '';
}

async function trackedContactEmails(tenantId: string): Promise<string[]> {
  const result = await pool.query<{ email: string }>(
    `SELECT lower(field_values->>'email') AS email
       FROM records r
       JOIN object_definitions o ON o.id = r.object_id
      WHERE r.tenant_id = $1
        AND o.api_name = 'contact'
        AND field_values ? 'email'
        AND length(field_values->>'email') > 0`,
    [tenantId],
  );
  return result.rows.map((r) => r.email).filter(Boolean);
}

async function findRelationshipId(
  tenantId: string,
  apiName: string,
): Promise<string | undefined> {
  const result = await pool.query<{ id: string }>(
    `SELECT id FROM relationship_definitions
      WHERE tenant_id = $1 AND api_name = $2
      LIMIT 1`,
    [tenantId, apiName],
  );
  return result.rows[0]?.id;
}

async function writeIngestRow(params: {
  tenantId: string;
  userId: string;
  email: InboundEmail;
  filterDecision: FilterDecision | 'manual';
}): Promise<{ id: string; insertedByUs: boolean }> {
  const id = randomUUID();
  const { tenantId, userId, email, filterDecision } = params;

  // Initial status for rows we'll process is `processing`, not `failed`, so
  // the UI never shows a temporary false-failure. Skipped rows finalise
  // inline immediately below so their status is correct on insert.
  const initialStatus =
    filterDecision === 'processed' || filterDecision === 'manual'
      ? 'processing'
      : 'skipped';

  // INSERT ... ON CONFLICT DO NOTHING RETURNING id returns the new id only
  // when we were the inserter. When a concurrent delivery has already
  // inserted the row, our statement returns no rows and the second worker
  // bails out rather than running a duplicate extraction (idempotency).
  const insertResult = await pool.query<{ id: string }>(
    `INSERT INTO email_ingest (
       id, tenant_id, user_id, received_at, provider, provider_msg_id,
       from_email, from_name, to_emails, cc_emails, subject,
       text_body, html_body, conversation_id,
       filter_decision, status
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     ON CONFLICT (tenant_id, provider, provider_msg_id) DO NOTHING
     RETURNING id`,
    [
      id,
      tenantId,
      userId,
      email.receivedAt,
      email.provider,
      email.providerMsgId,
      email.from.email,
      email.from.name ?? null,
      email.to.map((p) => p.email),
      (email.cc ?? []).map((p) => p.email),
      email.subject ?? null,
      email.textBody ?? null,
      email.htmlBody ?? null,
      email.conversationId ?? null,
      filterDecision,
      initialStatus,
    ],
  );

  if (insertResult.rows.length > 0) {
    return { id: insertResult.rows[0].id, insertedByUs: true };
  }

  // Conflict path: another worker inserted first. Look up the existing row
  // so callers can report the prior outcome, but signal that we should NOT
  // re-run extraction or side effects.
  const existing = await pool.query<{ id: string }>(
    `SELECT id FROM email_ingest
      WHERE tenant_id = $1 AND provider = $2 AND provider_msg_id = $3`,
    [tenantId, email.provider, email.providerMsgId],
  );
  return { id: existing.rows[0]!.id, insertedByUs: false };
}

async function finaliseIngest(
  ingestId: string,
  patch: {
    status: IngestStatus;
    accountId?: string;
    activityId?: string;
    reviewTaskId?: string;
    confidence?: number;
    error?: string;
    extraction?: EmailExtraction;
  },
): Promise<void> {
  await pool.query(
    `UPDATE email_ingest
        SET status = $2,
            account_id = $3,
            activity_id = $4,
            review_task_id = $5,
            confidence = $6,
            error = $7,
            llm_extraction = COALESCE($8::jsonb, llm_extraction),
            updated_at = NOW()
      WHERE id = $1`,
    [
      ingestId,
      patch.status,
      patch.accountId ?? null,
      patch.activityId ?? null,
      patch.reviewTaskId ?? null,
      patch.confidence ?? null,
      patch.error ?? null,
      patch.extraction ? JSON.stringify(patch.extraction) : null,
    ],
  );
}

async function createEmailActivity(
  tenantId: string,
  userId: string,
  ownerName: string | undefined,
  email: InboundEmail,
  extraction: EmailExtraction,
): Promise<string> {
  const subject = email.subject ?? `Email from ${email.from.email}`;
  const description = [
    extraction.summary ? `Summary: ${extraction.summary}` : undefined,
    `From: ${email.from.email}`,
    `To: ${email.to.map((p) => p.email).join(', ')}`,
    email.cc && email.cc.length > 0
      ? `Cc: ${email.cc.map((p) => p.email).join(', ')}`
      : undefined,
    '',
    bodyForLlm(email),
  ]
    .filter(Boolean)
    .join('\n');

  const activity = await createRecord(
    tenantId,
    'activity',
    {
      subject: subject.slice(0, 500),
      type: 'Email',
      status: 'Completed',
      completed_date: email.receivedAt.toISOString(),
      description: description.slice(0, 10_000),
    },
    userId,
    ownerName,
  );
  return activity.id;
}

async function createReviewTask(
  tenantId: string,
  userId: string,
  ownerName: string | undefined,
  email: InboundEmail,
  ingestId: string,
): Promise<string> {
  const subject = `Review email match: ${email.subject ?? email.from.email}`;
  const description = [
    `CPCRM could not confidently match an account for an email you received.`,
    ``,
    `From: ${email.from.email}`,
    `Subject: ${email.subject ?? '(no subject)'}`,
    ``,
    `Open /email-ingest?ingest=${ingestId} to choose the right account,`,
    `create a new one, or discard.`,
  ].join('\n');

  const task = await createRecord(
    tenantId,
    'activity',
    {
      subject: subject.slice(0, 500),
      type: 'Task',
      status: 'Not Started',
      priority: 'Medium',
      description,
    },
    userId,
    ownerName,
  );
  return task.id;
}

async function upsertContactForAccount(
  tenantId: string,
  accountId: string,
  userId: string,
  ownerName: string | undefined,
  participant: { email: string; fullName?: string; role?: string },
): Promise<void> {
  const existing = await pool.query<{ id: string }>(
    `SELECT r.id FROM records r
      JOIN object_definitions o ON o.id = r.object_id
     WHERE r.tenant_id = $1
       AND o.api_name = 'contact'
       AND lower(r.field_values->>'email') = $2
     LIMIT 1`,
    [tenantId, participant.email.toLowerCase()],
  );
  if (existing.rows.length > 0) return;

  const nameParts = (participant.fullName ?? '').trim().split(/\s+/);
  const firstName = nameParts[0] || participant.email.split('@')[0] || '';
  const lastName = nameParts.slice(1).join(' ') || '';

  const contact = await createRecord(
    tenantId,
    'contact',
    {
      first_name: firstName.slice(0, 100),
      last_name: lastName.slice(0, 100),
      email: participant.email.slice(0, 255),
      job_title: participant.role?.slice(0, 200),
    },
    userId,
    ownerName,
  );

  const contactAccountRel = await findRelationshipId(tenantId, 'contact_account');
  if (contactAccountRel) {
    try {
      await linkRecords(tenantId, contact.id, contactAccountRel, accountId, userId);
    } catch (err) {
      logger.warn({ err, tenantId, contactId: contact.id }, 'Failed to link contact to account');
    }
  }
}

async function linkActivityToAccountAndContacts(
  tenantId: string,
  userId: string,
  activityId: string,
  accountId: string,
  participantEmails: ReadonlyArray<string>,
): Promise<void> {
  const activityAccountRel = await findRelationshipId(tenantId, 'activity_account');
  if (activityAccountRel) {
    try {
      await linkRecords(tenantId, activityId, activityAccountRel, accountId, userId);
    } catch (err) {
      logger.warn({ err, tenantId, activityId, accountId }, 'Failed to link activity to account');
    }
  }

  const activityContactRel = await findRelationshipId(tenantId, 'activity_contact');
  if (!activityContactRel || participantEmails.length === 0) return;

  for (const email of participantEmails) {
    const contactRow = await pool.query<{ id: string }>(
      `SELECT r.id FROM records r
        JOIN object_definitions o ON o.id = r.object_id
       WHERE r.tenant_id = $1
         AND o.api_name = 'contact'
         AND lower(r.field_values->>'email') = $2
       LIMIT 1`,
      [tenantId, email.toLowerCase()],
    );
    const contactId = contactRow.rows[0]?.id;
    if (!contactId) continue;
    try {
      await linkRecords(tenantId, activityId, activityContactRel, contactId, userId);
    } catch (err) {
      logger.warn({ err, tenantId, activityId, contactId }, 'Failed to link activity to contact');
    }
  }
}

/**
 * Main ingest entry point. Idempotent via the (tenant_id, provider,
 * provider_msg_id) unique constraint: a duplicate call returns the existing
 * outcome without re-processing.
 */
export async function ingestEmail(
  email: InboundEmail,
  ctx: IngestContext,
): Promise<IngestOutcome> {
  // Early idempotency short-circuit — avoid re-running the LLM if we've
  // already processed this message.
  const prior = await pool.query<{
    id: string;
    status: IngestStatus;
    account_id: string | null;
    activity_id: string | null;
    review_task_id: string | null;
    confidence: number | null;
    filter_decision: FilterDecision | 'manual';
  }>(
    `SELECT id, status, account_id, activity_id, review_task_id, confidence, filter_decision
       FROM email_ingest
      WHERE tenant_id = $1 AND provider = $2 AND provider_msg_id = $3`,
    [ctx.tenantId, email.provider, email.providerMsgId],
  );
  if (prior.rows.length > 0) {
    const row = prior.rows[0];
    return {
      ingestId: row.id,
      status: row.status,
      accountId: row.account_id ?? undefined,
      activityId: row.activity_id ?? undefined,
      reviewTaskId: row.review_task_id ?? undefined,
      confidence: row.confidence ?? undefined,
      filterDecision: row.filter_decision,
    };
  }

  const ownerDomain = loadOwnerDomain(ctx.ownerEmail);
  const mentioned = await trackedContactEmails(ctx.tenantId);

  const filterable: FilterableMessage = {
    from: email.from,
    to: email.to,
    cc: email.cc,
    subject: email.subject,
    headers: email.headers,
    hasCalendarAttachment: email.hasCalendarAttachment,
  };
  const filterCtx: FilterContext = {
    ownerDomain,
    mentionedContactEmails: mentioned,
  };

  const { decision, reason } = ctx.forceInclude
    ? { decision: 'processed' as const, reason: 'manual include' }
    : classifyMessage(filterable, filterCtx);

  const effectiveDecision: FilterDecision | 'manual' = ctx.forceInclude
    ? 'manual'
    : decision;

  const { id: ingestId, insertedByUs } = await writeIngestRow({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    email,
    filterDecision: effectiveDecision,
  });

  // If another worker beat us to the insert, don't run extraction or any
  // side effects — just return the existing row's status. This closes the
  // concurrent-delivery race on the (tenant_id, provider, provider_msg_id)
  // unique constraint.
  if (!insertedByUs) {
    const existing = await pool.query<{
      status: IngestStatus;
      account_id: string | null;
      activity_id: string | null;
      review_task_id: string | null;
      confidence: number | null;
    }>(
      `SELECT status, account_id, activity_id, review_task_id, confidence
         FROM email_ingest WHERE id = $1`,
      [ingestId],
    );
    const row = existing.rows[0];
    return {
      ingestId,
      status: row?.status ?? 'resolved',
      accountId: row?.account_id ?? undefined,
      activityId: row?.activity_id ?? undefined,
      reviewTaskId: row?.review_task_id ?? undefined,
      confidence: row?.confidence ?? undefined,
      filterDecision: effectiveDecision,
    };
  }

  if (decision !== 'processed' && !ctx.forceInclude) {
    // Row was inserted with status='skipped' already — no UPDATE needed.
    logger.debug({ ingestId, decision, reason }, 'Email skipped by filter');
    return { ingestId, status: 'skipped', filterDecision: decision };
  }

  let extraction: EmailExtraction;
  try {
    extraction = await extractFromEmail(ctx.tenantId, {
      from: email.from,
      to: email.to,
      cc: email.cc,
      subject: email.subject,
      receivedAt: email.receivedAt,
      body: bodyForLlm(email),
    } satisfies EmailForExtraction);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, ingestId }, 'LLM extraction failed');
    await finaliseIngest(ingestId, { status: 'failed', error: message });
    return { ingestId, status: 'failed', filterDecision: effectiveDecision };
  }

  const candidates = await matchAccount(ctx.tenantId, {
    senderDomain: domainOfEmail(email.from.email),
    extractedDomain: extraction.company.domain ?? hostFromWebsite(extraction.company.website),
    extractedCompanyName: extraction.company.name,
  });
  const top = candidates[0];
  const topScore = top?.score ?? 0;

  // Merge deterministic candidates into the stored extraction so the review UI
  // can show the canonical list rather than the LLM's suggestion.
  extraction.candidates = candidates.map((c) => ({
    accountId: c.accountId,
    score: Number(c.score.toFixed(3)),
    reason: c.reason,
  }));

  const participantEmails = [
    email.from.email,
    ...email.to.map((p) => p.email),
    ...(email.cc ?? []).map((p) => p.email),
  ];

  const { autoApplyThreshold, autoCreateThreshold } = config.emailIngest;

  if (topScore >= autoApplyThreshold && top) {
    const activityId = await createEmailActivity(
      ctx.tenantId,
      ctx.userId,
      ctx.ownerName,
      email,
      extraction,
    );
    for (const contact of extraction.contacts) {
      await upsertContactForAccount(
        ctx.tenantId,
        top.accountId,
        ctx.userId,
        ctx.ownerName,
        contact,
      );
    }
    await linkActivityToAccountAndContacts(
      ctx.tenantId,
      ctx.userId,
      activityId,
      top.accountId,
      participantEmails,
    );
    await finaliseIngest(ingestId, {
      status: 'auto_applied',
      accountId: top.accountId,
      activityId,
      confidence: topScore,
      extraction,
    });
    return {
      ingestId,
      status: 'auto_applied',
      accountId: top.accountId,
      activityId,
      confidence: topScore,
      filterDecision: effectiveDecision,
    };
  }

  if (topScore < autoCreateThreshold) {
    const account = await createAccount({
      name: extraction.company.name,
      industry: extraction.company.industry,
      website: extraction.company.website,
      email: email.from.email,
      tenantId: ctx.tenantId,
      requestingUserId: ctx.userId,
    });
    const activityId = await createEmailActivity(
      ctx.tenantId,
      ctx.userId,
      ctx.ownerName,
      email,
      extraction,
    );
    for (const contact of extraction.contacts) {
      await upsertContactForAccount(
        ctx.tenantId,
        account.id,
        ctx.userId,
        ctx.ownerName,
        contact,
      );
    }
    await linkActivityToAccountAndContacts(
      ctx.tenantId,
      ctx.userId,
      activityId,
      account.id,
      participantEmails,
    );
    await finaliseIngest(ingestId, {
      status: 'new_account',
      accountId: account.id,
      activityId,
      confidence: topScore,
      extraction,
    });
    return {
      ingestId,
      status: 'new_account',
      accountId: account.id,
      activityId,
      confidence: topScore,
      filterDecision: effectiveDecision,
    };
  }

  // Ambiguous — queue for the user to resolve via a Task activity.
  const reviewTaskId = await createReviewTask(
    ctx.tenantId,
    ctx.userId,
    ctx.ownerName,
    email,
    ingestId,
  );
  await finaliseIngest(ingestId, {
    status: 'pending_user_review',
    reviewTaskId,
    confidence: topScore,
    extraction,
  });
  return {
    ingestId,
    status: 'pending_user_review',
    reviewTaskId,
    confidence: topScore,
    filterDecision: effectiveDecision,
  };
}

/**
 * Completes a pending_user_review ingest when the forwarder picks an account
 * (existing or newly-created) or discards the email. Called from the
 * `/email-ingest/:id/resolve` endpoint.
 */
export async function resolvePendingIngest(params: {
  tenantId: string;
  userId: string;
  ownerName?: string;
  ingestId: string;
  resolution: 'match' | 'create' | 'discard';
  accountId?: string;          // required when resolution='match'
  newAccountName?: string;     // required when resolution='create'
}): Promise<IngestOutcome> {
  const { tenantId, userId, ownerName, ingestId, resolution } = params;

  const ingestRow = await pool.query<{
    from_email: string;
    from_name: string | null;
    to_emails: string[] | null;
    cc_emails: string[] | null;
    subject: string | null;
    text_body: string | null;
    html_body: string | null;
    received_at: Date;
    status: IngestStatus;
    llm_extraction: EmailExtraction | null;
    provider: string;
    provider_msg_id: string;
    conversation_id: string | null;
  }>(
    `SELECT from_email, from_name, to_emails, cc_emails, subject, text_body,
            html_body, received_at, status, llm_extraction, provider,
            provider_msg_id, conversation_id
       FROM email_ingest
      WHERE id = $1 AND tenant_id = $2`,
    [ingestId, tenantId],
  );
  if (ingestRow.rows.length === 0) {
    throw new Error('Ingest not found');
  }
  const row = ingestRow.rows[0];
  if (row.status !== 'pending_user_review') {
    throw new Error(`Ingest is in state ${row.status}, not pending_user_review`);
  }

  if (resolution === 'discard') {
    await finaliseIngest(ingestId, { status: 'resolved' });
    return { ingestId, status: 'resolved' };
  }

  // Reconstruct the minimal InboundEmail for activity creation.
  const email: InboundEmail = {
    provider: row.provider as 'microsoft' | 'postmark',
    providerMsgId: row.provider_msg_id,
    from: { email: row.from_email, name: row.from_name ?? undefined },
    to: (row.to_emails ?? []).map((e) => ({ email: e })),
    cc: (row.cc_emails ?? []).map((e) => ({ email: e })),
    subject: row.subject ?? undefined,
    textBody: row.text_body ?? undefined,
    htmlBody: row.html_body ?? undefined,
    receivedAt: row.received_at,
    conversationId: row.conversation_id ?? undefined,
  };
  const extraction = row.llm_extraction ?? {
    company: { name: row.from_name ?? row.from_email },
    contacts: [],
    nextSteps: [],
    summary: row.subject ?? '',
    candidates: [],
    confidence: 0,
  };

  let accountId: string;
  if (resolution === 'match') {
    if (!params.accountId) throw new Error('accountId required for match resolution');
    accountId = params.accountId;
  } else {
    const account = await createAccount({
      name: params.newAccountName ?? extraction.company.name,
      industry: extraction.company.industry,
      website: extraction.company.website,
      email: email.from.email,
      tenantId,
      requestingUserId: userId,
    });
    accountId = account.id;
  }

  const activityId = await createEmailActivity(tenantId, userId, ownerName, email, extraction);
  for (const contact of extraction.contacts) {
    await upsertContactForAccount(tenantId, accountId, userId, ownerName, contact);
  }
  const participantEmails = [
    email.from.email,
    ...email.to.map((p) => p.email),
    ...(email.cc ?? []).map((p) => p.email),
  ];
  await linkActivityToAccountAndContacts(
    tenantId,
    userId,
    activityId,
    accountId,
    participantEmails,
  );
  await finaliseIngest(ingestId, {
    status: 'resolved',
    accountId,
    activityId,
  });
  return { ingestId, status: 'resolved', accountId, activityId };
}
