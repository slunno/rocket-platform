import { randomUUID } from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { createAccessToken, createOpaqueToken, hashToken, REFRESH_TOKEN_TTL_MS } from './tokens.js';

export type SessionContext = { userAgent?: string; ipAddress?: string };
export type IssuedSession = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  sessionId: string;
};

const sessionExpiry = () => new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
const safeContext = (context: SessionContext) => ({
  userAgent: context.userAgent?.slice(0, 300),
  ipAddress: context.ipAddress?.slice(0, 64),
});

export async function createAuthSession(
  userId: string,
  context: SessionContext,
): Promise<IssuedSession> {
  const refreshToken = createOpaqueToken();
  const session = await prisma.authSession.create({
    data: {
      userId,
      familyId: randomUUID(),
      refreshTokenHash: hashToken(refreshToken),
      expiresAt: sessionExpiry(),
      ...safeContext(context),
    },
    select: { id: true },
  });

  return {
    accessToken: createAccessToken({ userId, sessionId: session.id }),
    refreshToken,
    expiresIn: 15 * 60,
    sessionId: session.id,
  };
}

export async function rotateAuthSession(
  refreshToken: string,
  context: SessionContext,
): Promise<
  | { kind: 'rotated'; userId: string; session: IssuedSession }
  | { kind: 'invalid' }
  | { kind: 'expired'; sessionIds: string[] }
  | { kind: 'reused'; sessionIds: string[] }
> {
  const sessionHint = await prisma.authSession.findUnique({
    where: { refreshTokenHash: hashToken(refreshToken) },
    select: { id: true },
  });
  if (!sessionHint) return { kind: 'invalid' };

  return prisma.$transaction(async (transaction) => {
    await transaction.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "AuthSession" WHERE "id" = ${sessionHint.id} FOR UPDATE
    `;
    const current = await transaction.authSession.findUnique({
      where: { id: sessionHint.id },
    });
    if (!current) return { kind: 'invalid' } as const;

    const now = new Date();
    if (current.revokedAt) {
      const activeSessions = await transaction.authSession.findMany({
        where: { familyId: current.familyId, revokedAt: null },
        select: { id: true },
      });
      await transaction.authSession.updateMany({
        where: { familyId: current.familyId, revokedAt: null },
        data: { revokedAt: now },
      });
      return { kind: 'reused', sessionIds: activeSessions.map(({ id }) => id) } as const;
    }
    if (current.expiresAt <= now) {
      await transaction.authSession.update({
        where: { id: current.id },
        data: { revokedAt: now },
      });
      return { kind: 'expired', sessionIds: [current.id] } as const;
    }

    const nextRefreshToken = createOpaqueToken();
    const nextSession = await transaction.authSession.create({
      data: {
        userId: current.userId,
        familyId: current.familyId,
        refreshTokenHash: hashToken(nextRefreshToken),
        expiresAt: sessionExpiry(),
        ...safeContext(context),
      },
      select: { id: true },
    });
    await transaction.authSession.update({
      where: { id: current.id },
      data: { revokedAt: now, replacedById: nextSession.id },
    });

    return {
      kind: 'rotated',
      userId: current.userId,
      session: {
        accessToken: createAccessToken({ userId: current.userId, sessionId: nextSession.id }),
        refreshToken: nextRefreshToken,
        expiresIn: 15 * 60,
        sessionId: nextSession.id,
      },
    } as const;
  });
}
