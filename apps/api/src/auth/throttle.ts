import { createHmac } from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { env } from '../env.js';

export type ThrottleDecision = {
  allowed: boolean;
  retryAfterSeconds: number;
  attempts: number;
};

function throttleKey(scope: string, subject: string) {
  return createHmac('sha256', env.JWT_SECRET).update(`${scope}:${subject}`).digest('hex');
}

export async function throttleStatus(scope: string, subject: string): Promise<ThrottleDecision> {
  const record = await prisma.authThrottle.findUnique({
    where: { key: throttleKey(scope, subject) },
    select: { failedCount: true, windowStartedAt: true, lockedUntil: true },
  });
  if (!record) return { allowed: true, retryAfterSeconds: 0, attempts: 0 };

  const now = new Date();
  if (record.lockedUntil && record.lockedUntil > now) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((record.lockedUntil.getTime() - now.getTime()) / 1000),
      ),
      attempts: record.failedCount,
    };
  }

  return { allowed: true, retryAfterSeconds: 0, attempts: record.failedCount };
}

export async function consumeThrottle(
  scope: string,
  subject: string,
  options: {
    windowMs: number;
    maxAttempts: number;
    lockDurationMs: (attempts: number) => number;
  },
): Promise<ThrottleDecision> {
  const key = throttleKey(scope, subject);
  const now = new Date();
  await prisma.authThrottle.createMany({
    data: [{ key, failedCount: 0, windowStartedAt: now, updatedAt: now }],
    skipDuplicates: true,
  });

  return prisma.$transaction(async (transaction) => {
    await transaction.$queryRaw<Array<{ key: string }>>`
      SELECT "key" FROM "AuthThrottle" WHERE "key" = ${key} FOR UPDATE
    `;
    const record = await transaction.authThrottle.findUnique({ where: { key } });
    if (!record) throw new Error('O contador de tentativas não foi criado.');

    if (record.lockedUntil && record.lockedUntil > now) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((record.lockedUntil.getTime() - now.getTime()) / 1000),
        ),
        attempts: record.failedCount,
      };
    }

    const expired = record.windowStartedAt.getTime() + options.windowMs <= now.getTime();
    const attempts = expired ? 1 : record.failedCount + 1;
    const overLimit = attempts > options.maxAttempts;
    const lockDurationMs = overLimit ? options.lockDurationMs(attempts) : 0;
    const lockedUntil = lockDurationMs > 0 ? new Date(now.getTime() + lockDurationMs) : null;

    await transaction.authThrottle.update({
      where: { key },
      data: {
        failedCount: attempts,
        windowStartedAt: expired ? now : record.windowStartedAt,
        lockedUntil,
        updatedAt: now,
      },
    });

    return {
      allowed: !overLimit,
      retryAfterSeconds: lockDurationMs > 0 ? Math.ceil(lockDurationMs / 1000) : 0,
      attempts,
    };
  });
}

export async function clearThrottle(scope: string, subject: string) {
  const now = new Date();
  await prisma.authThrottle.updateMany({
    where: { key: throttleKey(scope, subject) },
    data: { failedCount: 0, windowStartedAt: now, lockedUntil: null, updatedAt: now },
  });
}
