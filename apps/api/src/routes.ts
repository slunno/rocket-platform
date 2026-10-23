import { Router } from 'express';
import type { Server } from 'socket.io';
import { messageInputSchema, paginationQuerySchema } from '@rocket/shared';
import { prisma } from './lib/prisma.js';
import { requireAuth } from './auth.js';
import { attachAuthSocketServer, authRouter } from './auth/routes.js';
import { createOrganizationRouter, getChannelContext } from './organization/routes.js';

const getRouteParam = (value: string | string[] | undefined) =>
  Array.isArray(value) ? (value[0] ?? '') : (value ?? '');

function withReactionCounts<T extends { reactions: { emoji: string }[] }>(message: T) {
  const counts = new Map<string, number>();
  for (const reaction of message.reactions)
    counts.set(reaction.emoji, (counts.get(reaction.emoji) ?? 0) + 1);
  return {
    ...message,
    reactions: [...counts].map(([emoji, count]) => ({ emoji, _count: { userId: count } })),
  };
}

const messageInclude = {
  author: {
    select: { id: true, username: true, displayName: true, avatarUrl: true, status: true },
  },
  reactions: { select: { emoji: true } },
} as const;

async function listMessages(
  parent: { conversationId: string } | { channelId: string },
  limit: number,
  cursor?: string,
) {
  if (cursor) {
    const cursorMessage = await prisma.message.findFirst({
      where: { ...parent, id: cursor },
      select: { id: true },
    });
    if (!cursorMessage) return null;
  }

  const messages = await prisma.message.findMany({
    where: { ...parent, deletedAt: null },
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    take: limit + 1,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    include: messageInclude,
  });
  const hasMore = messages.length > limit;
  const items = messages.slice(0, limit).reverse().map(withReactionCounts);
  return { items, nextCursor: hasMore ? (items[0]?.id ?? null) : null };
}

export function createApiRouter(io: Server) {
  const router = Router();
  attachAuthSocketServer(io);

  router.get('/health', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: 'ok', database: 'connected' });
    } catch {
      res.status(503).json({ status: 'unavailable', database: 'disconnected' });
    }
  });

  router.use('/auth', authRouter);
  router.use('/', createOrganizationRouter(io));

  router.get('/conversations', requireAuth, async (req, res, next) => {
    try {
      const memberships = await prisma.conversationMember.findMany({
        where: { userId: req.userId },
        include: {
          conversation: {
            include: {
              members: {
                include: {
                  user: {
                    select: {
                      id: true,
                      username: true,
                      displayName: true,
                      avatarUrl: true,
                      status: true,
                    },
                  },
                },
              },
              messages: {
                where: { deletedAt: null },
                orderBy: { createdAt: 'desc' },
                take: 1,
                select: { text: true, createdAt: true },
              },
              _count: { select: { members: true } },
            },
          },
        },
        orderBy: { conversation: { updatedAt: 'desc' } },
      });
      return res.json(
        memberships.map(({ conversation }) => ({
          id: conversation.id,
          type: conversation.type,
          name:
            conversation.type === 'DIRECT'
              ? (conversation.members.find(({ user }) => user.id !== req.userId)?.user
                  .displayName ?? conversation.name)
              : conversation.name,
          description: conversation.description,
          memberCount: conversation._count.members,
          preview: conversation.messages[0]?.text,
          lastAt: conversation.messages[0]?.createdAt.toISOString(),
          members: conversation.members.map(({ user }) => user),
        })),
      );
    } catch (error) {
      return next(error);
    }
  });

  router.get('/conversations/:conversationId/messages', requireAuth, async (req, res, next) => {
    try {
      const conversationId = getRouteParam(req.params.conversationId);
      const membership = await prisma.conversationMember.findUnique({
        where: { conversationId_userId: { conversationId, userId: req.userId! } },
      });
      if (!membership) {
        return res.status(404).json({
          error: { code: 'CONVERSATION_NOT_FOUND', message: 'Conversa não encontrada.' },
        });
      }
      const parsedQuery = paginationQuerySchema.safeParse({
        limit: req.query.limit,
        cursor: req.query.cursor,
      });
      if (!parsedQuery.success) {
        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'A página deve usar um limite entre 1 e 100 e um cursor válido.',
          },
        });
      }
      const page = await listMessages(
        { conversationId },
        parsedQuery.data.limit,
        parsedQuery.data.cursor,
      );
      if (!page) {
        return res.status(400).json({
          error: { code: 'INVALID_MESSAGE_CURSOR', message: 'O cursor não pertence à conversa.' },
        });
      }
      return res.json(page);
    } catch (error) {
      return next(error);
    }
  });

  router.post('/conversations/:conversationId/messages', requireAuth, async (req, res, next) => {
    try {
      const conversationId = getRouteParam(req.params.conversationId);
      const parsedBody = messageInputSchema.safeParse(req.body);
      if (!parsedBody.success) {
        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'A mensagem deve conter de 1 a 10.000 caracteres.',
          },
        });
      }
      const { text, clientMessageId } = parsedBody.data;
      const membership = await prisma.conversationMember.findUnique({
        where: { conversationId_userId: { conversationId, userId: req.userId! } },
      });
      if (!membership) {
        return res.status(404).json({
          error: { code: 'CONVERSATION_NOT_FOUND', message: 'Conversa não encontrada.' },
        });
      }
      if (clientMessageId) {
        const existingMessage = await prisma.message.findUnique({
          where: {
            conversationId_authorId_clientMessageId: {
              conversationId,
              authorId: req.userId!,
              clientMessageId,
            },
          },
          include: messageInclude,
        });
        if (existingMessage) return res.status(200).json(withReactionCounts(existingMessage));
      }
      const message = clientMessageId
        ? await prisma.message.upsert({
            where: {
              conversationId_authorId_clientMessageId: {
                conversationId,
                authorId: req.userId!,
                clientMessageId,
              },
            },
            create: { conversationId, authorId: req.userId!, text, clientMessageId },
            update: {},
            include: messageInclude,
          })
        : await prisma.message.create({
            data: { conversationId, authorId: req.userId!, text },
            include: messageInclude,
          });
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      });
      const normalizedMessage = withReactionCounts(message);
      io.to(`conversation:${conversationId}`).emit('message:created', {
        ...normalizedMessage,
        conversationId,
      });
      return res.status(201).json(normalizedMessage);
    } catch (error) {
      return next(error);
    }
  });

  router.get('/channels/:channelId/messages', requireAuth, async (req, res, next) => {
    try {
      const channelId = getRouteParam(req.params.channelId);
      const context = await getChannelContext(channelId, req.userId!);
      if (!context) {
        return res.status(404).json({
          error: { code: 'CHANNEL_NOT_FOUND', message: 'Canal não encontrado.' },
        });
      }
      if (!context.isMember) {
        return res.status(403).json({
          error: {
            code: 'CHANNEL_MEMBERSHIP_REQUIRED',
            message: 'Entre na equipe para acessar este canal.',
          },
        });
      }
      const parsedQuery = paginationQuerySchema.safeParse({
        limit: req.query.limit,
        cursor: req.query.cursor,
      });
      if (!parsedQuery.success) {
        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'A página deve usar um limite entre 1 e 100 e um cursor válido.',
          },
        });
      }
      const page = await listMessages(
        { channelId },
        parsedQuery.data.limit,
        parsedQuery.data.cursor,
      );
      if (!page) {
        return res.status(400).json({
          error: { code: 'INVALID_MESSAGE_CURSOR', message: 'O cursor não pertence ao canal.' },
        });
      }
      return res.json(page);
    } catch (error) {
      return next(error);
    }
  });

  router.post('/channels/:channelId/messages', requireAuth, async (req, res, next) => {
    try {
      const channelId = getRouteParam(req.params.channelId);
      const context = await getChannelContext(channelId, req.userId!);
      if (!context) {
        return res.status(404).json({
          error: { code: 'CHANNEL_NOT_FOUND', message: 'Canal não encontrado.' },
        });
      }
      if (!context.isMember) {
        return res.status(403).json({
          error: {
            code: 'CHANNEL_MEMBERSHIP_REQUIRED',
            message: 'Entre na equipe para participar deste canal.',
          },
        });
      }
      const parsedBody = messageInputSchema.safeParse(req.body);
      if (!parsedBody.success) {
        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'A mensagem deve conter de 1 a 10.000 caracteres.',
          },
        });
      }
      if (parsedBody.data.clientMessageId) {
        const existingMessage = await prisma.message.findUnique({
          where: {
            channelId_authorId_clientMessageId: {
              channelId,
              authorId: req.userId!,
              clientMessageId: parsedBody.data.clientMessageId,
            },
          },
          include: messageInclude,
        });
        if (existingMessage) return res.status(200).json(withReactionCounts(existingMessage));
      }
      const message = parsedBody.data.clientMessageId
        ? await prisma.message.upsert({
            where: {
              channelId_authorId_clientMessageId: {
                channelId,
                authorId: req.userId!,
                clientMessageId: parsedBody.data.clientMessageId,
              },
            },
            create: {
              channelId,
              authorId: req.userId!,
              text: parsedBody.data.text,
              clientMessageId: parsedBody.data.clientMessageId,
            },
            update: {},
            include: messageInclude,
          })
        : await prisma.message.create({
            data: { channelId, authorId: req.userId!, text: parsedBody.data.text },
            include: messageInclude,
          });
      await prisma.channel.update({ where: { id: channelId }, data: { updatedAt: new Date() } });
      const normalizedMessage = withReactionCounts(message);
      io.to(`channel:${channelId}`).emit('message:created', {
        ...normalizedMessage,
        channelId,
      });
      return res.status(201).json(normalizedMessage);
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
