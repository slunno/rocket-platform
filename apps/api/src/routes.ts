import { Router } from 'express';
import type { Server } from 'socket.io';
import {
  conversationPreferenceInputSchema,
  directConversationCreateInputSchema,
  groupConversationCreateInputSchema,
  groupConversationUpdateInputSchema,
  memberInputSchema,
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

type MessageTarget = { conversationId: string } | { channelId: string };

function getMentionHandles(text: string) {
  return [...text.matchAll(/(?:^|\s)@([a-z\d][a-z\d._-]*[a-z\d]|[a-z\d])/gi)].map((match) =>
    match[1]!.toLowerCase(),
  );
}

async function mentionsAreAvailable(text: string, target: MessageTarget) {
  const mentions = getMentionHandles(text);
  if (!mentions.length) return true;
  const mentionChannel = mentions.includes('canal');
  if ('conversationId' in target && mentionChannel) return false;
  const usernames = [...new Set(mentions.filter((username) => username !== 'canal'))];
  if (!usernames.length) return true;

  const memberships =
    'conversationId' in target
      ? await prisma.conversationMember.findMany({
          where: { conversationId: target.conversationId, user: { username: { in: usernames } } },
          select: { user: { select: { username: true } } },
        })
      : await prisma.channel
          .findUnique({
            where: { id: target.channelId },
            select: {
              teamId: true,
              visibility: true,
            },
          })
          .then(async (channel) => {
            if (!channel) return [];
            return channel.visibility === 'PUBLIC'
              ? prisma.teamMember.findMany({
                  where: { teamId: channel.teamId, user: { username: { in: usernames } } },
                  select: { user: { select: { username: true } } },
                })
              : prisma.channelMember.findMany({
                  where: { channelId: target.channelId, user: { username: { in: usernames } } },
                  select: { user: { select: { username: true } } },
                });
          });
  return usernames.every((username) =>
    memberships.some((member) => member.user.username === username),
  );
}

function invalidMentionResponse(res: import('express').Response) {
  return res.status(400).json({
    error: {
      code: 'MESSAGE_MENTION_UNAVAILABLE',
      message: 'A mensagem menciona alguém que não participa desta conversa.',
    },
  });
}

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

async function countUnreadMessages(
  parent: { conversationId: string } | { channelId: string },
  userId: string,
  lastReadAt: Date,
) {
  return prisma.message.count({
    where: {
      ...parent,
      replyToId: null,
      deletedAt: null,
      authorId: { not: userId },
      createdAt: { gt: lastReadAt },
    },
  });
}

const conversationUserSelect = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
  status: true,
} as const;

const conversationMembersInclude = {
  members: { include: { user: { select: conversationUserSelect } } },
  _count: { select: { members: true } },
} as const;

function conversationDto(
  conversation: {
    id: string;
    type: 'DIRECT' | 'GROUP';
    name: string;
    description: string | null;
    avatarUrl: string | null;
    workspaceId: string | null;
    createdById: string | null;
    members: {
      userId: string;
      muted: boolean;
      pinned: boolean;
      user: {
        id: string;
        username: string;
        displayName: string;
        avatarUrl: string | null;
        status: 'ONLINE' | 'BUSY' | 'DO_NOT_DISTURB' | 'AWAY' | 'OFFLINE';
      };
    }[];
    _count: { members: number };
  },
  userId: string,
) {
  const currentMember = conversation.members.find((member) => member.userId === userId);
  const otherMember = conversation.members.find((member) => member.userId !== userId);
  return {
    id: conversation.id,
    type: conversation.type,
    name:
      conversation.type === 'DIRECT'
        ? (otherMember?.user.displayName ?? conversation.name)
        : conversation.name,
    description: conversation.description,
    avatarUrl: conversation.avatarUrl,
    workspaceId: conversation.workspaceId,
    createdById: conversation.createdById,
    memberCount: conversation._count.members,
    muted: currentMember?.muted ?? false,
    pinned: currentMember?.pinned ?? false,
    members: conversation.members.map(({ user }) => user),
  };
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
                  user: { select: conversationUserSelect },
                },
              },
              messages: {
                where: { deletedAt: null, replyToId: null },
                orderBy: { createdAt: 'desc' },
                take: 1,
                select: { text: true, createdAt: true },
              },
              _count: { select: { members: true } },
            },
          },
        },
        orderBy: [{ pinned: 'desc' }, { conversation: { updatedAt: 'desc' } }],
      });
      return res.json(
        await Promise.all(
          memberships.map(async ({ conversation, lastReadAt, joinedAt }) => ({
            ...conversationDto(conversation, req.userId!),
            preview: conversation.messages[0]?.text,
            lastAt: conversation.messages[0]?.createdAt.toISOString(),
            unread: await countUnreadMessages(
              { conversationId: conversation.id },
              req.userId!,
              lastReadAt ?? joinedAt,
            ),
          })),
        ),
      );
    } catch (error) {
      return next(error);
    }
  });

  router.post(
    '/workspaces/:workspaceId/conversations/direct',
    requireAuth,
    async (req, res, next) => {
      try {
        const workspaceId = getRouteParam(req.params.workspaceId);
        const input = directConversationCreateInputSchema.safeParse(req.body);
        if (!input.success) {
          return res.status(400).json({
            error: { code: 'VALIDATION_ERROR', message: 'Selecione uma pessoa para iniciar a DM.' },
          });
        }
        const targetUserId = input.data.targetUserId;
        if (targetUserId === req.userId)
          return res.status(400).json({
            error: { code: 'SELF_CONVERSATION', message: 'Selecione outra pessoa para conversar.' },
          });
        const workspaceMembers = await prisma.workspaceMember.findMany({
          where: { workspaceId, userId: { in: [req.userId!, targetUserId] } },
          select: { userId: true, role: true },
        });
        if (workspaceMembers.length !== 2)
          return res.status(404).json({
            error: { code: 'PERSON_NOT_FOUND', message: 'Pessoa não encontrada neste espaço.' },
          });
        if (workspaceMembers.some(({ role }) => role === 'GUEST'))
          return res.status(403).json({
            error: {
              code: 'GUEST_DIRECTORY_RESTRICTED',
              message: 'A conversa direta não está disponível para convidados.',
            },
          });
        const target = await prisma.user.findUnique({
          where: { id: targetUserId },
          select: { id: true, displayName: true },
        });
        if (!target)
          return res.status(404).json({
            error: { code: 'PERSON_NOT_FOUND', message: 'Pessoa não encontrada neste espaço.' },
          });
        const directKey = [req.userId!, targetUserId].sort().join(':');
        let conversation;
        try {
          conversation = await prisma.conversation.upsert({
            where: { directKey },
            update: {},
            create: {
              type: 'DIRECT',
              name: target.displayName,
              workspaceId,
              directKey,
              createdById: req.userId!,
              members: { create: [{ userId: req.userId! }, { userId: targetUserId }] },
            },
            include: conversationMembersInclude,
          });
        } catch (error) {
          if ((error as { code?: string }).code !== 'P2002') throw error;
          conversation = await prisma.conversation.findUnique({
            where: { directKey },
            include: conversationMembersInclude,
          });
          if (!conversation) throw error;
        }
        await io
          .in([`user:${req.userId}`, `user:${targetUserId}`])
          .socketsJoin(`conversation:${conversation.id}`);
        io.to([`user:${req.userId}`, `user:${targetUserId}`]).emit('conversation:updated', {
          conversationId: conversation.id,
        });
        return res.status(200).json(conversationDto(conversation, req.userId!));
      } catch (error) {
        return next(error);
      }
    },
  );

  router.post('/workspaces/:workspaceId/conversations', requireAuth, async (req, res, next) => {
    try {
      const workspaceId = getRouteParam(req.params.workspaceId);
      const input = groupConversationCreateInputSchema.safeParse(req.body);
      if (!input.success) {
        return res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Confira o nome e as pessoas do grupo.' },
        });
      }
      if (input.data.userIds.includes(req.userId!))
        return res.status(400).json({
          error: {
            code: 'GROUP_MEMBER_DUPLICATE',
            message: 'Você será incluído automaticamente no grupo.',
          },
        });
      const requestedUserIds = [...input.data.userIds, req.userId!];
      const workspaceMembers = await prisma.workspaceMember.findMany({
        where: { workspaceId, userId: { in: requestedUserIds } },
        select: { userId: true, role: true },
      });
      if (workspaceMembers.length !== requestedUserIds.length)
        return res.status(404).json({
          error: {
            code: 'PERSON_NOT_FOUND',
            message: 'Todas as pessoas precisam pertencer ao espaço.',
          },
        });
      if (workspaceMembers.some(({ role }) => role === 'GUEST'))
        return res.status(403).json({
          error: {
            code: 'GUEST_DIRECTORY_RESTRICTED',
            message: 'Grupos não estão disponíveis para convidados.',
          },
        });
      const conversation = await prisma.conversation.create({
        data: {
          type: 'GROUP',
          name: input.data.name,
          avatarUrl: input.data.avatarUrl ?? null,
          workspaceId,
          createdById: req.userId!,
          members: { create: requestedUserIds.map((userId) => ({ userId })) },
        },
        include: conversationMembersInclude,
      });
      await io
        .in(requestedUserIds.map((userId) => `user:${userId}`))
        .socketsJoin(`conversation:${conversation.id}`);
      io.to(requestedUserIds.map((userId) => `user:${userId}`)).emit('conversation:updated', {
        conversationId: conversation.id,
      });
      return res.status(201).json(conversationDto(conversation, req.userId!));
    } catch (error) {
      return next(error);
    }
  });

  router.patch('/conversations/:conversationId', requireAuth, async (req, res, next) => {
    try {
      const conversationId = getRouteParam(req.params.conversationId);
      const input = groupConversationUpdateInputSchema.safeParse(req.body);
      if (!input.success)
        return res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Confira os dados do grupo.' },
        });
      const conversation = await prisma.conversation.findFirst({
        where: {
          id: conversationId,
          type: 'GROUP',
          members: { some: { userId: req.userId! } },
        },
        select: { createdById: true },
      });
      if (!conversation)
        return res.status(404).json({
          error: { code: 'CONVERSATION_NOT_FOUND', message: 'Grupo não encontrado.' },
        });
      if (conversation.createdById && conversation.createdById !== req.userId)
        return res.status(403).json({
          error: {
            code: 'FORBIDDEN',
            message: 'Somente quem criou o grupo pode editar seus dados.',
          },
        });
      const updated = await prisma.conversation.update({
        where: { id: conversationId },
        data: input.data,
        select: { id: true, name: true, description: true, avatarUrl: true },
      });
      io.to(`conversation:${conversationId}`).emit('conversation:updated', { conversationId });
      return res.json(updated);
    } catch (error) {
      return next(error);
    }
  });

  router.patch('/conversations/:conversationId/preference', requireAuth, async (req, res, next) => {
    try {
      const conversationId = getRouteParam(req.params.conversationId);
      const input = conversationPreferenceInputSchema.safeParse(req.body);
      if (!input.success)
        return res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Informe ao menos uma preferência válida.' },
        });
      const membership = await prisma.conversationMember.findUnique({
        where: { conversationId_userId: { conversationId, userId: req.userId! } },
        select: { userId: true },
      });
      if (!membership)
        return res.status(404).json({
          error: { code: 'CONVERSATION_NOT_FOUND', message: 'Conversa não encontrada.' },
        });
      return res.json(
        await prisma.conversationMember.update({
          where: { conversationId_userId: { conversationId, userId: req.userId! } },
          data: input.data,
          select: { muted: true, pinned: true },
        }),
      );
    } catch (error) {
      return next(error);
    }
  });

  router.post('/conversations/:conversationId/members', requireAuth, async (req, res, next) => {
    try {
      const conversationId = getRouteParam(req.params.conversationId);
      const input = memberInputSchema.safeParse(req.body);
      if (!input.success)
        return res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Selecione uma pessoa válida.' },
        });
      const targetUserId = input.data.userId;
      const conversation = await prisma.conversation.findFirst({
        where: {
          id: conversationId,
          type: 'GROUP',
          members: { some: { userId: req.userId! } },
        },
        select: { workspaceId: true, createdById: true },
      });
      if (!conversation)
        return res.status(404).json({
          error: { code: 'CONVERSATION_NOT_FOUND', message: 'Grupo não encontrado.' },
        });
      if (conversation.createdById && conversation.createdById !== req.userId)
        return res.status(403).json({
          error: {
            code: 'FORBIDDEN',
            message: 'Somente quem criou o grupo pode adicionar pessoas.',
          },
        });
      const targetMembership = conversation.workspaceId
        ? await prisma.workspaceMember.findUnique({
            where: {
              workspaceId_userId: { workspaceId: conversation.workspaceId, userId: targetUserId },
            },
            select: { role: true },
          })
        : await prisma.workspaceMember.findFirst({
            where: {
              userId: targetUserId,
              workspace: { members: { some: { userId: req.userId! } } },
            },
            select: { role: true },
          });
      if (!targetMembership || targetMembership.role === 'GUEST')
        return res.status(404).json({
          error: { code: 'PERSON_NOT_FOUND', message: 'Pessoa não encontrada neste espaço.' },
        });
      const addResult = await prisma.$transaction(async (transaction) => {
        await transaction.$queryRaw<{ id: string }[]>`
          SELECT "id" FROM "Conversation" WHERE "id" = ${conversationId} FOR UPDATE
        `;
        const existing = await transaction.conversationMember.findUnique({
          where: { conversationId_userId: { conversationId, userId: targetUserId } },
          select: { userId: true },
        });
        if (existing) return { added: false, limitReached: false };
        if ((await transaction.conversationMember.count({ where: { conversationId } })) >= 50)
          return { added: false, limitReached: true };
        await transaction.conversationMember.create({
          data: { conversationId, userId: targetUserId },
        });
        await transaction.conversation.update({
          where: { id: conversationId },
          data: { updatedAt: new Date() },
        });
        return { added: true, limitReached: false };
      });
      if (addResult.limitReached)
        return res.status(409).json({
          error: { code: 'GROUP_MEMBER_LIMIT', message: 'O grupo chegou ao limite de 50 pessoas.' },
        });
      await io.in(`user:${targetUserId}`).socketsJoin(`conversation:${conversationId}`);
      if (addResult.added)
        io.to(`conversation:${conversationId}`).emit('conversation:updated', { conversationId });
      return res.status(204).end();
    } catch (error) {
      return next(error);
    }
  });

  router.delete(
    '/conversations/:conversationId/members/:userId',
    requireAuth,
    async (req, res, next) => {
      try {
        const conversationId = getRouteParam(req.params.conversationId);
        const targetUserId = getRouteParam(req.params.userId);
        const conversation = await prisma.conversation.findFirst({
          where: {
            id: conversationId,
            type: 'GROUP',
            members: { some: { userId: req.userId! } },
          },
          select: {
            createdById: true,
            members: { select: { userId: true, joinedAt: true } },
          },
        });
        if (!conversation)
          return res.status(404).json({
            error: { code: 'CONVERSATION_NOT_FOUND', message: 'Grupo não encontrado.' },
          });
        if (targetUserId !== req.userId && conversation.createdById !== req.userId)
          return res.status(403).json({
            error: { code: 'FORBIDDEN', message: 'Você só pode sair do grupo.' },
          });
        if (!conversation.members.some(({ userId }) => userId === targetUserId))
          return res.status(404).json({
            error: {
              code: 'CONVERSATION_MEMBER_NOT_FOUND',
              message: 'Pessoa não encontrada no grupo.',
            },
          });
        await prisma.$transaction(async (transaction) => {
          await transaction.conversationMember.delete({
            where: { conversationId_userId: { conversationId, userId: targetUserId } },
          });
          const nextCreator =
            conversation.createdById === targetUserId
              ? await transaction.conversationMember.findFirst({
                  where: { conversationId },
                  orderBy: { joinedAt: 'asc' },
                  select: { userId: true },
                })
              : null;
          await transaction.conversation.update({
            where: { id: conversationId },
            data: {
              updatedAt: new Date(),
              ...(conversation.createdById === targetUserId
                ? { createdById: nextCreator?.userId ?? null }
                : {}),
            },
          });
        });
        io.to(`conversation:${conversationId}`).emit('conversation:updated', { conversationId });
        await io.in(`user:${targetUserId}`).socketsLeave(`conversation:${conversationId}`);
        return res.status(204).end();
      } catch (error) {
        return next(error);
      }
    },
  );

  router.post('/conversations/:conversationId/read', requireAuth, async (req, res, next) => {
    try {
      const conversationId = getRouteParam(req.params.conversationId);
      const membership = await prisma.conversationMember.findUnique({
        where: { conversationId_userId: { conversationId, userId: req.userId! } },
        select: { userId: true },
      });
      if (!membership) {
        return res.status(404).json({
          error: { code: 'CONVERSATION_NOT_FOUND', message: 'Conversa não encontrada.' },
        });
      }
      const { lastReadAt } = await prisma.conversationMember.update({
        where: { conversationId_userId: { conversationId, userId: req.userId! } },
        data: { lastReadAt: new Date() },
        select: { lastReadAt: true },
      });
      const serialized = lastReadAt!.toISOString();
      io.to(`user:${req.userId}`).emit('read:updated', {
        targetType: 'CONVERSATION',
        targetId: conversationId,
        lastReadAt: serialized,
      });
      return res.json({ lastReadAt: serialized });
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
      const lastReadAt = membership.lastReadAt ?? membership.joinedAt;
      const unreadCount = await countUnreadMessages({ conversationId }, req.userId!, lastReadAt);
      return res.json({ ...page, lastReadAt: lastReadAt.toISOString(), unreadCount });
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
      if (!(await mentionsAreAvailable(text, { conversationId }))) {
        return invalidMentionResponse(res);
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

  router.post('/channels/:channelId/read', requireAuth, async (req, res, next) => {
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

      const { lastReadAt } = await prisma.channelReadState.upsert({
        where: { channelId_userId: { channelId, userId: req.userId! } },
        create: { channelId, userId: req.userId!, lastReadAt: new Date() },
        update: { lastReadAt: new Date() },
        select: { lastReadAt: true },
      });
      const serialized = lastReadAt.toISOString();
      io.to(`user:${req.userId}`).emit('read:updated', {
        targetType: 'CHANNEL',
        targetId: channelId,
        lastReadAt: serialized,
      });
      return res.json({ lastReadAt: serialized });
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
      const readState = await prisma.channelReadState.findUnique({
        where: { channelId_userId: { channelId, userId: req.userId! } },
        select: { lastReadAt: true },
      });
      const joinedAt =
        context.channel.visibility === 'PUBLIC'
          ? context.teamMembership?.joinedAt
          : context.channel.members[0]?.joinedAt;
      const lastReadAt = readState?.lastReadAt ?? joinedAt ?? context.channel.createdAt;
      const unreadCount = await countUnreadMessages({ channelId }, req.userId!, lastReadAt);
      return res.json({ ...page, lastReadAt: lastReadAt.toISOString(), unreadCount });
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
      if (!(await mentionsAreAvailable(parsedBody.data.text, { channelId }))) {
        return invalidMentionResponse(res);
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
      const target = access.message.conversationId
        ? { conversationId: access.message.conversationId }
        : { channelId: access.message.channelId! };
      if (!(await mentionsAreAvailable(text, target))) return invalidMentionResponse(res);
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
      const target = access.message.conversationId
        ? { conversationId: access.message.conversationId }
        : { channelId: access.message.channelId! };
      if (!(await mentionsAreAvailable(parsedBody.data.text, target))) {
        return invalidMentionResponse(res);
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
