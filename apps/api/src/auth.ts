import type { NextFunction, Request, Response } from 'express';
import jwt, { type JwtPayload } from 'jsonwebtoken';

const getSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'production' && (!secret || secret.length < 32)) {
    throw new Error('JWT_SECRET must contain at least 32 characters in production.');
  }
  return secret || 'local-only-secret-change-before-deployment-000000000';
};

export function signUserToken(userId: string) {
  return jwt.sign({}, getSecret(), { subject: userId, expiresIn: '8h' });
}

export function verifyUserToken(token: string) {
  const payload = jwt.verify(token, getSecret()) as JwtPayload;
  if (!payload.sub) throw new Error('Token has no subject.');
  return payload.sub;
}

declare global {
  namespace Express {
    interface Request { userId?: string }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.header('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Authentication required.' });
  try {
    req.userId = verifyUserToken(token);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}
