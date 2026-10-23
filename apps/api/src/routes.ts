import { Router } from 'express';
import type { Server } from 'socket.io';
import {
  messageInputSchema,
  messageUpdateInputSchema,
  paginationQuerySchema,
  reactionInputSchema,
} from '@rocket/shared';
import { prisma } from './lib/prisma.js';
import { requireAuth } from './auth.js';
import { attachAuthSocketServer, authRouter } from './auth/routes.js';
import { createOrganizationRouter, getChannelContext } from './organization/routes.js';

const getRouteParam = (value: string | string[] | undefined) =>
  Array.isArray(value) ? (value[0] ?? '') : (value ?? '');

function withReactionCounts<
  T extends {
    reactions: { emoji: string; user: { id: string; displayName: string } }[];
    _count: { replies: number };
  },
>(message: T) {
  const usersByEmoji = new Map<string, { id: string; displayName: string }[]>();
  for (const reaction of message.reactions) {
    const users = usersByEmoji.get(reaction.emoji) ?? [];
    users.push(reaction.user);
    usersByEmoji.set(reaction.emoji, users);
  }
  return {
    ...message,
    reactions: [...usersByEmoji].map(([emoji, users]) => ({
      emoji,
      users,
      _count: { userId: users.length },
    })),
    replyCount: message._count.replies,
  };
}

const messageInclude = {
  author: {
    select: { id: true, username: true, displayName: true, avatarUrl: true, status: true },
  },
  reactions: { select: { emoji: true, user: { select: { id: true, displayName: true } } } },
  _count: { select: { replies: { where: { deletedAt: null } } } },
} as const;

async function findAuthorizedMessage(messageId: string, userId: string) {
  const message = await prisma.message.findFirst({
    where: { id: messageId, deletedAt: null },
    select: { id: true, authorId: true, conversationId: true, channelId: true, replyToId: true },
  });
  if (!message) {
    return {
      allowed: false,
      status: 404,
      code: 'MESSAGE_NOT_FOUND',
      message: 'Mensagem não encontrada.',
    } as const;
  }

  if (message.conversationId) {
    const membership = await prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId: message.conversationId, userId } },
      select: { userId: true },
    });
    if (!membership) {
      return {
        allowed: false,
        status: 404,
        code: 'MESSAGE_NOT_FOUND',
        message: 'Mensagem não encontrada.',
      } as const;
    }
    return { allowed: true, message, room: `conversation:${message.conversationId}` } as const;
  }

  if (!message.channelId) {
    return {
      allowed: false,
      status: 404,
      code: 'MESSAGE_NOT_FOUND',
      message: 'Mensagem não encontrada.',
    } as const;
  }
  const context = await getChannelContext(message.channelId, userId);
  if (!context) {
    return {
      allowed: false,
      status: 404,
      code: 'MESSAGE_NOT_FOUND',
      message: 'Mensagem não encontrada.',
    } as const;
  }
  if (!context.isMember) {
    return {
      allowed: false,
      status: 403,
      code: 'CHANNEL_MEMBERSHIP_REQUIRED',
      message: 'Entre na equipe para acessar esta mensagem.',
    } as const;
  }
  return { allowed: true, message, room: `channel:${message.channelId}` } as const;
}

async function listMessages(
  parent: { conversationId: string } | { channelId: string },
  limit: number,
  cursor?: string,
) {
  if (cursor) {
    const cursorMessage = await prisma.message.findFirst({
      where: { ...parent, id: cursor, replyToId: null },
      select: { id: true },
    });
    if (!cursorMessage) return null;
  }

  const messages = await prisma.message.findMany({
    where: { ...parent, replyToId: null, deletedAt: null },
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    take: limit + 1,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    include: messageInclude,
  });
  const hasMore = messages.length > limit;
  const items = messages.slice(0, limit).reverse().map(withReactionCounts);
  return { items, nextCursor: hasMore ? (items[0]?.id ?? null) : null };
}

async function listThreadReplies(rootMessageId: string, limit: number, cursor?: string) {
  if (cursor) {
    const cursorMessage = await prisma.message.findFirst({
      where: { id: cursor, replyToId: rootMessageId, deletedAt: null },
      select: { id: true },
    });
    if (!cursorMessage) return null;
  }

  const messages = await prisma.message.findMany({
    where: { replyToId: rootMessageId, deletedAt: null },
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

  router.get('/messages/:messageId/replies', requireAuth, async (req, res, next) => {
    try {
      const messageId = getRouteParam(req.params.messageId);
      const access = await findAuthorizedMessage(messageId, req.userId!);
      if (!access.allowed)
        return res.status(access.status).json({
          error: { code: access.code, message: access.message },
        });
      if (access.message.replyToId) {
        return res.status(400).json({
          error: {
            code: 'MESSAGE_THREAD_ROOT_REQUIRED',
            message: 'As respostas devem pertencer à mensagem inicial do tópico.',
          },
        });
      }
      const parsedQuery = paginationQuerySchema.safeParse({
        limit: req.query.limit,
        cursor: req.query.cursor,
      });
      if (!parsedQuery.success) {
        return res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Informe uma página válida de respostas.' },
        });
      }
      const page = await listThreadReplies(
        messageId,
        parsedQuery.data.limit,
        parsedQuery.data.cursor,
      );
      if (!page) {
        return res.status(400).json({
          error: { code: 'INVALID_MESSAGE_CURSOR', message: 'O cursor não pertence ao tópico.' },
        });
      }
      return res.json(page);
    } catch (error) {
      return next(error);
    }
  });

  router.post('/messages/:messageId/replies', requireAuth, async (req, res, next) => {
    try {
      const messageId = getRouteParam(req.params.messageId);
      const access = await findAuthorizedMessage(messageId, req.userId!);
      if (!access.allowed)
        return res.status(access.status).json({
          error: { code: access.code, message: access.message },
        });
      if (access.message.replyToId) {
        return res.status(400).json({
          error: {
            code: 'MESSAGE_THREAD_ROOT_REQUIRED',
            message: 'As respostas devem pertencer à mensagem inicial do tópico.',
          },
        });
      }
      const parsedBody = messageInputSchema.safeParse(req.body);
      if (!parsedBody.success) {
        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'A resposta deve conter de 1 a 10.000 caracteres.',
          },
        });
      }

      const { clientMessageId, text } = parsedBody.data;
      let existingReply = null;
      if (clientMessageId && access.message.conversationId) {
        existingReply = await prisma.message.findUnique({
          where: {
            conversationId_authorId_clientMessageId: {
              conversationId: access.message.conversationId,
              authorId: req.userId!,
              clientMessageId,
            },
          },
          include: messageInclude,
        });
      } else if (clientMessageId && access.message.channelId) {
        existingReply = await prisma.message.findUnique({
          where: {
            channelId_authorId_clientMessageId: {
              channelId: access.message.channelId,
              authorId: req.userId!,
              clientMessageId,
            },
          },
          include: messageInclude,
        });
      }
      if (existingReply) {
        if (existingReply.replyToId !== messageId) {
          return res.status(409).json({
            error: {
              code: 'IDEMPOTENCY_KEY_REUSED',
              message: 'Este identificador já foi usado em outra mensagem.',
            },
          });
        }
        return res.status(200).json(withReactionCounts(existingReply));
      }

      const replyData = {
        authorId: req.userId!,
        text,
        replyToId: messageId,
        ...(clientMessageId ? { clientMessageId } : {}),
      };
      const reply = access.message.conversationId
        ? clientMessageId
          ? await prisma.message.upsert({
              where: {
                conversationId_authorId_clientMessageId: {
                  conversationId: access.message.conversationId,
                  authorId: req.userId!,
                  clientMessageId,
                },
              },
              create: { ...replyData, conversationId: access.message.conversationId },
              update: {},
              include: messageInclude,
            })
          : await prisma.message.create({
              data: { ...replyData, conversationId: access.message.conversationId },
              include: messageInclude,
            })
        : clientMessageId
          ? await prisma.message.upsert({
              where: {
                channelId_authorId_clientMessageId: {
                  channelId: access.message.channelId!,
                  authorId: req.userId!,
                  clientMessageId,
                },
              },
              create: { ...replyData, channelId: access.message.channelId! },
              update: {},
              include: messageInclude,
            })
          : await prisma.message.create({
              data: { ...replyData, channelId: access.message.channelId! },
              include: messageInclude,
            });
      if (reply.replyToId !== messageId) {
        return res.status(409).json({
          error: {
            code: 'IDEMPOTENCY_KEY_REUSED',
            message: 'Este identificador já foi usado em outra mensagem.',
          },
        });
      }
      if (access.message.conversationId) {
        await prisma.conversation.update({
          where: { id: access.message.conversationId },
          data: { updatedAt: new Date() },
        });
      }
      const normalizedReply = {
        ...withReactionCounts(reply),
        conversationId: access.message.conversationId ?? undefined,
        channelId: access.message.channelId ?? undefined,
      };
      io.to(access.room).emit('message:created', normalizedReply);

      const updatedRoot = await prisma.message.findUniqueOrThrow({
        where: { id: messageId },
        include: messageInclude,
      });
      io.to(access.room).emit('message:updated', withReactionCounts(updatedRoot));
      return res.status(201).json(normalizedReply);
    } catch (error) {
      return next(error);
    }
  });

  router.patch('/messages/:messageId', requireAuth, async (req, res, next) => {
    try {
      const messageId = getRouteParam(req.params.messageId);
      const access = await findAuthorizedMessage(messageId, req.userId!);
      if (!access.allowed)
        return res.status(access.status).json({
          error: { code: access.code, message: access.message },
        });
      if (access.message.authorId !== req.userId) {
        return res.status(403).json({
          error: { code: 'MESSAGE_AUTHOR_REQUIRED', message: 'Somente a autoria pode editar.' },
        });
      }
      const parsedBody = messageUpdateInputSchema.safeParse(req.body);
      if (!parsedBody.success) {
        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'A mensagem deve conter de 1 a 10.000 caracteres.',
          },
        });
      }
      const updatedMessage = await prisma.message.update({
        where: { id: messageId },
        data: { text: parsedBody.data.text, editedAt: new Date() },
        include: messageInclude,
      });
      const normalizedMessage = withReactionCounts(updatedMessage);
      io.to(access.room).emit('message:updated', normalizedMessage);
      return res.json(normalizedMessage);
    } catch (error) {
      return next(error);
    }
  });

  router.delete('/messages/:messageId', requireAuth, async (req, res, next) => {
    try {
      const messageId = getRouteParam(req.params.messageId);
      const access = await findAuthorizedMessage(messageId, req.userId!);
      if (!access.allowed)
        return res.status(access.status).json({
          error: { code: access.code, message: access.message },
        });
      if (access.message.authorId !== req.userId) {
        return res.status(403).json({
          error: { code: 'MESSAGE_AUTHOR_REQUIRED', message: 'Somente a autoria pode excluir.' },
        });
      }
      const deletedAt = new Date();
      await prisma.message.update({ where: { id: messageId }, data: { deletedAt } });
      io.to(access.room).emit('message:deleted', {
        id: messageId,
        conversationId: access.message.conversationId,
        channelId: access.message.channelId,
        replyToId: access.message.replyToId,
        deletedAt: deletedAt.toISOString(),
      });
      if (access.message.replyToId) {
        const updatedRoot = await prisma.message.findUniqueOrThrow({
          where: { id: access.message.replyToId },
          include: messageInclude,
        });
        io.to(access.room).emit('message:updated', withReactionCounts(updatedRoot));
      }
      return res.status(204).end();
    } catch (error) {
      return next(error);
    }
  });

  router.put('/messages/:messageId/reactions', requireAuth, async (req, res, next) => {
    try {
      const messageId = getRouteParam(req.params.messageId);
      const access = await findAuthorizedMessage(messageId, req.userId!);
      if (!access.allowed)
        return res.status(access.status).json({
          error: { code: access.code, message: access.message },
        });
      const parsedBody = reactionInputSchema.safeParse(req.body);
      if (!parsedBody.success) {
        return res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Informe uma reação válida.' },
        });
      }
      const key = {
        messageId_userId_emoji: {
          messageId,
          userId: req.userId!,
          emoji: parsedBody.data.emoji,
        },
      };
      const existingReaction = await prisma.reaction.findUnique({ where: key });
      if (!existingReaction) {
        await prisma.reaction.upsert({
          where: key,
          create: { messageId, userId: req.userId!, emoji: parsedBody.data.emoji },
          update: {},
        });
      }
      const updatedMessage = await prisma.message.findUniqueOrThrow({
        where: { id: messageId },
        include: messageInclude,
      });
      const normalizedMessage = withReactionCounts(updatedMessage);
      if (!existingReaction) io.to(access.room).emit('reaction:added', normalizedMessage);
      return res.json(normalizedMessage);
    } catch (error) {
      return next(error);
    }
  });

  router.delete('/messages/:messageId/reactions/:emoji', requireAuth, async (req, res, next) => {
    try {
      const messageId = getRouteParam(req.params.messageId);
      const access = await findAuthorizedMessage(messageId, req.userId!);
      if (!access.allowed)
        return res.status(access.status).json({
          error: { code: access.code, message: access.message },
        });
      const parsedBody = reactionInputSchema.safeParse({ emoji: req.params.emoji });
      if (!parsedBody.success) {
        return res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Informe uma reação válida.' },
        });
      }
      const removed = await prisma.reaction.deleteMany({
        where: { messageId, userId: req.userId!, emoji: parsedBody.data.emoji },
      });
      const updatedMessage = await prisma.message.findUniqueOrThrow({
        where: { id: messageId },
        include: messageInclude,
      });
      const normalizedMessage = withReactionCounts(updatedMessage);
      if (removed.count) io.to(access.room).emit('reaction:removed', normalizedMessage);
      return res.json(normalizedMessage);
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
