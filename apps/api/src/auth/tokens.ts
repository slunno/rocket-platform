import { createHash, randomBytes, randomUUID } from 'node:crypto';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { env } from '../env.js';

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type AccessClaims = { userId: string; sessionId: string };

export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function createOpaqueToken() {
  return randomBytes(32).toString('base64url');
}

export function createAccessToken({ userId, sessionId }: AccessClaims) {
  return jwt.sign({ sid: sessionId, jti: randomUUID() }, env.JWT_SECRET, {
    algorithm: 'HS256',
    audience: 'rocket-web',
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    issuer: 'rocket-api',
    subject: userId,
  });
}

export function verifyAccessToken(token: string): AccessClaims {
  const payload = jwt.verify(token, env.JWT_SECRET, {
    algorithms: ['HS256'],
    audience: 'rocket-web',
    issuer: 'rocket-api',
  }) as JwtPayload;

  if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') {
    throw new Error('Token de acesso inválido.');
  }

  return { userId: payload.sub, sessionId: payload.sid };
}
