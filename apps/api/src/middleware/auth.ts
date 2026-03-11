import DescopeClient from '@descope/node-sdk';
import type { Request, Response, NextFunction } from 'express';

const projectId = process.env.DESCOPE_PROJECT_ID;

if (!projectId) {
  throw new Error('DESCOPE_PROJECT_ID environment variable is required');
}

const descopeClient = DescopeClient({ projectId });

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    email?: string;
    name?: string;
  };
}

export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }

  const sessionToken = authHeader.slice(7);

  try {
    const authInfo = await descopeClient.validateSession(sessionToken);
    const userId = authInfo.token.sub;

    if (!userId) {
      res.status(401).json({ error: 'Invalid token: missing subject claim' });
      return;
    }

    req.user = {
      userId,
      email: authInfo.token.email as string | undefined,
      name: authInfo.token.name as string | undefined,
    };

    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
