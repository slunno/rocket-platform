import type { NextFunction, Request, Response } from 'express';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { env } from './env.js';

export function signUserToken(userId: string) {
  return jwt.sign({}, env.JWT_SECRET, { subject: userId, expiresIn: '8h' });
}

export function verifyUserToken(token: string) {
  const payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
  if (!payload.sub) throw new Error('Token has no subject.');
  return payload.sub;
}

declare module 'express-serve-static-core' {
  interface Request {
    userId?: string;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.header('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) {
    return res.status(401).json({
      error: { code: 'UNAUTHENTICATED', message: 'Autenticação necessária.' },
    });
  }
  try {
    req.userId = verifyUserToken(token);
    next();
  } catch {
    return res.status(401).json({
      error: { code: 'UNAUTHENTICATED', message: 'Token inválido ou expirado.' },
    });
  }
}
