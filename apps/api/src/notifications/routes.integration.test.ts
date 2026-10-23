import { createServer, type Server as HttpServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { Server as SocketServer } from 'socket.io';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const integrationTestsEnabled =
  process.env.AUTH_INTEGRATION_TESTS === 'true' && Boolean(process.env.REDIS_URL);

describe.skipIf(!integrationTestsEnabled)('atividade e notificações integradas', () => {
  let server: HttpServer;
  let baseUrl: string;
  let prisma: typeof import('../lib/prisma.js').prisma;
  let queue: typeof import('./queue.js').activityNotificationQueue;
  let closeQueue: typeof import('./queue.js').closeActivityNotificationQueue;
  const suffix = randomUUID();
  const ownerEmail = `rocket-activity-owner-${suffix}@example.test`;
  const memberEmail = `rocket-activity-member-${suffix}@example.test`;
  const userEmails = [ownerEmail, memberEmail];
  const workspaceIds: string[] = [];
  const queueJobIds = new Set<string>();
  let channelId = '';

  beforeAll(async () => {
    const [{ createApiRouter }, client, notificationQueue] = await Promise.all([
      import('../routes.js'),
      import('../lib/prisma.js'),
      import('./queue.js'),
    ]);
    prisma = client.prisma;
    queue = notificationQueue.activityNotificationQueue;
    closeQueue = notificationQueue.closeActivityNotificationQueue;
    const app = express();
    app.use(express.json());
    const socketServer = {
      in: () => ({ socketsJoin: async () => undefined, socketsLeave: async () => undefined }),
      to: () => ({ emit: () => undefined }),
    } as unknown as SocketServer;
    app.use('/', createApiRouter(socketServer));
    app.use(
      (error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) =>
        res.status(500).json({
          error: {
            code: 'INTERNAL_ERROR',
            message: error instanceof Error ? error.message : String(error),
          },
        }),
    );
    server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    if (workspaceIds.length)
      await prisma.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
    await prisma.user.deleteMany({ where: { email: { in: userEmails } } });
    await Promise.all(
      [...queueJobIds].map(async (jobId) => {
        const job = await queue.getJob(jobId);
        if (job) await job.remove();
      }),
    );
    await closeQueue();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    await prisma.$disconnect();
  });

  async function register(email: string, displayName: string) {
    const response = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, displayName, password: 'Rocket-Strong-Pass-2026!' }),
    });
    expect(response.status).toBe(201);
    return (await response.json()) as {
      accessToken: string;
      user: { id: string; username: string };
    };
  }

  async function request(method: string, path: string, token: string, body?: unknown) {
    return fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  it('cria atividade autorizada e respeita menções e silêncio por canal', async () => {
    const owner = await register(ownerEmail, 'Responsável de Atividade');
    const member = await register(memberEmail, 'Membro de Atividade');
    const pushEndpoint = `https://fcm.googleapis.com/fcm/send/${suffix}`;
    const pushSubscription = {
      endpoint: pushEndpoint,
      keys: { p256dh: 'p'.repeat(32), auth: 'a'.repeat(16) },
    };
    const subscribeResponse = await request(
      'POST',
      '/activity/push-subscriptions',
      member.accessToken,
      pushSubscription,
    );
    expect(subscribeResponse.status).toBe(204);
    expect(
      await prisma.pushSubscription.findUnique({ where: { endpoint: pushEndpoint } }),
    ).toMatchObject({
      userId: member.user.id,
    });
    const blockedEndpoint = await request(
      'POST',
      '/activity/push-subscriptions',
      member.accessToken,
      {
        ...pushSubscription,
        endpoint: 'https://127.0.0.1:5432/private',
      },
    );
    expect(blockedEndpoint.status).toBe(400);
    await request('DELETE', '/activity/push-subscriptions', owner.accessToken, pushSubscription);
    expect(
      await prisma.pushSubscription.findUnique({ where: { endpoint: pushEndpoint } }),
    ).toBeTruthy();
    await request('DELETE', '/activity/push-subscriptions', member.accessToken, pushSubscription);
    expect(
      await prisma.pushSubscription.findUnique({ where: { endpoint: pushEndpoint } }),
    ).toBeNull();

    const workspaceResponse = await request('POST', '/workspaces', owner.accessToken, {
      name: 'Workspace de Atividade',
    });
    expect(workspaceResponse.status).toBe(201);
    const workspace = (await workspaceResponse.json()) as { id: string };
    workspaceIds.push(workspace.id);

    const inviteResponse = await request(
      'POST',
      `/workspaces/${workspace.id}/invites`,
      owner.accessToken,
      { email: memberEmail },
    );
    expect(inviteResponse.status).toBe(201);
    const invite = (await inviteResponse.json()) as { inviteUrl: string };
    const invitationToken = new URL(invite.inviteUrl).searchParams.get('token');
    expect(invitationToken).toBeTruthy();
    const acceptResponse = await request('POST', '/invites/accept', member.accessToken, {
      token: invitationToken,
    });
    expect(acceptResponse.status).toBe(200);

    const workspaceDetail = await request('GET', `/workspaces/${workspace.id}`, owner.accessToken);
    const detail = (await workspaceDetail.json()) as {
      teams: { id: string; channels: { id: string; name: string }[] }[];
    };
    const team = detail.teams[0]!;
    channelId = team.channels[0]!.id;
    const joinTeamResponse = await request('POST', `/teams/${team.id}/join`, member.accessToken);
    expect(joinTeamResponse.status).toBe(204);

    const invitationActivity = await request('GET', '/activity?filter=all', owner.accessToken);
    const ownerActivity = (await invitationActivity.json()) as {
      items: { id: string; kind: string }[];
    };
    const acceptedInvite = ownerActivity.items.find(({ kind }) => kind === 'INVITE');
    expect(acceptedInvite).toBeDefined();
    queueJobIds.add(`activity-${acceptedInvite!.id}`);
    expect(await queue.getJob(`activity-${acceptedInvite!.id}`)).toBeTruthy();

    const messageResponse = await request(
      'POST',
      `/channels/${channelId}/messages`,
      owner.accessToken,
      { text: `@${member.user.username} confira a nova coleção`, clientMessageId: randomUUID() },
    );
    expect(messageResponse.status).toBe(201);
    const message = (await messageResponse.json()) as { id: string };
    const mentionResponse = await request('GET', '/activity?filter=mentions', member.accessToken);
    const mentionActivity = (await mentionResponse.json()) as {
      items: { id: string; kind: string; readAt: string | null }[];
      unreadCount: number;
    };
    const mention = mentionActivity.items.find(({ kind }) => kind === 'MENTION');
    expect(mention).toMatchObject({ kind: 'MENTION', readAt: null });
    expect(mentionActivity.unreadCount).toBe(1);
    queueJobIds.add(`activity-${mention!.id}`);
    expect(await queue.getJob(`activity-${mention!.id}`)).toBeTruthy();

    const replyResponse = await request(
      'POST',
      `/messages/${message.id}/replies`,
      member.accessToken,
      { text: 'Vou conferir os detalhes', clientMessageId: randomUUID() },
    );
    expect(replyResponse.status).toBe(201);
    const ownerActivityAfterReply = await request('GET', '/activity?filter=all', owner.accessToken);
    const ownerActivityWithReply = (await ownerActivityAfterReply.json()) as {
      items: { id: string; kind: string }[];
    };
    const replyActivity = ownerActivityWithReply.items.find(({ kind }) => kind === 'REPLY');
    expect(replyActivity).toBeDefined();
    queueJobIds.add(`activity-${replyActivity!.id}`);

    const unauthorizedRead = await request(
      'POST',
      `/activity/${mention!.id}/read`,
      owner.accessToken,
    );
    expect(unauthorizedRead.status).toBe(404);
    const markRead = await request('POST', `/activity/${mention!.id}/read`, member.accessToken);
    expect(markRead.status).toBe(204);

    const memberMessageResponse = await request(
      'POST',
      `/channels/${channelId}/messages`,
      member.accessToken,
      { text: 'Amostra enviada para revisão', clientMessageId: randomUUID() },
    );
    expect(memberMessageResponse.status).toBe(201);
    const memberMessage = (await memberMessageResponse.json()) as { id: string };
    const reactionResponse = await request(
      'PUT',
      `/messages/${memberMessage.id}/reactions`,
      owner.accessToken,
      { emoji: '🔥' },
    );
    expect(reactionResponse.status).toBe(200);
    const reactionActivity = await request('GET', '/activity?filter=all', member.accessToken);
    const memberActivity = (await reactionActivity.json()) as {
      items: { id: string; kind: string }[];
    };
    const reaction = memberActivity.items.find(({ kind }) => kind === 'REACTION');
    expect(reaction).toBeDefined();
    queueJobIds.add(`activity-${reaction!.id}`);

    const preferenceResponse = await request(
      'PATCH',
      `/channels/${channelId}/preference`,
      member.accessToken,
      { notificationLevel: 'MUTED' },
    );
    expect(preferenceResponse.status).toBe(200);
    const secondMemberMessageResponse = await request(
      'POST',
      `/channels/${channelId}/messages`,
      member.accessToken,
      { text: 'Amostra silenciada', clientMessageId: randomUUID() },
    );
    const secondMemberMessage = (await secondMemberMessageResponse.json()) as { id: string };
    await request('PUT', `/messages/${secondMemberMessage.id}/reactions`, owner.accessToken, {
      emoji: '👏',
    });
    const mutedActivityResponse = await request('GET', '/activity?filter=all', member.accessToken);
    const mutedActivity = (await mutedActivityResponse.json()) as {
      items: { kind: string; messageId?: string }[];
    };
    expect(mutedActivity.items.filter(({ kind }) => kind === 'REACTION')).toHaveLength(1);

    const finalRead = await request('GET', '/activity?filter=unread', member.accessToken);
    const finalReadActivity = (await finalRead.json()) as { unreadCount: number };
    expect(finalReadActivity.unreadCount).toBe(1);
    await request('POST', '/activity/read-all', member.accessToken);
    const clearedActivity = await request('GET', '/activity?filter=unread', member.accessToken);
    expect(((await clearedActivity.json()) as { unreadCount: number }).unreadCount).toBe(0);
    expect(message.id).toBeTruthy();
  });
});
