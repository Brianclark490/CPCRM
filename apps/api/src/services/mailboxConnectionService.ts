import { pool } from '../db/client.js';
import { config } from '../lib/config.js';
import { logger } from '../lib/logger.js';
import { encryptToken, decryptToken } from '../lib/tokenEncryption.js';

/**
 * Microsoft Graph OAuth 2.0 authorization-code flow wrappers plus storage of
 * the resulting OAuth tokens (encrypted at rest with AES-256-GCM).
 *
 * The refresh token is required to mint new access tokens and is always
 * encrypted in the DB (column `refresh_token_enc`). The last access token is
 * also cached encrypted so we can reuse it until it's near expiry, avoiding
 * a refresh round-trip on every Graph call. `getAccessToken()` transparently
 * refreshes when the cached token is within 60s of its stored expiry.
 *
 * On disconnect, `refresh_token_enc` is nulled so the stored row can no
 * longer mint tokens even if something else holds the connection id.
 */

export const MS_AUTH_BASE = 'https://login.microsoftonline.com';
export const MS_GRAPH_BASE = 'https://graph.microsoft.com';

/** Scopes we request during the consent flow. */
export const GRAPH_SCOPES = [
  'offline_access',
  'Mail.ReadBasic',
  'Mail.Read',
  'User.Read',
];

export interface MailboxConnectionRow {
  id: string;
  tenantId: string;
  userId: string;
  provider: 'microsoft';
  providerUserId: string;
  emailAddress: string;
  status: 'active' | 'paused' | 'revoked' | 'error';
}

export function buildAuthorizeUrl(state: string): string {
  const clientId = config.emailIngest.msGraphClientId;
  const redirectUri = config.emailIngest.msGraphRedirectUri;
  if (!clientId || !redirectUri) {
    throw new Error('Microsoft Graph OAuth is not configured');
  }
  const qs = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    response_mode: 'query',
    scope: GRAPH_SCOPES.join(' '),
    state,
    prompt: 'select_account',
  });
  return `${MS_AUTH_BASE}/${config.emailIngest.msGraphTenantId}/oauth2/v2.0/authorize?${qs.toString()}`;
}

interface TokenResponse {
  token_type: string;
  scope: string;
  expires_in: number;
  access_token: string;
  refresh_token?: string;
  id_token?: string;
}

async function postTokenRequest(body: URLSearchParams): Promise<TokenResponse> {
  const clientSecret = process.env.MS_GRAPH_CLIENT_SECRET;
  const clientId = config.emailIngest.msGraphClientId;
  if (!clientId || !clientSecret) {
    throw new Error('Microsoft Graph OAuth is not configured');
  }
  body.set('client_id', clientId);
  body.set('client_secret', clientSecret);

  const res = await fetch(
    `${MS_AUTH_BASE}/${config.emailIngest.msGraphTenantId}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Microsoft token endpoint ${res.status}: ${text}`);
  }
  return (await res.json()) as TokenResponse;
}

export async function exchangeAuthCode(code: string): Promise<TokenResponse> {
  const redirectUri = config.emailIngest.msGraphRedirectUri;
  if (!redirectUri) throw new Error('MS_GRAPH_REDIRECT_URI is not configured');
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    scope: GRAPH_SCOPES.join(' '),
  });
  return postTokenRequest(body);
}

async function exchangeRefreshToken(refreshToken: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    scope: GRAPH_SCOPES.join(' '),
  });
  return postTokenRequest(body);
}

export interface GraphMeProfile {
  id: string;
  mail?: string;
  userPrincipalName?: string;
  displayName?: string;
}

export async function fetchGraphProfile(accessToken: string): Promise<GraphMeProfile> {
  const res = await fetch(`${MS_GRAPH_BASE}/v1.0/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph /me ${res.status}: ${text}`);
  }
  return (await res.json()) as GraphMeProfile;
}

export async function saveMailboxConnection(params: {
  tenantId: string;
  userId: string;
  providerUserId: string;
  emailAddress: string;
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
  scopes: string[];
}): Promise<MailboxConnectionRow> {
  const tokenExpiresAt = new Date(Date.now() + params.expiresInSeconds * 1000);
  const accessEnc = encryptToken(params.accessToken);
  const refreshEnc = encryptToken(params.refreshToken);

  const result = await pool.query<{
    id: string;
    tenant_id: string;
    user_id: string;
    provider: 'microsoft';
    provider_user_id: string;
    email_address: string;
    status: 'active' | 'paused' | 'revoked' | 'error';
  }>(
    `INSERT INTO mailbox_connections (
       tenant_id, user_id, provider, provider_user_id, email_address,
       access_token_enc, refresh_token_enc, token_expires_at, scopes, status
     ) VALUES ($1,$2,'microsoft',$3,$4,$5,$6,$7,$8,'active')
     ON CONFLICT (tenant_id, user_id, provider)
     DO UPDATE SET
       provider_user_id = EXCLUDED.provider_user_id,
       email_address    = EXCLUDED.email_address,
       access_token_enc = EXCLUDED.access_token_enc,
       refresh_token_enc= EXCLUDED.refresh_token_enc,
       token_expires_at = EXCLUDED.token_expires_at,
       scopes           = EXCLUDED.scopes,
       status           = 'active',
       last_error       = NULL,
       updated_at       = NOW()
     RETURNING id, tenant_id, user_id, provider, provider_user_id, email_address, status`,
    [
      params.tenantId,
      params.userId,
      params.providerUserId,
      params.emailAddress,
      accessEnc,
      refreshEnc,
      tokenExpiresAt,
      params.scopes,
    ],
  );
  const row = result.rows[0];
  return {
    id: row.id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    provider: row.provider,
    providerUserId: row.provider_user_id,
    emailAddress: row.email_address,
    status: row.status,
  };
}

/**
 * Returns an up-to-date access token for the connection, refreshing via the
 * refresh_token grant when the stored access token is within 60s of expiry.
 *
 * Refuses to mint tokens for revoked connections or rows whose
 * `refresh_token_enc` has been nulled — this is the defence-in-depth
 * counterpart to `disconnectMailbox()`, which clears the refresh token.
 */
export async function getAccessToken(connectionId: string): Promise<string> {
  const result = await pool.query<{
    access_token_enc: Buffer | null;
    refresh_token_enc: Buffer | null;
    token_expires_at: Date | null;
    status: 'active' | 'paused' | 'revoked' | 'error';
  }>(
    `SELECT access_token_enc, refresh_token_enc, token_expires_at, status
       FROM mailbox_connections
      WHERE id = $1`,
    [connectionId],
  );
  if (result.rows.length === 0) {
    throw new Error('Mailbox connection not found');
  }
  const row = result.rows[0];

  if (row.status === 'revoked') {
    throw new Error('Mailbox connection has been revoked');
  }
  if (!row.refresh_token_enc) {
    throw new Error('Mailbox connection has no refresh token');
  }

  const stillValid =
    row.access_token_enc &&
    row.token_expires_at &&
    row.token_expires_at.getTime() - Date.now() > 60_000;

  if (stillValid) {
    return decryptToken(row.access_token_enc!);
  }

  const refreshPlain = decryptToken(row.refresh_token_enc);
  const tokens = await exchangeRefreshToken(refreshPlain);

  const nextExpiresAt = new Date(Date.now() + tokens.expires_in * 1000);
  const accessEnc = encryptToken(tokens.access_token);
  const refreshEnc = tokens.refresh_token
    ? encryptToken(tokens.refresh_token)
    : row.refresh_token_enc;

  await pool.query(
    `UPDATE mailbox_connections
        SET access_token_enc = $2,
            refresh_token_enc = $3,
            token_expires_at = $4,
            updated_at = NOW()
      WHERE id = $1`,
    [connectionId, accessEnc, refreshEnc, nextExpiresAt],
  );
  logger.debug({ connectionId }, 'Refreshed Microsoft Graph access token');

  return tokens.access_token;
}

export async function markConnectionError(
  connectionId: string,
  error: string,
): Promise<void> {
  await pool.query(
    `UPDATE mailbox_connections
        SET status = 'error', last_error = $2, updated_at = NOW()
      WHERE id = $1`,
    [connectionId, error.slice(0, 500)],
  );
}

export async function disconnectMailbox(
  tenantId: string,
  userId: string,
): Promise<void> {
  // Null both token columns so a stale connection id can't mint new tokens
  // after disconnect. We keep the row itself (with status='revoked') for
  // audit so it's possible to see when a user had a mailbox connected.
  await pool.query(
    `UPDATE mailbox_connections
        SET status = 'revoked',
            access_token_enc = NULL,
            refresh_token_enc = NULL,
            token_expires_at = NULL,
            updated_at = NOW()
      WHERE tenant_id = $1 AND user_id = $2`,
    [tenantId, userId],
  );
}

export async function getMailboxConnection(
  tenantId: string,
  userId: string,
): Promise<MailboxConnectionRow | undefined> {
  const result = await pool.query<{
    id: string;
    tenant_id: string;
    user_id: string;
    provider: 'microsoft';
    provider_user_id: string;
    email_address: string;
    status: 'active' | 'paused' | 'revoked' | 'error';
  }>(
    `SELECT id, tenant_id, user_id, provider, provider_user_id, email_address, status
       FROM mailbox_connections
      WHERE tenant_id = $1 AND user_id = $2
      ORDER BY connected_at DESC
      LIMIT 1`,
    [tenantId, userId],
  );
  const row = result.rows[0];
  if (!row) return undefined;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    provider: row.provider,
    providerUserId: row.provider_user_id,
    emailAddress: row.email_address,
    status: row.status,
  };
}
