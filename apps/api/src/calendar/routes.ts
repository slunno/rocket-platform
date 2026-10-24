import { Router, type Response } from 'express';
import {
  calendarAttendeeResponseInputSchema,
  calendarEventCreateInputSchema,
  calendarEventUpdateInputSchema,
  calendarEventsQuerySchema,
} from '@rocket/shared';
import { requireAuth } from '../auth.js';
import { prisma } from '../lib/prisma.js';
import { scheduleCalendarReminders } from '../notifications/queue.js';

const router = Router();
const eventInclude = {
  createdBy: { select: { id: true, displayName: true } },
  attendees: {
    include: { user: { select: { id: true, displayName: true, username: true, avatarUrl: true } } },
    orderBy: { createdAt: 'asc' as const },
  },
} as const;

function routeParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

function fail(res: Response, status: number, code: string, message: string) {
  return res.status(status).json({ error: { code, message } });
}

function serializeEvent(
  event: Awaited<ReturnType<typeof prisma.calendarEvent.findFirstOrThrow>> & {
    createdBy: { id: string; displayName: string };
    attendees: {
      status: string;
      respondedAt: Date | null;
      user: { id: string; displayName: string; username: string; avatarUrl: string | null };
    }[];
  },
) {
  return {
    id: event.id,
    workspaceId: event.workspaceId,
    title: event.title,
    description: event.description,
    startAt: event.startAt.toISOString(),
    endAt: event.endAt.toISOString(),
    timeZone: event.timeZone,
    recurrence: event.recurrence,
    recurrenceUntil: event.recurrenceUntil?.toISOString() ?? null,
    reminderMinutes: event.reminderMinutes,
    createdBy: event.createdBy,
    attendees: event.attendees.map((attendee) => ({
      id: attendee.user.id,
      displayName: attendee.user.displayName,
      username: attendee.user.username,
      avatarUrl: attendee.user.avatarUrl,
      status: attendee.status,
      respondedAt: attendee.respondedAt?.toISOString() ?? null,
    })),
  };
}

async function workspaceRole(workspaceId: string, userId: string) {
  return prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { role: true },
  });
}

function canManageEvent(event: { createdById: string }, userId: string, role: string) {
  return event.createdById === userId || role === 'OWNER' || role === 'ADMIN';
}

async function verifyAttendees(workspaceId: string, attendeeIds: string[], creatorId: string) {
  const requestedIds = [...new Set([...attendeeIds, creatorId])];
  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId, userId: { in: requestedIds } },
    select: { userId: true },
  });
  return members.length === requestedIds.length ? requestedIds : null;
}

router.use(requireAuth);

router.get('/workspaces/:workspaceId/events', async (req, res, next) => {
  try {
    const workspaceId = routeParam(req.params.workspaceId);
    const role = await workspaceRole(workspaceId, req.userId!);
    if (!role) return fail(res, 404, 'WORKSPACE_NOT_FOUND', 'Espaço de trabalho não encontrado.');
    const parsed = calendarEventsQuerySchema.safeParse(req.query);
    if (!parsed.success)
      return fail(
        res,
        400,
        'VALIDATION_ERROR',
        'O período selecionado para o calendário é inválido.',
      );
    const { from, to } = parsed.data;
    const events = await prisma.calendarEvent.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        OR: [
          {
            recurrence: 'NONE',
            startAt: { lt: to },
            endAt: { gte: from },
          },
          {
            recurrence: { not: 'NONE' },
            startAt: { lt: to },
            recurrenceUntil: { gte: from },
          },
        ],
      },
      include: eventInclude,
      orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
      take: 500,
    });
    return res.json({ items: events.map(serializeEvent) });
  } catch (error) {
    return next(error);
  }
});

router.post('/workspaces/:workspaceId/events', async (req, res, next) => {
  try {
    const workspaceId = routeParam(req.params.workspaceId);
    const role = await workspaceRole(workspaceId, req.userId!);
    if (!role) return fail(res, 404, 'WORKSPACE_NOT_FOUND', 'Espaço de trabalho não encontrado.');
    if (role.role === 'GUEST')
      return fail(res, 403, 'FORBIDDEN', 'Convidados não podem criar eventos.');
    const parsed = calendarEventCreateInputSchema.safeParse(req.body);
    if (!parsed.success)
      return fail(res, 400, 'VALIDATION_ERROR', 'Revise os campos e os horários do evento.');
    const requestedAttendees = await verifyAttendees(
      workspaceId,
      parsed.data.attendeeIds,
      req.userId!,
    );
    if (!requestedAttendees)
      return fail(
        res,
        400,
        'INVALID_ATTENDEES',
        'Todos os participantes devem pertencer ao espaço.',
      );
    const event = await prisma.calendarEvent.create({
      data: {
        workspaceId,
        createdById: req.userId!,
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        startAt: parsed.data.startAt,
        endAt: parsed.data.endAt,
        timeZone: parsed.data.timeZone,
        recurrence: parsed.data.recurrence,
        recurrenceUntil: parsed.data.recurrenceUntil ?? null,
        reminderMinutes: parsed.data.reminderMinutes,
        attendees: {
          create: requestedAttendees.map((userId) => ({
            userId,
            status: userId === req.userId ? 'ACCEPTED' : 'INVITED',
            ...(userId === req.userId ? { respondedAt: new Date() } : {}),
          })),
        },
      },
      include: eventInclude,
    });
    await scheduleCalendarReminders(event.id).catch((error: unknown) => {
      console.error('Could not schedule calendar reminders:', error);
    });
    return res.status(201).json(serializeEvent(event));
  } catch (error) {
    return next(error);
  }
});

router.patch('/events/:eventId', async (req, res, next) => {
  try {
    const eventId = routeParam(req.params.eventId);
    const parsed = calendarEventUpdateInputSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, 'VALIDATION_ERROR', 'Revise os campos do evento.');
    const existing = await prisma.calendarEvent.findFirst({
      where: { id: eventId, deletedAt: null },
      include: { attendees: { select: { userId: true, status: true } } },
    });
    if (!existing) return fail(res, 404, 'EVENT_NOT_FOUND', 'Evento não encontrado.');
    const role = await workspaceRole(existing.workspaceId, req.userId!);
    if (!role) return fail(res, 404, 'EVENT_NOT_FOUND', 'Evento não encontrado.');
    if (!canManageEvent(existing, req.userId!, role.role))
      return fail(
        res,
        403,
        'FORBIDDEN',
        'Somente quem organizou ou administra o espaço pode editar este evento.',
      );

    const merged = calendarEventCreateInputSchema.safeParse({
      title: parsed.data.title ?? existing.title,
      description:
        parsed.data.description === undefined ? existing.description : parsed.data.description,
      startAt: parsed.data.startAt ?? existing.startAt,
      endAt: parsed.data.endAt ?? existing.endAt,
      timeZone: parsed.data.timeZone ?? existing.timeZone,
      recurrence: parsed.data.recurrence ?? existing.recurrence,
      recurrenceUntil:
        parsed.data.recurrenceUntil === undefined
          ? existing.recurrenceUntil
          : parsed.data.recurrenceUntil,
      reminderMinutes: parsed.data.reminderMinutes ?? existing.reminderMinutes,
      attendeeIds: parsed.data.attendeeIds ?? existing.attendees.map(({ userId }) => userId),
    });
    if (!merged.success)
      return fail(res, 400, 'VALIDATION_ERROR', 'Revise os horários e a recorrência do evento.');
    const requestedAttendees = await verifyAttendees(
      existing.workspaceId,
      merged.data.attendeeIds,
      existing.createdById,
    );
    if (!requestedAttendees)
      return fail(
        res,
        400,
        'INVALID_ATTENDEES',
        'Todos os participantes devem pertencer ao espaço.',
      );

    const event = await prisma.$transaction(async (tx) => {
      await tx.calendarEventAttendee.deleteMany({
        where: { eventId, userId: { notIn: requestedAttendees } },
      });
      await tx.calendarEventAttendee.createMany({
        data: requestedAttendees.map((userId) => ({
          eventId,
          userId,
          status:
            userId === existing.createdById
              ? ('ACCEPTED' as const)
              : (existing.attendees.find((attendee) => attendee.userId === userId)?.status ??
                'INVITED'),
        })),
        skipDuplicates: true,
      });
      return tx.calendarEvent.update({
        where: { id: eventId },
        data: {
          title: merged.data.title,
          description: merged.data.description ?? null,
          startAt: merged.data.startAt,
          endAt: merged.data.endAt,
          timeZone: merged.data.timeZone,
          recurrence: merged.data.recurrence,
          recurrenceUntil: merged.data.recurrenceUntil ?? undefined,
          reminderMinutes: merged.data.reminderMinutes,
        },
        include: eventInclude,
      });
    });
    await scheduleCalendarReminders(event.id).catch((error: unknown) => {
      console.error('Could not refresh calendar reminders:', error);
    });
    return res.json(serializeEvent(event));
  } catch (error) {
    return next(error);
  }
});

router.delete('/events/:eventId', async (req, res, next) => {
  try {
    const eventId = routeParam(req.params.eventId);
    const event = await prisma.calendarEvent.findFirst({
      where: { id: eventId, deletedAt: null },
      select: { id: true, workspaceId: true, createdById: true },
    });
    if (!event) return fail(res, 404, 'EVENT_NOT_FOUND', 'Evento não encontrado.');
    const role = await workspaceRole(event.workspaceId, req.userId!);
    if (!role) return fail(res, 404, 'EVENT_NOT_FOUND', 'Evento não encontrado.');
    if (!canManageEvent(event, req.userId!, role.role))
      return fail(
        res,
        403,
        'FORBIDDEN',
        'Somente quem organizou ou administra o espaço pode excluir este evento.',
      );
    await prisma.calendarEvent.update({ where: { id: eventId }, data: { deletedAt: new Date() } });
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
});

router.post('/events/:eventId/response', async (req, res, next) => {
  try {
    const eventId = routeParam(req.params.eventId);
    const parsed = calendarAttendeeResponseInputSchema.safeParse(req.body);
    if (!parsed.success)
      return fail(res, 400, 'VALIDATION_ERROR', 'A resposta ao convite é inválida.');
    const attendee = await prisma.calendarEventAttendee.findFirst({
      where: {
        eventId,
        userId: req.userId,
        event: { deletedAt: null, workspace: { members: { some: { userId: req.userId } } } },
      },
      select: { eventId: true },
    });
    if (!attendee) return fail(res, 404, 'EVENT_INVITATION_NOT_FOUND', 'Convite não encontrado.');
    await prisma.calendarEventAttendee.update({
      where: { eventId_userId: { eventId, userId: req.userId! } },
      data: { status: parsed.data.status, respondedAt: new Date() },
    });
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
});

export function createCalendarRouter() {
  return router;
}
