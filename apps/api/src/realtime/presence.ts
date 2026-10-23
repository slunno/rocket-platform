import type { Redis } from 'ioredis';

export const presenceTtlSeconds = 60;

const heartbeatScript = `
local wasOnline = redis.call('EXISTS', KEYS[1])
local timestamp = tonumber(ARGV[1])
local staleBefore = timestamp - tonumber(ARGV[3])
redis.call('ZADD', KEYS[2], timestamp, ARGV[2])
redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', staleBefore)
redis.call('EXPIRE', KEYS[2], tonumber(ARGV[4]))
redis.call('SET', KEYS[1], '1', 'EX', tonumber(ARGV[4]))
if wasOnline == 0 then return 1 end
return 0
`;

const disconnectScript = `
redis.call('ZREM', KEYS[2], ARGV[1])
redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', tonumber(ARGV[2]))
local activeSockets = redis.call('ZCARD', KEYS[2])
if activeSockets == 0 then
  redis.call('DEL', KEYS[1], KEYS[2])
  return 1
end
redis.call('EXPIRE', KEYS[2], tonumber(ARGV[3]))
return 0
`;

export class RedisPresenceStore {
  constructor(
    private readonly redis: Redis,
    private readonly ttlSeconds = presenceTtlSeconds,
  ) {}

  async heartbeat(userId: string, socketId: string, now = Date.now()) {
    const result = await this.redis.eval(
      heartbeatScript,
      2,
      this.onlineKey(userId),
      this.socketsKey(userId),
      String(now),
      socketId,
      String(this.ttlSeconds * 1000),
      String(this.ttlSeconds),
    );
    return Number(result) === 1;
  }

  async disconnect(userId: string, socketId: string, now = Date.now()) {
    const result = await this.redis.eval(
      disconnectScript,
      2,
      this.onlineKey(userId),
      this.socketsKey(userId),
      socketId,
      String(now - this.ttlSeconds * 1000),
      String(this.ttlSeconds),
    );
    return Number(result) === 1;
  }

  async isOnline(userId: string) {
    return (await this.redis.exists(this.onlineKey(userId))) === 1;
  }

  async areOnline(userIds: string[]) {
    const uniqueUserIds = [...new Set(userIds)];
    if (uniqueUserIds.length === 0) return new Map<string, boolean>();

    const commands = uniqueUserIds.map((userId) => ['exists', this.onlineKey(userId)]);
    const result = await this.redis.pipeline(commands).exec();
    if (!result) throw new Error('Redis não retornou o estado de presença.');

    return new Map(
      uniqueUserIds.map((userId, index) => {
        const [error, online] = result[index] ?? [new Error('Resposta Redis incompleta.'), 0];
        if (error) throw error;
        return [userId, Number(online) === 1];
      }),
    );
  }

  private onlineKey(userId: string) {
    return `rocket:presence:${userId}:online`;
  }

  private socketsKey(userId: string) {
    return `rocket:presence:${userId}:sockets`;
  }
}
