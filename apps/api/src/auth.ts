import type { NextFunction, Request, Response } from 'express';
import { prisma } from './lib/prisma.js';
import { verifyAccessToken as readAccessToken } from './auth/tokens.js';

export const accessTokenLifetimeSeconds = 15 * 60;

export function verifyAccessToken(token: string) {
  return readAccessToken(token);
}

export async function validateAccessToken(token: string) {
  const identity = verifyAccessToken(token);
  const session = await prisma.authSession.findFirst({
    where: {
      id: identity.sessionId,
      userId: identity.userId,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: { id: true },
  });
  if (!session) throw new Error('Inactive session.');
  return identity;
}

declare module 'express-serve-static-core' {
  interface Request {
    userId?: string;
    sessionId?: string;
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.header('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) {
    return res.status(401).json({
      error: { code: 'UNAUTHENTICATED', message: 'Autenticação necessária.' },
    });
  }
  try {
    const identity = await validateAccessToken(token);
    req.userId = identity.userId;
    req.sessionId = identity.sessionId;
    return next();
  } catch {
    return res.status(401).json({
      error: { code: 'UNAUTHENTICATED', message: 'Token inválido ou expirado.' },
    });
  }
}
