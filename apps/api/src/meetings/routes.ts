import { randomUUID } from 'node:crypto';
import { Router, type Response } from 'express';
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import { meetingNowInputSchema } from '@rocket/shared';
import { requireAuth } from '../auth.js';
import { env } from '../env.js';
import { prisma } from '../lib/prisma.js';

const router = Router();

function routeParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

function fail(res: Response, status: number, code: string, message: string) {
  return res.status(status).json({ error: { code, message } });
}

function liveKitAvailable(res: Response) {
  if (env.LIVEKIT_URL && env.LIVEKIT_API_KEY && env.LIVEKIT_API_SECRET) return true;
  fail(
    res,
    503,
    'LIVEKIT_NOT_CONFIGURED',
    'As chamadas ainda não estão configuradas neste ambiente.',
  );
  return false;
}

function liveKitRoomService() {
  if (!env.LIVEKIT_URL || !env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET) return null;
  const endpoint = env.LIVEKIT_URL.replace(/^ws/, 'http');
  return new RoomServiceClient(endpoint, env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET);
}

async function workspaceRole(workspaceId: string, userId: string) {
  return prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { role: true },
  });
}

async function userCanJoinCall(
  call: {
    createdById: string;
    conversationId: string | null;
    channelId: string | null;
    eventId: string | null;
    workspaceId: string;
  },
  userId: string,
) {
  const membership = await workspaceRole(call.workspaceId, userId);
  if (!membership) return false;
  if (call.conversationId) {
    const conversationMember = await prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId: call.conversationId, userId } },
      select: { userId: true },
    });
    return Boolean(conversationMember);
  }
  if (call.channelId) {
    const channel = await prisma.channel.findFirst({
      where: {
        id: call.channelId,
        archivedAt: null,
        team: { workspaceId: call.workspaceId, archivedAt: null },
        OR: [
          { visibility: 'PUBLIC', team: { members: { some: { userId } } } },
          { visibility: 'PRIVATE', members: { some: { userId } } },
        ],
      },
      select: { id: true },
    });
    return Boolean(channel);
  }
  if (call.eventId) {
    if (call.createdById === userId || membership.role === 'OWNER' || membership.role === 'ADMIN') {
      return true;
    }
    const attendee = await prisma.calendarEventAttendee.findUnique({
      where: { eventId_userId: { eventId: call.eventId, userId } },
      select: { status: true },
    });
    return attendee?.status === 'ACCEPTED';
  }
  return call.createdById === userId;
}

async function meetingToken(callId: string, userId: string, res: Response) {
  if (!liveKitAvailable(res)) return null;
  const call = await prisma.meetingCall.findUnique({
    where: { id: callId },
    include: {
      createdBy: { select: { id: true, displayName: true } },
      event: { select: { id: true, title: true, deletedAt: true } },
      conversation: { select: { id: true, name: true } },
      channel: { select: { id: true, name: true } },
    },
  });
  if (!call || !(await userCanJoinCall(call, userId))) return null;
  if (call.endedAt) {
    fail(res, 410, 'MEETING_ENDED', 'Esta reunião já foi encerrada.');
    return null;
  }
  if (call.event && call.event.deletedAt) return null;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { displayName: true },
  });
  if (!user) return null;
  const now = new Date();
  await prisma.callParticipant.upsert({
    where: { callId_userId: { callId, userId } },
    create: { callId, userId, firstJoinedAt: now, lastJoinedAt: now },
    update: { lastJoinedAt: now, leftAt: null },
  });
  const accessToken = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
    identity: userId,
    name: user.displayName,
    ttl: '15m',
  });
  accessToken.addGrant({
    roomJoin: true,
    room: call.roomName,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });
  const membership = await workspaceRole(call.workspaceId, userId);
  return {
    id: call.id,
    title: call.event?.title ?? call.channel?.name ?? call.conversation?.name ?? 'Chamada 1:1',
    roomName: call.roomName,
    serverUrl: env.LIVEKIT_URL,
    token: await accessToken.toJwt(),
    startedAt: call.startedAt.toISOString(),
    canEnd:
      call.createdById === userId || membership?.role === 'OWNER' || membership?.role === 'ADMIN',
  };
}

router.use(requireAuth);

router.get('/workspaces/:workspaceId/calls', async (req, res, next) => {
  try {
    const workspaceId = routeParam(req.params.workspaceId);
    if (!(await workspaceRole(workspaceId, req.userId!)))
      return fail(res, 404, 'WORKSPACE_NOT_FOUND', 'Espaço de trabalho não encontrado.');
    const calls = await prisma.meetingCall.findMany({
      where: {
        workspaceId,
        OR: [
          { createdById: req.userId },
          { conversation: { members: { some: { userId: req.userId } } } },
          {
            channel: {
              OR: [
                {
                  visibility: 'PUBLIC',
                  archivedAt: null,
                  team: {
                    workspaceId,
                    archivedAt: null,
                    members: { some: { userId: req.userId } },
                  },
                },
                {
                  visibility: 'PRIVATE',
                  archivedAt: null,
                  team: { workspaceId, archivedAt: null },
                  members: { some: { userId: req.userId } },
                },
              ],
            },
          },
          {
            event: {
              OR: [
                { createdById: req.userId },
                { attendees: { some: { userId: req.userId, status: 'ACCEPTED' } } },
              ],
            },
          },
        ],
      },
      include: {
        createdBy: { select: { id: true, displayName: true } },
        conversation: { select: { id: true, name: true } },
        channel: { select: { id: true, name: true } },
        event: { select: { id: true, title: true, startAt: true } },
        participants: {
          include: { user: { select: { id: true, displayName: true } } },
          orderBy: { lastJoinedAt: 'asc' },
        },
      },
      orderBy: { startedAt: 'desc' },
      take: 50,
    });
    return res.json({
      items: calls.map((call) => ({
        id: call.id,
        title: call.event?.title ?? call.channel?.name ?? call.conversation?.name ?? 'Chamada 1:1',
        conversationId: call.conversationId,
        channelId: call.channelId,
        eventId: call.eventId,
        createdBy: call.createdBy,
        startedAt: call.startedAt.toISOString(),
        endedAt: call.endedAt?.toISOString() ?? null,
        participants: call.participants.map(({ user, firstJoinedAt, lastJoinedAt, leftAt }) => ({
          ...user,
          firstJoinedAt: firstJoinedAt.toISOString(),
          lastJoinedAt: lastJoinedAt.toISOString(),
          leftAt: leftAt?.toISOString() ?? null,
        })),
      })),
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/workspaces/:workspaceId/meetings/now', async (req, res, next) => {
  try {
    const workspaceId = routeParam(req.params.workspaceId);
    if (!(await workspaceRole(workspaceId, req.userId!)))
      return fail(res, 404, 'WORKSPACE_NOT_FOUND', 'Espaço de trabalho não encontrado.');
    const parsed = meetingNowInputSchema.safeParse(req.body);
    if (!parsed.success)
      return fail(
        res,
        400,
        'VALIDATION_ERROR',
        'Selecione uma conversa direta ou um canal para iniciar a chamada.',
      );
    const conversation = parsed.data.conversationId
      ? await prisma.conversation.findFirst({
          where: {
            id: parsed.data.conversationId,
            workspaceId,
            type: 'DIRECT',
            members: { some: { userId: req.userId } },
          },
          select: { id: true },
        })
      : null;
    const channel = parsed.data.channelId
      ? await prisma.channel.findFirst({
          where: {
            id: parsed.data.channelId,
            archivedAt: null,
            team: { workspaceId, archivedAt: null },
            OR: [
              { visibility: 'PUBLIC', team: { members: { some: { userId: req.userId } } } },
              { visibility: 'PRIVATE', members: { some: { userId: req.userId } } },
            ],
          },
          select: { id: true },
        })
      : null;
    if (!conversation && !channel)
      return fail(res, 404, 'MEETING_TARGET_NOT_FOUND', 'Conversa ou canal não encontrado.');
    if (!liveKitAvailable(res)) return;
    const existingCall = await prisma.meetingCall.findFirst({
      where: {
        workspaceId,
        endedAt: null,
        ...(conversation ? { conversationId: conversation.id } : { channelId: channel!.id }),
      },
      orderBy: { startedAt: 'desc' },
      select: { id: true },
    });
    const call =
      existingCall ??
      (await prisma.meetingCall.create({
        data: {
          id: randomUUID(),
          workspaceId,
          conversationId: conversation?.id,
          channelId: channel?.id,
          roomName: `rocket-${randomUUID()}`,
          createdById: req.userId!,
        },
        select: { id: true },
      }));
    const credentials = await meetingToken(call.id, req.userId!, res);
    if (!credentials) {
      if (res.headersSent) return;
      return fail(res, 404, 'MEETING_NOT_FOUND', 'A chamada não está disponível.');
    }
    return res.status(201).json(credentials);
  } catch (error) {
    return next(error);
  }
});

router.post('/events/:eventId/join', async (req, res, next) => {
  try {
    const eventId = routeParam(req.params.eventId);
    const event = await prisma.calendarEvent.findFirst({
      where: { id: eventId, deletedAt: null },
      include: { attendees: { where: { userId: req.userId }, select: { status: true } } },
    });
    if (!event) return fail(res, 404, 'EVENT_NOT_FOUND', 'Evento não encontrado.');
    if (
      !(await userCanJoinCall(
        { ...event, conversationId: null, channelId: null, eventId },
        req.userId!,
      ))
    )
      return fail(res, 404, 'EVENT_NOT_FOUND', 'Evento não encontrado.');
    if (!liveKitAvailable(res)) return;
    const call = await prisma.meetingCall.upsert({
      where: { eventId },
      create: {
        workspaceId: event.workspaceId,
        eventId,
        roomName: `rocket-${randomUUID()}`,
        createdById: event.createdById,
      },
      update: {},
      select: { id: true },
    });
    const credentials = await meetingToken(call.id, req.userId!, res);
    if (!credentials) {
      if (res.headersSent) return;
      return fail(res, 404, 'EVENT_NOT_FOUND', 'Evento não encontrado.');
    }
    return res.json(credentials);
  } catch (error) {
    return next(error);
  }
});

router.post('/:callId/join', async (req, res, next) => {
  try {
    const callId = routeParam(req.params.callId);
    const call = await prisma.meetingCall.findUnique({
      where: { id: callId },
      select: {
        id: true,
        createdById: true,
        conversationId: true,
        channelId: true,
        eventId: true,
        workspaceId: true,
      },
    });
    if (!call || !(await userCanJoinCall(call, req.userId!)))
      return fail(res, 404, 'MEETING_NOT_FOUND', 'Chamada não encontrada.');
    const credentials = await meetingToken(call.id, req.userId!, res);
    if (!credentials) {
      if (res.headersSent) return;
      return fail(res, 404, 'MEETING_NOT_FOUND', 'Chamada não encontrada.');
    }
    return res.json(credentials);
  } catch (error) {
    return next(error);
  }
});

router.post('/:callId/leave', async (req, res, next) => {
  try {
    const callId = routeParam(req.params.callId);
    const call = await prisma.meetingCall.findUnique({
      where: { id: callId },
      select: {
        id: true,
        createdById: true,
        conversationId: true,
        channelId: true,
        eventId: true,
        workspaceId: true,
      },
    });
    if (!call || !(await userCanJoinCall(call, req.userId!)))
      return fail(res, 404, 'MEETING_NOT_FOUND', 'Chamada não encontrada.');
    await prisma.callParticipant.updateMany({
      where: { callId, userId: req.userId! },
      data: { leftAt: new Date() },
    });
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
});

router.post('/:callId/end', async (req, res, next) => {
  try {
    const callId = routeParam(req.params.callId);
    const call = await prisma.meetingCall.findUnique({
      where: { id: callId },
      select: { id: true, roomName: true, createdById: true, workspaceId: true },
    });
    if (!call) return fail(res, 404, 'MEETING_NOT_FOUND', 'Chamada não encontrada.');
    const role = await workspaceRole(call.workspaceId, req.userId!);
    if (!role) return fail(res, 404, 'MEETING_NOT_FOUND', 'Chamada não encontrada.');
    if (call.createdById !== req.userId && role.role !== 'OWNER' && role.role !== 'ADMIN')
      return fail(
        res,
        403,
        'FORBIDDEN',
        'Somente quem iniciou ou administra o espaço pode encerrar a chamada.',
      );
    const roomService = liveKitRoomService();
    if (!roomService)
      return fail(
        res,
        503,
        'LIVEKIT_NOT_CONFIGURED',
        'O serviço de chamadas não está configurado neste ambiente.',
      );
    const rooms = await roomService.listRooms([call.roomName]).catch(() => null);
    if (!rooms) {
      return fail(
        res,
        503,
        'LIVEKIT_UNAVAILABLE',
        'Não foi possível encerrar a chamada agora. Tente novamente.',
      );
    }
    await prisma.meetingCall.updateMany({
      where: { id: callId, endedAt: null },
      data: { endedAt: new Date() },
    });
    try {
      if (rooms.some((room) => room.name === call.roomName))
        await roomService.deleteRoom(call.roomName);
    } catch {
      return fail(
        res,
        503,
        'LIVEKIT_UNAVAILABLE',
        'Não foi possível desconectar as pessoas da sala. Tente encerrar novamente.',
      );
    }
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
});

export function createMeetingsRouter() {
  return router;
}
