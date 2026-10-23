import { createServer, type Server as HttpServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { Server as SocketServer } from 'socket.io';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const integrationTestsEnabled = process.env.AUTH_INTEGRATION_TESTS === 'true';

describe.skipIf(!integrationTestsEnabled)('organização, equipes e canais integrados', () => {
  let server: HttpServer;
  let baseUrl: string;
  let prisma: typeof import('../lib/prisma.js').prisma;
  const suffix = randomUUID();
  const ownerEmail = `rocket-owner-${suffix}@example.test`;
  const memberEmail = `rocket-member-${suffix}@example.test`;
  const guestEmail = `rocket-guest-${suffix}@example.test`;
  const workspaceIds: string[] = [];
  const userEmails = [ownerEmail, memberEmail, guestEmail];

  beforeAll(async () => {
    const [{ createApiRouter }, client] = await Promise.all([
      import('../routes.js'),
      import('../lib/prisma.js'),
    ]);
    prisma = client.prisma;
    const app = express();
    app.use(express.json());
    const socketServer = {
      in: () => ({ socketsJoin: async () => undefined, socketsLeave: async () => undefined }),
      to: () => ({ emit: () => undefined }),
    } as unknown as SocketServer;
    app.use('/', createApiRouter(socketServer));
    server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    if (workspaceIds.length)
      await prisma.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
    await prisma.user.deleteMany({ where: { email: { in: userEmails } } });
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
    return (await response.json()) as { accessToken: string };
  }

  async function request(method: string, path: string, accessToken: string, body?: unknown) {
    return fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  async function createAndAcceptInvite(
    ownerToken: string,
    recipientToken: string,
    email: string,
    workspaceId: string,
    options: { role?: 'MEMBER' | 'GUEST'; teamId?: string } = {},
  ) {
    const created = await request('POST', `/workspaces/${workspaceId}/invites`, ownerToken, {
      email,
      ...options,
    });
    expect(created.status).toBe(201);
    const invite = (await created.json()) as { inviteUrl: string };
    const token = new URL(invite.inviteUrl).searchParams.get('token');
    expect(token).toBeTruthy();
    return request('POST', '/invites/accept', recipientToken, { token });
  }

  it('preserva isolamento, gerencia membros, convites e preferências de canal', async () => {
    const owner = await register(ownerEmail, 'Proprietária de Teste');
    const member = await register(memberEmail, 'Membro de Teste');
    const guest = await register(guestEmail, 'Convidada de Teste');

    const createdWorkspace = await request('POST', '/workspaces', owner.accessToken, {
      name: 'AKR Brands Teste',
    });
    expect(createdWorkspace.status).toBe(201);
    const workspace = (await createdWorkspace.json()) as { id: string; teams: never[] };
    workspaceIds.push(workspace.id);

    const workspaceDetailResponse = await request(
      'GET',
      `/workspaces/${workspace.id}`,
      owner.accessToken,
    );
    const workspaceDetail = (await workspaceDetailResponse.json()) as {
      teams: { id: string; channels: { id: string; name: string }[] }[];
    };
    const defaultTeam = workspaceDetail.teams[0];
    expect(defaultTeam.channels.some(({ name }) => name === 'geral')).toBe(true);

    const teamCreated = await request(
      'POST',
      `/workspaces/${workspace.id}/teams`,
      owner.accessToken,
      {
        name: 'Produto e Estilo',
        description: 'Coleções e desenvolvimento de produto.',
      },
    );
    expect(teamCreated.status).toBe(201);
    const team = (await teamCreated.json()) as { id: string };
    const renamedTeam = await request('PATCH', `/teams/${team.id}`, owner.accessToken, {
      name: 'Produto e Modelagem',
      description: 'Desenvolvimento das coleções.',
    });
    expect(renamedTeam.status).toBe(200);

    const publicCreated = await request('POST', `/teams/${team.id}/channels`, owner.accessToken, {
      name: 'Coleção',
      visibility: 'PUBLIC',
    });
    const privateCreated = await request('POST', `/teams/${team.id}/channels`, owner.accessToken, {
      name: 'Planejamento confidencial',
      visibility: 'PRIVATE',
    });
    expect(publicCreated.status).toBe(201);
    expect(privateCreated.status).toBe(201);
    const publicChannel = (await publicCreated.json()) as { id: string; joined: boolean };
    const privateChannel = (await privateCreated.json()) as { id: string; joined: boolean };
    expect(publicChannel.joined).toBe(true);
    expect(privateChannel.joined).toBe(true);

    const clientMessageId = randomUUID();
    const firstMessage = await request(
      'POST',
      `/channels/${publicChannel.id}/messages`,
      owner.accessToken,
      { text: 'Primeira mensagem da página.', clientMessageId },
    );
    const retriedMessage = await request(
      'POST',
      `/channels/${publicChannel.id}/messages`,
      owner.accessToken,
      { text: 'Texto repetido após retry.', clientMessageId },
    );
    const secondMessage = await request(
      'POST',
      `/channels/${publicChannel.id}/messages`,
      owner.accessToken,
      { text: 'Segunda mensagem.', clientMessageId: randomUUID() },
    );
    const thirdMessage = await request(
      'POST',
      `/channels/${publicChannel.id}/messages`,
      owner.accessToken,
      { text: 'Terceira mensagem.', clientMessageId: randomUUID() },
    );
    const firstMessageJson = (await firstMessage.json()) as { id: string; text: string };
    const retryMessageJson = (await retriedMessage.json()) as { id: string; text: string };
    expect(firstMessage.status).toBe(201);
    expect(retriedMessage.status).toBe(200);
    expect(retryMessageJson).toEqual(firstMessageJson);
    expect(secondMessage.status).toBe(201);
    expect(thirdMessage.status).toBe(201);

    const recentMessagesResponse = await request(
      'GET',
      `/channels/${publicChannel.id}/messages?limit=2`,
      owner.accessToken,
    );
    const recentPage = (await recentMessagesResponse.json()) as {
      items: { id: string }[];
      nextCursor: string | null;
    };
    expect(recentMessagesResponse.status).toBe(200);
    expect(recentPage.items).toHaveLength(2);
    expect(recentPage.nextCursor).toBe(recentPage.items[0]?.id);

    const olderMessagesResponse = await request(
      'GET',
      `/channels/${publicChannel.id}/messages?limit=2&cursor=${encodeURIComponent(recentPage.nextCursor!)}`,
      owner.accessToken,
    );
    const olderPage = (await olderMessagesResponse.json()) as {
      items: { id: string }[];
      nextCursor: string | null;
    };
    expect(olderMessagesResponse.status).toBe(200);
    expect(olderPage.items).toHaveLength(1);
    expect(olderPage.nextCursor).toBeNull();
    expect(new Set([...olderPage.items, ...recentPage.items].map(({ id }) => id)).size).toBe(3);
    const replyClientMessageId = randomUUID();
    const firstReplyResponse = await request(
      'POST',
      `/messages/${firstMessageJson.id}/replies`,
      owner.accessToken,
      { text: 'Resposta dentro do tópico.', clientMessageId: replyClientMessageId },
    );
    const firstReply = (await firstReplyResponse.json()) as {
      id: string;
      replyToId: string;
      text: string;
    };
    const retriedReplyResponse = await request(
      'POST',
      `/messages/${firstMessageJson.id}/replies`,
      owner.accessToken,
      { text: 'Texto repetido após retry.', clientMessageId: replyClientMessageId },
    );
    const retriedReply = (await retriedReplyResponse.json()) as { id: string; text: string };
    expect(firstReplyResponse.status).toBe(201);
    expect(firstReply).toMatchObject({
      replyToId: firstMessageJson.id,
      text: 'Resposta dentro do tópico.',
    });
    expect(retriedReplyResponse.status).toBe(200);
    expect(retriedReply).toMatchObject({ id: firstReply.id, text: firstReply.text });
    const threadPageResponse = await request(
      'GET',
      `/messages/${firstMessageJson.id}/replies?limit=10`,
      owner.accessToken,
    );
    const threadPage = (await threadPageResponse.json()) as {
      items: { id: string }[];
      nextCursor: string | null;
    };
    expect(threadPageResponse.status).toBe(200);
    expect(threadPage.items.map(({ id }) => id)).toEqual([firstReply.id]);
    expect(threadPage.nextCursor).toBeNull();
    expect(
      (
        await request('POST', `/messages/${firstReply.id}/replies`, owner.accessToken, {
          text: 'Resposta aninhada não permitida.',
        })
      ).status,
    ).toBe(400);
    const rootsOnlyResponse = await request(
      'GET',
      `/channels/${publicChannel.id}/messages?limit=10`,
      owner.accessToken,
    );
    const rootsOnly = (await rootsOnlyResponse.json()) as {
      items: { id: string; replyCount: number }[];
    };
    expect(rootsOnly.items).toHaveLength(3);
    expect(rootsOnly.items.find(({ id }) => id === firstMessageJson.id)?.replyCount).toBe(1);
    expect(
      await prisma.message.count({ where: { channelId: publicChannel.id, replyToId: null } }),
    ).toBe(3);
    expect(
      (
        await request(
          'GET',
          `/channels/${privateChannel.id}/messages?cursor=${encodeURIComponent(firstMessageJson.id)}`,
          owner.accessToken,
        )
      ).status,
    ).toBe(400);

    expect(
      (
        await request('PATCH', `/channels/${publicChannel.id}`, owner.accessToken, {
          name: 'Coleções 2027',
          description: 'Planejamento da próxima coleção.',
        })
      ).status,
    ).toBe(200);
    const archivedChannelResponse = await request(
      'POST',
      `/teams/${team.id}/channels`,
      owner.accessToken,
      { name: 'Canal temporário', visibility: 'PUBLIC' },
    );
    const archivedChannel = (await archivedChannelResponse.json()) as { id: string };
    expect(
      (await request('DELETE', `/channels/${archivedChannel.id}`, owner.accessToken)).status,
    ).toBe(204);
    expect(
      (await request('GET', `/channels/${archivedChannel.id}/messages`, owner.accessToken)).status,
    ).toBe(404);
    const archivedTeamResponse = await request(
      'POST',
      `/workspaces/${workspace.id}/teams`,
      owner.accessToken,
      { name: 'Equipe temporária' },
    );
    const archivedTeam = (await archivedTeamResponse.json()) as { id: string };
    expect((await request('DELETE', `/teams/${archivedTeam.id}`, owner.accessToken)).status).toBe(
      204,
    );

    const canceledInviteResponse = await request(
      'POST',
      `/workspaces/${workspace.id}/invites`,
      owner.accessToken,
      { email: `cancel-${suffix}@example.test` },
    );
    expect(canceledInviteResponse.status).toBe(201);
    const invites = (await (
      await request('GET', `/workspaces/${workspace.id}/invites`, owner.accessToken)
    ).json()) as {
      id: string;
      email: string;
    }[];
    const canceledInvite = invites.find(({ email }) => email === `cancel-${suffix}@example.test`);
    expect(canceledInvite).toBeDefined();
    expect(
      (
        await request(
          'DELETE',
          `/workspaces/${workspace.id}/invites/${canceledInvite!.id}`,
          owner.accessToken,
        )
      ).status,
    ).toBe(204);

    expect(
      (
        await request('POST', `/workspaces/${workspace.id}/teams`, member.accessToken, {
          name: 'Sem permissão',
        })
      ).status,
    ).toBe(404);

    const memberInvite = await createAndAcceptInvite(
      owner.accessToken,
      member.accessToken,
      memberEmail,
      workspace.id,
    );
    expect(memberInvite.status).toBe(200);
    expect(
      (
        await request('POST', `/workspaces/${workspace.id}/teams`, member.accessToken, {
          name: 'Sem permissão',
        })
      ).status,
    ).toBe(403);
    const memberId = (
      await prisma.user.findUniqueOrThrow({ where: { email: memberEmail }, select: { id: true } })
    ).id;
    expect(
      (
        await request(
          'PATCH',
          `/workspaces/${workspace.id}/members/${memberId}`,
          owner.accessToken,
          { role: 'ADMIN' },
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await request('POST', `/workspaces/${workspace.id}/teams`, member.accessToken, {
          name: 'Equipe administrada',
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await request(
          'DELETE',
          `/workspaces/${workspace.id}/members/${memberId}`,
          member.accessToken,
        )
      ).status,
    ).toBe(403);
    const beforeJoinResponse = await request(
      'GET',
      `/workspaces/${workspace.id}`,
      member.accessToken,
    );
    const beforeJoin = (await beforeJoinResponse.json()) as {
      teams: {
        id: string;
        joined: boolean;
        channels: { id: string; visibility: string; joined: boolean }[];
      }[];
    };
    expect(beforeJoin.teams.find(({ id }) => id === team.id)?.joined).toBe(false);
    expect(
      (await request('GET', `/channels/${privateChannel.id}/messages`, member.accessToken)).status,
    ).toBe(403);
    expect(
      (await request('POST', `/channels/${publicChannel.id}/read`, member.accessToken)).status,
    ).toBe(403);
    expect(
      (
        await request('POST', `/messages/${firstMessageJson.id}/replies`, member.accessToken, {
          text: 'Sem entrar na equipe.',
        })
      ).status,
    ).toBe(403);
    expect((await request('POST', `/teams/${team.id}/join`, member.accessToken)).status).toBe(204);
    await prisma.teamMember.update({
      where: { teamId_userId: { teamId: team.id, userId: memberId } },
      data: { joinedAt: new Date() },
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(
      (await request('GET', `/channels/${publicChannel.id}/messages`, member.accessToken)).status,
    ).toBe(200);
    expect(
      (await request('POST', `/channels/${privateChannel.id}/read`, member.accessToken)).status,
    ).toBe(403);
    const unreadRootResponse = await request(
      'POST',
      `/channels/${publicChannel.id}/messages`,
      owner.accessToken,
      { text: 'Mensagem nova para o membro.' },
    );
    expect(unreadRootResponse.status).toBe(201);
    const unreadPageResponse = await request(
      'GET',
      `/channels/${publicChannel.id}/messages`,
      member.accessToken,
    );
    const unreadPage = (await unreadPageResponse.json()) as {
      unreadCount: number;
      lastReadAt: string;
    };
    expect(unreadPageResponse.status).toBe(200);
    expect(unreadPage.unreadCount).toBe(1);
    expect(unreadPage.lastReadAt).toEqual(expect.any(String));
    const workspaceUnreadResponse = await request(
      'GET',
      `/workspaces/${workspace.id}`,
      member.accessToken,
    );
    const workspaceUnread = (await workspaceUnreadResponse.json()) as {
      teams: { channels: { id: string; unread: number }[] }[];
    };
    expect(
      workspaceUnread.teams
        .flatMap(({ channels }) => channels)
        .find(({ id }) => id === publicChannel.id)?.unread,
    ).toBe(1);
    const channelReadResponse = await request(
      'POST',
      `/channels/${publicChannel.id}/read`,
      member.accessToken,
    );
    expect(channelReadResponse.status).toBe(200);
    const readPageResponse = await request(
      'GET',
      `/channels/${publicChannel.id}/messages`,
      member.accessToken,
    );
    const readPage = (await readPageResponse.json()) as { unreadCount: number };
    expect(readPage.unreadCount).toBe(0);
    const memberReplyResponse = await request(
      'POST',
      `/messages/${firstMessageJson.id}/replies`,
      member.accessToken,
      { text: 'Resposta de uma pessoa participante.', clientMessageId: randomUUID() },
    );
    expect(memberReplyResponse.status).toBe(201);
    const updatedRootResponse = await request(
      'GET',
      `/channels/${publicChannel.id}/messages?limit=10`,
      owner.accessToken,
    );
    const updatedRoots = (await updatedRootResponse.json()) as {
      items: { id: string; replyCount: number }[];
    };
    expect(updatedRoots.items.find(({ id }) => id === firstMessageJson.id)?.replyCount).toBe(2);
    expect((await request('DELETE', `/messages/${firstReply.id}`, member.accessToken)).status).toBe(
      403,
    );
    expect((await request('DELETE', `/messages/${firstReply.id}`, owner.accessToken)).status).toBe(
      204,
    );
    const liveThreadResponse = await request(
      'GET',
      `/messages/${firstMessageJson.id}/replies?limit=10`,
      owner.accessToken,
    );
    const liveThread = (await liveThreadResponse.json()) as { items: { id: string }[] };
    expect(liveThread.items).toHaveLength(1);
    expect(liveThread.items[0]?.id).not.toBe(firstReply.id);
    const liveRootResponse = await request(
      'GET',
      `/channels/${publicChannel.id}/messages?limit=10`,
      owner.accessToken,
    );
    const liveRoots = (await liveRootResponse.json()) as {
      items: { id: string; replyCount: number }[];
    };
    expect(liveRoots.items.find(({ id }) => id === firstMessageJson.id)?.replyCount).toBe(1);
    expect(
      (
        await request('PATCH', `/messages/${firstMessageJson.id}`, member.accessToken, {
          text: 'Edição de outra pessoa.',
        })
      ).status,
    ).toBe(403);
    const editedMessageResponse = await request(
      'PATCH',
      `/messages/${firstMessageJson.id}`,
      owner.accessToken,
      { text: 'Primeira mensagem revisada.' },
    );
    const editedMessage = (await editedMessageResponse.json()) as {
      text: string;
      editedAt: string | null;
    };
    expect(editedMessageResponse.status).toBe(200);
    expect(editedMessage).toMatchObject({
      text: 'Primeira mensagem revisada.',
      editedAt: expect.any(String),
    });

    const memberReaction = await request(
      'PUT',
      `/messages/${firstMessageJson.id}/reactions`,
      member.accessToken,
      { emoji: '👍' },
    );
    expect(memberReaction.status).toBe(200);
    const duplicateReaction = await request(
      'PUT',
      `/messages/${firstMessageJson.id}/reactions`,
      member.accessToken,
      { emoji: '👍' },
    );
    const duplicateReactionJson = (await duplicateReaction.json()) as {
      reactions: { emoji: string; users: { id: string }[] }[];
    };
    expect(duplicateReactionJson.reactions.find(({ emoji }) => emoji === '👍')?.users).toHaveLength(
      1,
    );
    const ownerReaction = await request(
      'PUT',
      `/messages/${firstMessageJson.id}/reactions`,
      owner.accessToken,
      { emoji: '👍' },
    );
    const ownerReactionJson = (await ownerReaction.json()) as {
      reactions: { emoji: string; users: { displayName: string }[] }[];
    };
    expect(ownerReactionJson.reactions.find(({ emoji }) => emoji === '👍')?.users).toHaveLength(2);
    expect(
      (
        await request(
          'DELETE',
          `/messages/${firstMessageJson.id}/reactions/${encodeURIComponent('👍')}`,
          owner.accessToken,
        )
      ).status,
    ).toBe(200);
    const memberOnlyReaction = await request(
      'GET',
      `/channels/${publicChannel.id}/messages?limit=10`,
      owner.accessToken,
    );
    const memberOnlyPage = (await memberOnlyReaction.json()) as {
      items: { id: string; reactions: { emoji: string; users: { displayName: string }[] }[] }[];
    };
    expect(
      memberOnlyPage.items.find(({ id }) => id === firstMessageJson.id)?.reactions[0]?.users,
    ).toHaveLength(1);

    expect(
      (await request('DELETE', `/messages/${firstMessageJson.id}`, member.accessToken)).status,
    ).toBe(403);
    expect(
      (await request('DELETE', `/messages/${firstMessageJson.id}`, owner.accessToken)).status,
    ).toBe(204);
    const afterSoftDelete = await request(
      'GET',
      `/channels/${publicChannel.id}/messages?limit=10`,
      owner.accessToken,
    );
    expect(
      ((await afterSoftDelete.json()) as { items: { id: string }[] }).items.some(
        ({ id }) => id === firstMessageJson.id,
      ),
    ).toBe(false);
    expect(
      (
        await request('PATCH', `/channels/${publicChannel.id}`, owner.accessToken, {
          visibility: 'PRIVATE',
        })
      ).status,
    ).toBe(200);
    expect(
      (await request('GET', `/channels/${publicChannel.id}/messages`, member.accessToken)).status,
    ).toBe(200);
    expect(
      (
        await request('PATCH', `/channels/${publicChannel.id}`, owner.accessToken, {
          visibility: 'PUBLIC',
        })
      ).status,
    ).toBe(200);

    const favorite = await request(
      'PATCH',
      `/channels/${publicChannel.id}/preference`,
      member.accessToken,
      { favorite: true, hidden: true },
    );
    expect(favorite.status).toBe(200);
    expect(await favorite.json()).toEqual({ favorite: true, hidden: true });

    const guestInvite = await createAndAcceptInvite(
      owner.accessToken,
      guest.accessToken,
      guestEmail,
      workspace.id,
      {
        role: 'GUEST',
        teamId: team.id,
      },
    );
    expect(guestInvite.status).toBe(200);
    expect(
      (await request('GET', `/workspaces/${workspace.id}/members`, guest.accessToken)).status,
    ).toBe(403);
    const guestWorkspace = (await (
      await request('GET', `/workspaces/${workspace.id}`, guest.accessToken)
    ).json()) as {
      teams: { id: string }[];
    };
    expect(guestWorkspace.teams.map(({ id }) => id)).toEqual([team.id]);
    expect((await request('POST', `/teams/${defaultTeam.id}/join`, guest.accessToken)).status).toBe(
      403,
    );
    const guestId = (
      await prisma.user.findUniqueOrThrow({ where: { email: guestEmail }, select: { id: true } })
    ).id;
    expect(
      (
        await request(
          'PATCH',
          `/workspaces/${workspace.id}/members/${guestId}`,
          member.accessToken,
          { role: 'ADMIN' },
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await request(
          'PATCH',
          `/workspaces/${workspace.id}/members/${guestId}`,
          owner.accessToken,
          { role: 'MEMBER' },
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await request(
          'PATCH',
          `/workspaces/${workspace.id}/members/${(await prisma.user.findUniqueOrThrow({ where: { email: ownerEmail }, select: { id: true } })).id}`,
          owner.accessToken,
          { role: 'MEMBER' },
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await request('POST', `/teams/${defaultTeam.id}/members`, owner.accessToken, {
          userId: guestId,
        })
      ).status,
    ).toBe(204);
    expect(
      (
        await request(
          'PATCH',
          `/workspaces/${workspace.id}/members/${guestId}`,
          owner.accessToken,
          { role: 'GUEST' },
        )
      ).status,
    ).toBe(200);
    expect(
      (
        (await (await request('GET', `/workspaces/${workspace.id}`, guest.accessToken)).json()) as {
          teams: unknown[];
        }
      ).teams,
    ).toHaveLength(0);
    expect(
      (await request('GET', `/channels/${publicChannel.id}/messages`, guest.accessToken)).status,
    ).toBe(403);
    expect(
      (await request('POST', `/teams/${team.id}/members`, owner.accessToken, { userId: guestId }))
        .status,
    ).toBe(204);
    const guestChannels = await request(
      'GET',
      `/channels/${publicChannel.id}/messages`,
      guest.accessToken,
    );
    expect(guestChannels.status).toBe(200);
    expect(
      (await request('GET', `/channels/${privateChannel.id}/messages`, guest.accessToken)).status,
    ).toBe(403);

    expect(
      (
        await request('POST', `/channels/${privateChannel.id}/members`, owner.accessToken, {
          userId: 'missing-user',
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await request('POST', `/channels/${privateChannel.id}/members`, owner.accessToken, {
          userId: memberId,
        })
      ).status,
    ).toBe(204);
    expect(
      (await request('GET', `/channels/${privateChannel.id}/messages`, member.accessToken)).status,
    ).toBe(200);
    expect(
      (
        await request(
          'DELETE',
          `/channels/${privateChannel.id}/members/${memberId}`,
          owner.accessToken,
        )
      ).status,
    ).toBe(204);
    expect(
      (await request('GET', `/channels/${privateChannel.id}/messages`, member.accessToken)).status,
    ).toBe(403);
    expect(
      (await request('DELETE', `/teams/${team.id}/members/${memberId}`, member.accessToken)).status,
    ).toBe(204);
    expect(
      (await request('GET', `/channels/${publicChannel.id}/messages`, member.accessToken)).status,
    ).toBe(403);
    expect(
      (
        await request(
          'DELETE',
          `/workspaces/${workspace.id}/members/${memberId}`,
          owner.accessToken,
        )
      ).status,
    ).toBe(204);
    expect((await request('GET', `/workspaces/${workspace.id}`, member.accessToken)).status).toBe(
      404,
    );
    const channelMentionResponse = await request(
      'POST',
      `/channels/${publicChannel.id}/messages`,
      owner.accessToken,
      { text: 'Atualização para @canal.' },
    );
    expect(channelMentionResponse.status).toBe(201);
    const unavailableMentionResponse = await request(
      'POST',
      `/channels/${publicChannel.id}/messages`,
      owner.accessToken,
      { text: 'Confira com @pessoa.inexistente.' },
    );
    expect(unavailableMentionResponse.status).toBe(400);
  });
});
