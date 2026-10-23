import { createHash, randomBytes } from 'node:crypto';
import { Router, type Response } from 'express';
import {
  channelCreateInputSchema,
  channelPreferenceInputSchema,
  channelUpdateInputSchema,
  memberInputSchema,
  teamCreateInputSchema,
  teamUpdateInputSchema,
  workspaceCreateInputSchema,
  workspaceInviteInputSchema,
  workspaceInviteAcceptInputSchema,
  workspaceMemberRoleUpdateInputSchema,
  workspaceUpdateInputSchema,
} from '@rocket/shared';
import type { Server } from 'socket.io';
import type { WorkspaceRole } from '../generated/prisma/client.js';
import { env } from '../env.js';
import { mailProvider } from '../mail/provider.js';
import { requireAuth } from '../auth.js';
import { prisma } from '../lib/prisma.js';
import { notifyInviteAccepted } from '../notifications/service.js';

const router = Router();
let socketServer: Server | undefined;
const inviteLifetimeMs = 7 * 24 * 60 * 60 * 1000;
const roleCanManage = (role: WorkspaceRole) => role === 'OWNER' || role === 'ADMIN';

function routeParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

function fail(res: Response, status: number, code: string, message: string) {
  return res.status(status).json({ error: { code, message } });
}

function slugify(value: string, fallback: string) {
  return (
    value
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || fallback
  );
}

function hashInviteToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

async function getWorkspaceRole(userId: string, workspaceId: string) {
  return prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { role: true },
  });
}

async function requireWorkspaceMember(userId: string, workspaceId: string, res: Response) {
  const membership = await getWorkspaceRole(userId, workspaceId);
  if (!membership) {
    fail(res, 404, 'WORKSPACE_NOT_FOUND', 'Espaço de trabalho não encontrado.');
    return null;
  }
  return membership.role;
}

async function requireWorkspaceAdmin(userId: string, workspaceId: string, res: Response) {
  const role = await requireWorkspaceMember(userId, workspaceId, res);
  if (!role) return null;
  if (!roleCanManage(role)) {
    fail(res, 403, 'FORBIDDEN', 'Somente proprietários e administradores podem fazer isso.');
    return null;
  }
  return role;
}

async function getChannelContext(channelId: string, userId: string) {
  const channel = await prisma.channel.findFirst({
    where: { id: channelId, archivedAt: null, team: { archivedAt: null } },
    include: {
      team: { select: { id: true, workspaceId: true, name: true, slug: true } },
      members: { where: { userId }, select: { userId: true, joinedAt: true } },
      preferences: {
        where: { userId },
        select: { favorite: true, hidden: true, notificationLevel: true },
      },
    },
  });
  if (!channel) return null;
  const workspaceMembership = await getWorkspaceRole(userId, channel.team.workspaceId);
  if (!workspaceMembership) return null;
  const teamMembership = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId: channel.teamId, userId } },
    select: { userId: true, joinedAt: true },
  });
  const isMember =
    channel.visibility === 'PUBLIC' ? Boolean(teamMembership) : channel.members.length > 0;
  return { channel, role: workspaceMembership.role, isMember, teamMembership };
}

router.use(requireAuth);

router.get('/workspaces', async (req, res, next) => {
  try {
    const memberships = await prisma.workspaceMember.findMany({
      where: { userId: req.userId },
      include: { workspace: { select: { id: true, name: true, slug: true } } },
      orderBy: { joinedAt: 'asc' },
    });
    return res.json(memberships.map(({ workspace, role }) => ({ ...workspace, role })));
  } catch (error) {
    return next(error);
  }
});

router.post('/workspaces', async (req, res, next) => {
  try {
    const parsed = workspaceCreateInputSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, 'VALIDATION_ERROR', 'Informe o nome do espaço.');

    const baseSlug = slugify(parsed.data.name, 'workspace');
    const workspace = await prisma.workspace.create({
      data: {
        name: parsed.data.name,
        slug: `${baseSlug}-${randomBytes(3).toString('hex')}`,
        members: { create: { userId: req.userId!, role: 'OWNER' } },
        teams: {
          create: {
            name: 'Geral',
            slug: 'geral',
            description: 'Equipe principal do espaço de trabalho.',
            members: { create: { userId: req.userId! } },
            channels: {
              create: {
                name: 'geral',
                slug: 'geral',
                description: 'Avisos e alinhamentos gerais.',
                visibility: 'PUBLIC',
              },
            },
          },
        },
      },
      select: { id: true, name: true, slug: true },
    });
    return res.status(201).json({ ...workspace, role: 'OWNER' });
  } catch (error) {
    return next(error);
  }
});

router.get('/workspaces/:workspaceId', async (req, res, next) => {
  try {
    const workspaceId = routeParam(req.params.workspaceId);
    const role = await requireWorkspaceMember(req.userId!, workspaceId, res);
    if (!role) return;

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        id: true,
        name: true,
        slug: true,
        teams: {
          where: {
            archivedAt: null,
            ...(role === 'GUEST' ? { members: { some: { userId: req.userId } } } : {}),
          },
          orderBy: { name: 'asc' },
          include: {
            members: {
              where: { userId: req.userId },
              select: { userId: true, joinedAt: true },
            },
            _count: { select: { members: true } },
            channels: {
              where: {
                archivedAt: null,
                OR: [
                  { visibility: 'PUBLIC' },
                  { members: { some: { userId: req.userId } } },
                  ...(roleCanManage(role) ? [{ visibility: 'PRIVATE' as const }] : []),
                ],
              },
              orderBy: { name: 'asc' },
              include: {
                members: {
                  where: { userId: req.userId },
                  select: { userId: true, joinedAt: true },
                },
                readStates: {
                  where: { userId: req.userId },
                  select: { lastReadAt: true },
                },
                preferences: {
                  where: { userId: req.userId },
                  select: { favorite: true, hidden: true, notificationLevel: true },
                },
                _count: { select: { members: true } },
              },
            },
          },
        },
      },
    });
    if (!workspace) return fail(res, 404, 'WORKSPACE_NOT_FOUND', 'Espaço não encontrado.');

    const unreadEntries = await Promise.all(
      workspace.teams.flatMap((team) =>
        team.channels.map(async (channel) => {
          const joined =
            channel.visibility === 'PUBLIC' ? team.members.length > 0 : channel.members.length > 0;
          if (!joined) return [channel.id, 0] as const;
          const lastReadAt =
            channel.readStates[0]?.lastReadAt ??
            (channel.visibility === 'PUBLIC'
              ? team.members[0]?.joinedAt
              : channel.members[0]?.joinedAt) ??
            channel.createdAt;
          const unread = await prisma.message.count({
            where: {
              channelId: channel.id,
              replyToId: null,
              deletedAt: null,
              authorId: { not: req.userId },
              createdAt: { gt: lastReadAt },
            },
          });
          return [channel.id, unread] as const;
        }),
      ),
    );
    const unreadByChannel = new Map(unreadEntries);

    return res.json({
      ...workspace,
      role,
      teams: workspace.teams.map((team) => ({
        id: team.id,
        name: team.name,
        slug: team.slug,
        description: team.description,
        joined: team.members.length > 0,
        memberCount: team._count.members,
        channels: team.channels.map((channel) => ({
          id: channel.id,
          name: channel.name,
          slug: channel.slug,
          description: channel.description,
          visibility: channel.visibility,
          joined:
            channel.visibility === 'PUBLIC' ? team.members.length > 0 : channel.members.length > 0,
          isFavorite: channel.preferences[0]?.favorite ?? false,
          isHidden: channel.preferences[0]?.hidden ?? false,
          notificationLevel: channel.preferences[0]?.notificationLevel ?? 'ALL',
          memberCount:
            channel.visibility === 'PUBLIC' ? team._count.members : channel._count.members,
          unread: unreadByChannel.get(channel.id) ?? 0,
        })),
      })),
    });
  } catch (error) {
    return next(error);
  }
});

router.patch('/workspaces/:workspaceId', async (req, res, next) => {
  try {
    const workspaceId = routeParam(req.params.workspaceId);
    if (!(await requireWorkspaceAdmin(req.userId!, workspaceId, res))) return;
    const parsed = workspaceUpdateInputSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, 'VALIDATION_ERROR', 'Nome do espaço inválido.');
    const workspace = await prisma.workspace.update({
      where: { id: workspaceId },
      data: parsed.data,
      select: { id: true, name: true, slug: true },
    });
    return res.json(workspace);
  } catch (error) {
    return next(error);
  }
});

router.get('/workspaces/:workspaceId/members', async (req, res, next) => {
  try {
    const workspaceId = routeParam(req.params.workspaceId);
    const role = await requireWorkspaceMember(req.userId!, workspaceId, res);
    if (!role) return;
    if (role === 'GUEST')
      return fail(
        res,
        403,
        'GUEST_DIRECTORY_RESTRICTED',
        'Convidados não podem consultar o diretório completo do espaço.',
      );
    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId },
      include: {
        user: {
          select: { id: true, email: true, username: true, displayName: true, avatarUrl: true },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });
    return res.json(members.map(({ role, user }) => ({ ...user, role })));
  } catch (error) {
    return next(error);
  }
});

router.patch('/workspaces/:workspaceId/members/:userId', async (req, res, next) => {
  try {
    const workspaceId = routeParam(req.params.workspaceId);
    const userId = routeParam(req.params.userId);
    const requesterRole = await requireWorkspaceAdmin(req.userId!, workspaceId, res);
    if (!requesterRole) return;
    const parsed = workspaceMemberRoleUpdateInputSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, 'VALIDATION_ERROR', 'Selecione uma função válida.');
    const member = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { role: true },
    });
    if (!member)
      return fail(res, 404, 'WORKSPACE_MEMBER_NOT_FOUND', 'Pessoa não encontrada no espaço.');
    if (member.role === 'OWNER')
      return fail(
        res,
        409,
        'OWNER_ROLE_PROTECTED',
        'A função de proprietário não pode ser alterada aqui.',
      );
    if (requesterRole === 'ADMIN' && (member.role === 'ADMIN' || parsed.data.role === 'ADMIN')) {
      return fail(
        res,
        403,
        'FORBIDDEN',
        'Somente o proprietário pode conceder ou alterar a função de administrador.',
      );
    }
    const channelsToLeave: string[] = [];
    const updated = await prisma.$transaction(async (transaction) => {
      if (parsed.data.role === 'GUEST' && member.role !== 'GUEST') {
        const teams = await transaction.team.findMany({
          where: { workspaceId },
          select: { id: true },
        });
        const teamIds = teams.map(({ id }) => id);
        const channels = await transaction.channel.findMany({
          where: { teamId: { in: teamIds } },
          select: { id: true },
        });
        channelsToLeave.push(...channels.map(({ id }) => id));
        await transaction.channelMember.deleteMany({
          where: { userId, channel: { teamId: { in: teamIds } } },
        });
        await transaction.teamMember.deleteMany({ where: { userId, teamId: { in: teamIds } } });
      }
      return transaction.workspaceMember.update({
        where: { workspaceId_userId: { workspaceId, userId } },
        data: { role: parsed.data.role },
        select: {
          role: true,
          user: {
            select: { id: true, email: true, username: true, displayName: true, avatarUrl: true },
          },
        },
      });
    });
    channelsToLeave.forEach(
      (id) => void socketServer?.in(`user:${userId}`).socketsLeave(`channel:${id}`),
    );
    return res.json({ ...updated.user, role: updated.role });
  } catch (error) {
    return next(error);
  }
});

router.delete('/workspaces/:workspaceId/members/:userId', async (req, res, next) => {
  try {
    const workspaceId = routeParam(req.params.workspaceId);
    const userId = routeParam(req.params.userId);
    const requesterRole = await requireWorkspaceAdmin(req.userId!, workspaceId, res);
    if (!requesterRole) return;
    const member = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { role: true },
    });
    if (!member)
      return fail(res, 404, 'WORKSPACE_MEMBER_NOT_FOUND', 'Pessoa não encontrada no espaço.');
    if (member.role === 'OWNER') {
      return fail(
        res,
        409,
        'OWNER_CANNOT_BE_REMOVED',
        'Transfira a propriedade antes de remover o proprietário.',
      );
    }
    if (requesterRole === 'ADMIN' && member.role === 'ADMIN') {
      return fail(
        res,
        403,
        'ADMIN_ROLE_PROTECTED',
        'Somente o proprietário pode remover uma pessoa administradora.',
      );
    }
    const teams = await prisma.team.findMany({ where: { workspaceId }, select: { id: true } });
    const teamIds = teams.map(({ id }) => id);
    const channels = await prisma.channel.findMany({
      where: { teamId: { in: teamIds } },
      select: { id: true },
    });
    await prisma.$transaction([
      prisma.channelMember.deleteMany({ where: { userId, channel: { teamId: { in: teamIds } } } }),
      prisma.teamMember.deleteMany({ where: { userId, teamId: { in: teamIds } } }),
      prisma.workspaceMember.delete({ where: { workspaceId_userId: { workspaceId, userId } } }),
    ]);
    channels.forEach(({ id }) => {
      void socketServer?.in(`user:${userId}`).socketsLeave(`channel:${id}`);
    });
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
});

router.post('/workspaces/:workspaceId/teams', async (req, res, next) => {
  try {
    const workspaceId = routeParam(req.params.workspaceId);
    if (!(await requireWorkspaceAdmin(req.userId!, workspaceId, res))) return;
    const parsed = teamCreateInputSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, 'VALIDATION_ERROR', 'Confira os dados da equipe.');
    const slug = slugify(parsed.data.name, 'equipe');
    if (await prisma.team.findUnique({ where: { workspaceId_slug: { workspaceId, slug } } })) {
      return fail(res, 409, 'TEAM_SLUG_IN_USE', 'Já existe uma equipe com esse nome.');
    }
    const team = await prisma.team.create({
      data: {
        workspaceId,
        name: parsed.data.name,
        slug,
        description: parsed.data.description,
        members: { create: { userId: req.userId! } },
        channels: {
          create: {
            name: 'geral',
            slug: 'geral',
            description: 'Avisos e alinhamentos gerais da equipe.',
            visibility: 'PUBLIC',
          },
        },
      },
      select: { id: true, name: true, slug: true, description: true },
    });
    return res.status(201).json({ ...team, joined: true, memberCount: 1, channels: [] });
  } catch (error) {
    return next(error);
  }
});

router.patch('/teams/:teamId', async (req, res, next) => {
  try {
    const teamId = routeParam(req.params.teamId);
    const team = await prisma.team.findFirst({ where: { id: teamId, archivedAt: null } });
    if (!team) return fail(res, 404, 'TEAM_NOT_FOUND', 'Equipe não encontrada.');
    if (!(await requireWorkspaceAdmin(req.userId!, team.workspaceId, res))) return;
    const parsed = teamUpdateInputSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, 'VALIDATION_ERROR', 'Confira os dados da equipe.');
    const slug = parsed.data.name ? slugify(parsed.data.name, 'equipe') : team.slug;
    if (
      slug !== team.slug &&
      (await prisma.team.findUnique({
        where: { workspaceId_slug: { workspaceId: team.workspaceId, slug } },
      }))
    ) {
      return fail(res, 409, 'TEAM_SLUG_IN_USE', 'Já existe uma equipe com esse nome.');
    }
    const updated = await prisma.team.update({
      where: { id: teamId },
      data: { ...parsed.data, slug },
      select: { id: true, name: true, slug: true, description: true },
    });
    return res.json(updated);
  } catch (error) {
    return next(error);
  }
});

router.delete('/teams/:teamId', async (req, res, next) => {
  try {
    const teamId = routeParam(req.params.teamId);
    const team = await prisma.team.findFirst({ where: { id: teamId, archivedAt: null } });
    if (!team) return fail(res, 404, 'TEAM_NOT_FOUND', 'Equipe não encontrada.');
    if (!(await requireWorkspaceAdmin(req.userId!, team.workspaceId, res))) return;
    const archivedAt = new Date();
    await prisma.$transaction([
      prisma.team.update({ where: { id: teamId }, data: { archivedAt } }),
      prisma.channel.updateMany({ where: { teamId, archivedAt: null }, data: { archivedAt } }),
    ]);
    const channels = await prisma.channel.findMany({ where: { teamId }, select: { id: true } });
    channels.forEach(
      ({ id }) => void socketServer?.in(`channel:${id}`).socketsLeave(`channel:${id}`),
    );
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
});

router.post('/teams/:teamId/join', async (req, res, next) => {
  try {
    const teamId = routeParam(req.params.teamId);
    const team = await prisma.team.findFirst({ where: { id: teamId, archivedAt: null } });
    if (!team) return fail(res, 404, 'TEAM_NOT_FOUND', 'Equipe não encontrada.');
    const role = await requireWorkspaceMember(req.userId!, team.workspaceId, res);
    if (!role) return;
    if (
      role === 'GUEST' &&
      !(await prisma.teamMember.findUnique({
        where: { teamId_userId: { teamId, userId: req.userId! } },
        select: { userId: true },
      }))
    ) {
      return fail(
        res,
        403,
        'GUEST_TEAM_RESTRICTED',
        'Convidados só podem entrar em equipes para as quais foram convidados.',
      );
    }
    await prisma.teamMember.upsert({
      where: { teamId_userId: { teamId, userId: req.userId! } },
      update: {},
      create: { teamId, userId: req.userId! },
    });
    const publicChannels = await prisma.channel.findMany({
      where: { teamId, visibility: 'PUBLIC', archivedAt: null },
      select: { id: true },
    });
    publicChannels.forEach(({ id }) => {
      void socketServer?.in(`user:${req.userId}`).socketsJoin(`channel:${id}`);
    });
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
});

router.post('/teams/:teamId/members', async (req, res, next) => {
  try {
    const teamId = routeParam(req.params.teamId);
    const team = await prisma.team.findFirst({ where: { id: teamId, archivedAt: null } });
    if (!team) return fail(res, 404, 'TEAM_NOT_FOUND', 'Equipe não encontrada.');
    if (!(await requireWorkspaceAdmin(req.userId!, team.workspaceId, res))) return;
    const parsed = memberInputSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, 'VALIDATION_ERROR', 'Informe uma pessoa válida.');
    if (!(await getWorkspaceRole(parsed.data.userId, team.workspaceId))) {
      return fail(res, 404, 'WORKSPACE_MEMBER_NOT_FOUND', 'A pessoa não pertence a este espaço.');
    }
    await prisma.teamMember.upsert({
      where: { teamId_userId: { teamId, userId: parsed.data.userId } },
      update: {},
      create: { teamId, userId: parsed.data.userId },
    });
    const publicChannels = await prisma.channel.findMany({
      where: { teamId, visibility: 'PUBLIC', archivedAt: null },
      select: { id: true },
    });
    publicChannels.forEach(({ id }) => {
      void socketServer?.in(`user:${parsed.data.userId}`).socketsJoin(`channel:${id}`);
    });
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
});

router.get('/teams/:teamId/members', async (req, res, next) => {
  try {
    const teamId = routeParam(req.params.teamId);
    const team = await prisma.team.findFirst({ where: { id: teamId, archivedAt: null } });
    if (!team) return fail(res, 404, 'TEAM_NOT_FOUND', 'Equipe não encontrada.');
    const role = await requireWorkspaceMember(req.userId!, team.workspaceId, res);
    if (!role) return;
    if (
      !roleCanManage(role) &&
      !(await prisma.teamMember.findUnique({
        where: { teamId_userId: { teamId, userId: req.userId! } },
      }))
    ) {
      return fail(res, 404, 'TEAM_NOT_FOUND', 'Equipe não encontrada.');
    }
    const members = await prisma.teamMember.findMany({
      where: { teamId },
      include: {
        user: {
          select: { id: true, email: true, username: true, displayName: true, avatarUrl: true },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });
    return res.json(members.map(({ user }) => user));
  } catch (error) {
    return next(error);
  }
});

router.delete('/teams/:teamId/members/:userId', async (req, res, next) => {
  try {
    const teamId = routeParam(req.params.teamId);
    const userId = routeParam(req.params.userId);
    const team = await prisma.team.findFirst({ where: { id: teamId, archivedAt: null } });
    if (!team) return fail(res, 404, 'TEAM_NOT_FOUND', 'Equipe não encontrada.');
    const requesterRole = await getWorkspaceRole(req.userId!, team.workspaceId);
    if (!requesterRole)
      return fail(res, 404, 'WORKSPACE_NOT_FOUND', 'Espaço de trabalho não encontrado.');
    const requesterIsManager = roleCanManage(requesterRole.role);
    if (!requesterIsManager && userId !== req.userId) {
      return fail(res, 403, 'FORBIDDEN', 'Você só pode sair da própria equipe.');
    }
    const targetMembership = await prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId } },
      select: { userId: true },
    });
    if (!targetMembership)
      return fail(res, 404, 'TEAM_MEMBER_NOT_FOUND', 'Pessoa não encontrada na equipe.');
    const channels = await prisma.channel.findMany({
      where: { teamId },
      select: { id: true },
    });
    await prisma.$transaction([
      prisma.teamMember.deleteMany({ where: { teamId, userId } }),
      prisma.channelMember.deleteMany({
        where: { userId, channel: { teamId } },
      }),
    ]);
    channels.forEach(({ id }) => {
      void socketServer?.in(`user:${userId}`).socketsLeave(`channel:${id}`);
    });
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
});

router.post('/teams/:teamId/channels', async (req, res, next) => {
  try {
    const teamId = routeParam(req.params.teamId);
    const team = await prisma.team.findFirst({ where: { id: teamId, archivedAt: null } });
    if (!team) return fail(res, 404, 'TEAM_NOT_FOUND', 'Equipe não encontrada.');
    if (!(await requireWorkspaceAdmin(req.userId!, team.workspaceId, res))) return;
    const parsed = channelCreateInputSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, 'VALIDATION_ERROR', 'Confira os dados do canal.');
    const slug = slugify(parsed.data.name, 'canal');
    if (await prisma.channel.findUnique({ where: { teamId_slug: { teamId, slug } } })) {
      return fail(res, 409, 'CHANNEL_SLUG_IN_USE', 'Já existe um canal com esse nome na equipe.');
    }
    const channel = await prisma.$transaction(async (transaction) => {
      await transaction.teamMember.upsert({
        where: { teamId_userId: { teamId, userId: req.userId! } },
        update: {},
        create: { teamId, userId: req.userId! },
      });
      return transaction.channel.create({
        data: {
          teamId,
          name: parsed.data.name,
          slug,
          description: parsed.data.description,
          visibility: parsed.data.visibility,
          ...(parsed.data.visibility === 'PRIVATE'
            ? { members: { create: { userId: req.userId! } } }
            : {}),
        },
        select: {
          id: true,
          teamId: true,
          name: true,
          slug: true,
          description: true,
          visibility: true,
        },
      });
    });
    void socketServer?.in(`user:${req.userId}`).socketsJoin(`channel:${channel.id}`);
    return res.status(201).json({ ...channel, joined: true });
  } catch (error) {
    return next(error);
  }
});

router.patch('/channels/:channelId', async (req, res, next) => {
  try {
    const channelId = routeParam(req.params.channelId);
    const context = await getChannelContext(channelId, req.userId!);
    if (!context) return fail(res, 404, 'CHANNEL_NOT_FOUND', 'Canal não encontrado.');
    if (!roleCanManage(context.role)) {
      return fail(
        res,
        403,
        'FORBIDDEN',
        'Somente proprietários e administradores podem editar canais.',
      );
    }
    const parsed = channelUpdateInputSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, 'VALIDATION_ERROR', 'Confira os dados do canal.');
    const slug = parsed.data.name ? slugify(parsed.data.name, 'canal') : context.channel.slug;
    if (
      slug !== context.channel.slug &&
      (await prisma.channel.findUnique({
        where: { teamId_slug: { teamId: context.channel.teamId, slug } },
      }))
    ) {
      return fail(res, 409, 'CHANNEL_SLUG_IN_USE', 'Já existe um canal com esse nome na equipe.');
    }
    const channel = await prisma.$transaction(async (transaction) => {
      if (parsed.data.visibility === 'PRIVATE' && context.channel.visibility === 'PUBLIC') {
        const teamMembers = await transaction.teamMember.findMany({
          where: { teamId: context.channel.teamId },
          select: { userId: true },
        });
        await transaction.channelMember.createMany({
          data: teamMembers.map(({ userId }) => ({ channelId, userId })),
          skipDuplicates: true,
        });
      }
      return transaction.channel.update({
        where: { id: channelId },
        data: { ...parsed.data, slug },
        select: {
          id: true,
          teamId: true,
          name: true,
          slug: true,
          description: true,
          visibility: true,
        },
      });
    });
    if (parsed.data.visibility === 'PRIVATE' && context.channel.visibility === 'PUBLIC') {
      void socketServer?.in(`channel:${channelId}`).socketsLeave(`channel:${channelId}`);
      const members = await prisma.channelMember.findMany({
        where: { channelId },
        select: { userId: true },
      });
      members.forEach(({ userId }) => {
        void socketServer?.in(`user:${userId}`).socketsJoin(`channel:${channelId}`);
      });
    }
    if (parsed.data.visibility === 'PUBLIC' && context.channel.visibility === 'PRIVATE') {
      const teamMembers = await prisma.teamMember.findMany({
        where: { teamId: context.channel.teamId },
        select: { userId: true },
      });
      void socketServer?.in(`channel:${channelId}`).socketsLeave(`channel:${channelId}`);
      teamMembers.forEach(({ userId }) => {
        void socketServer?.in(`user:${userId}`).socketsJoin(`channel:${channelId}`);
      });
    }
    return res.json(channel);
  } catch (error) {
    return next(error);
  }
});

router.delete('/channels/:channelId', async (req, res, next) => {
  try {
    const channelId = routeParam(req.params.channelId);
    const channel = await prisma.channel.findFirst({
      where: { id: channelId, archivedAt: null },
      include: { team: { select: { workspaceId: true } } },
    });
    if (!channel) return fail(res, 404, 'CHANNEL_NOT_FOUND', 'Canal não encontrado.');
    if (!(await requireWorkspaceAdmin(req.userId!, channel.team.workspaceId, res))) return;
    await prisma.channel.update({ where: { id: channelId }, data: { archivedAt: new Date() } });
    void socketServer?.in(`channel:${channelId}`).socketsLeave(`channel:${channelId}`);
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
});

router.post('/channels/:channelId/members', async (req, res, next) => {
  try {
    const channelId = routeParam(req.params.channelId);
    const context = await getChannelContext(channelId, req.userId!);
    if (!context) return fail(res, 404, 'CHANNEL_NOT_FOUND', 'Canal não encontrado.');
    if (context.channel.visibility !== 'PRIVATE') {
      return fail(
        res,
        400,
        'CHANNEL_NOT_PRIVATE',
        'Canais públicos são acessíveis por toda a equipe.',
      );
    }
    if (!roleCanManage(context.role)) {
      return fail(
        res,
        403,
        'FORBIDDEN',
        'Somente proprietários e administradores podem convidar para canais privados.',
      );
    }
    const parsed = memberInputSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, 'VALIDATION_ERROR', 'Informe uma pessoa válida.');
    if (!(await getWorkspaceRole(parsed.data.userId, context.channel.team.workspaceId))) {
      return fail(res, 404, 'WORKSPACE_MEMBER_NOT_FOUND', 'A pessoa não pertence a este espaço.');
    }
    await prisma.$transaction([
      prisma.teamMember.upsert({
        where: { teamId_userId: { teamId: context.channel.teamId, userId: parsed.data.userId } },
        update: {},
        create: { teamId: context.channel.teamId, userId: parsed.data.userId },
      }),
      prisma.channelMember.upsert({
        where: { channelId_userId: { channelId, userId: parsed.data.userId } },
        update: {},
        create: { channelId, userId: parsed.data.userId },
      }),
    ]);
    void socketServer?.in(`user:${parsed.data.userId}`).socketsJoin(`channel:${channelId}`);
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
});

router.get('/channels/:channelId/members', async (req, res, next) => {
  try {
    const channelId = routeParam(req.params.channelId);
    const context = await getChannelContext(channelId, req.userId!);
    if (!context) return fail(res, 404, 'CHANNEL_NOT_FOUND', 'Canal não encontrado.');
    if (!context.isMember && !roleCanManage(context.role))
      return fail(res, 404, 'CHANNEL_NOT_FOUND', 'Canal não encontrado.');
    if (context.channel.visibility === 'PUBLIC') {
      const members = await prisma.teamMember.findMany({
        where: { teamId: context.channel.teamId },
        include: {
          user: {
            select: { id: true, email: true, username: true, displayName: true, avatarUrl: true },
          },
        },
        orderBy: { joinedAt: 'asc' },
      });
      return res.json(members.map(({ user }) => user));
    }
    const members = await prisma.channelMember.findMany({
      where: { channelId },
      include: {
        user: {
          select: { id: true, email: true, username: true, displayName: true, avatarUrl: true },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });
    return res.json(members.map(({ user }) => user));
  } catch (error) {
    return next(error);
  }
});

router.delete('/channels/:channelId/members/:userId', async (req, res, next) => {
  try {
    const channelId = routeParam(req.params.channelId);
    const userId = routeParam(req.params.userId);
    const context = await getChannelContext(channelId, req.userId!);
    if (!context) return fail(res, 404, 'CHANNEL_NOT_FOUND', 'Canal não encontrado.');
    if (context.channel.visibility !== 'PRIVATE') {
      return fail(
        res,
        400,
        'CHANNEL_NOT_PRIVATE',
        'Use a equipe para gerenciar o acesso a um canal público.',
      );
    }
    if (userId !== req.userId && !roleCanManage(context.role)) {
      return fail(res, 403, 'FORBIDDEN', 'Você só pode sair do próprio canal.');
    }
    await prisma.channelMember.deleteMany({ where: { channelId, userId } });
    void socketServer?.in(`user:${userId}`).socketsLeave(`channel:${channelId}`);
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
});

router.patch('/channels/:channelId/preference', async (req, res, next) => {
  try {
    const channelId = routeParam(req.params.channelId);
    const context = await getChannelContext(channelId, req.userId!);
    if (!context) return fail(res, 404, 'CHANNEL_NOT_FOUND', 'Canal não encontrado.');
    if (!context.isMember)
      return fail(res, 403, 'FORBIDDEN', 'Entre na equipe para personalizar o canal.');
    const parsed = channelPreferenceInputSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, 'VALIDATION_ERROR', 'Preferências inválidas.');
    const preference = await prisma.channelPreference.upsert({
      where: { channelId_userId: { channelId, userId: req.userId! } },
      update: parsed.data,
      create: { channelId, userId: req.userId!, ...parsed.data },
      select: { favorite: true, hidden: true, notificationLevel: true },
    });
    return res.json(preference);
  } catch (error) {
    return next(error);
  }
});

router.post('/workspaces/:workspaceId/invites', async (req, res, next) => {
  try {
    const workspaceId = routeParam(req.params.workspaceId);
    if (!(await requireWorkspaceAdmin(req.userId!, workspaceId, res))) return;
    const parsed = workspaceInviteInputSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, 'VALIDATION_ERROR', 'Confira o convite informado.');
    const existingMember = await prisma.workspaceMember.findFirst({
      where: { workspaceId, user: { email: parsed.data.email } },
      select: { userId: true },
    });
    if (existingMember)
      return fail(res, 409, 'ALREADY_MEMBER', 'Essa pessoa já pertence ao espaço.');
    const existingInvite = await prisma.workspaceInvite.findFirst({
      where: {
        workspaceId,
        email: parsed.data.email,
        acceptedAt: null,
        canceledAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
    });
    if (existingInvite)
      return fail(
        res,
        409,
        'INVITE_ALREADY_EXISTS',
        'Já existe um convite ativo para esse e-mail.',
      );
    if (parsed.data.teamId) {
      const team = await prisma.team.findFirst({
        where: { id: parsed.data.teamId, workspaceId, archivedAt: null },
        select: { id: true },
      });
      if (!team) return fail(res, 404, 'TEAM_NOT_FOUND', 'Equipe do convite não encontrada.');
    }
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + inviteLifetimeMs);
    const invite = await prisma.workspaceInvite.create({
      data: {
        workspaceId,
        teamId: parsed.data.teamId,
        email: parsed.data.email,
        role: parsed.data.role,
        tokenHash: hashInviteToken(token),
        expiresAt,
        invitedById: req.userId!,
      },
      select: {
        email: true,
        role: true,
        expiresAt: true,
        workspace: { select: { name: true } },
        team: { select: { name: true } },
        invitedBy: { select: { displayName: true } },
      },
    });
    const baseUrl = env.WEB_ORIGIN.replace(/\/$/, '');
    const inviteUrl = `${baseUrl}/convites/aceitar?token=${encodeURIComponent(token)}`;
    try {
      await mailProvider.sendWorkspaceInvite({
        email: invite.email,
        inviterName: invite.invitedBy.displayName,
        workspaceName: invite.workspace.name,
        teamName: invite.team?.name,
        role: invite.role as 'MEMBER' | 'GUEST',
        inviteUrl,
        expiresAt,
      });
    } catch {
      await prisma.workspaceInvite.updateMany({
        where: { tokenHash: hashInviteToken(token), canceledAt: null },
        data: { canceledAt: new Date() },
      });
      return fail(
        res,
        503,
        'INVITE_EMAIL_FAILED',
        'Não foi possível enviar o convite. Tente novamente.',
      );
    }
    return res.status(201).json({
      inviteUrl,
      email: parsed.data.email,
      role: parsed.data.role,
      expiresAt,
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/workspaces/:workspaceId/invites', async (req, res, next) => {
  try {
    const workspaceId = routeParam(req.params.workspaceId);
    if (!(await requireWorkspaceAdmin(req.userId!, workspaceId, res))) return;
    const invites = await prisma.workspaceInvite.findMany({
      where: { workspaceId, canceledAt: null },
      select: {
        id: true,
        email: true,
        role: true,
        expiresAt: true,
        acceptedAt: true,
        team: { select: { id: true, name: true } },
        invitedBy: { select: { displayName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return res.json(invites);
  } catch (error) {
    return next(error);
  }
});

router.delete('/workspaces/:workspaceId/invites/:inviteId', async (req, res, next) => {
  try {
    const workspaceId = routeParam(req.params.workspaceId);
    const inviteId = routeParam(req.params.inviteId);
    if (!(await requireWorkspaceAdmin(req.userId!, workspaceId, res))) return;
    const result = await prisma.workspaceInvite.updateMany({
      where: { id: inviteId, workspaceId, acceptedAt: null, canceledAt: null },
      data: { canceledAt: new Date() },
    });
    if (!result.count) return fail(res, 404, 'INVITE_NOT_FOUND', 'Convite não encontrado.');
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
});

router.post('/invites/accept', async (req, res, next) => {
  try {
    const parsed = workspaceInviteAcceptInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return fail(res, 400, 'VALIDATION_ERROR', 'Link de convite inválido.');
    }
    const token = parsed.data.token;
    const tokenHash = hashInviteToken(token);
    const accepted = await prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "WorkspaceInvite" WHERE "tokenHash" = ${tokenHash} FOR UPDATE
      `;
      const invite = await transaction.workspaceInvite.findUnique({
        where: { tokenHash },
        include: { workspace: { select: { id: true, name: true, slug: true } } },
      });
      if (!invite || invite.canceledAt || invite.acceptedAt || invite.expiresAt <= new Date()) {
        return { error: 'INVITE_INVALID' as const };
      }
      const user = await transaction.user.findUnique({
        where: { id: req.userId! },
        select: { id: true, email: true },
      });
      if (!user?.email || user.email.toLowerCase() !== invite.email.toLowerCase()) {
        return { error: 'INVITE_EMAIL_MISMATCH' as const };
      }
      const membership = await transaction.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId: invite.workspaceId, userId: user.id } },
        select: { userId: true },
      });
      if (membership) return { error: 'ALREADY_MEMBER' as const };
      await transaction.workspaceMember.create({
        data: { workspaceId: invite.workspaceId, userId: user.id, role: invite.role },
      });
      if (invite.teamId) {
        await transaction.teamMember.create({
          data: { teamId: invite.teamId, userId: user.id },
        });
      }
      await transaction.workspaceInvite.update({
        where: { id: invite.id },
        data: { acceptedAt: new Date(), acceptedById: user.id },
      });
      return {
        inviteId: invite.id,
        inviterId: invite.invitedById,
        workspace: invite.workspace,
        role: invite.role,
        teamId: invite.teamId,
      };
    });
    if ('error' in accepted) {
      const status = accepted.error === 'ALREADY_MEMBER' ? 409 : 400;
      const message =
        accepted.error === 'INVITE_EMAIL_MISMATCH'
          ? 'Entre com o e-mail que recebeu este convite.'
          : accepted.error === 'ALREADY_MEMBER'
            ? 'Você já pertence a esse espaço de trabalho.'
            : 'O convite expirou ou já foi usado.';
      return fail(res, status, accepted.error ?? 'INVITE_INVALID', message);
    }
    if (accepted.teamId) {
      const publicChannels = await prisma.channel.findMany({
        where: { teamId: accepted.teamId, visibility: 'PUBLIC', archivedAt: null },
        select: { id: true },
      });
      publicChannels.forEach(({ id }) => {
        void socketServer?.in(`user:${req.userId}`).socketsJoin(`channel:${id}`);
      });
    }
    await notifyInviteAccepted({
      inviteId: accepted.inviteId,
      workspaceId: accepted.workspace.id,
      actorId: req.userId!,
      recipientId: accepted.inviterId,
    }).catch((error: unknown) => {
      console.error(
        'Could not record invite activity:',
        error instanceof Error ? error.message : error,
      );
    });
    return res.json({ ...accepted.workspace, role: accepted.role });
  } catch (error) {
    return next(error);
  }
});

export function createOrganizationRouter(io: Server) {
  socketServer = io;
  return router;
}

export { getChannelContext };
