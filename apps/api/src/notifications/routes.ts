import { Router } from 'express';
import { activityQuerySchema, pushSubscriptionInputSchema } from '@rocket/shared';
import { requireAuth } from '../auth.js';
import { prisma } from '../lib/prisma.js';
import { serializeActivityNotification } from './serialize.js';
import { webPushConfigured } from './push.js';
import { env } from '../env.js';

const router = Router();
const pushEndpointHosts = [
  'fcm.googleapis.com',
  'push.services.mozilla.com',
  'push.apple.com',
  'notify.windows.com',
  'push.services.opera.com',
];

function isAllowedPushEndpoint(endpoint: string) {
  const url = new URL(endpoint);
  return (
    url.protocol === 'https:' &&
    !url.username &&
    !url.password &&
    pushEndpointHosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))
  );
}

function visibleActivityWhere(userId: string) {
  return {
    recipientId: userId,
    OR: [
      { conversation: { members: { some: { userId } } } },
      {
        channel: {
          OR: [
            { visibility: 'PUBLIC' as const, team: { members: { some: { userId } } } },
            { visibility: 'PRIVATE' as const, members: { some: { userId } } },
          ],
        },
      },
      { workspace: { members: { some: { userId } } } },
    ],
  };
}

const activityInclude = {
  actor: { select: { displayName: true } },
  workspace: { select: { name: true } },
  conversation: { select: { id: true, name: true } },
  channel: { select: { id: true, name: true, teamId: true } },
} as const;

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const parsed = activityQuerySchema.safeParse({
      filter: req.query.filter,
      limit: req.query.limit,
      cursor: req.query.cursor,
    });
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'O filtro de atividade é inválido.' },
      });
    }
    const { filter, limit, cursor } = parsed.data;
    const baseWhere = visibleActivityWhere(req.userId!);
    const where = {
      ...baseWhere,
      ...(filter === 'unread' ? { readAt: null } : {}),
      ...(filter === 'mentions' ? { kind: 'MENTION' as const } : {}),
    };
    if (cursor) {
      const cursorItem = await prisma.activityNotification.findFirst({
        where: { id: cursor, recipientId: req.userId },
        select: { id: true, createdAt: true },
      });
      if (!cursorItem) {
        return res.status(400).json({
          error: { code: 'INVALID_ACTIVITY_CURSOR', message: 'O cursor de atividade é inválido.' },
        });
      }
      Object.assign(where, {
        AND: [
          {
            OR: [
              { createdAt: { lt: cursorItem.createdAt } },
              { createdAt: cursorItem.createdAt, id: { lt: cursorItem.id } },
            ],
          },
        ],
      });
    }
    const [items, unreadCount] = await Promise.all([
      prisma.activityNotification.findMany({
        where,
        include: activityInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
      }),
      prisma.activityNotification.count({
        where: { ...baseWhere, readAt: null },
      }),
    ]);
    const hasMore = items.length > limit;
    const page = hasMore ? items.slice(0, limit) : items;
    return res.json({
      items: page.map(serializeActivityNotification),
      nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
      unreadCount,
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/push-config', requireAuth, (_req, res) => {
  return res.json({
    enabled: webPushConfigured,
    publicKey: webPushConfigured ? env.VAPID_PUBLIC_KEY : null,
  });
});

router.post('/read-all', requireAuth, async (req, res, next) => {
  try {
    const result = await prisma.activityNotification.updateMany({
      where: { ...visibleActivityWhere(req.userId!), readAt: null },
      data: { readAt: new Date() },
    });
    return res.json({ updated: result.count });
  } catch (error) {
    return next(error);
  }
});

router.post('/:notificationId/read', requireAuth, async (req, res, next) => {
  try {
    const notificationId = Array.isArray(req.params.notificationId)
      ? req.params.notificationId[0]
      : req.params.notificationId;
    const result = await prisma.activityNotification.updateMany({
      where: { id: notificationId, ...visibleActivityWhere(req.userId!) },
      data: { readAt: new Date() },
    });
    if (!result.count) {
      return res.status(404).json({
        error: { code: 'ACTIVITY_NOT_FOUND', message: 'Atividade não encontrada.' },
      });
    }
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
});

router.post('/push-subscriptions', requireAuth, async (req, res, next) => {
  try {
    const parsed = pushSubscriptionInputSchema.safeParse(req.body);
    if (!parsed.success || !isAllowedPushEndpoint(parsed.data.endpoint)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_PUSH_SUBSCRIPTION',
          message: 'A assinatura do navegador é inválida.',
        },
      });
    }
    const { endpoint, keys } = parsed.data;
    await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: { userId: req.userId!, endpoint, p256dh: keys.p256dh, auth: keys.auth },
      update: { userId: req.userId!, p256dh: keys.p256dh, auth: keys.auth },
    });
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
});

router.delete('/push-subscriptions', requireAuth, async (req, res, next) => {
  try {
    const parsed = pushSubscriptionInputSchema.safeParse(req.body);
    if (!parsed.success || !isAllowedPushEndpoint(parsed.data?.endpoint ?? '')) {
      return res.status(400).json({
        error: {
          code: 'INVALID_PUSH_SUBSCRIPTION',
          message: 'A assinatura do navegador é inválida.',
        },
      });
    }
    await prisma.pushSubscription.deleteMany({
      where: { userId: req.userId!, endpoint: parsed.data.endpoint },
    });
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
});

export function createActivityRouter() {
  return router;
}
