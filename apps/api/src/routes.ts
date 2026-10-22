import { Router } from 'express';
import type { Server } from 'socket.io';
import { prisma } from './lib/prisma.js';
import { requireAuth, signUserToken } from './auth.js';

const getRouteParam = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] ?? '' : value ?? '';

function withReactionCounts<T extends { reactions: { emoji: string }[] }>(message: T) {
  const counts = new Map<string, number>();
  for (const reaction of message.reactions) counts.set(reaction.emoji, (counts.get(reaction.emoji) ?? 0) + 1);
  return {
    ...message,
    reactions: [...counts].map(([emoji, count]) => ({ emoji, _count: { userId: count } })),
  };
}

export function createApiRouter(io: Server) {
  const router = Router();

  router.get('/health', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: 'ok', database: 'connected' });
    } catch {
      res.status(503).json({ status: 'unavailable', database: 'disconnected' });
    }
  });

  router.post('/auth/demo', async (_req, res) => {
    if (process.env.NODE_ENV === 'production' || process.env.DEMO_AUTH_ENABLED !== 'true') {
      return res.status(404).json({ error: 'Not found.' });
    }
    const user = await prisma.user.findUnique({ where: { id: 'demo-user' }, select: { id: true, username: true, displayName: true } });
    if (!user) return res.status(503).json({ error: 'Run the database seed before using the demo session.' });
    return res.json({ token: signUserToken(user.id), user });
  });

  router.get('/conversations', requireAuth, async (req, res, next) => {
    try {
      const memberships = await prisma.conversationMember.findMany({
        where: { userId: req.userId },
        include: {
          conversation: {
            include: {
              members: { include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true, status: true } } } },
              messages: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 1, select: { text: true, createdAt: true } },
              _count: { select: { members: true } },
            },
          },
        },
        orderBy: { conversation: { updatedAt: 'desc' } },
      });
      return res.json(memberships.map(({ conversation }) => ({
        id: conversation.id,
        type: conversation.type,
        name: conversation.name,
        description: conversation.description,
        memberCount: conversation._count.members,
        preview: conversation.messages[0]?.text,
        lastAt: conversation.messages[0]?.createdAt.toISOString(),
        members: conversation.members.map(({ user }) => user),
      })));
    } catch (error) { return next(error); }
  });

  router.get('/conversations/:conversationId/messages', requireAuth, async (req, res, next) => {
    try {
      const conversationId = getRouteParam(req.params.conversationId);
      const membership = await prisma.conversationMember.findUnique({ where: { conversationId_userId: { conversationId, userId: req.userId! } } });
      if (!membership) return res.status(404).json({ error: 'Conversation not found.' });
      const requestedLimit = Number(req.query.limit ?? 50);
      const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(requestedLimit, 100)) : 50;
      const messages = await prisma.message.findMany({
        where: { conversationId, deletedAt: null },
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          author: { select: { id: true, username: true, displayName: true, avatarUrl: true, status: true } },
          reactions: { select: { emoji: true } },
        },
      });
      return res.json(messages.reverse().map(withReactionCounts));
    } catch (error) { return next(error); }
  });

  router.post('/conversations/:conversationId/messages', requireAuth, async (req, res, next) => {
    try {
      const conversationId = getRouteParam(req.params.conversationId);
      const text = typeof req.body.text === 'string' ? req.body.text.trim() : '';
      if (!text || text.length > 10_000) return res.status(400).json({ error: 'Message must contain between 1 and 10000 characters.' });
      const membership = await prisma.conversationMember.findUnique({ where: { conversationId_userId: { conversationId, userId: req.userId! } } });
      if (!membership) return res.status(404).json({ error: 'Conversation not found.' });
      const message = await prisma.message.create({
        data: { conversationId, authorId: req.userId!, text },
        include: {
          author: { select: { id: true, username: true, displayName: true, avatarUrl: true, status: true } },
          reactions: { select: { emoji: true } },
        },
      });
      await prisma.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
      const normalizedMessage = withReactionCounts(message);
      io.to(`conversation:${conversationId}`).emit('message:created', { ...normalizedMessage, conversationId });
      return res.status(201).json(normalizedMessage);
    } catch (error) { return next(error); }
  });

  return router;
}
