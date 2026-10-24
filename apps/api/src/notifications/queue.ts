import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import type { Server } from 'socket.io';
import { socketEvents } from '@rocket/shared';
import { env } from '../env.js';
import { prisma } from '../lib/prisma.js';
import { serializeActivityNotification } from './serialize.js';
import { sendWebPush, webPushConfigured } from './push.js';

const queueName = 'rocket-activity-notifications';
type QueueJobData =
  | { notificationId: string }
  | {
      kind: 'calendar-reminder';
      eventId: string;
      attendeeId: string;
      eventUpdatedAt: string;
      occurrenceStart: string;
    };

type CalendarReminderEvent = {
  id: string;
  updatedAt: Date;
  startAt: Date;
  recurrence: 'NONE' | 'DAILY' | 'WEEKLY' | 'MONTHLY';
  recurrenceUntil: Date | null;
  reminderMinutes: number;
};

const producerConnection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
});

export const activityNotificationQueue = new Queue<QueueJobData>(queueName, {
  connection: producerConnection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 1_000 },
    removeOnComplete: 1_000,
    removeOnFail: 5_000,
  },
});

export async function enqueueActivityNotification(notificationId: string) {
  await activityNotificationQueue.add(
    'deliver',
    { notificationId },
    { jobId: `activity-${notificationId}` },
  );
}

function nextRecurrenceStart(event: CalendarReminderEvent, after: Date): Date | null {
  const cursor = new Date(event.startAt);
  if (event.recurrence === 'NONE') return cursor > after ? cursor : null;
  const until = event.recurrenceUntil;
  let iterations = 0;
  while (cursor <= after && iterations < 400) {
    if (event.recurrence === 'DAILY') cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (event.recurrence === 'WEEKLY') cursor.setUTCDate(cursor.getUTCDate() + 7);
    if (event.recurrence === 'MONTHLY') {
      const day = cursor.getUTCDate();
      cursor.setUTCDate(1);
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
      const lastDay = new Date(
        Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0),
      ).getUTCDate();
      cursor.setUTCDate(Math.min(day, lastDay));
    }
    iterations += 1;
  }
  if (iterations >= 400 || (until && cursor > until)) return null;
  return cursor;
}

async function enqueueCalendarReminder(
  event: CalendarReminderEvent,
  attendeeId: string,
  occurrenceStart: Date,
) {
  if (event.reminderMinutes <= 0 || occurrenceStart <= new Date()) return;
  const delay = Math.max(
    0,
    occurrenceStart.getTime() - event.reminderMinutes * 60_000 - Date.now(),
  );
  await activityNotificationQueue.add(
    'calendar-reminder',
    {
      kind: 'calendar-reminder',
      eventId: event.id,
      attendeeId,
      eventUpdatedAt: event.updatedAt.toISOString(),
      occurrenceStart: occurrenceStart.toISOString(),
    },
    {
      jobId: `calendar-${event.id}-${attendeeId}-${occurrenceStart.getTime()}-${event.updatedAt.getTime()}`,
      delay,
    },
  );
}

export async function scheduleCalendarReminders(eventId: string) {
  const event = await prisma.calendarEvent.findUnique({
    where: { id: eventId },
    include: {
      attendees: { where: { status: { not: 'DECLINED' } }, select: { userId: true } },
    },
  });
  if (!event || event.deletedAt || event.reminderMinutes <= 0) return;
  const occurrenceStart = nextRecurrenceStart(event, new Date(Date.now() - 1));
  if (!occurrenceStart) return;
  await Promise.all(
    event.attendees.map((attendee) =>
      enqueueCalendarReminder(event, attendee.userId, occurrenceStart),
    ),
  );
}

async function deliverActivityNotification(notificationId: string, io: Server) {
  const notification = await prisma.activityNotification.findUnique({
    where: { id: notificationId },
    include: {
      actor: { select: { displayName: true } },
      recipient: {
        select: {
          status: true,
          pushSubscriptions: { select: { id: true, endpoint: true, p256dh: true, auth: true } },
        },
      },
      workspace: { select: { name: true } },
      conversation: { select: { id: true, name: true } },
      channel: { select: { id: true, name: true, teamId: true } },
    },
  });
  if (!notification || notification.readAt || notification.recipient.status === 'DO_NOT_DISTURB')
    return;
  const serialized = serializeActivityNotification(notification);
  io.to(`user:${notification.recipientId}`).emit(socketEvents.notificationCreated, serialized);
  if (!webPushConfigured || notification.recipient.pushSubscriptions.length === 0) return;

  const body =
    notification.kind === 'EVENT_REMINDER'
      ? 'Seu evento começa em breve.'
      : notification.kind === 'MENTION'
        ? `${serialized.actorName} mencionou você.`
        : notification.kind === 'REPLY'
          ? `${serialized.actorName} respondeu ao seu tópico.`
          : notification.kind === 'REACTION'
            ? `${serialized.actorName} reagiu à sua mensagem.`
            : `${serialized.actorName} aceitou seu convite para ${serialized.workspaceName ?? 'o espaço'}.`;
  const url =
    serialized.target?.type === 'conversation'
      ? `/chat/${encodeURIComponent(serialized.target.id)}`
      : serialized.target?.type === 'channel'
        ? `/equipes/${encodeURIComponent(serialized.target.teamId)}/${encodeURIComponent(serialized.target.id)}`
        : notification.kind === 'EVENT_REMINDER' && serialized.target?.type === 'workspace'
          ? `/calendario?workspaceId=${encodeURIComponent(serialized.target.id)}`
          : '/atividade';
  const payload = JSON.stringify({ title: 'Rocket', body, url, tag: notification.id });
  const results = await Promise.allSettled(
    notification.recipient.pushSubscriptions.map((subscription) =>
      sendWebPush(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        payload,
      ),
    ),
  );
  const expiredSubscriptionIds: string[] = [];
  const transientErrors: unknown[] = [];
  results.forEach((result, index) => {
    if (result.status !== 'rejected') return;
    const statusCode = (result.reason as { statusCode?: number } | undefined)?.statusCode;
    const subscription = notification.recipient.pushSubscriptions[index];
    if (subscription && (statusCode === 404 || statusCode === 410)) {
      expiredSubscriptionIds.push(subscription.id);
    } else {
      transientErrors.push(result.reason);
    }
  });
  if (expiredSubscriptionIds.length) {
    await prisma.pushSubscription.deleteMany({ where: { id: { in: expiredSubscriptionIds } } });
  }
  if (transientErrors.length) {
    throw new Error(`Falha ao enviar push para ${transientErrors.length} assinatura(s).`);
  }
}

async function deliverCalendarReminder(
  data: Extract<QueueJobData, { kind: 'calendar-reminder' }>,
  io: Server,
) {
  const occurrenceStart = new Date(data.occurrenceStart);
  const event = await prisma.calendarEvent.findFirst({
    where: {
      id: data.eventId,
      deletedAt: null,
      updatedAt: new Date(data.eventUpdatedAt),
    },
    include: {
      attendees: {
        where: { userId: data.attendeeId, status: { not: 'DECLINED' } },
        select: { userId: true },
      },
    },
  });
  if (
    !event ||
    event.reminderMinutes <= 0 ||
    !event.attendees.length ||
    occurrenceStart <= new Date()
  )
    return;

  const sourceKey = `calendar-reminder:${event.id}:${data.attendeeId}:${occurrenceStart.getTime()}`;
  const notification = await prisma.activityNotification.upsert({
    where: { recipientId_sourceKey: { recipientId: data.attendeeId, sourceKey } },
    create: {
      recipientId: data.attendeeId,
      actorId: event.createdById,
      kind: 'EVENT_REMINDER',
      sourceKey,
      workspaceId: event.workspaceId,
    },
    update: {},
    select: { id: true },
  });
  await deliverActivityNotification(notification.id, io);

  const nextStart = nextRecurrenceStart(event, occurrenceStart);
  if (nextStart) await enqueueCalendarReminder(event, data.attendeeId, nextStart);
}

export function startActivityNotificationWorker(io: Server) {
  const worker = new Worker<QueueJobData>(
    queueName,
    async (job) => {
      if ('notificationId' in job.data) {
        await deliverActivityNotification(job.data.notificationId, io);
      } else {
        await deliverCalendarReminder(job.data, io);
      }
    },
    {
      connection: new Redis(env.REDIS_URL, { maxRetriesPerRequest: null }),
      concurrency: 20,
    },
  );
  worker.on('failed', (job, error) => {
    console.error('Activity notification delivery failed:', job?.id, error.message);
  });
  return worker;
}

export async function closeActivityNotificationQueue() {
  await activityNotificationQueue.close();
  await producerConnection.quit();
}
