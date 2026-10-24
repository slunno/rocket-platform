import { createServer, type Server as HttpServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { Server as SocketServer } from 'socket.io';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assignIntegrationTestIp } from '../test-utils/integration-ip.js';

const integrationTestsEnabled =
  process.env.AUTH_INTEGRATION_TESTS === 'true' && Boolean(process.env.REDIS_URL);

describe.skipIf(!integrationTestsEnabled)('busca global integrada', () => {
  let server: HttpServer;
  let baseUrl: string;
  let prisma: typeof import('../lib/prisma.js').prisma;
  let closeQueue: typeof import('../notifications/queue.js').closeActivityNotificationQueue;
  const suffix = randomUUID();
  const ownerEmail = `rocket-search-owner-${suffix}@example.test`;
  const memberEmail = `rocket-search-member-${suffix}@example.test`;
  const outsiderEmail = `rocket-search-outsider-${suffix}@example.test`;
  const userEmails = [ownerEmail, memberEmail, outsiderEmail];
  let workspaceId = '';
  let ownerId = '';
  let publicChannelId = '';
  let privateChannelId = '';

  beforeAll(async () => {
    const [{ createApiRouter }, client, notificationQueue] = await Promise.all([
      import('../routes.js'),
      import('../lib/prisma.js'),
      import('../notifications/queue.js'),
    ]);
    prisma = client.prisma;
    closeQueue = notificationQueue.closeActivityNotificationQueue;
    const app = express();
    app.use(express.json());
    assignIntegrationTestIp(app, '192.0.2.12');
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

  it('limita resultados por workspace, canal acessível, autor, local e anexo', async () => {
    const owner = await register(ownerEmail, 'Responsável Atlas');
    const member = await register(memberEmail, 'Beatriz Busca');
    const outsider = await register(outsiderEmail, 'Pessoa Externa');
    ownerId = owner.user.id;

    const workspaceResponse = await request('POST', '/workspaces', owner.accessToken, {
      name: `Busca Atlas ${suffix.slice(0, 8)}`,
    });
    expect(workspaceResponse.status).toBe(201);
    const workspace = (await workspaceResponse.json()) as { id: string };
    workspaceId = workspace.id;

    const team = await prisma.team.create({
      data: {
        workspaceId,
        name: 'Produto Atlas',
        slug: `produto-atlas-${suffix.slice(0, 8)}`,
      },
    });
    await prisma.workspaceMember.create({
      data: { workspaceId, userId: member.user.id, role: 'MEMBER' },
    });
    await prisma.teamMember.createMany({
      data: [
        { teamId: team.id, userId: owner.user.id },
        { teamId: team.id, userId: member.user.id },
      ],
    });
    const publicChannel = await prisma.channel.create({
      data: {
        teamId: team.id,
        name: 'Projeto Atlas',
        slug: `projeto-atlas-${suffix.slice(0, 8)}`,
        visibility: 'PUBLIC',
      },
    });
    publicChannelId = publicChannel.id;
    const privateChannel = await prisma.channel.create({
      data: {
        teamId: team.id,
        name: 'Atlas Restrito',
        slug: `atlas-restrito-${suffix.slice(0, 8)}`,
        visibility: 'PRIVATE',
      },
    });
    privateChannelId = privateChannel.id;
    await prisma.channelMember.create({
      data: { channelId: privateChannel.id, userId: owner.user.id },
    });

    const publicMessage = await prisma.message.create({
      data: {
        channelId: publicChannel.id,
        authorId: owner.user.id,
        text: 'O atlas público registra o planejamento aprovado.',
      },
    });
    await prisma.message.create({
      data: {
        channelId: privateChannel.id,
        authorId: owner.user.id,
        text: 'O atlas privado contém dados restritos da equipe.',
      },
    });
    await prisma.attachment.create({
      data: {
        messageId: publicMessage.id,
        fileName: 'mapa-atlas.pdf',
        mimeType: 'application/pdf',
        sizeBytes: BigInt(2048),
        storageKey: `attachments/${owner.user.id}/${suffix}`,
        uploadedAt: new Date(),
      },
    });

    const memberSearch = await request(
      'GET',
      `/search?workspaceId=${workspaceId}&q=atlas`,
      member.accessToken,
    );
    expect(memberSearch.status).toBe(200);
    const memberResults = (await memberSearch.json()) as {
      messages: { snippet: string; target: { id: string } }[];
      people: { displayName: string }[];
      channels: { id: string; name: string }[];
      files: { fileName: string; sizeBytes: number; target: { id: string } }[];
    };
    expect(memberResults.messages.map(({ target }) => target.id)).toContain(publicChannel.id);
    expect(memberResults.messages.some(({ snippet }) => snippet.includes('privado'))).toBe(false);
    expect(memberResults.channels.map(({ id }) => id)).toContain(publicChannel.id);
    expect(memberResults.channels.map(({ id }) => id)).not.toContain(privateChannel.id);
    expect(memberResults.files).toContainEqual(
      expect.objectContaining({ fileName: 'mapa-atlas.pdf', sizeBytes: 2048 }),
    );

    const fileSearch = await request(
      'GET',
      `/search?workspaceId=${workspaceId}&q=mapa&type=files`,
      member.accessToken,
    );
    const fileResults = (await fileSearch.json()) as { files: { fileName: string }[] };
    expect(fileResults.files.map(({ fileName }) => fileName)).toContain('mapa-atlas.pdf');

    const filteredSearch = await request(
      'GET',
      `/search?workspaceId=${workspaceId}&q=atlas&type=messages&from=${ownerId}&in=${publicChannelId}&hasAttachment=yes`,
      member.accessToken,
    );
    const filteredResults = (await filteredSearch.json()) as {
      messages: { author: { id: string }; target: { id: string }; hasAttachment: boolean }[];
    };
    expect(filteredResults.messages).toHaveLength(1);
    expect(filteredResults.messages[0]).toMatchObject({
      author: { id: ownerId },
      target: { id: publicChannel.id },
      hasAttachment: true,
    });

    const privateOwnerSearch = await request(
      'GET',
      `/search?workspaceId=${workspaceId}&q=privado&type=messages&in=${privateChannelId}`,
      owner.accessToken,
    );
    const privateOwnerResults = (await privateOwnerSearch.json()) as { messages: unknown[] };
    expect(privateOwnerResults.messages).toHaveLength(1);

    const outsiderSearch = await request(
      'GET',
      `/search?workspaceId=${workspaceId}&q=atlas`,
      outsider.accessToken,
    );
    expect(outsiderSearch.status).toBe(404);
    const peopleSearch = await request(
      'GET',
      `/search?workspaceId=${workspaceId}&q=Beatriz&type=people`,
      owner.accessToken,
    );
    const peopleResults = (await peopleSearch.json()) as {
      people: { displayName: string; email?: string }[];
    };
    expect(peopleResults.people).toEqual([
      expect.objectContaining({ displayName: 'Beatriz Busca' }),
    ]);
    expect(peopleResults.people[0]).not.toHaveProperty('email');
  });
});
