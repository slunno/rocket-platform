import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { assignIntegrationTestIp } from '../test-utils/integration-ip.js';

const integrationTestsEnabled = process.env.AUTH_INTEGRATION_TESTS === 'true';

describe.skipIf(!integrationTestsEnabled)('fluxo de autenticação integrado', () => {
  let server: Server;
  let baseUrl: string;
  let prisma: typeof import('../lib/prisma.js').prisma;
  const email = `rocket-auth-${randomUUID()}@example.test`;

  beforeAll(async () => {
    const [{ authRouter }, client] = await Promise.all([
      import('./routes.js'),
      import('../lib/prisma.js'),
    ]);
    prisma = client.prisma;
    const app = express();
    app.use(express.json());
    assignIntegrationTestIp(app, '192.0.2.10');
    app.use('/api/auth', authRouter);
    server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}/api/auth`;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    await prisma.$disconnect();
  });

  async function post(path: string, body?: unknown, cookie?: string, accessToken?: string) {
    return fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async function login(password: string) {
    const response = await post('/login', { email, password });
    const data = (await response.json()) as { accessToken: string };
    return { response, data, cookie: response.headers.get('set-cookie')?.split(';')[0] ?? '' };
  }

  it('cadastra, autentica, renova, recupera senha e revoga sessões', async () => {
    const originalPassword = 'Rocket-Strong-Pass-2026!';
    const registration = await post('/register', {
      email,
      password: originalPassword,
      displayName: 'Pessoa de Teste',
    });
    expect(registration.status).toBe(201);
    expect(registration.headers.get('set-cookie')).toContain('HttpOnly');
    const registered = (await registration.json()) as {
      accessToken: string;
      user: { email: string };
    };
    expect(registered.user.email).toBe(email);
    expect(
      (
        await fetch(`${baseUrl}/profile`, {
          headers: { Authorization: `Bearer ${registered.accessToken}` },
        })
      ).status,
    ).toBe(200);
    const profileUpdate = await fetch(`${baseUrl}/profile`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${registered.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jobTitle: 'Design de produto',
        locale: 'en-US',
        status: 'BUSY',
        statusMessage: 'Em uma reunião',
        timeZone: 'America/Sao_Paulo',
      }),
    });
    expect(profileUpdate.status).toBe(200);
    expect(await profileUpdate.json()).toMatchObject({
      jobTitle: 'Design de produto',
      locale: 'en-US',
      status: 'BUSY',
      statusMessage: 'Em uma reunião',
    });

    const invalidLogin = await post('/login', { email, password: 'incorrect-password' });
    expect(invalidLogin.status).toBe(401);
    const firstLogin = await login(originalPassword);
    expect(firstLogin.response.status).toBe(200);
    expect(firstLogin.cookie).toContain('rocket_refresh=');

    const refreshResponse = await post('/refresh', undefined, firstLogin.cookie);
    expect(refreshResponse.status).toBe(200);
    const refreshed = (await refreshResponse.json()) as { accessToken: string };
    const refreshedCookie = refreshResponse.headers.get('set-cookie')?.split(';')[0] ?? '';
    expect(refreshedCookie).not.toBe(firstLogin.cookie);

    const replayResponse = await post('/refresh', undefined, firstLogin.cookie);
    expect(replayResponse.status).toBe(401);
    const revokedProfile = await fetch(`${baseUrl}/profile`, {
      headers: { Authorization: `Bearer ${refreshed.accessToken}` },
    });
    expect(revokedProfile.status).toBe(401);

    const spy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const forgotResponse = await post('/forgot-password', { email });
    expect(forgotResponse.status).toBe(202);
    const resetLog = spy.mock.calls
      .map(([message]) => String(message))
      .find((message) => message.includes(email));
    spy.mockRestore();
    expect(resetLog).toBeDefined();
    const resetUrl = new URL(resetLog!.slice(resetLog!.indexOf('http')));
    const resetToken = resetUrl.searchParams.get('token');
    expect(resetToken).toBeTruthy();

    const newPassword = 'Rocket-New-Strong-Pass-2026!';
    const resetResponse = await post('/reset-password', {
      token: resetToken,
      password: newPassword,
    });
    expect(resetResponse.status).toBe(204);
    expect(
      (
        await post('/reset-password', {
          token: resetToken,
          password: newPassword,
        })
      ).status,
    ).toBe(400);
    expect((await login(originalPassword)).response.status).toBe(401);

    const newLogin = await login(newPassword);
    expect(newLogin.response.status).toBe(200);
    const secondDevice = await login(newPassword);
    expect(secondDevice.response.status).toBe(200);
    const logoutAll = await post('/logout-all', undefined, undefined, newLogin.data.accessToken);
    expect(logoutAll.status).toBe(204);
    const otherDeviceProfile = await fetch(`${baseUrl}/profile`, {
      headers: { Authorization: `Bearer ${secondDevice.data.accessToken}` },
    });
    expect(otherDeviceProfile.status).toBe(401);

    const currentDevice = await login(newPassword);
    const logout = await post('/logout', undefined, currentDevice.cookie);
    expect(logout.status).toBe(204);
    const signedOutProfile = await fetch(`${baseUrl}/profile`, {
      headers: { Authorization: `Bearer ${currentDevice.data.accessToken}` },
    });
    expect(signedOutProfile.status).toBe(401);
  });

  it('retorna erros de validação e respostas sem enumeração de e-mail', async () => {
    const invalidRegistration = await post('/register', {
      email: `bad-${email}`,
      password: 'curta',
      displayName: 'Teste',
    });
    expect(invalidRegistration.status).toBe(400);

    const missingRefresh = await post('/refresh');
    expect(missingRefresh.status).toBe(401);

    const unknownForgot = await post('/forgot-password', { email: `unknown-${email}` });
    const knownForgot = await post('/forgot-password', { email });
    expect(unknownForgot.status).toBe(202);
    expect(knownForgot.status).toBe(202);
    expect(await unknownForgot.json()).toEqual(await knownForgot.json());

    const bruteForceEmail = `brute-force-${email}`;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(
        (await post('/login', { email: bruteForceEmail, password: 'wrong-password' })).status,
      ).toBe(401);
    }
    const blocked = await post('/login', { email: bruteForceEmail, password: 'wrong-password' });
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0);
  });
});
