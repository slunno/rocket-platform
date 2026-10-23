import http from 'node:http';
import cors from 'cors';
import express from 'express';
import { Server } from 'socket.io';
import { env } from './env.js';
import { validateAccessToken } from './auth.js';
import { prisma } from './lib/prisma.js';
import { createApiRouter } from './routes.js';
import { getChannelContext } from './organization/routes.js';
import { typingInputSchema } from '@rocket/shared';

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: env.WEB_ORIGIN, methods: ['GET', 'POST'], credentials: true },
});

app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use('/api', createApiRouter(io));
app.use(
  (error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(error);
    return res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Ocorreu um erro interno.' },
    });
  },
);

io.use(async (socket, next) => {
  try {
    const identity = await validateAccessToken(String(socket.handshake.auth.token ?? ''));
    socket.data.userId = identity.userId;
    socket.data.sessionId = identity.sessionId;
    next();
  } catch {
    next(new Error('Unauthorized'));
  }
});

io.on('connection', async (socket) => {
  try {
    const identity = await validateAccessToken(String(socket.handshake.auth.token ?? ''));
    socket.data.userId = identity.userId;
    socket.data.sessionId = identity.sessionId;
    socket.join(`user:${identity.userId}`);
    socket.join(`session:${identity.sessionId}`);
  } catch {
    socket.disconnect(true);
    return;
  }

  socket.on(
    'auth:reauth',
    async (token: unknown, acknowledge?: (result: { ok: boolean }) => void) => {
      try {
        if (typeof token !== 'string') throw new Error('Invalid token.');
        const identity = await validateAccessToken(token);
        if (identity.userId !== socket.data.userId) throw new Error('User mismatch.');
        const previousSessionId = socket.data.sessionId as string | undefined;
        if (previousSessionId && previousSessionId !== identity.sessionId) {
          socket.leave(`session:${previousSessionId}`);
        }
        socket.data.sessionId = identity.sessionId;
        socket.join(`session:${identity.sessionId}`);
        acknowledge?.({ ok: true });
      } catch {
        acknowledge?.({ ok: false });
        socket.disconnect(true);
      }
    },
  );

  socket.on(
    'channel:join',
    async (channelId: unknown, acknowledge?: (result: { ok: boolean }) => void) => {
      try {
        if (typeof channelId !== 'string') throw new Error('Invalid channel.');
        const access = await getChannelContext(channelId, socket.data.userId as string);
        if (!access?.isMember) throw new Error('Channel access denied.');
        await socket.join(`channel:${channelId}`);
        acknowledge?.({ ok: true });
      } catch {
        acknowledge?.({ ok: false });
      }
    },
  );

  socket.on('channel:leave', async (channelId: unknown) => {
    if (typeof channelId === 'string') await socket.leave(`channel:${channelId}`);
  });

  socket.on('typing', async (payload: unknown, acknowledge?: (result: { ok: boolean }) => void) => {
    const parsed = typingInputSchema.safeParse(payload);
    if (!parsed.success) {
      acknowledge?.({ ok: false });
      return;
    }
    const { targetType, targetId, isTyping } = parsed.data;
    const room = `${targetType === 'CHANNEL' ? 'channel' : 'conversation'}:${targetId}`;
    if (!socket.rooms.has(room)) {
      acknowledge?.({ ok: false });
      return;
    }
    try {
      const displayName = socket.data.displayName as string | undefined;
      if (!displayName) {
        acknowledge?.({ ok: false });
        return;
      }
      socket.to(room).emit('typing', {
        targetType,
        targetId,
        userId: socket.data.userId,
        displayName,
        isTyping,
      });
      acknowledge?.({ ok: true });
    } catch {
      acknowledge?.({ ok: false });
    }
  });

  const [person, conversationMemberships, channelMemberships] = await Promise.all([
    prisma.user.findUnique({
      where: { id: socket.data.userId },
      select: { displayName: true },
    }),
    prisma.conversationMember.findMany({
      where: { userId: socket.data.userId },
      select: { conversationId: true },
    }),
    prisma.channel.findMany({
      where: {
        archivedAt: null,
        team: { archivedAt: null },
        OR: [
          { visibility: 'PUBLIC', team: { members: { some: { userId: socket.data.userId } } } },
          { visibility: 'PRIVATE', members: { some: { userId: socket.data.userId } } },
        ],
      },
      select: { id: true },
    }),
  ]);
  if (!person) {
    socket.disconnect(true);
    return;
  }
  socket.data.displayName = person.displayName;
  conversationMemberships.forEach(({ conversationId }) =>
    socket.join(`conversation:${conversationId}`),
  );
  channelMemberships.forEach(({ id }) => socket.join(`channel:${id}`));
});

server.listen(env.API_PORT, () =>
  console.log(`Rocket API listening on http://localhost:${env.API_PORT}`),
);

async function shutdown() {
  io.close();
  await prisma.$disconnect();
  server.close(() => process.exit(0));
}
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
