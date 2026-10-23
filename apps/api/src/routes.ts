import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import type { Server } from 'socket.io';
import {
  MAX_ATTACHMENT_SIZE_BYTES,
  attachmentDownloadQuerySchema,
  conversationPreferenceInputSchema,
  directConversationCreateInputSchema,
  fileListQuerySchema,
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
import { env } from './env.js';
import { attachAuthSocketServer, authRouter } from './auth/routes.js';
import { createOrganizationRouter, getChannelContext } from './organization/routes.js';
import { isAllowedAttachment, sanitizeAttachmentFileName } from './storage/files.js';
import { storageProvider } from './storage/provider.js';
import { createActivityRouter } from './notifications/routes.js';
import { notifyMessageCreated, notifyReactionAdded } from './notifications/service.js';
import { createSearchRouter } from './search/routes.js';

const getRouteParam = (value: string | string[] | undefined) =>
  Array.isArray(value) ? (value[0] ?? '') : (value ?? '');

function withReactionCounts<
  T extends {
    reactions: { emoji: string; user: { id: string; displayName: string } }[];
    attachments: {
      id: string;
      fileName: string;
      mimeType: string;
      sizeBytes: bigint;
      createdAt: Date;
      uploadedAt: Date | null;
      storageKey: string;
    }[];
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
    attachments: message.attachments.map(
      ({ id, fileName, mimeType, sizeBytes, createdAt, uploadedAt }) => ({
        id,
        fileName,
        mimeType,
        sizeBytes: Number(sizeBytes),
        createdAt,
        uploadedAt,
      }),
    ),
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
  attachments: {
    select: {
      id: true,
      fileName: true,
      mimeType: true,
      sizeBytes: true,
      storageKey: true,
      createdAt: true,
      uploadedAt: true,
    },
  },
  _count: { select: { replies: { where: { deletedAt: null } } } },
} as const;

type MessageTarget = { conversationId: string } | { channelId: string };

type PreparedAttachment = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: bigint;
  storageKey: string;
};

function prepareAttachments(
  inputs: { fileName: string; mimeType: string; sizeBytes: number }[],
  userId: string,
) {
  const attachments: PreparedAttachment[] = [];
  for (const input of inputs) {
    const fileName = sanitizeAttachmentFileName(input.fileName);
    if (
      input.sizeBytes > Math.min(MAX_ATTACHMENT_SIZE_BYTES, env.STORAGE_MAX_FILE_SIZE_BYTES) ||
      !isAllowedAttachment(fileName, input.mimeType)
    )
      return null;
    const id = randomUUID();
    attachments.push({
      id,
      fileName,
      mimeType: input.mimeType,
      sizeBytes: BigInt(input.sizeBytes),
      storageKey: `attachments/${userId}/${id}`,
    });
  }
  return attachments;
}

function attachmentsMatch(
  existing: { fileName: string; mimeType: string; sizeBytes: bigint }[],
  requested: PreparedAttachment[],
) {
  const normalize = (items: { fileName: string; mimeType: string; sizeBytes: bigint }[]) =>
    items
      .map(({ fileName, mimeType, sizeBytes }) => `${fileName}\u0000${mimeType}\u0000${sizeBytes}`)
      .sort();
  return (
    JSON.stringify(normalize(existing)) ===
    JSON.stringify(
      normalize(
        requested.map(({ fileName, mimeType, sizeBytes }) => ({
          fileName,
          mimeType,
          sizeBytes,
        })),
      ),
    )
  );
}

async function withUploadForms<
  T extends {
    reactions: { emoji: string; user: { id: string; displayName: string } }[];
    _count: { replies: number };
    attachments: {
      id: string;
      fileName: string;
      mimeType: string;
      sizeBytes: bigint;
      createdAt: Date;
      storageKey: string;
      uploadedAt: Date | null;
    }[];
  },
>(message: T) {
  const uploads = await Promise.all(
    message.attachments
      .filter((attachment) => !attachment.uploadedAt)
      .map(async (attachment) => ({
        attachmentId: attachment.id,
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        sizeBytes: Number(attachment.sizeBytes),
        ...(await storageProvider.createUploadForm(attachment.storageKey, attachment.mimeType)),
      })),
  );
  return { ...withReactionCounts(message), uploads };
}

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
      notificationLevel: 'ALL' | 'MENTIONS' | 'MUTED';
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
    muted: Boolean(currentMember?.muted || currentMember?.notificationLevel === 'MUTED'),
    pinned: currentMember?.pinned ?? false,
    notificationLevel: currentMember?.notificationLevel ?? 'ALL',
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
  router.use('/activity', createActivityRouter());
  router.use('/search', createSearchRouter());
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
                select: { text: true, createdAt: true, attachments: { select: { id: true } } },
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
            preview:
              conversation.messages[0]?.text ||
              (conversation.messages[0]?.attachments.length ? 'Anexo' : undefined),
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
          data: {
            ...input.data,
            ...(input.data.muted !== undefined
              ? { notificationLevel: input.data.muted ? 'MUTED' : 'ALL' }
              : {}),
            ...(input.data.notificationLevel
              ? {
                  muted: input.data.notificationLevel === 'MUTED',
                  notificationLevel: input.data.notificationLevel,
                }
              : {}),
          },
          select: { muted: true, pinned: true, notificationLevel: true },
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
            message: 'Escreva uma mensagem ou anexe arquivos permitidos (até 25 MiB cada).',
          },
        });
      }
      const { text, clientMessageId, attachments: attachmentInputs } = parsedBody.data;
      const membership = await prisma.conversationMember.findUnique({
        where: { conversationId_userId: { conversationId, userId: req.userId! } },
      });
      if (!membership) {
        return res.status(404).json({
          error: { code: 'CONVERSATION_NOT_FOUND', message: 'Conversa não encontrada.' },
        });
      }
      const attachmentRecords = prepareAttachments(attachmentInputs, req.userId!);
      if (!attachmentRecords) {
        return res.status(400).json({
          error: {
            code: 'ATTACHMENT_NOT_ALLOWED',
            message: 'Confira o tipo, a extensão e o tamanho dos arquivos anexados.',
          },
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
        if (existingMessage) {
          if (!attachmentsMatch(existingMessage.attachments, attachmentRecords)) {
            return res.status(409).json({
              error: {
                code: 'IDEMPOTENCY_KEY_REUSED',
                message: 'Este identificador já foi usado com outro conteúdo.',
              },
            });
          }
          return res.status(200).json(await withUploadForms(existingMessage));
        }
      }
      const createMessageData = {
        conversationId,
        authorId: req.userId!,
        text,
        ...(clientMessageId ? { clientMessageId } : {}),
        ...(attachmentRecords.length ? { attachments: { create: attachmentRecords } } : {}),
      };
      const message = clientMessageId
        ? await prisma.message.upsert({
            where: {
              conversationId_authorId_clientMessageId: {
                conversationId,
                authorId: req.userId!,
                clientMessageId,
              },
            },
            create: createMessageData,
            update: {},
            include: messageInclude,
          })
        : await prisma.message.create({
            data: createMessageData,
            include: messageInclude,
          });
      if (!attachmentsMatch(message.attachments, attachmentRecords)) {
        return res.status(409).json({
          error: {
            code: 'IDEMPOTENCY_KEY_REUSED',
            message: 'Este identificador já foi usado com outro conteúdo.',
          },
        });
      }
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      });
      const normalizedMessage = withReactionCounts(message);
      io.to(`conversation:${conversationId}`).emit('message:created', {
        ...normalizedMessage,
        conversationId,
      });
      await notifyMessageCreated({
        messageId: message.id,
        authorId: req.userId!,
        text: message.text,
        conversationId,
      }).catch((error: unknown) => {
        console.error(
          'Could not record message activity:',
          error instanceof Error ? error.message : error,
        );
      });
      return res.status(201).json(await withUploadForms(message));
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
            message: 'Escreva uma mensagem ou anexe arquivos permitidos (até 25 MiB cada).',
          },
        });
      }
      const { text, clientMessageId, attachments: attachmentInputs } = parsedBody.data;
      const attachmentRecords = prepareAttachments(attachmentInputs, req.userId!);
      if (!attachmentRecords) {
        return res.status(400).json({
          error: {
            code: 'ATTACHMENT_NOT_ALLOWED',
            message: 'Confira o tipo, a extensão e o tamanho dos arquivos anexados.',
          },
        });
      }
      if (!(await mentionsAreAvailable(text, { channelId }))) {
        return invalidMentionResponse(res);
      }
      if (clientMessageId) {
        const existingMessage = await prisma.message.findUnique({
          where: {
            channelId_authorId_clientMessageId: {
              channelId,
              authorId: req.userId!,
              clientMessageId,
            },
          },
          include: messageInclude,
        });
        if (existingMessage) {
          if (!attachmentsMatch(existingMessage.attachments, attachmentRecords)) {
            return res.status(409).json({
              error: {
                code: 'IDEMPOTENCY_KEY_REUSED',
                message: 'Este identificador já foi usado com outro conteúdo.',
              },
            });
          }
          return res.status(200).json(await withUploadForms(existingMessage));
        }
      }
      const createMessageData = {
        channelId,
        authorId: req.userId!,
        text,
        ...(clientMessageId ? { clientMessageId } : {}),
        ...(attachmentRecords.length ? { attachments: { create: attachmentRecords } } : {}),
      };
      const message = clientMessageId
        ? await prisma.message.upsert({
            where: {
              channelId_authorId_clientMessageId: {
                channelId,
                authorId: req.userId!,
                clientMessageId,
              },
            },
            create: createMessageData,
            update: {},
            include: messageInclude,
          })
        : await prisma.message.create({
            data: createMessageData,
            include: messageInclude,
          });
      if (!attachmentsMatch(message.attachments, attachmentRecords)) {
        return res.status(409).json({
          error: {
            code: 'IDEMPOTENCY_KEY_REUSED',
            message: 'Este identificador já foi usado com outro conteúdo.',
          },
        });
      }
      await prisma.channel.update({ where: { id: channelId }, data: { updatedAt: new Date() } });
      const normalizedMessage = withReactionCounts(message);
      io.to(`channel:${channelId}`).emit('message:created', {
        ...normalizedMessage,
        channelId,
      });
      await notifyMessageCreated({
        messageId: message.id,
        authorId: req.userId!,
        text: message.text,
        channelId,
      }).catch((error: unknown) => {
        console.error(
          'Could not record message activity:',
          error instanceof Error ? error.message : error,
        );
      });
      return res.status(201).json(await withUploadForms(message));
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

      if (parsedBody.data.attachments.length) {
        return res.status(400).json({
          error: {
            code: 'ATTACHMENTS_NOT_ALLOWED_IN_THREAD',
            message: 'Envie anexos em uma nova mensagem da conversa.',
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
      await notifyMessageCreated({
        messageId: reply.id,
        authorId: req.userId!,
        text: reply.text,
        replyToId: reply.replyToId,
        ...(access.message.conversationId
          ? { conversationId: access.message.conversationId }
          : { channelId: access.message.channelId! }),
      }).catch((error: unknown) => {
        console.error(
          'Could not record reply activity:',
          error instanceof Error ? error.message : error,
        );
      });

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
      const reactionCreatedAt = new Date();
      const createdReaction = await prisma.reaction.createMany({
        data: {
          messageId,
          userId: req.userId!,
          emoji: parsedBody.data.emoji,
          createdAt: reactionCreatedAt,
        },
        skipDuplicates: true,
      });
      const updatedMessage = await prisma.message.findUniqueOrThrow({
        where: { id: messageId },
        include: messageInclude,
      });
      const normalizedMessage = withReactionCounts(updatedMessage);
      if (createdReaction.count) {
        io.to(access.room).emit('reaction:added', normalizedMessage);
        await notifyReactionAdded({
          messageId,
          actorId: req.userId!,
          emoji: parsedBody.data.emoji,
          reactionCreatedAt,
          recipientId: access.message.authorId,
          conversationId: access.message.conversationId,
          channelId: access.message.channelId,
        }).catch((error: unknown) => {
          console.error(
            'Could not record reaction activity:',
            error instanceof Error ? error.message : error,
          );
        });
      }
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

  router.post('/attachments/:attachmentId/complete', requireAuth, async (req, res, next) => {
    try {
      const attachmentId = getRouteParam(req.params.attachmentId);
      const attachment = await prisma.attachment.findUnique({
        where: { id: attachmentId },
        select: {
          id: true,
          messageId: true,
          fileName: true,
          mimeType: true,
          sizeBytes: true,
          storageKey: true,
          uploadedAt: true,
          createdAt: true,
          message: { select: { authorId: true, deletedAt: true } },
        },
      });
      if (!attachment || attachment.message.deletedAt)
        return res.status(404).json({
          error: { code: 'ATTACHMENT_NOT_FOUND', message: 'Anexo não encontrado.' },
        });

      const access = await findAuthorizedMessage(attachment.messageId, req.userId!);
      if (!access.allowed)
        return res
          .status(access.status)
          .json({ error: { code: access.code, message: access.message } });
      if (attachment.message.authorId !== req.userId!)
        return res.status(403).json({
          error: {
            code: 'FORBIDDEN',
            message: 'Somente quem enviou o anexo pode concluir o upload.',
          },
        });

      let newlyUploaded = false;
      if (!attachment.uploadedAt) {
        const verified = await storageProvider.verifyUpload(
          attachment.storageKey,
          attachment.fileName,
          attachment.mimeType,
          Number(attachment.sizeBytes),
        );
        if (!verified) {
          await storageProvider.deleteObject(attachment.storageKey).catch(() => undefined);
          await prisma.attachment.deleteMany({ where: { id: attachment.id, uploadedAt: null } });
          return res.status(400).json({
            error: {
              code: 'ATTACHMENT_INVALID',
              message: 'O arquivo enviado não corresponde ao tipo ou tamanho informado.',
            },
          });
        }
        const updated = await prisma.attachment.updateMany({
          where: { id: attachment.id, uploadedAt: null },
          data: { uploadedAt: new Date() },
        });
        newlyUploaded = updated.count > 0;
      }

      const completed = await prisma.attachment.findUniqueOrThrow({
        where: { id: attachment.id },
        select: {
          id: true,
          fileName: true,
          mimeType: true,
          sizeBytes: true,
          createdAt: true,
          uploadedAt: true,
        },
      });
      const response = {
        ...completed,
        sizeBytes: Number(completed.sizeBytes),
        uploadedAt: completed.uploadedAt?.toISOString() ?? null,
        createdAt: completed.createdAt.toISOString(),
      };
      if (newlyUploaded)
        io.to(access.room).emit('attachment:ready', {
          messageId: attachment.messageId,
          conversationId: access.message.conversationId,
          channelId: access.message.channelId,
          attachment: response,
        });
      return res.json(response);
    } catch (error) {
      return next(error);
    }
  });

  router.get('/attachments/:attachmentId/download-url', requireAuth, async (req, res, next) => {
    try {
      const parsedQuery = attachmentDownloadQuerySchema.safeParse(req.query);
      if (!parsedQuery.success)
        return res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Informe uma forma de exibição válida.' },
        });
      const attachment = await prisma.attachment.findFirst({
        where: { id: getRouteParam(req.params.attachmentId), uploadedAt: { not: null } },
        select: {
          id: true,
          messageId: true,
          fileName: true,
          mimeType: true,
          storageKey: true,
        },
      });
      if (!attachment)
        return res.status(404).json({
          error: { code: 'ATTACHMENT_NOT_FOUND', message: 'Anexo não encontrado.' },
        });

      const access = await findAuthorizedMessage(attachment.messageId, req.userId!);
      if (!access.allowed)
        return res
          .status(access.status)
          .json({ error: { code: access.code, message: access.message } });
      const url = await storageProvider.createDownloadUrl(
        attachment.storageKey,
        attachment.fileName,
        attachment.mimeType,
        parsedQuery.data.disposition,
      );
      return res.json({ url, expiresIn: 300 });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/files', requireAuth, async (req, res, next) => {
    try {
      const parsedQuery = fileListQuerySchema.safeParse(req.query);
      if (!parsedQuery.success)
        return res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Os filtros de arquivos são inválidos.' },
        });
      const { query, sortBy, limit } = parsedQuery.data;
      const accessRules = [
        { message: { conversation: { members: { some: { userId: req.userId! } } } } },
        {
          message: {
            channel: {
              visibility: 'PUBLIC' as const,
              archivedAt: null,
              team: { archivedAt: null, members: { some: { userId: req.userId! } } },
            },
          },
        },
        {
          message: {
            channel: {
              visibility: 'PRIVATE' as const,
              archivedAt: null,
              team: { archivedAt: null },
              members: { some: { userId: req.userId! } },
            },
          },
        },
      ];
      const searchRules = query
        ? [
            {
              OR: [
                { fileName: { contains: query, mode: 'insensitive' as const } },
                { message: { text: { contains: query, mode: 'insensitive' as const } } },
                {
                  message: {
                    author: { displayName: { contains: query, mode: 'insensitive' as const } },
                  },
                },
                {
                  message: { channel: { name: { contains: query, mode: 'insensitive' as const } } },
                },
              ],
            },
          ]
        : [];
      const where = {
        uploadedAt: { not: null },
        message: { deletedAt: null },
        AND: [{ OR: accessRules }, ...searchRules],
      };
      const orderBy =
        sortBy === 'name'
          ? [{ fileName: 'asc' as const }, { id: 'asc' as const }]
          : sortBy === 'size'
            ? [{ sizeBytes: 'desc' as const }, { createdAt: 'desc' as const }]
            : [{ createdAt: 'desc' as const }, { id: 'desc' as const }];
      const [files, total] = await Promise.all([
        prisma.attachment.findMany({
          where,
          orderBy,
          take: limit + 1,
          include: {
            message: {
              select: {
                id: true,
                text: true,
                createdAt: true,
                author: { select: { id: true, displayName: true } },
                channel: { select: { id: true, name: true, team: { select: { name: true } } } },
                conversation: { select: { id: true, name: true } },
              },
            },
          },
        }),
        prisma.attachment.count({ where }),
      ]);
      const hasMore = files.length > limit;
      const items = files
        .slice(0, limit)
        .map(({ storageKey: _storageKey, sizeBytes, ...file }) => ({
          ...file,
          sizeBytes: Number(sizeBytes),
          message: {
            ...file.message,
            createdAt: file.message.createdAt.toISOString(),
            location: file.message.channel
              ? {
                  type: 'CHANNEL' as const,
                  channelId: file.message.channel.id,
                  channelName: file.message.channel.name,
                  teamName: file.message.channel.team.name,
                }
              : {
                  type: 'CHAT' as const,
                  conversationId: file.message.conversation?.id ?? null,
                  conversationName: file.message.conversation?.name ?? 'Chat',
                },
          },
          createdAt: file.createdAt.toISOString(),
          uploadedAt: file.uploadedAt?.toISOString() ?? null,
        }));
      return res.json({ items, total, hasMore });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/channels/:channelId/files', requireAuth, async (req, res, next) => {
    try {
      const channelId = getRouteParam(req.params.channelId);
      const context = await getChannelContext(channelId, req.userId!);
      if (!context)
        return res
          .status(404)
          .json({ error: { code: 'CHANNEL_NOT_FOUND', message: 'Canal não encontrado.' } });
      if (!context.isMember)
        return res.status(403).json({
          error: {
            code: 'CHANNEL_MEMBERSHIP_REQUIRED',
            message: 'Entre na equipe para acessar os arquivos deste canal.',
          },
        });
      const parsedQuery = fileListQuerySchema.safeParse(req.query);
      if (!parsedQuery.success)
        return res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Os filtros de arquivos são inválidos.' },
        });
      const { query, sortBy, limit } = parsedQuery.data;
      const where = {
        uploadedAt: { not: null },
        message: {
          channelId,
          deletedAt: null,
        },
        ...(query
          ? {
              OR: [
                { fileName: { contains: query, mode: 'insensitive' as const } },
                { message: { text: { contains: query, mode: 'insensitive' as const } } },
                {
                  message: {
                    author: { displayName: { contains: query, mode: 'insensitive' as const } },
                  },
                },
              ],
            }
          : {}),
      };
      const orderBy =
        sortBy === 'name'
          ? [{ fileName: 'asc' as const }, { id: 'asc' as const }]
          : sortBy === 'size'
            ? [{ sizeBytes: 'desc' as const }, { createdAt: 'desc' as const }]
            : [{ createdAt: 'desc' as const }, { id: 'desc' as const }];
      const [files, total] = await Promise.all([
        prisma.attachment.findMany({
          where,
          orderBy,
          take: limit + 1,
          include: {
            message: {
              select: {
                id: true,
                text: true,
                createdAt: true,
                author: { select: { id: true, displayName: true } },
                channel: { select: { id: true, name: true, team: { select: { name: true } } } },
              },
            },
          },
        }),
        prisma.attachment.count({ where }),
      ]);
      const hasMore = files.length > limit;
      const items = files
        .slice(0, limit)
        .map(({ storageKey: _storageKey, sizeBytes, ...file }) => ({
          ...file,
          sizeBytes: Number(sizeBytes),
          createdAt: file.createdAt.toISOString(),
          uploadedAt: file.uploadedAt?.toISOString() ?? null,
          message: { ...file.message, createdAt: file.message.createdAt.toISOString() },
        }));
      return res.json({ items, total, hasMore });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
