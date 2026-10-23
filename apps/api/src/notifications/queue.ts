import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import type { Server } from 'socket.io';
import { socketEvents } from '@rocket/shared';
import { env } from '../env.js';
import { prisma } from '../lib/prisma.js';
import { serializeActivityNotification } from './serialize.js';
import { sendWebPush, webPushConfigured } from './push.js';

const queueName = 'rocket-activity-notifications';
const producerConnection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
});

export const activityNotificationQueue = new Queue<{ notificationId: string }>(queueName, {
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

export function startActivityNotificationWorker(io: Server) {
  const worker = new Worker(
    queueName,
    async (job) => {
      const notification = await prisma.activityNotification.findUnique({
        where: { id: job.data.notificationId },
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
      if (
        !notification ||
        notification.readAt ||
        notification.recipient.status === 'DO_NOT_DISTURB'
      )
        return;
      const serialized = serializeActivityNotification(notification);
      io.to(`user:${notification.recipientId}`).emit(socketEvents.notificationCreated, serialized);
      if (!webPushConfigured || notification.recipient.pushSubscriptions.length === 0) return;

      const body =
        notification.kind === 'MENTION'
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
