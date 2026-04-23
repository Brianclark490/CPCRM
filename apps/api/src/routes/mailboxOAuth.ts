import { Router } from 'express';
import type { Response } from 'express';
import { randomBytes } from 'node:crypto';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { requireAuth } from '../middleware/auth.js';
import { requireTenant } from '../middleware/tenant.js';
import { logger } from '../lib/logger.js';
import { AppError } from '../lib/appError.js';
import { config } from '../lib/config.js';
import {
  buildAuthorizeUrl,
  disconnectMailbox,
  exchangeAuthCode,
  fetchGraphProfile,
  getMailboxConnection,
  GRAPH_SCOPES,
  saveMailboxConnection,
} from '../services/mailboxConnectionService.js';
import {
  createInboxSubscription,
  deleteSubscription,
} from '../services/graphSubscriptionService.js';

/**
 * OAuth flow endpoints for connecting a user's Microsoft 365 mailbox.
 *
 * GET /mailbox/connect/microsoft        – authenticated; starts the flow.
 * GET /mailbox/oauth/microsoft/callback – redirected-to by Microsoft; uses
 *                                         the opaque `state` value as a key
 *                                         into an in-memory `stateStore` map
 *                                         to re-identify the user (no Descope
 *                                         session cookie is guaranteed across
 *                                         the 302). Limited to a single
 *                                         instance — move to shared storage
 *                                         before running behind a scale-out.
 * POST /mailbox/disconnect              – revokes the stored tokens and
 *                                         cancels the Graph subscription.
 * GET /mailbox/status                   – current connection status for the
 *                                         signed-in user.
 */

export const mailboxOAuthRouter = Router();

// In-memory state store. Entries expire after 10 minutes. For multi-instance
// deployments this should move to Redis or a DB row — for a single App Service
// instance this is fine and avoids introducing Redis in the MVP.
const stateStore = new Map<
  string,
  { tenantId: string; userId: string; expiresAt: number }
>();

function pruneStates(): void {
  const now = Date.now();
  for (const [key, value] of stateStore) {
    if (value.expiresAt < now) stateStore.delete(key);
  }
}

mailboxOAuthRouter.get(
  '/connect/microsoft',
  requireAuth,
  requireTenant,
  async (req: AuthenticatedRequest, res: Response) => {
    if (!config.emailIngest.msGraphClientId || !config.emailIngest.msGraphRedirectUri) {
      throw new AppError('NOT_CONFIGURED', 503, 'Microsoft Graph OAuth is not configured');
    }
    pruneStates();
    const state = randomBytes(24).toString('hex');
    stateStore.set(state, {
      tenantId: req.user!.tenantId!,
      userId: req.user!.userId,
      expiresAt: Date.now() + 10 * 60 * 1000,
    });
    res.json({ authUrl: buildAuthorizeUrl(state) });
  },
);

mailboxOAuthRouter.get(
  '/oauth/microsoft/callback',
  async (req, res: Response) => {
    const code = (req.query.code as string | undefined) ?? '';
    const state = (req.query.state as string | undefined) ?? '';
    const error = req.query.error as string | undefined;

    if (error) {
      logger.warn({ error }, 'Microsoft OAuth callback returned error');
      res.redirect(`/settings/profile?mailboxError=${encodeURIComponent(error)}`);
      return;
    }
    if (!code || !state) {
      res.status(400).send('Missing code or state');
      return;
    }
    pruneStates();
    const binding = stateStore.get(state);
    if (!binding) {
      res.status(400).send('Unknown or expired state — please restart the connection flow');
      return;
    }
    stateStore.delete(state);

    try {
      const tokens = await exchangeAuthCode(code);
      if (!tokens.refresh_token) {
        throw new Error('Microsoft did not return a refresh_token — scope offline_access missing?');
      }
      const profile = await fetchGraphProfile(tokens.access_token);
      const emailAddress = profile.mail ?? profile.userPrincipalName ?? '';
      if (!emailAddress) {
        throw new Error('Microsoft profile missing email address');
      }

      const connection = await saveMailboxConnection({
        tenantId: binding.tenantId,
        userId: binding.userId,
        providerUserId: profile.id,
        emailAddress,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresInSeconds: tokens.expires_in,
        scopes: GRAPH_SCOPES,
      });

      // Best-effort subscription creation — if it fails (e.g. public URL not
      // reachable in dev) we still keep the connection and the renewal job
      // will retry.
      try {
        await createInboxSubscription({
          mailboxConnectionId: connection.id,
          tenantId: binding.tenantId,
        });
      } catch (err) {
        logger.warn({ err, connectionId: connection.id }, 'Initial subscription creation failed');
      }

      res.redirect('/settings/profile?mailboxConnected=1');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ err }, 'Microsoft OAuth callback failed');
      res.redirect(`/settings/profile?mailboxError=${encodeURIComponent(message)}`);
    }
  },
);

async function handleDisconnect(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const tenantId = req.user!.tenantId!;
  const userId = req.user!.userId;

  const connection = await getMailboxConnection(tenantId, userId);
  if (connection) {
    await deleteSubscription(connection.id);
  }
  await disconnectMailbox(tenantId, userId);
  res.status(204).end();
}

// Expose both verbs: DELETE is the canonical REST shape, POST is kept as an
// alias so callers with strict CSRF tooling (that doesn't send bodies on
// DELETE) still work.
mailboxOAuthRouter.delete('/disconnect', requireAuth, requireTenant, handleDisconnect);
mailboxOAuthRouter.post('/disconnect', requireAuth, requireTenant, handleDisconnect);

mailboxOAuthRouter.get(
  '/status',
  requireAuth,
  requireTenant,
  async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = req.user!.tenantId!;
    const userId = req.user!.userId;
    const connection = await getMailboxConnection(tenantId, userId);
    res.json({
      connected: connection?.status === 'active',
      status: connection?.status ?? 'disconnected',
      emailAddress: connection?.emailAddress ?? null,
      provider: connection?.provider ?? null,
    });
  },
);
