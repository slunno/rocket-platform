import { createServer, type Server as HttpServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { Server as SocketServer } from 'socket.io';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const integrationTestsEnabled =
  process.env.AUTH_INTEGRATION_TESTS === 'true' && Boolean(process.env.REDIS_URL);

describe.skipIf(!integrationTestsEnabled)('calendário e reuniões integrados', () => {
  let server: HttpServer;
  let baseUrl: string;
  let prisma: typeof import('../lib/prisma.js').prisma;
  let reminderQueue: typeof import('../notifications/queue.js').activityNotificationQueue;
  let closeQueue: typeof import('../notifications/queue.js').closeActivityNotificationQueue;
  let workspaceId = '';
  let calendarReminderJobs: { remove: () => Promise<void> }[] = [];
  const suffix = randomUUID();
  const ownerEmail = `rocket-calendar-owner-${suffix}@example.test`;
  const memberEmail = `rocket-calendar-member-${suffix}@example.test`;
  const guestEmail = `rocket-calendar-guest-${suffix}@example.test`;
  const outsiderEmail = `rocket-calendar-outsider-${suffix}@example.test`;
  const userEmails = [ownerEmail, memberEmail, guestEmail, outsiderEmail];

  beforeAll(async () => {
    const [{ createApiRouter }, client, notifications] = await Promise.all([
      import('../routes.js'),
      import('../lib/prisma.js'),
      import('../notifications/queue.js'),
    ]);
    prisma = client.prisma;
    reminderQueue = notifications.activityNotificationQueue;
    closeQueue = notifications.closeActivityNotificationQueue;
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
    for (const job of calendarReminderJobs) await job.remove().catch(() => undefined);
    if (workspaceId) await prisma.workspace.deleteMany({ where: { id: workspaceId } });
    await prisma.user.deleteMany({ where: { email: { in: userEmails } } });
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
      user: { id: string };
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

  it('protege eventos e chamadas, agenda lembretes e emite credenciais LiveKit autorizadas', async () => {
    const [owner, member, guest, outsider] = await Promise.all([
      register(ownerEmail, 'Responsável de Produto'),
      register(memberEmail, 'Membro de Produto'),
      register(guestEmail, 'Convidada de Produto'),
      register(outsiderEmail, 'Pessoa Externa'),
    ]);
    const workspaceResponse = await request('POST', '/workspaces', owner.accessToken, {
      name: `Calendário Produto ${suffix.slice(0, 8)}`,
    });
    expect(workspaceResponse.status).toBe(201);
    const workspace = (await workspaceResponse.json()) as { id: string };
    workspaceId = workspace.id;
    await prisma.workspaceMember.createMany({
      data: [
        { workspaceId, userId: member.user.id, role: 'MEMBER' },
        { workspaceId, userId: guest.user.id, role: 'GUEST' },
      ],
    });
    const team = await prisma.team.findFirstOrThrow({ where: { workspaceId } });
    await prisma.teamMember.create({ data: { teamId: team.id, userId: member.user.id } });
    const channel = await prisma.channel.findFirstOrThrow({ where: { teamId: team.id } });

    const startAt = new Date(Date.now() + 3 * 60 * 60 * 1000);
    startAt.setSeconds(0, 0);
    const endAt = new Date(startAt.getTime() + 30 * 60 * 1000);
    const recurrenceUntil = new Date(startAt.getTime() + 14 * 24 * 60 * 60 * 1000);
    const created = await request(
      'POST',
      `/calendar/workspaces/${workspaceId}/events`,
      owner.accessToken,
      {
        title: 'Revisão da coleção',
        description: 'Ajustes finais de produto.',
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        timeZone: 'America/Sao_Paulo',
        recurrence: 'WEEKLY',
        recurrenceUntil: recurrenceUntil.toISOString(),
        reminderMinutes: 15,
        attendeeIds: [member.user.id],
      },
    );
    expect(created.status).toBe(201);
    const event = (await created.json()) as {
      id: string;
      title: string;
      attendees: { id: string; status: string }[];
    };
    expect(event.attendees).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: owner.user.id, status: 'ACCEPTED' }),
        expect.objectContaining({ id: member.user.id, status: 'INVITED' }),
      ]),
    );
    const queuedJobs = await reminderQueue.getJobs(['delayed'], 0, 1000);
    calendarReminderJobs = queuedJobs.filter(
      (job) => 'eventId' in job.data && job.data.eventId === event.id,
    );
    expect(calendarReminderJobs).toHaveLength(2);

    const guestCreate = await request(
      'POST',
      `/calendar/workspaces/${workspaceId}/events`,
      guest.accessToken,
      {
        title: 'Evento de convidada',
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
      },
    );
    expect(guestCreate.status).toBe(403);
    const outsiderList = await request(
      'GET',
      `/calendar/workspaces/${workspaceId}/events?from=${encodeURIComponent(startAt.toISOString())}&to=${encodeURIComponent(endAt.toISOString())}`,
      outsider.accessToken,
    );
    expect(outsiderList.status).toBe(404);

    const deniedEventJoin = await request(
      'POST',
      `/meetings/events/${event.id}/join`,
      member.accessToken,
      {},
    );
    expect(deniedEventJoin.status).toBe(404);
    const responded = await request(
      'POST',
      `/calendar/events/${event.id}/response`,
      member.accessToken,
      { status: 'ACCEPTED' },
    );
    expect(responded.status).toBe(204);
    const eventCall = await request(
      'POST',
      `/meetings/events/${event.id}/join`,
      member.accessToken,
      {},
    );
    expect(eventCall.status).toBe(200);
    const eventCredentials = (await eventCall.json()) as {
      token: string;
      roomName: string;
      serverUrl: string;
      canEnd: boolean;
    };
    expect(eventCredentials).toMatchObject({
      roomName: expect.stringMatching(/^rocket-/),
      serverUrl: 'ws://localhost:7880',
      canEnd: false,
    });
    expect(eventCredentials.token.split('.')).toHaveLength(3);

    const channelCall = await request(
      'POST',
      `/meetings/workspaces/${workspaceId}/meetings/now`,
      owner.accessToken,
      { channelId: channel.id },
    );
    expect(channelCall.status).toBe(201);
    const channelCredentials = (await channelCall.json()) as {
      id: string;
      canEnd: boolean;
    };
    expect(channelCredentials.canEnd).toBe(true);
    const memberJoin = await request(
      'POST',
      `/meetings/${channelCredentials.id}/join`,
      member.accessToken,
      {},
    );
    expect(memberJoin.status).toBe(200);
    const memberHistory = await request(
      'GET',
      `/meetings/workspaces/${workspaceId}/calls`,
      member.accessToken,
    );
    expect(memberHistory.status).toBe(200);
    const historyPayload = (await memberHistory.json()) as { items: { id: string }[] };
    expect(historyPayload.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: channelCredentials.id })]),
    );
    const outsiderJoin = await request(
      'POST',
      `/meetings/${channelCredentials.id}/join`,
      outsider.accessToken,
      {},
    );
    expect(outsiderJoin.status).toBe(404);
    const memberEnd = await request(
      'POST',
      `/meetings/${channelCredentials.id}/end`,
      member.accessToken,
      {},
    );
    expect(memberEnd.status).toBe(403);
    const ownerEnd = await request(
      'POST',
      `/meetings/${channelCredentials.id}/end`,
      owner.accessToken,
      {},
    );
    expect(ownerEnd.status).toBe(204);
    const endedJoin = await request(
      'POST',
      `/meetings/${channelCredentials.id}/join`,
      member.accessToken,
      {},
    );
    expect(endedJoin.status).toBe(410);
  });
});
