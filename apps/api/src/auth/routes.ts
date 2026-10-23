import { randomBytes } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import {
  forgotPasswordInputSchema,
  loginInputSchema,
  profileUpdateInputSchema,
  registerInputSchema,
  resetPasswordInputSchema,
} from '@rocket/shared';
import type { Server } from 'socket.io';
import { env } from '../env.js';
import { accessTokenLifetimeSeconds, requireAuth } from '../auth.js';
import { prisma } from '../lib/prisma.js';
import { mailProvider } from '../mail/provider.js';
import { clearThrottle, consumeThrottle, throttleStatus } from './throttle.js';
import { dummyPasswordHash, hashPassword, verifyPassword } from './password.js';
import { createAuthSession, rotateAuthSession } from './sessions.js';
import { createOpaqueToken, hashToken, REFRESH_TOKEN_TTL_MS } from './tokens.js';

const router = Router();
const refreshCookieName = 'rocket_refresh';
const refreshLifetimeMs = REFRESH_TOKEN_TTL_MS;
const resetLifetimeMs = 20 * 60 * 1000;
const publicUserSelect = {
  id: true,
  email: true,
  username: true,
  displayName: true,
  avatarUrl: true,
  jobTitle: true,
  timeZone: true,
  locale: true,
  status: true,
  statusMessage: true,
} as const;

type PublicUser = {
  id: string;
  email: string | null;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  jobTitle: string | null;
  timeZone: string;
  locale: string;
  status: 'ONLINE' | 'BUSY' | 'DO_NOT_DISTURB' | 'AWAY' | 'OFFLINE';
  statusMessage: string | null;
};

const rateWindows = new Map<string, { count: number; resetAt: number }>();
let socketServer: Server | undefined;

export function attachAuthSocketServer(io: Server) {
  socketServer = io;
}

function disconnectSessions(sessionIds: string[]) {
  if (sessionIds.length) {
    void socketServer?.in(sessionIds.map((id) => `session:${id}`)).disconnectSockets(true);
  }
}

function requestLimit(maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: (error?: unknown) => void) => {
    const key = `${req.ip ?? 'unknown'}:${req.path}`;
    const now = Date.now();
    if (rateWindows.size > 5_000) {
      for (const [entryKey, entry] of rateWindows) {
        if (entry.resetAt <= now) rateWindows.delete(entryKey);
      }
      if (rateWindows.size > 10_000) {
        for (const entryKey of rateWindows.keys()) {
          rateWindows.delete(entryKey);
          if (rateWindows.size <= 5_000) break;
        }
      }
    }
    const current = rateWindows.get(key);
    if (!current || current.resetAt <= now) {
      rateWindows.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    current.count += 1;
    if (current.count <= maxRequests) return next();
    const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
    res.setHeader('Retry-After', String(retryAfter));
    return res.status(429).json({
      error: {
        code: 'RATE_LIMITED',
        message: 'Muitas solicitações. Tente novamente em alguns minutos.',
      },
    });
  };
}

function clientIp(req: Request) {
  return (req.ip ?? 'unknown').slice(0, 100);
}

function progressiveLock(attempts: number, scope: 'email' | 'ip') {
  if (scope === 'email') {
    if (attempts <= 8) return 60_000;
    if (attempts <= 12) return 5 * 60_000;
    if (attempts <= 20) return 15 * 60_000;
  } else {
    if (attempts <= 25) return 5 * 60_000;
    if (attempts <= 30) return 15 * 60_000;
  }
  return 60 * 60_000;
}

function readCookie(req: Request, name: string) {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function setRefreshCookie(res: Response, token: string) {
  res.cookie(refreshCookieName, token, {
    httpOnly: true,
    maxAge: refreshLifetimeMs,
    path: '/api/auth',
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
  });
}

function clearRefreshCookie(res: Response) {
  res.clearCookie(refreshCookieName, {
    httpOnly: true,
    path: '/api/auth',
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
  });
}

function assertSameOrigin(req: Request, res: Response) {
  const origin = req.header('Origin');
  const fetchSite = req.header('Sec-Fetch-Site');
  if ((origin && origin !== env.WEB_ORIGIN) || fetchSite === 'cross-site') {
    res.status(403).json({ error: { code: 'ORIGIN_FORBIDDEN', message: 'Origem não permitida.' } });
    return false;
  }
  return true;
}

function issueSessionResponse(
  res: Response,
  user: PublicUser,
  session: { accessToken: string; refreshToken: string; expiresIn: number },
) {
  setRefreshCookie(res, session.refreshToken);
  return res.json({
    accessToken: session.accessToken,
    expiresIn: session.expiresIn || accessTokenLifetimeSeconds,
    user,
  });
}

function invalidInput(res: Response) {
  return res.status(400).json({
    error: { code: 'VALIDATION_ERROR', message: 'Confira os dados informados e tente novamente.' },
  });
}

router.post('/register', requestLimit(12, 15 * 60_000), async (req, res, next) => {
  try {
    const parsed = registerInputSchema.safeParse(req.body);
    if (!parsed.success) return invalidInput(res);

    const ipLimit = await consumeThrottle('register-ip', clientIp(req), {
      windowMs: 15 * 60_000,
      maxAttempts: 10,
      lockDurationMs: () => 15 * 60_000,
    });
    if (!ipLimit.allowed) {
      res.setHeader('Retry-After', String(ipLimit.retryAfterSeconds));
      return res.status(429).json({
        error: { code: 'RATE_LIMITED', message: 'Muitas tentativas. Tente novamente mais tarde.' },
      });
    }

    const existing = await prisma.user.findUnique({
      where: { email: parsed.data.email },
      select: { id: true },
    });
    if (existing) {
      return res.status(409).json({
        error: { code: 'EMAIL_ALREADY_REGISTERED', message: 'Este e-mail já está cadastrado.' },
      });
    }

    const baseUsername =
      parsed.data.email
        .split('@')[0]!
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9._-]/g, '')
        .slice(0, 24) || 'membro';
    const username = `${baseUsername}.${randomBytes(3).toString('hex')}`;
    const user = await prisma.user.create({
      data: {
        email: parsed.data.email,
        passwordHash: await hashPassword(parsed.data.password),
        displayName: parsed.data.displayName,
        username,
        status: 'ONLINE',
      },
      select: publicUserSelect,
    });
    const session = await createAuthSession(user.id, {
      ipAddress: clientIp(req),
      userAgent: req.header('User-Agent'),
    });
    return issueSessionResponse(res.status(201), user, session);
  } catch (error) {
    return next(error);
  }
});

router.post('/login', requestLimit(30, 15 * 60_000), async (req, res, next) => {
  try {
    const parsed = loginInputSchema.safeParse(req.body);
    if (!parsed.success) return invalidInput(res);
    const email = parsed.data.email;
    const ip = clientIp(req);
    const [emailLimit, ipLimit] = await Promise.all([
      throttleStatus('login-email', email),
      throttleStatus('login-ip', ip),
    ]);
    const activeLimit = [emailLimit, ipLimit].find((limit) => !limit.allowed);
    if (activeLimit) {
      res.setHeader('Retry-After', String(activeLimit.retryAfterSeconds));
      return res.status(429).json({
        error: {
          code: 'LOGIN_TEMPORARILY_BLOCKED',
          message: 'Muitas tentativas. Tente novamente mais tarde.',
        },
      });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { ...publicUserSelect, passwordHash: true },
    });
    const passwordIsValid = await verifyPassword(
      user?.passwordHash ?? (await dummyPasswordHash),
      parsed.data.password,
    );
    if (!user?.passwordHash || !passwordIsValid) {
      const [emailResult, ipResult] = await Promise.all([
        consumeThrottle('login-email', email, {
          windowMs: 15 * 60_000,
          maxAttempts: 5,
          lockDurationMs: (attempts) => progressiveLock(attempts, 'email'),
        }),
        consumeThrottle('login-ip', ip, {
          windowMs: 15 * 60_000,
          maxAttempts: 20,
          lockDurationMs: (attempts) => progressiveLock(attempts, 'ip'),
        }),
      ]);
      const retryAfter = Math.max(emailResult.retryAfterSeconds, ipResult.retryAfterSeconds);
      if (retryAfter > 0) res.setHeader('Retry-After', String(retryAfter));
      return res.status(retryAfter ? 429 : 401).json({
        error: {
          code: retryAfter ? 'LOGIN_TEMPORARILY_BLOCKED' : 'INVALID_CREDENTIALS',
          message: retryAfter
            ? 'Muitas tentativas. Tente novamente mais tarde.'
            : 'E-mail ou senha inválidos.',
        },
      });
    }

    await clearThrottle('login-email', email);
    const publicUser: PublicUser = {
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      jobTitle: user.jobTitle,
      timeZone: user.timeZone,
      locale: user.locale,
      status: user.status,
      statusMessage: user.statusMessage,
    };
    const session = await createAuthSession(user.id, {
      ipAddress: clientIp(req),
      userAgent: req.header('User-Agent'),
    });
    return issueSessionResponse(res, publicUser, session);
  } catch (error) {
    return next(error);
  }
});

router.post('/refresh', requestLimit(120, 15 * 60_000), async (req, res, next) => {
  if (!assertSameOrigin(req, res)) return;
  const oldRefreshToken = readCookie(req, refreshCookieName);
  if (!oldRefreshToken) {
    clearRefreshCookie(res);
    return res
      .status(401)
      .json({ error: { code: 'UNAUTHENTICATED', message: 'Sessão expirada.' } });
  }

  try {
    const result = await rotateAuthSession(oldRefreshToken, {
      ipAddress: clientIp(req),
      userAgent: req.header('User-Agent'),
    });
    if (result.kind !== 'rotated') {
      if (result.kind === 'reused' || result.kind === 'expired') {
        disconnectSessions(result.sessionIds);
      }
      clearRefreshCookie(res);
      return res
        .status(401)
        .json({ error: { code: 'UNAUTHENTICATED', message: 'Sessão expirada.' } });
    }
    const user = await prisma.user.findUnique({
      where: { id: result.userId },
      select: publicUserSelect,
    });
    if (!user) {
      clearRefreshCookie(res);
      return res
        .status(401)
        .json({ error: { code: 'UNAUTHENTICATED', message: 'Sessão expirada.' } });
    }
    return issueSessionResponse(res, user, result.session);
  } catch (error) {
    return next(error);
  }
});

router.post('/logout', requestLimit(120, 15 * 60_000), async (req, res, next) => {
  if (!assertSameOrigin(req, res)) return;
  try {
    const refreshToken = readCookie(req, refreshCookieName);
    if (refreshToken) {
      const session = await prisma.authSession.findUnique({
        where: { refreshTokenHash: hashToken(refreshToken) },
        select: { familyId: true },
      });
      if (session) {
        const activeSessions = await prisma.authSession.findMany({
          where: { familyId: session.familyId, revokedAt: null },
          select: { id: true },
        });
        await prisma.authSession.updateMany({
          where: { familyId: session.familyId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        disconnectSessions(activeSessions.map(({ id }) => id));
      }
    }
    clearRefreshCookie(res);
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
});

router.post('/logout-all', requireAuth, async (req, res, next) => {
  if (!assertSameOrigin(req, res)) return;
  try {
    const activeSessions = await prisma.authSession.findMany({
      where: { userId: req.userId, revokedAt: null },
      select: { id: true },
    });
    await prisma.authSession.updateMany({
      where: { userId: req.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    disconnectSessions(activeSessions.map(({ id }) => id));
    clearRefreshCookie(res);
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
});

router.get('/profile', requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: publicUserSelect,
    });
    if (!user)
      return res
        .status(404)
        .json({ error: { code: 'USER_NOT_FOUND', message: 'Perfil não encontrado.' } });
    return res.json(user);
  } catch (error) {
    return next(error);
  }
});

router.patch('/profile', requireAuth, async (req, res, next) => {
  try {
    const parsed = profileUpdateInputSchema.safeParse(req.body);
    if (!parsed.success) return invalidInput(res);
    if (parsed.data.timeZone) {
      try {
        new Intl.DateTimeFormat('pt-BR', { timeZone: parsed.data.timeZone });
      } catch {
        return res
          .status(400)
          .json({ error: { code: 'VALIDATION_ERROR', message: 'Fuso horário inválido.' } });
      }
    }
    const user = await prisma.user.update({
      where: { id: req.userId! },
      data: parsed.data,
      select: publicUserSelect,
    });
    return res.json(user);
  } catch (error) {
    return next(error);
  }
});

router.post('/forgot-password', requestLimit(20, 15 * 60_000), async (req, res, next) => {
  try {
    const parsed = forgotPasswordInputSchema.safeParse(req.body);
    if (!parsed.success) return invalidInput(res);
    const rate = await consumeThrottle('forgot-password', parsed.data.email, {
      windowMs: 60 * 60_000,
      maxAttempts: 3,
      lockDurationMs: () => 60 * 60_000,
    });
    if (rate.allowed) {
      const user = await prisma.user.findUnique({
        where: { email: parsed.data.email },
        select: { id: true, email: true, displayName: true, passwordHash: true },
      });
      if (user?.email && user.passwordHash) {
        const token = createOpaqueToken();
        const now = new Date();
        await prisma.$transaction([
          prisma.passwordResetToken.updateMany({
            where: { userId: user.id, usedAt: null },
            data: { usedAt: now },
          }),
          prisma.passwordResetToken.create({
            data: {
              userId: user.id,
              tokenHash: hashToken(token),
              expiresAt: new Date(now.getTime() + resetLifetimeMs),
            },
          }),
        ]);
        try {
          await mailProvider.sendPasswordReset({
            email: user.email,
            displayName: user.displayName,
            resetUrl: `${env.WEB_ORIGIN}/redefinir-senha?token=${encodeURIComponent(token)}`,
          });
        } catch {
          console.error('Password reset email delivery failed.');
        }
      }
    }
    return res.status(202).json({
      message: 'Se o e-mail estiver cadastrado, enviaremos instruções para redefinir sua senha.',
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/reset-password', requestLimit(20, 15 * 60_000), async (req, res, next) => {
  try {
    const parsed = resetPasswordInputSchema.safeParse(req.body);
    if (!parsed.success) return invalidInput(res);
    const tokenHash = hashToken(parsed.data.token);
    const newPasswordHash = await hashPassword(parsed.data.password);
    const now = new Date();
    const resetResult = await prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "PasswordResetToken" WHERE "tokenHash" = ${tokenHash} FOR UPDATE
      `;
      const resetToken = await transaction.passwordResetToken.findUnique({ where: { tokenHash } });
      if (!resetToken || resetToken.usedAt || resetToken.expiresAt <= now) return false;
      await transaction.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash: newPasswordHash },
      });
      await transaction.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: now },
      });
      await transaction.passwordResetToken.updateMany({
        where: { userId: resetToken.userId, usedAt: null },
        data: { usedAt: now },
      });
      const activeSessions = await transaction.authSession.findMany({
        where: { userId: resetToken.userId, revokedAt: null },
        select: { id: true },
      });
      await transaction.authSession.updateMany({
        where: { userId: resetToken.userId, revokedAt: null },
        data: { revokedAt: now },
      });
      return { ok: true as const, sessionIds: activeSessions.map(({ id }) => id) };
    });
    if (resetResult === false) {
      clearRefreshCookie(res);
      return res.status(400).json({
        error: {
          code: 'RESET_TOKEN_INVALID',
          message: 'O link expirou ou já foi usado. Solicite outro.',
        },
      });
    }
    disconnectSessions(resetResult.sessionIds);
    clearRefreshCookie(res);
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
});

router.post('/demo', requestLimit(20, 15 * 60_000), async (req, res, next) => {
  if (env.NODE_ENV === 'production' || !env.DEMO_AUTH_ENABLED) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Rota não encontrada.' } });
  }
  try {
    const user = await prisma.user.findUnique({
      where: { id: 'demo-user' },
      select: publicUserSelect,
    });
    if (!user) {
      return res.status(503).json({
        error: {
          code: 'DEMO_USER_MISSING',
          message: 'Carregue o seed antes de usar a sessão demo.',
        },
      });
    }
    const session = await createAuthSession(user.id, {
      ipAddress: clientIp(req),
      userAgent: req.header('User-Agent'),
    });
    return issueSessionResponse(res, user, session);
  } catch (error) {
    return next(error);
  }
});

export { router as authRouter };
