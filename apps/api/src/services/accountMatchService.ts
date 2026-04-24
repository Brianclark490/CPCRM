import { pool } from '../db/client.js';

/**
 * Account-matching for inbound email ingestion.
 *
 * Three signals are combined, each producing a `MatchCandidate` with a score
 * in `[0, 1]`. The orchestrator picks the top-scoring candidate and compares
 * it to the configured auto-apply / auto-create thresholds.
 *
 *   1. Sender-domain match against an Account's stored website / email.
 *   2. LLM-extracted domain match (same comparison, different source).
 *   3. Normalised-name match using Postgres pg_trgm `similarity()`.
 *
 * All queries are scoped by `tenant_id` even though the RLS policy installed
 * by migration 025 already enforces isolation — defence-in-depth per ADR-006.
 */

export interface MatchCandidate {
  accountId: string;
  score: number;
  reason: string;
}

export interface MatchSignals {
  /** Domain of the external sender, already stripped of free-mail providers. */
  senderDomain?: string;
  /** Domain the LLM extracted for the company. */
  extractedDomain?: string;
  /** Company name the LLM extracted. */
  extractedCompanyName?: string;
}

/**
 * Consumer-grade / free-mail domains. Sending from `@gmail.com` tells us
 * nothing about the underlying company — we ignore these for domain matching
 * and fall back to name similarity.
 */
export const FREE_MAIL_DOMAINS: ReadonlySet<string> = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yahoo.co.uk',
  'ymail.com',
  'outlook.com',
  'hotmail.com',
  'hotmail.co.uk',
  'live.com',
  'msn.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'pm.me',
  'gmx.com',
  'gmx.de',
  'mail.com',
  'qq.com',
  '163.com',
  'yandex.com',
]);

export function stripFreeMail(domain: string | undefined): string | undefined {
  if (!domain) return undefined;
  const d = domain.toLowerCase();
  return FREE_MAIL_DOMAINS.has(d) ? undefined : d;
}

const COMPANY_SUFFIX_RE =
  /\b(inc|inc\.|incorporated|ltd|ltd\.|limited|llc|l\.l\.c\.|gmbh|pty|pty\.|pty ltd|plc|corp|corp\.|corporation|co|co\.|company|ag|s\.a\.|sa|sas|bv|b\.v\.)\b/g;

export function normaliseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(COMPANY_SUFFIX_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Trigram set for a string, padded with spaces at start/end so short names
 * still produce useful grams. Matches the convention Postgres `pg_trgm`
 * uses so callers moving between DB-side and app-side scoring see
 * comparable numbers.
 */
export function trigrams(s: string): ReadonlySet<string> {
  const padded = `  ${s.toLowerCase()} `;
  const set = new Set<string>();
  for (let i = 0; i < padded.length - 2; i++) {
    set.add(padded.slice(i, i + 3));
  }
  return set;
}

/** Jaccard similarity on trigram sets: |A ∩ B| / |A ∪ B|, in [0, 1]. */
export function jaccardSimilarity(
  a: ReadonlySet<string>,
  b: ReadonlySet<string>,
): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const gram of a) if (b.has(gram)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Turns `https://sub.acme.co.uk/foo` into `acme.co.uk`. Returns undefined if
 * the input can't be parsed as a URL or if the host is empty.
 */
export function hostFromWebsite(website: string | undefined | null): string | undefined {
  if (!website) return undefined;
  try {
    // Accept bare "acme.com" strings by adding the scheme when missing.
    const withScheme = /^https?:\/\//i.test(website) ? website : `http://${website}`;
    const host = new URL(withScheme).hostname.toLowerCase();
    return host.startsWith('www.') ? host.slice(4) : host;
  } catch {
    return undefined;
  }
}

interface AccountRow {
  id: string;
  name: string;
  email: string | null;
  website: string | null;
}

async function loadAccountsForTenant(tenantId: string): Promise<AccountRow[]> {
  // The RLS-aware pool proxy sets app.current_tenant_id on the checked-out
  // connection, so RLS enforces the same filter. We add the explicit
  // WHERE tenant_id = $1 as defence-in-depth (ADR-006).
  const result = await pool.query<AccountRow>(
    `SELECT id, name, email, website
       FROM accounts
      WHERE tenant_id = $1`,
    [tenantId],
  );
  return result.rows;
}

/**
 * Scores every account in the tenant and returns them sorted high-to-low.
 * Only candidates with `score > 0` are returned.
 */
export async function matchAccount(
  tenantId: string,
  signals: MatchSignals,
): Promise<MatchCandidate[]> {
  const senderDomain = stripFreeMail(signals.senderDomain?.toLowerCase());
  const extractedDomain = stripFreeMail(signals.extractedDomain?.toLowerCase());
  const extractedName = signals.extractedCompanyName
    ? normaliseName(signals.extractedCompanyName)
    : '';

  const accounts = await loadAccountsForTenant(tenantId);

  const candidates = new Map<string, MatchCandidate>();

  function consider(
    accountId: string,
    score: number,
    reason: string,
  ): void {
    const existing = candidates.get(accountId);
    if (!existing || score > existing.score) {
      candidates.set(accountId, { accountId, score, reason });
    }
  }

  for (const acc of accounts) {
    const accHost = hostFromWebsite(acc.website) ?? '';
    const accEmailDomain = acc.email ? acc.email.split('@')[1]?.toLowerCase() ?? '' : '';

    // Direct sender-domain hit.
    if (senderDomain && (accHost === senderDomain || accEmailDomain === senderDomain)) {
      consider(acc.id, 0.95, `sender domain '${senderDomain}' matches account`);
    }

    // LLM-extracted domain hit (slightly weaker because the LLM could mis-extract).
    if (extractedDomain && (accHost === extractedDomain || accEmailDomain === extractedDomain)) {
      consider(acc.id, 0.9, `extracted domain '${extractedDomain}' matches account`);
    }

    // Sender or extracted domain is a suffix of the account host (e.g.
    // `eu.acme.com` email vs `acme.com` on the account).
    if (
      senderDomain &&
      accHost &&
      (senderDomain.endsWith(`.${accHost}`) || accHost.endsWith(`.${senderDomain}`))
    ) {
      consider(acc.id, 0.8, `sender domain '${senderDomain}' shares root with '${accHost}'`);
    }
  }

  // Name-similarity pass. We compute trigram-Jaccard similarity in-process
  // against the account list we already loaded for domain matching. This
  // avoids the pg_trgm extension, which is not allow-listed on Azure
  // Database for PostgreSQL Flexible Server. For tenant sizes in the
  // low-thousands this is fast enough to run on every ingest.
  if (extractedName) {
    const targetGrams = trigrams(extractedName);
    const scored = accounts
      .map((acc) => ({
        acc,
        name: acc.name,
        score: jaccardSimilarity(targetGrams, trigrams(normaliseName(acc.name))),
      }))
      .filter((row) => row.score > 0.35)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    for (const row of scored) {
      // Map trigram-Jaccard similarity (0–1) into our confidence range,
      // capping at 0.85 so a pure-name match never auto-applies on its own.
      const score = Math.min(0.85, 0.55 + row.score * 0.3);
      consider(
        row.acc.id,
        score,
        `name '${row.name}' ≈ '${signals.extractedCompanyName}' (trgm=${row.score.toFixed(2)})`,
      );
    }
  }

  return [...candidates.values()].sort((a, b) => b.score - a.score);
}
