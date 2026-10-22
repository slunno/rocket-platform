import http from 'node:http';
import cors from 'cors';
import express from 'express';
import { Server } from 'socket.io';
import { env } from './env.js';
import { verifyUserToken } from './auth.js';
import { prisma } from './lib/prisma.js';
import { createApiRouter } from './routes.js';

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: env.WEB_ORIGIN, methods: ['GET', 'POST'] } });

app.use(cors({ origin: env.WEB_ORIGIN }));
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
    const userId = verifyUserToken(String(socket.handshake.auth.token ?? ''));
    socket.data.userId = userId;
    next();
  } catch {
    next(new Error('Unauthorized'));
  }
});

io.on('connection', async (socket) => {
  const memberships = await prisma.conversationMember.findMany({
    where: { userId: socket.data.userId },
    select: { conversationId: true },
  });
  memberships.forEach(({ conversationId }) => socket.join(`conversation:${conversationId}`));
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
