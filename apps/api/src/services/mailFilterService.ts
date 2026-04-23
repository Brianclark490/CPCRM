/**
 * Pure, synchronous classification of an inbound email.
 *
 * The orchestrator calls this before any LLM work so we don't burn tokens on
 * obvious non-sales content. The logic is intentionally conservative:
 * marginal cases fall through to `processed` and let the LLM and account
 * matcher decide. All signals are derived from the email itself — no DB
 * lookups — which keeps the function deterministic and cheap to unit test.
 */

export type FilterDecision =
  | 'processed'          // send to LLM
  | 'skipped_internal'   // every participant shares the user's primary domain
  | 'skipped_bulk'       // mailing list / marketing blast
  | 'skipped_automated'; // transactional / no-reply / DMARC-authenticated automated

export interface MailParticipant {
  email: string;
  name?: string;
}

export interface FilterableMessage {
  from: MailParticipant;
  to: MailParticipant[];
  cc?: MailParticipant[];
  subject?: string;
  headers?: Record<string, string | string[] | undefined>;
  hasCalendarAttachment?: boolean;
}

export interface FilterContext {
  /** Primary email domain of the mailbox owner (e.g. 'cpcrm.com'). */
  ownerDomain: string;
  /**
   * Explicit inclusion signal: emails addressed to any of these addresses
   * should always be processed, even if they look internal. Populate this
   * from the set of tracked Contact emails.
   */
  mentionedContactEmails?: ReadonlyArray<string>;
}

export interface FilterResult {
  decision: FilterDecision;
  reason: string;
}

const AUTOMATED_LOCAL_PARTS = new Set([
  'noreply',
  'no-reply',
  'donotreply',
  'do-not-reply',
  'notifications',
  'notification',
  'mailer-daemon',
  'postmaster',
  'bounces',
  'automated',
]);

function domainOf(email: string): string {
  const at = email.lastIndexOf('@');
  return at === -1 ? '' : email.slice(at + 1).toLowerCase();
}

function localPartOf(email: string): string {
  const at = email.indexOf('@');
  return at === -1 ? email.toLowerCase() : email.slice(0, at).toLowerCase();
}

function headerValue(
  headers: FilterableMessage['headers'],
  name: string,
): string | undefined {
  if (!headers) return undefined;
  // Headers can be case-sensitive in different providers; normalise on read.
  const lower = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lower) {
      if (Array.isArray(value)) return value[0];
      return value ?? undefined;
    }
  }
  return undefined;
}

export function classifyMessage(
  msg: FilterableMessage,
  ctx: FilterContext,
): FilterResult {
  const ownerDomain = ctx.ownerDomain.toLowerCase();
  const mentioned = new Set(
    (ctx.mentionedContactEmails ?? []).map((e) => e.toLowerCase()),
  );

  // Explicit inclusion wins over every skip rule below.
  const participants: string[] = [
    msg.from.email,
    ...msg.to.map((p) => p.email),
    ...(msg.cc ?? []).map((p) => p.email),
  ].map((e) => e.toLowerCase());

  if (participants.some((email) => mentioned.has(email))) {
    return {
      decision: 'processed',
      reason: 'participant matches a tracked contact',
    };
  }

  // Calendar invites carry ICS attachments — we rely on Activity type=Meeting
  // via a separate calendar ingest, not email ingest, so skip them here.
  if (msg.hasCalendarAttachment) {
    return { decision: 'skipped_automated', reason: 'calendar invite' };
  }

  // Bulk / list mail signals.
  if (headerValue(msg.headers, 'List-Unsubscribe')) {
    return { decision: 'skipped_bulk', reason: 'List-Unsubscribe header present' };
  }
  const precedence = headerValue(msg.headers, 'Precedence')?.toLowerCase();
  if (precedence === 'bulk' || precedence === 'list' || precedence === 'junk') {
    return { decision: 'skipped_bulk', reason: `Precedence: ${precedence}` };
  }
  if (headerValue(msg.headers, 'Auto-Submitted')) {
    const as = headerValue(msg.headers, 'Auto-Submitted')!.toLowerCase();
    if (as !== 'no') {
      return { decision: 'skipped_automated', reason: `Auto-Submitted: ${as}` };
    }
  }

  // Local-part heuristics for automated senders.
  const senderLocal = localPartOf(msg.from.email);
  if (AUTOMATED_LOCAL_PARTS.has(senderLocal)) {
    return {
      decision: 'skipped_automated',
      reason: `sender local-part '${senderLocal}' is a known automated mailbox`,
    };
  }
  if (senderLocal.startsWith('noreply') || senderLocal.startsWith('no-reply')) {
    return {
      decision: 'skipped_automated',
      reason: `sender local-part '${senderLocal}' indicates automated mailbox`,
    };
  }

  // Internal-to-org: every participant is on the owner's domain. Anything
  // external present flips this to processed.
  if (ownerDomain) {
    const allInternal = participants.every(
      (email) => domainOf(email) === ownerDomain,
    );
    if (allInternal) {
      return {
        decision: 'skipped_internal',
        reason: 'all participants share the owner domain',
      };
    }
  }

  return { decision: 'processed', reason: 'ok' };
}
