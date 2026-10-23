import { randomUUID } from 'node:crypto';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RedisPresenceStore } from './presence.js';

const redisUrl = process.env.REDIS_URL;

describe.skipIf(!redisUrl)('presença Redis integrada', () => {
  let redis: Redis;
  let presence: RedisPresenceStore;

  beforeAll(async () => {
    redis = new Redis(redisUrl!);
    await redis.ping();
    presence = new RedisPresenceStore(redis);
  });

  afterAll(async () => {
    await redis.quit();
  });

  it('mantém online enquanto houver sockets ativos e emite transições uma vez', async () => {
    const userId = `presence-${randomUUID()}`;
    const firstSocket = randomUUID();
    const secondSocket = randomUUID();

    expect(await presence.heartbeat(userId, firstSocket)).toBe(true);
    expect(await presence.heartbeat(userId, secondSocket)).toBe(false);
    expect(await presence.isOnline(userId)).toBe(true);
    const missingUserId = `missing-${randomUUID()}`;
    expect(await presence.areOnline([userId, missingUserId])).toEqual(
      new Map([
        [userId, true],
        [missingUserId, false],
      ]),
    );
    expect(await presence.disconnect(userId, firstSocket)).toBe(false);
    expect(await presence.isOnline(userId)).toBe(true);
    expect(await presence.disconnect(userId, secondSocket)).toBe(true);
    expect(await presence.isOnline(userId)).toBe(false);
    const reconnectedSocket = randomUUID();
    expect(await presence.heartbeat(userId, reconnectedSocket)).toBe(true);
    expect(await presence.disconnect(userId, reconnectedSocket)).toBe(true);
  });

  it('remove sockets expirados ao receber um novo heartbeat', async () => {
    const userId = `presence-${randomUUID()}`;
    const expiredSocket = randomUUID();
    const activeSocket = randomUUID();
    const start = Date.now();

    expect(await presence.heartbeat(userId, expiredSocket, start)).toBe(true);
    expect(
      await presence.heartbeat(userId, activeSocket, start + (presenceHeartbeatTtlMs + 1)),
    ).toBe(false);
    expect(
      await presence.disconnect(userId, expiredSocket, start + presenceHeartbeatTtlMs + 2),
    ).toBe(false);
    expect(
      await presence.disconnect(userId, activeSocket, start + presenceHeartbeatTtlMs + 3),
    ).toBe(true);
  });
});

const presenceHeartbeatTtlMs = 60_000;
